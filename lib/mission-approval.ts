import type {
  D1MissionSessionStore,
  MissionSession,
  PendingMissionAction,
} from "../db/mission-session-store";
import {
  parseMissionContinuation,
  type MissionContinuation,
} from "./mission-orchestrator";
import {
  MissionToolPolicyError,
  MissionToolRunner,
} from "./mission-tool-runner";

type ApprovalStore = Pick<
  D1MissionSessionStore,
  | "claimPendingAction"
  | "getSession"
  | "completeApprovedAction"
  | "completeRejectedAction"
>;

export type MissionApprovalResult =
  | {
      kind: "resumable";
      session: MissionSession;
      continuation: MissionContinuation;
      action: PendingMissionAction;
    }
  | { kind: "already_completed"; result: Record<string, unknown> | null }
  | { kind: "expired" }
  | { kind: "conflict" };

function appendFunctionOutput(
  session: MissionSession,
  action: PendingMissionAction,
  result: Record<string, unknown>,
): MissionContinuation {
  const continuation = parseMissionContinuation(session.continuation);
  return {
    ...continuation,
    items: [
      ...continuation.items,
      {
        type: "function_call_output",
        call_id: action.callId,
        output: JSON.stringify(result),
      },
    ],
  };
}

function approvalEvent(
  session: MissionSession,
  action: PendingMissionAction,
  decision: "approve" | "reject",
  result: Record<string, unknown>,
  now: number,
): Record<string, unknown> {
  return {
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    sequence: session.events.length + 1,
    kind: "approval",
    toolName: action.toolName,
    callId: action.callId,
    label: decision === "approve" ? "You approved the action" : "You said no",
    result,
    createdAt: now,
  };
}

export class MissionApprovalCoordinator {
  constructor(
    private readonly store: ApprovalStore,
    private readonly toolRunner: MissionToolRunner,
  ) {}

  async decide(input: {
    sessionId: string;
    actionId: string;
    sessionVersion: number;
    decision: "approve" | "reject";
    now: number;
  }): Promise<MissionApprovalResult> {
    const claim = await this.store.claimPendingAction(input);
    if (claim.kind === "expired") return { kind: "expired" };
    if (claim.kind === "conflict") return { kind: "conflict" };

    const action = claim.action;
    if (claim.kind === "already_decided") {
      if (
        (input.decision === "approve" && action.status === "executed") ||
        (input.decision === "reject" && action.status === "rejected" && action.result)
      ) {
        return { kind: "already_completed", result: action.result };
      }
      if (
        (input.decision === "approve" && action.status !== "approved") ||
        (input.decision === "reject" && action.status !== "rejected")
      ) {
        return { kind: "conflict" };
      }
    }

    const session = await this.store.getSession(input.sessionId, input.now);
    if (
      !session ||
      session.version !== input.sessionVersion ||
      session.pendingActionId !== input.actionId
    ) {
      return { kind: "conflict" };
    }

    if (input.decision === "reject") {
      const result = { approved: false, executed: false };
      const continuation = appendFunctionOutput(session, action, result);
      const events = [
        ...session.events,
        approvalEvent(session, action, "reject", result, input.now),
      ];
      const completed = await this.store.completeRejectedAction({
        sessionId: input.sessionId,
        actionId: input.actionId,
        sessionVersion: input.sessionVersion,
        events,
        continuation,
        result,
        now: input.now,
      });
      if (completed.kind === "rejected") {
        return {
          kind: "resumable",
          session: completed.session,
          continuation,
          action: completed.action,
        };
      }
      if (completed.kind === "already_rejected") {
        return { kind: "already_completed", result: completed.action.result };
      }
      return { kind: "conflict" };
    }

    let executed: Awaited<ReturnType<MissionToolRunner["executeFrozenWrite"]>>;
    try {
      executed = await this.toolRunner.executeFrozenWrite(action, {
        session,
        now: input.now,
      });
    } catch (error) {
      if (error instanceof MissionToolPolicyError) return { kind: "conflict" };
      throw error;
    }
    const continuation = appendFunctionOutput(session, action, executed.result);
    const events = [
      ...session.events,
      approvalEvent(session, action, "approve", executed.result, input.now),
    ];
    const completed = await this.store.completeApprovedAction({
      sessionId: input.sessionId,
      actionId: input.actionId,
      sessionVersion: input.sessionVersion,
      argumentsHash: action.argumentsHash,
      world: executed.world,
      events,
      continuation,
      result: executed.result,
      now: input.now,
    });
    if (completed.kind === "executed") {
      return {
        kind: "resumable",
        session: completed.session,
        continuation,
        action: completed.action,
      };
    }
    if (completed.kind === "already_executed") {
      return { kind: "already_completed", result: completed.action.result };
    }
    return { kind: "conflict" };
  }
}
