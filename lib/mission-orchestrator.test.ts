import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { MissionSession } from "../db/mission-session-store";
import {
  MissionOrchestrator,
  type MissionModelAdapter,
  type MissionModelResponse,
} from "./mission-orchestrator";
import { MissionToolRunner, type MissionToolDefinition } from "./mission-tool-runner";

const now = 1_721_310_000_000;

function session(overrides: Partial<MissionSession> = {}): MissionSession {
  return {
    id: "ses_orchestrator",
    scenarioId: "cancel-streamly",
    seedId: "cancel-a",
    experienceMode: "live",
    status: "active",
    stage: "check",
    version: 2,
    permissions: ["message:renewal"],
    world: { subscription: { id: "sub_1", status: "active" } },
    events: [],
    continuation: null,
    pendingActionId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 30 * 60_000,
    ...overrides,
  };
}

const tools: MissionToolDefinition[] = [
  {
    name: "read_resource",
    description: "Read one allowed resource.",
    kind: "read",
    allowedStages: ["check"],
    inputSchema: z.object({ resourceId: z.string() }).strict(),
    authorize: (input, context) =>
      context.session.permissions.includes(`message:${input.resourceId}`),
    execute: (input) => ({ id: String(input.resourceId), subject: "Renewal" }),
    summarize: () => ({ label: "Read one message" }),
  },
  {
    name: "cancel_subscription",
    description: "Request a cancellation and pause for approval.",
    kind: "write",
    allowedStages: ["approve"],
    inputSchema: z.object({ subscriptionId: z.string() }).strict(),
    authorize: (input, context) =>
      (context.session.world.subscription as { id?: string }).id === input.subscriptionId,
    preview: (input) => ({
      label: "Cancel Streamly",
      consequence: "The renewal will not happen.",
      details: { subscriptionId: input.subscriptionId },
      idempotencyKey: `cancel:${input.subscriptionId}`,
    }),
    execute: () => ({ world: {}, result: { confirmationId: "confirm_1" } }),
  },
];

function toolRunner() {
  return new MissionToolRunner(tools, {
    actionId: () => "act_orchestrator",
    eventId: () => "evt_orchestrator",
  });
}

function scriptedAdapter(responses: MissionModelResponse[]): MissionModelAdapter & {
  respond: ReturnType<typeof vi.fn>;
} {
  return {
    respond: vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("No scripted response");
      return response;
    }),
  };
}

describe("mission Responses orchestrator", () => {
  it("replays complete model output and matches tool results by call_id", async () => {
    const adapter = scriptedAdapter([
      {
        id: "resp_1",
        output: [
          { type: "reasoning", id: "rs_1", summary: [] },
          {
            type: "function_call",
            call_id: "call_read",
            name: "read_resource",
            arguments: '{"resourceId":"renewal"}',
          },
        ],
      },
      {
        id: "resp_2",
        output: [{ type: "message", id: "msg_1", text: "I found the renewal." }],
      },
    ]);

    const result = await new MissionOrchestrator(adapter, toolRunner()).run({
      session: session(),
      initialInput: [{ role: "user", content: "Find my renewal." }],
      now,
    });

    expect(result.kind).toBe("completed");
    expect(adapter.respond).toHaveBeenCalledTimes(2);
    const secondInput = adapter.respond.mock.calls[1][0].input;
    expect(secondInput).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "reasoning", id: "rs_1" }),
        expect.objectContaining({ type: "function_call", call_id: "call_read" }),
        expect.objectContaining({
          type: "function_call_output",
          call_id: "call_read",
          output: JSON.stringify({ id: "renewal", subject: "Renewal" }),
        }),
      ]),
    );
    expect(result.continuation.responseIds).toEqual(["resp_1", "resp_2"]);
    expect(result.events).toEqual([
      expect.objectContaining({
        kind: "tool_result",
        toolName: "read_resource",
      }),
      expect.objectContaining({
        kind: "coach",
        label: "I found the renewal.",
      }),
    ]);
  });

  it("freezes a write and returns before sending function output", async () => {
    const adapter = scriptedAdapter([
      {
        id: "resp_write",
        output: [
          {
            type: "function_call",
            call_id: "call_cancel",
            name: "cancel_subscription",
            arguments: '{"subscriptionId":"sub_1"}',
          },
        ],
      },
    ]);
    const attach = vi.fn(async () => ({ kind: "attached" as const }));

    const result = await new MissionOrchestrator(adapter, toolRunner()).run({
      session: session({ stage: "approve" }),
      initialInput: [{ role: "user", content: "Cancel it." }],
      now,
      attachPendingAction: attach,
    });

    expect(result.kind).toBe("awaiting_approval");
    if (result.kind !== "awaiting_approval") throw new Error("Expected approval");
    expect(result.pendingAction).toMatchObject({
      id: "act_orchestrator",
      callId: "call_cancel",
      arguments: { subscriptionId: "sub_1" },
    });
    expect(attach).toHaveBeenCalledWith(
      result.pendingAction,
      expect.objectContaining({
        continuation: result.continuation,
        events: result.events,
      }),
    );
    expect(result.continuation.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "function_call_output" })]),
    );
  });

  it("returns one schema error to the model, then fails a second invalid call", async () => {
    const adapter = scriptedAdapter([
      {
        id: "resp_bad_1",
        output: [
          {
            type: "function_call",
            call_id: "call_bad_1",
            name: "not_a_tool",
            arguments: "{}",
          },
        ],
      },
      {
        id: "resp_bad_2",
        output: [
          {
            type: "function_call",
            call_id: "call_bad_2",
            name: "also_not_a_tool",
            arguments: "{}",
          },
        ],
      },
    ]);

    const result = await new MissionOrchestrator(adapter, toolRunner()).run({
      session: session(),
      initialInput: [{ role: "user", content: "Continue." }],
      now,
    });

    expect(result).toMatchObject({ kind: "retryable_error", errorCode: "invalid_tool_call" });
    expect(adapter.respond.mock.calls[1][0].input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "function_call_output",
          call_id: "call_bad_1",
        }),
      ]),
    );
  });

  it("stops after four model/tool hops", async () => {
    const responses = Array.from({ length: 4 }, (_, index) => ({
      id: `resp_${index}`,
      output: [
        {
          type: "function_call" as const,
          call_id: `call_${index}`,
          name: "read_resource",
          arguments: '{"resourceId":"renewal"}',
        },
      ],
    }));
    const adapter = scriptedAdapter(responses);

    const result = await new MissionOrchestrator(adapter, toolRunner()).run({
      session: session(),
      initialInput: [{ role: "user", content: "Keep going." }],
      now,
    });

    expect(result).toMatchObject({ kind: "retryable_error", errorCode: "tool_hop_limit" });
    expect(adapter.respond).toHaveBeenCalledTimes(4);
  });

  it("preserves the last good continuation when the model fails", async () => {
    const adapter: MissionModelAdapter = {
      respond: vi.fn(async () => {
        throw new Error("timeout");
      }),
    };
    const initialInput = [{ role: "user", content: "Continue." }];

    const result = await new MissionOrchestrator(adapter, toolRunner()).run({
      session: session(),
      initialInput,
      now,
    });

    expect(result).toMatchObject({ kind: "retryable_error", errorCode: "model_error" });
    expect(result.continuation.items).toEqual(initialInput);
  });
});
