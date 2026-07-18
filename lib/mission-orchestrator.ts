import type {
  MissionSession,
  PendingMissionAction,
} from "../db/mission-session-store";
import {
  MissionToolPolicyError,
  type MissionFunctionOutput,
  type MissionToolEvent,
  MissionToolRunner,
} from "./mission-tool-runner";

const MAX_TOOL_HOPS = 4;
const MAX_INVALID_TOOL_RETRIES = 1;

export interface MissionFunctionCallItem extends Record<string, unknown> {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export type MissionModelItem = Record<string, unknown>;

export interface MissionModelResponse {
  id: string;
  output: MissionModelItem[];
}

export interface MissionModelRequest {
  input: MissionModelItem[];
  tools: ReturnType<MissionToolRunner["openAITools"]>;
  parallelToolCalls: false;
}

export interface MissionModelAdapter {
  respond(request: MissionModelRequest): Promise<MissionModelResponse>;
}

export interface MissionContinuation extends Record<string, unknown> {
  items: MissionModelItem[];
  responseIds: string[];
  toolHops: number;
}

export function parseMissionContinuation(value: unknown): MissionContinuation {
  if (!value || typeof value !== "object") {
    throw new Error("Stored mission continuation is invalid");
  }
  const candidate = value as Partial<MissionContinuation>;
  if (
    !Array.isArray(candidate.items) ||
    !candidate.items.every(
      (item) => item !== null && typeof item === "object" && !Array.isArray(item),
    ) ||
    !Array.isArray(candidate.responseIds) ||
    !candidate.responseIds.every((id) => typeof id === "string") ||
    !Number.isInteger(candidate.toolHops) ||
    (candidate.toolHops ?? -1) < 0 ||
    (candidate.toolHops ?? MAX_TOOL_HOPS + 1) > MAX_TOOL_HOPS
  ) {
    throw new Error("Stored mission continuation is invalid");
  }
  return {
    items: candidate.items as MissionModelItem[],
    responseIds: candidate.responseIds,
    toolHops: candidate.toolHops as number,
  };
}

export type MissionOrchestratorErrorCode =
  | "model_error"
  | "invalid_tool_call"
  | "multiple_tool_calls"
  | "tool_hop_limit"
  | "pending_action_conflict"
  | "pending_action_store_required";

interface MissionRunInput {
  session: MissionSession;
  initialInput?: MissionModelItem[];
  continuation?: MissionContinuation;
  now: number;
  attachPendingAction?: (
    action: PendingMissionAction,
    state: { continuation: MissionContinuation; events: unknown[] },
  ) => Promise<{ kind: "attached" } | { kind: "conflict" }>;
}

interface MissionRunBase {
  continuation: MissionContinuation;
  events: unknown[];
}

export type MissionRunResult =
  | (MissionRunBase & { kind: "completed" })
  | (MissionRunBase & {
      kind: "awaiting_approval";
      pendingAction: PendingMissionAction;
    })
  | (MissionRunBase & {
      kind: "retryable_error";
      errorCode: MissionOrchestratorErrorCode;
    });

function isFunctionCall(item: MissionModelItem): item is MissionFunctionCallItem {
  return (
    item.type === "function_call" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}

function messageText(item: MissionModelItem): string | null {
  if (item.type !== "message") return null;
  if (typeof item.text === "string" && item.text.trim()) {
    return item.text.trim();
  }
  if (!Array.isArray(item.content)) return null;
  const text = item.content
    .flatMap((part) =>
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "output_text" &&
      "text" in part &&
      typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n")
    .trim();
  return text || null;
}

function coachEvents(
  output: MissionModelItem[],
  startingSequence: number,
  now: number,
): unknown[] {
  let sequence = startingSequence;
  return output.flatMap((item) => {
    const label = messageText(item);
    if (!label) return [];
    sequence += 1;
    return [
      {
        id:
          typeof item.id === "string"
            ? item.id
            : `evt_${crypto.randomUUID().replaceAll("-", "")}`,
        sequence,
        kind: "coach",
        label: label.slice(0, 240),
        createdAt: now,
      },
    ];
  });
}

function policyFunctionOutput(
  callId: string,
  error: MissionToolPolicyError,
): MissionFunctionOutput {
  return {
    type: "function_call_output",
    call_id: callId,
    output: JSON.stringify({
      ok: false,
      error: "tool_call_rejected",
      reason: error.code,
    }),
  };
}

function pendingEvent(
  action: PendingMissionAction,
  sequence: number,
): MissionToolEvent & { kind: "tool_result" } {
  return {
    id: `evt_${action.id.replace(/^act_/, "")}`,
    sequence,
    kind: "tool_result",
    toolName: action.toolName,
    callId: action.callId,
    label: "Waiting for your approval",
    sanitizedArguments: action.arguments,
    result: {
      pendingActionId: action.id,
      label: action.preview.label,
      consequence: action.preview.consequence,
    },
    createdAt: action.createdAt,
  };
}

function currentContinuation(input: MissionRunInput): MissionContinuation {
  if (input.continuation) {
    return {
      items: [...input.continuation.items],
      responseIds: [...input.continuation.responseIds],
      toolHops: input.continuation.toolHops,
    };
  }
  if (!input.initialInput?.length) {
    throw new Error("Mission run requires initial input or continuation");
  }
  return { items: [...input.initialInput], responseIds: [], toolHops: 0 };
}

export class MissionOrchestrator {
  constructor(
    private readonly adapter: MissionModelAdapter,
    private readonly toolRunner: MissionToolRunner,
  ) {}

  async run(input: MissionRunInput): Promise<MissionRunResult> {
    const continuation = currentContinuation(input);
    let events = [...input.session.events];
    let workingSession = { ...input.session, events };
    let invalidToolRetries = 0;

    while (continuation.toolHops < MAX_TOOL_HOPS) {
      let response: MissionModelResponse;
      try {
        response = await this.adapter.respond({
          input: [...continuation.items],
          tools: this.toolRunner.openAITools(),
          parallelToolCalls: false,
        });
      } catch {
        return {
          kind: "retryable_error",
          errorCode: "model_error",
          continuation,
          events,
        };
      }

      continuation.items.push(...response.output);
      continuation.responseIds.push(response.id);
      events = [
        ...events,
        ...coachEvents(response.output, events.length, input.now),
      ];
      workingSession = { ...workingSession, events };
      const calls = response.output.filter(isFunctionCall);
      if (calls.length === 0) {
        return { kind: "completed", continuation, events };
      }
      if (calls.length !== 1) {
        return {
          kind: "retryable_error",
          errorCode: "multiple_tool_calls",
          continuation,
          events,
        };
      }

      const [call] = calls;
      const toolCall = {
        callId: call.call_id,
        name: call.name,
        arguments: call.arguments,
      };
      continuation.toolHops += 1;
      try {
        const kind = this.toolRunner.toolKind(call.name);
        if (!kind) throw new MissionToolPolicyError("unlisted_tool");

        if (kind === "write") {
          if (!input.attachPendingAction) {
            return {
              kind: "retryable_error",
              errorCode: "pending_action_store_required",
              continuation,
              events,
            };
          }
          const pendingAction = await this.toolRunner.freezeWrite(toolCall, {
            session: workingSession,
            now: input.now,
          });
          const pendingEvents = [
            ...events,
            pendingEvent(pendingAction, events.length + 1),
          ];
          const attached = await input.attachPendingAction(pendingAction, {
            continuation,
            events: pendingEvents,
          });
          if (attached.kind !== "attached") {
            return {
              kind: "retryable_error",
              errorCode: "pending_action_conflict",
              continuation,
              events,
            };
          }
          events = pendingEvents;
          return {
            kind: "awaiting_approval",
            pendingAction,
            continuation,
            events,
          };
        }

        const handled = await this.toolRunner.handleRead(toolCall, {
          session: workingSession,
          now: input.now,
        });
        events = [...events, handled.event];
        workingSession = { ...workingSession, events };
        continuation.items.push(handled.functionOutput);
      } catch (error) {
        const policyError =
          error instanceof MissionToolPolicyError
            ? error
            : new MissionToolPolicyError("invalid_arguments");
        if (invalidToolRetries >= MAX_INVALID_TOOL_RETRIES) {
          return {
            kind: "retryable_error",
            errorCode: "invalid_tool_call",
            continuation,
            events,
          };
        }
        invalidToolRetries += 1;
        continuation.items.push(policyFunctionOutput(call.call_id, policyError));
      }
    }

    return {
      kind: "retryable_error",
      errorCode: "tool_hop_limit",
      continuation,
      events,
    };
  }
}
