import { z } from "zod";
import type {
  MissionSession,
  PendingMissionAction,
} from "../db/mission-session-store";

const MAX_ARGUMENT_BYTES = 8 * 1_024;
const MAX_RESULT_BYTES = 16 * 1_024;
const ACTION_TTL_MS = 5 * 60_000;

export type MissionToolPolicyErrorCode =
  | "unlisted_tool"
  | "wrong_tool_kind"
  | "wrong_stage"
  | "invalid_arguments"
  | "unauthorized_resource"
  | "oversized_result"
  | "changed_action"
  | "action_not_approved"
  | "stale_action"
  | "expired_action";

export class MissionToolPolicyError extends Error {
  constructor(public readonly code: MissionToolPolicyErrorCode) {
    super("Mission tool call was rejected");
  }
}

export interface MissionToolCall {
  callId: string;
  name: string;
  arguments: string;
}

export interface MissionToolContext {
  session: MissionSession;
  now: number;
}

interface BaseToolDefinition {
  name: string;
  description: string;
  kind: "read" | "write";
  allowedStages: readonly string[];
  inputSchema: z.ZodType<Record<string, unknown>>;
  authorize: (
    input: Record<string, unknown>,
    context: MissionToolContext,
  ) => boolean;
}

export interface MissionReadToolDefinition extends BaseToolDefinition {
  kind: "read";
  execute: (
    input: Record<string, unknown>,
    context: MissionToolContext,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  summarize: (
    output: Record<string, unknown>,
    input: Record<string, unknown>,
  ) => { label: string };
}

export interface MissionWriteToolDefinition extends BaseToolDefinition {
  kind: "write";
  preview: (
    input: Record<string, unknown>,
    context: MissionToolContext,
  ) => PendingMissionAction["preview"] & { idempotencyKey: string };
  execute: (
    input: Record<string, unknown>,
    context: MissionToolContext,
  ) =>
    | Promise<{
        world: Record<string, unknown>;
        result: Record<string, unknown>;
      }>
    | {
        world: Record<string, unknown>;
        result: Record<string, unknown>;
      };
}

export type MissionToolDefinition =
  | MissionReadToolDefinition
  | MissionWriteToolDefinition;

export interface MissionToolEvent {
  id: string;
  sequence: number;
  kind: "tool_result";
  toolName: string;
  callId: string;
  label: string;
  sanitizedArguments: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: number;
}

export interface MissionFunctionOutput extends Record<string, unknown> {
  type: "function_call_output";
  call_id: string;
  output: string;
}

interface MissionToolRunnerFactories {
  actionId?: () => string;
  eventId?: () => string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  throw new MissionToolPolicyError("invalid_arguments");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseArguments(
  definition: MissionToolDefinition,
  rawArguments: string,
): Record<string, unknown> {
  if (byteLength(rawArguments) > MAX_ARGUMENT_BYTES) {
    throw new MissionToolPolicyError("invalid_arguments");
  }
  try {
    const value = JSON.parse(rawArguments) as unknown;
    return definition.inputSchema.parse(value);
  } catch (error) {
    if (error instanceof MissionToolPolicyError) throw error;
    throw new MissionToolPolicyError("invalid_arguments");
  }
}

function nextSequence(events: unknown[]): number {
  return (
    events.reduce<number>((highest, event) => {
      if (
        event &&
        typeof event === "object" &&
        "sequence" in event &&
        typeof event.sequence === "number"
      ) {
        return Math.max(highest, event.sequence);
      }
      return highest;
    }, 0) + 1
  );
}

function boundedJson(value: Record<string, unknown>): string {
  const serialized = JSON.stringify(value);
  if (byteLength(serialized) > MAX_RESULT_BYTES) {
    throw new MissionToolPolicyError("oversized_result");
  }
  return serialized;
}

export async function hashToolArguments(
  argumentsValue: Record<string, unknown>,
): Promise<string> {
  const canonical = JSON.stringify(canonicalize(argumentsValue));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export class MissionToolRunner {
  private readonly definitions: Map<string, MissionToolDefinition>;
  private readonly actionId: () => string;
  private readonly eventId: () => string;

  constructor(
    definitions: MissionToolDefinition[],
    factories: MissionToolRunnerFactories = {},
  ) {
    this.definitions = new Map();
    for (const definition of definitions) {
      if (this.definitions.has(definition.name)) {
        throw new Error(`Duplicate mission tool: ${definition.name}`);
      }
      this.definitions.set(definition.name, definition);
    }
    this.actionId =
      factories.actionId ??
      (() => `act_${crypto.randomUUID().replaceAll("-", "")}`);
    this.eventId =
      factories.eventId ??
      (() => `evt_${crypto.randomUUID().replaceAll("-", "")}`);
  }

  private definition(
    name: string,
    kind: "read" | "write",
    context: MissionToolContext,
  ): MissionToolDefinition {
    const definition = this.definitions.get(name);
    if (!definition) throw new MissionToolPolicyError("unlisted_tool");
    if (definition.kind !== kind) {
      throw new MissionToolPolicyError("wrong_tool_kind");
    }
    if (!definition.allowedStages.includes(context.session.stage)) {
      throw new MissionToolPolicyError("wrong_stage");
    }
    return definition;
  }

  private authorizedArguments(
    definition: MissionToolDefinition,
    rawArguments: string,
    context: MissionToolContext,
  ): Record<string, unknown> {
    const input = parseArguments(definition, rawArguments);
    if (!definition.authorize(input, context)) {
      throw new MissionToolPolicyError("unauthorized_resource");
    }
    return input;
  }

  openAITools(): Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict: true;
  }> {
    return Array.from(this.definitions.values(), (definition) => {
      const parameters = z.toJSONSchema(
        definition.inputSchema,
      ) as Record<string, unknown> & { $schema?: string };
      delete parameters.$schema;
      return {
        type: "function",
        name: definition.name,
        description: definition.description,
        parameters,
        strict: true,
      };
    });
  }

  toolKind(name: string): "read" | "write" | null {
    return this.definitions.get(name)?.kind ?? null;
  }

  async handleRead(
    call: MissionToolCall,
    context: MissionToolContext,
  ): Promise<{
    output: Record<string, unknown>;
    functionOutput: MissionFunctionOutput;
    event: MissionToolEvent;
  }> {
    const definition = this.definition(call.name, "read", context);
    if (definition.kind !== "read") {
      throw new MissionToolPolicyError("wrong_tool_kind");
    }
    const input = this.authorizedArguments(
      definition,
      call.arguments,
      context,
    );
    const output = await definition.execute(input, context);
    const serializedOutput = boundedJson(output);
    const summary = definition.summarize(output, input);

    return {
      output,
      functionOutput: {
        type: "function_call_output",
        call_id: call.callId,
        output: serializedOutput,
      },
      event: {
        id: this.eventId(),
        sequence: nextSequence(context.session.events),
        kind: "tool_result",
        toolName: definition.name,
        callId: call.callId,
        label: summary.label,
        sanitizedArguments: input,
        result: output,
        createdAt: context.now,
      },
    };
  }

  async freezeWrite(
    call: MissionToolCall,
    context: MissionToolContext,
  ): Promise<PendingMissionAction> {
    const definition = this.definition(call.name, "write", context);
    if (definition.kind !== "write") {
      throw new MissionToolPolicyError("wrong_tool_kind");
    }
    const input = this.authorizedArguments(
      definition,
      call.arguments,
      context,
    );
    const { idempotencyKey, ...preview } = definition.preview(input, context);
    const sessionVersion = context.session.version + 1;

    return {
      id: this.actionId(),
      sessionId: context.session.id,
      callId: call.callId,
      toolName: definition.name,
      argumentsHash: await hashToolArguments(input),
      arguments: input,
      preview,
      status: "pending",
      sessionVersion,
      idempotencyKey: `${idempotencyKey}:v${sessionVersion}`,
      result: null,
      createdAt: context.now,
      expiresAt: context.now + ACTION_TTL_MS,
      decidedAt: null,
      executedAt: null,
    };
  }

  async executeFrozenWrite(
    action: PendingMissionAction,
    context: MissionToolContext,
  ): Promise<{
    world: Record<string, unknown>;
    result: Record<string, unknown>;
  }> {
    if (action.status !== "approved") {
      throw new MissionToolPolicyError("action_not_approved");
    }
    if (action.expiresAt <= context.now) {
      throw new MissionToolPolicyError("expired_action");
    }
    if (
      action.sessionId !== context.session.id ||
      action.sessionVersion !== context.session.version ||
      context.session.pendingActionId !== action.id
    ) {
      throw new MissionToolPolicyError("stale_action");
    }

    const definition = this.definition(action.toolName, "write", context);
    if (definition.kind !== "write") {
      throw new MissionToolPolicyError("wrong_tool_kind");
    }
    const parsedArguments = definition.inputSchema.safeParse(action.arguments);
    if (!parsedArguments.success) {
      throw new MissionToolPolicyError("changed_action");
    }
    if (
      (await hashToolArguments(parsedArguments.data)) !== action.argumentsHash
    ) {
      throw new MissionToolPolicyError("changed_action");
    }
    if (!definition.authorize(parsedArguments.data, context)) {
      throw new MissionToolPolicyError("unauthorized_resource");
    }

    const executed = await definition.execute(parsedArguments.data, context);
    boundedJson(executed.result);
    boundedJson(executed.world);
    return executed;
  }
}
