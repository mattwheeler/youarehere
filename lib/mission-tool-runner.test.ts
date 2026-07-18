import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { MissionSession, PendingMissionAction } from "@/db/mission-session-store";
import {
  MissionToolPolicyError,
  MissionToolRunner,
  hashToolArguments,
  type MissionToolDefinition,
} from "./mission-tool-runner";

const now = 1_721_310_000_000;

function session(overrides: Partial<MissionSession> = {}): MissionSession {
  return {
    id: "ses_tools",
    scenarioId: "cancel-streamly",
    seedId: "cancel-a",
    experienceMode: "live",
    status: "active",
    stage: "check",
    version: 4,
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

function definitions(spies?: { read?: ReturnType<typeof vi.fn>; write?: ReturnType<typeof vi.fn> }): MissionToolDefinition[] {
  return [
    {
      name: "read_resource",
      description: "Read one resource that the learner allowed.",
      kind: "read",
      allowedStages: ["check"],
      inputSchema: z.object({ resourceId: z.string() }).strict(),
      authorize: (input, context) => context.session.permissions.includes(`message:${input.resourceId}`),
      execute: async (input) => {
        spies?.read?.(input);
        return { id: String(input.resourceId), subject: "Your renewal" };
      },
      summarize: () => ({ label: "Read the renewal message" }),
    },
    {
      name: "cancel_subscription",
      description: "Request cancellation. This pauses for learner approval.",
      kind: "write",
      allowedStages: ["approve"],
      inputSchema: z.object({ subscriptionId: z.string() }).strict(),
      authorize: (input, context) =>
        (context.session.world.subscription as { id?: string }).id === input.subscriptionId,
      preview: (input) => ({
        label: "Cancel Streamly Premium",
        consequence: "The next renewal will not happen.",
        details: { subscriptionId: input.subscriptionId, price: 18.99 },
        idempotencyKey: `cancel:${input.subscriptionId}`,
      }),
      execute: async (input, context) => {
        spies?.write?.(input);
        return {
          world: {
            ...context.session.world,
            subscription: { id: String(input.subscriptionId), status: "cancelled" },
          },
          result: { confirmationId: "confirm_1" },
        };
      },
    },
  ];
}

function runner(spies?: { read?: ReturnType<typeof vi.fn>; write?: ReturnType<typeof vi.fn> }) {
  return new MissionToolRunner(definitions(spies), {
    actionId: () => "act_fixed",
    eventId: () => "evt_fixed",
  });
}

describe("strict mission tool runner", () => {
  it("exports strict OpenAI function definitions", () => {
    expect(runner().openAITools()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "function",
          name: "read_resource",
          strict: true,
          parameters: expect.objectContaining({
            type: "object",
            additionalProperties: false,
          }),
        }),
      ]),
    );
  });

  it.each([
    ["missing_tool", "check", { resourceId: "renewal" }, "unlisted_tool"],
    ["read_resource", "approve", { resourceId: "renewal" }, "wrong_stage"],
    ["read_resource", "check", { resourceId: "renewal", extra: true }, "invalid_arguments"],
    ["read_resource", "check", { resourceId: "private" }, "unauthorized_resource"],
  ])("rejects %s without executing", async (name, stage, argumentsValue, reason) => {
    const read = vi.fn();
    const toolRunner = runner({ read });

    await expect(
      toolRunner.handleRead(
        { callId: "call_1", name, arguments: JSON.stringify(argumentsValue) },
        { session: session({ stage }), now },
      ),
    ).rejects.toMatchObject<Partial<MissionToolPolicyError>>({ code: reason });
    expect(read).not.toHaveBeenCalled();
  });

  it("returns a bounded read result and ordered observable event", async () => {
    const result = await runner().handleRead(
      { callId: "call_read", name: "read_resource", arguments: '{"resourceId":"renewal"}' },
      { session: session({ events: [{ sequence: 1 }] }), now },
    );

    expect(result.output).toEqual({ id: "renewal", subject: "Your renewal" });
    expect(result.functionOutput).toEqual({
      type: "function_call_output",
      call_id: "call_read",
      output: JSON.stringify(result.output),
    });
    expect(result.event).toMatchObject({
      id: "evt_fixed",
      sequence: 2,
      kind: "tool_result",
      toolName: "read_resource",
      callId: "call_read",
      label: "Read the renewal message",
    });
  });

  it("freezes a write without executing it", async () => {
    const write = vi.fn();
    const toolRunner = runner({ write });
    const pending = await toolRunner.freezeWrite(
      {
        callId: "call_cancel",
        name: "cancel_subscription",
        arguments: '{"subscriptionId":"sub_1"}',
      },
      { session: session({ stage: "approve" }), now },
    );

    expect(write).not.toHaveBeenCalled();
    expect(pending).toMatchObject<Partial<PendingMissionAction>>({
      id: "act_fixed",
      sessionId: "ses_tools",
      callId: "call_cancel",
      toolName: "cancel_subscription",
      arguments: { subscriptionId: "sub_1" },
      status: "pending",
      sessionVersion: 5,
      idempotencyKey: "cancel:sub_1:v5",
      preview: {
        label: "Cancel Streamly Premium",
        consequence: "The next renewal will not happen.",
        details: { subscriptionId: "sub_1", price: 18.99 },
      },
    });
    expect(pending.argumentsHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("executes only the exact frozen write arguments", async () => {
    const write = vi.fn();
    const toolRunner = runner({ write });
    const frozen = await toolRunner.freezeWrite(
      {
        callId: "call_cancel",
        name: "cancel_subscription",
        arguments: '{"subscriptionId":"sub_1"}',
      },
      { session: session({ stage: "approve" }), now },
    );

    await expect(
      toolRunner.executeFrozenWrite(
        { ...frozen, status: "approved", arguments: { subscriptionId: "sub_2" } },
        {
          session: session({
            stage: "approve",
            version: 5,
            status: "awaiting_approval",
            pendingActionId: "act_fixed",
          }),
          now: now + 1,
        },
      ),
    ).rejects.toMatchObject({ code: "changed_action" });
    expect(write).not.toHaveBeenCalled();

    await expect(
      toolRunner.executeFrozenWrite({ ...frozen, status: "approved" }, {
        session: session({
          stage: "approve",
          version: 5,
          status: "awaiting_approval",
          pendingActionId: "act_fixed",
        }),
        now: now + 1,
      }),
    ).resolves.toMatchObject({ result: { confirmationId: "confirm_1" } });
    expect(write).toHaveBeenCalledOnce();
  });

  it("hashes equivalent object arguments identically", async () => {
    await expect(hashToolArguments({ b: 2, a: { y: 2, x: 1 } })).resolves.toBe(
      await hashToolArguments({ a: { x: 1, y: 2 }, b: 2 }),
    );
  });
});
