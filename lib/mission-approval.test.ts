import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type {
  D1MissionSessionStore,
  MissionSession,
  PendingMissionAction,
} from "../db/mission-session-store";
import { MissionApprovalCoordinator } from "./mission-approval";
import { MissionToolRunner, type MissionToolDefinition } from "./mission-tool-runner";

const now = 1_721_310_000_000;

function session(): MissionSession {
  return {
    id: "ses_approval",
    scenarioId: "cancel-streamly",
    seedId: "cancel-a",
    experienceMode: "live",
    status: "awaiting_approval",
    stage: "approve",
    version: 5,
    permissions: [],
    world: { subscription: { id: "sub_1", status: "active" } },
    events: [],
    continuation: {
      items: [
        {
          type: "function_call",
          call_id: "call_cancel",
          name: "cancel_subscription",
          arguments: '{"subscriptionId":"sub_1"}',
        },
      ],
      responseIds: ["resp_1"],
      toolHops: 1,
    },
    pendingActionId: "act_approval",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 30 * 60_000,
  };
}

function action(status: PendingMissionAction["status"]): PendingMissionAction {
  return {
    id: "act_approval",
    sessionId: "ses_approval",
    callId: "call_cancel",
    toolName: "cancel_subscription",
    argumentsHash: "sha256:d668f5797528257d2c9a4f933944c54489c0c13d563eb030ea1af53073058a82",
    arguments: { subscriptionId: "sub_1" },
    preview: {
      label: "Cancel Streamly",
      consequence: "The renewal will not happen.",
      details: { subscriptionId: "sub_1" },
    },
    status,
    sessionVersion: 5,
    idempotencyKey: "cancel:sub_1:v5",
    result: status === "executed" ? { confirmationId: "confirm_1" } : null,
    createdAt: now,
    expiresAt: now + 5 * 60_000,
    decidedAt: status === "pending" ? null : now + 1,
    executedAt: status === "executed" ? now + 2 : null,
  };
}

function runner(execute = vi.fn()) {
  const definitions: MissionToolDefinition[] = [
    {
      name: "cancel_subscription",
      description: "Cancel after approval.",
      kind: "write",
      allowedStages: ["approve"],
      inputSchema: z.object({ subscriptionId: z.string() }).strict(),
      authorize: (input, context) =>
        (context.session.world.subscription as { id?: string }).id === input.subscriptionId,
      preview: () => ({
        label: "Cancel Streamly",
        consequence: "The renewal will not happen.",
        details: {},
        idempotencyKey: "cancel:sub_1",
      }),
      execute: async (input, context) => {
        execute(input);
        return {
          world: {
            ...context.session.world,
            subscription: { id: input.subscriptionId, status: "cancelled" },
          },
          result: { confirmationId: "confirm_1" },
        };
      },
    },
  ];
  return { toolRunner: new MissionToolRunner(definitions), execute };
}

describe("mission approval coordinator", () => {
  it("executes approved frozen arguments and appends matching function output", async () => {
    const { toolRunner, execute } = runner();
    const approved = action("approved");
    const updatedSession = { ...session(), version: 6, pendingActionId: null };
    const store = {
      claimPendingAction: vi.fn(async () => ({ kind: "claimed" as const, action: approved })),
      getSession: vi.fn(async () => session()),
      completeApprovedAction: vi.fn(async (input) => ({
        kind: "executed" as const,
        action: { ...approved, status: "executed" as const, result: input.result },
        session: updatedSession,
      })),
      completeRejectedAction: vi.fn(),
    } as unknown as Pick<
      D1MissionSessionStore,
      | "claimPendingAction"
      | "getSession"
      | "completeApprovedAction"
      | "completeRejectedAction"
    >;

    const result = await new MissionApprovalCoordinator(store, toolRunner).decide({
      sessionId: "ses_approval",
      actionId: "act_approval",
      sessionVersion: 5,
      decision: "approve",
      now: now + 2,
    });

    expect(result.kind).toBe("resumable");
    expect(execute).toHaveBeenCalledOnce();
    if (result.kind !== "resumable") throw new Error("Expected resumable");
    expect(result.continuation.items.at(-1)).toEqual({
      type: "function_call_output",
      call_id: "call_cancel",
      output: JSON.stringify({ confirmationId: "confirm_1" }),
    });
    expect(store.completeApprovedAction).toHaveBeenCalledWith(
      expect.objectContaining({
        argumentsHash: approved.argumentsHash,
        result: { confirmationId: "confirm_1" },
        world: expect.objectContaining({
          subscription: { id: "sub_1", status: "cancelled" },
        }),
      }),
    );
  });

  it("records rejection without running the write executor", async () => {
    const { toolRunner, execute } = runner();
    const rejected = action("rejected");
    const store = {
      claimPendingAction: vi.fn(async () => ({ kind: "claimed" as const, action: rejected })),
      getSession: vi.fn(async () => session()),
      completeApprovedAction: vi.fn(),
      completeRejectedAction: vi.fn(async () => ({
        kind: "rejected" as const,
        action: { ...rejected, result: { approved: false, executed: false } },
        session: { ...session(), version: 6, pendingActionId: null },
      })),
    } as unknown as Pick<
      D1MissionSessionStore,
      | "claimPendingAction"
      | "getSession"
      | "completeApprovedAction"
      | "completeRejectedAction"
    >;

    const result = await new MissionApprovalCoordinator(store, toolRunner).decide({
      sessionId: "ses_approval",
      actionId: "act_approval",
      sessionVersion: 5,
      decision: "reject",
      now: now + 2,
    });

    expect(result.kind).toBe("resumable");
    expect(execute).not.toHaveBeenCalled();
    expect(store.completeRejectedAction).toHaveBeenCalledWith(
      expect.objectContaining({ result: { approved: false, executed: false } }),
    );
    expect(store.completeApprovedAction).not.toHaveBeenCalled();
  });

  it("returns the first result for a duplicate completed approval", async () => {
    const { toolRunner, execute } = runner();
    const executed = action("executed");
    const store = {
      claimPendingAction: vi.fn(async () => ({
        kind: "already_decided" as const,
        action: executed,
      })),
      getSession: vi.fn(),
      completeApprovedAction: vi.fn(),
      completeRejectedAction: vi.fn(),
    } as unknown as Pick<
      D1MissionSessionStore,
      | "claimPendingAction"
      | "getSession"
      | "completeApprovedAction"
      | "completeRejectedAction"
    >;

    const result = await new MissionApprovalCoordinator(store, toolRunner).decide({
      sessionId: "ses_approval",
      actionId: "act_approval",
      sessionVersion: 5,
      decision: "approve",
      now: now + 3,
    });

    expect(result).toMatchObject({
      kind: "already_completed",
      result: { confirmationId: "confirm_1" },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
