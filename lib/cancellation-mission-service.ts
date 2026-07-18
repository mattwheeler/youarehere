import {
  D1MissionSessionStore,
  type MissionSession,
  type PendingMissionAction,
} from "../db/mission-session-store";
import { MissionApprovalCoordinator } from "./mission-approval";
import { createCancellationToolRunner } from "./cancellation-tools";
import {
  cancellationWorldSeeds,
  getCancellationWorldSeed,
} from "./golden-missions";
import {
  MissionOrchestrator,
  parseMissionContinuation,
  type MissionContinuation,
  type MissionModelAdapter,
  type MissionModelItem,
  type MissionRunResult,
} from "./mission-orchestrator";
import {
  missionRuntimeRequestSchema,
  missionRuntimeResponseSchema,
  type MissionRuntimeRequest,
  type MissionRuntimeResponse,
} from "./mission-runtime";
import { issueMissionToken, verifyMissionToken } from "./mission-token";

const SESSION_TTL_MS = 30 * 60_000;
const PUBLIC_EVENT_KINDS = new Set([
  "coach",
  "permission",
  "tool_call",
  "tool_result",
  "approval",
  "outcome",
  "error",
]);

export interface CancellationMissionServiceFactories {
  sessionId?: () => string;
  eventId?: () => string;
  seedId?: () => string;
  actionId?: () => string;
  toolEventId?: () => string;
}

export class CancellationMissionServiceError extends Error {
  constructor(
    public readonly code:
      | "invalid_state"
      | "conflict"
      | "expired"
      | "unsupported_mission",
  ) {
    super("The mission could not continue");
  }
}

function randomId(prefix: "ses" | "evt"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function eventValue(
  event: unknown,
  key: string,
): unknown {
  return event && typeof event === "object" && key in event
    ? event[key as keyof typeof event]
    : undefined;
}

function responseIds(session: MissionSession): string[] {
  if (!session.continuation) return [];
  try {
    return parseMissionContinuation(session.continuation).responseIds;
  } catch {
    return [];
  }
}

function visiblePermissions(permissions: string[]): string[] {
  return permissions.flatMap((permission) => {
    if (permission === "mail:streamly") return ["Streamly messages only"];
    if (permission === "mail:metadata:all") return ["All inbox metadata"];
    if (permission.startsWith("mail:message:")) return ["One pasted message"];
    return [];
  });
}

function progress(stage: string): number {
  if (stage === "access") return 0.1;
  if (stage === "work") return 0.35;
  if (stage === "route-choice") return 0.55;
  if (stage === "proof") return 0.85;
  if (stage === "complete") return 1;
  return 0.7;
}

function publicEvents(events: unknown[]): MissionRuntimeResponse["events"] {
  return events
    .flatMap((event) => {
      const id = eventValue(event, "id");
      const kind = eventValue(event, "kind");
      const label = eventValue(event, "label");
      const createdAt = eventValue(event, "createdAt");
      if (
        typeof id !== "string" ||
        typeof kind !== "string" ||
        !PUBLIC_EVENT_KINDS.has(kind) ||
        typeof label !== "string" ||
        typeof createdAt !== "number"
      ) {
        return [];
      }
      const toolName = eventValue(event, "toolName");
      const callId = eventValue(event, "callId");
      const argumentsValue = eventValue(event, "sanitizedArguments");
      const result = eventValue(event, "result");
      const technical =
        typeof toolName === "string" &&
        typeof callId === "string" &&
        argumentsValue !== null &&
        typeof argumentsValue === "object" &&
        !Array.isArray(argumentsValue) &&
        result !== null &&
        typeof result === "object" &&
        !Array.isArray(result)
          ? {
              toolName,
              callId,
              arguments: argumentsValue as Record<string, unknown>,
              result: result as Record<string, unknown>,
            }
          : undefined;
      return [
        {
          id,
          kind: kind as MissionRuntimeResponse["events"][number]["kind"],
          label: label.slice(0, 240),
          createdAt,
          ...(technical ? { technical } : {}),
        },
      ];
    })
    .slice(-100);
}

function resetToolHops(continuation: MissionContinuation): MissionContinuation {
  return {
    ...continuation,
    items: [...continuation.items],
    responseIds: [...continuation.responseIds],
    toolHops: 0,
  };
}

function addUserTurn(
  continuation: MissionContinuation,
  content: string,
): MissionContinuation {
  return {
    ...resetToolHops(continuation),
    items: [
      ...continuation.items,
      { role: "user", content } as MissionModelItem,
    ],
  };
}

function proofMatches(session: MissionSession): boolean {
  const world = session.world as {
    subscription?: { id?: string; status?: string };
    confirmation?: { subscriptionId?: string; confirmationId?: string } | null;
  };
  if (
    world.subscription?.status !== "cancelled" ||
    !world.subscription.id ||
    world.confirmation?.subscriptionId !== world.subscription.id ||
    !world.confirmation.confirmationId
  ) {
    return false;
  }
  return session.events.some((event) => {
    if (eventValue(event, "toolName") !== "get_cancellation_confirmation") {
      return false;
    }
    const result = eventValue(event, "result");
    return (
      !!result &&
      typeof result === "object" &&
      "confirmationId" in result &&
      result.confirmationId === world.confirmation?.confirmationId &&
      "matchesAccountState" in result &&
      result.matchesAccountState === true
    );
  });
}

export class CancellationMissionService {
  private readonly sessionId: () => string;
  private readonly eventId: () => string;
  private readonly seedId: () => string;
  private readonly toolRunner;
  private readonly orchestrator: MissionOrchestrator;
  private readonly approvals: MissionApprovalCoordinator;

  constructor(
    private readonly store: D1MissionSessionStore,
    adapter: MissionModelAdapter,
    private readonly signingSecret: string,
    factories: CancellationMissionServiceFactories = {},
  ) {
    this.sessionId = factories.sessionId ?? (() => randomId("ses"));
    this.eventId = factories.eventId ?? (() => randomId("evt"));
    this.seedId =
      factories.seedId ??
      (() =>
        cancellationWorldSeeds[
          Math.floor(Math.random() * cancellationWorldSeeds.length)
        ].id);
    this.toolRunner = createCancellationToolRunner({
      actionId: factories.actionId,
      eventId: factories.toolEventId,
    });
    this.orchestrator = new MissionOrchestrator(adapter, this.toolRunner);
    this.approvals = new MissionApprovalCoordinator(store, this.toolRunner);
  }

  async handle(
    rawRequest: MissionRuntimeRequest,
    now = Date.now(),
  ): Promise<MissionRuntimeResponse> {
    const request = missionRuntimeRequestSchema.parse(rawRequest);
    if (request.type === "start") return this.start(request, now);
    if (request.type === "choose") return this.choose(request, now);
    if (request.type === "approve") return this.approve(request, now);
    return this.retry(request, now);
  }

  private async start(
    request: Extract<MissionRuntimeRequest, { type: "start" }>,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    if (request.scenarioId !== "cancel-streamly") {
      throw new CancellationMissionServiceError("unsupported_mission");
    }
    const seedId = this.seedId();
    const session: MissionSession = {
      id: this.sessionId(),
      scenarioId: request.scenarioId,
      seedId,
      experienceMode: "live",
      status: "active",
      stage: "access",
      version: 1,
      permissions: [],
      world: getCancellationWorldSeed(seedId) as unknown as Record<
        string,
        unknown
      >,
      events: [
        {
          id: this.eventId(),
          sequence: 1,
          kind: "coach",
          label: "Let’s cancel Streamly without opening your whole inbox.",
          createdAt: now,
        },
      ],
      continuation: null,
      pendingActionId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };
    await this.store.createSession(session);
    return this.present(session, now);
  }

  private async current(
    token: string,
    now: number,
  ): Promise<{ session: MissionSession; version: number }> {
    const claims = await verifyMissionToken(token, this.signingSecret, { now });
    const session = await this.store.getSession(claims.sessionId, now);
    if (!session) throw new CancellationMissionServiceError("expired");
    if (session.version !== claims.version) {
      throw new CancellationMissionServiceError("conflict");
    }
    return { session, version: claims.version };
  }

  private async update(
    session: MissionSession,
    now: number,
    patch: Partial<
      Pick<
        MissionSession,
        | "status"
        | "stage"
        | "permissions"
        | "world"
        | "events"
        | "continuation"
        | "pendingActionId"
      >
    >,
  ): Promise<MissionSession> {
    const result = await this.store.updateSession({
      sessionId: session.id,
      expectedVersion: session.version,
      patch,
      now,
    });
    if (result.kind !== "updated") {
      throw new CancellationMissionServiceError("conflict");
    }
    return result.session;
  }

  private async choose(
    request: Extract<MissionRuntimeRequest, { type: "choose" }>,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    const { session } = await this.current(request.sessionToken, now);
    if (session.stage === "access") {
      return this.chooseAccess(session, request.choiceId, now);
    }
    if (session.stage === "route-choice") {
      return this.chooseRoute(session, request.choiceId, now);
    }
    if (session.stage === "proof") {
      return this.chooseProof(session, request.choiceId, now);
    }
    throw new CancellationMissionServiceError("invalid_state");
  }

  private async chooseAccess(
    session: MissionSession,
    choiceId: string,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    const world = session.world as unknown as ReturnType<
      typeof getCancellationWorldSeed
    >;
    const receiptId = world.inbox.find((message) =>
      message.tags.includes("legitimate"),
    )?.id;
    const selection =
      choiceId === "focused-access"
        ? {
            permissions: ["mail:streamly"],
            label: "You shared only Streamly messages",
            prompt:
              "Find my Streamly renewal. Search, read both matching Streamly messages, then stop so I can choose the account address.",
          }
        : choiceId === "all-access"
          ? {
              permissions: ["mail:metadata:all"],
              label: "You allowed all inbox metadata",
              prompt:
                "Find my Streamly renewal. Search the allowed metadata, read both matching Streamly messages, then stop so I can choose the account address.",
            }
          : choiceId === "paste-item" && receiptId
            ? {
                permissions: [`mail:message:${receiptId}`],
                label: "You pasted one Streamly message",
                prompt: `Read the pasted message ${receiptId}, then stop so I can choose the account address.`,
              }
            : null;
    if (!selection) throw new CancellationMissionServiceError("invalid_state");

    const prepared = await this.update(session, now, {
      stage: "work",
      permissions: selection.permissions,
      events: [
        ...session.events,
        {
          id: this.eventId(),
          sequence: session.events.length + 1,
          kind: "permission",
          label: selection.label,
          createdAt: now,
        },
      ],
    });
    return this.runPhase(
      prepared,
      { initialInput: [{ role: "user", content: selection.prompt }] },
      "route-choice",
      now,
    );
  }

  private async chooseRoute(
    session: MissionSession,
    choiceId: string,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    if (!session.continuation) {
      throw new CancellationMissionServiceError("invalid_state");
    }
    const trusted = choiceId === "trusted-route";
    if (!trusted && choiceId !== "risky-route") {
      throw new CancellationMissionServiceError("invalid_state");
    }
    const linkId = trusted
      ? `link_${session.seedId}_account`
      : `link_${session.seedId}_phish`;
    const prepared = await this.update(session, now, {
      events: [
        ...session.events,
        {
          id: this.eventId(),
          sequence: session.events.length + 1,
          kind: "permission",
          label: trusted
            ? "You chose the Streamly account address"
            : "You asked AI to check the look-alike address",
          createdAt: now,
        },
      ],
    });
    const continuation = addUserTurn(
      parseMissionContinuation(prepared.continuation),
      trusted
        ? `Check ${linkId}. If it is trusted, preview the exact change and request cancellation.`
        : `Check ${linkId}. Do not continue if the address is not trusted.`,
    );
    return this.runPhase(
      prepared,
      { continuation },
      "route-choice",
      now,
    );
  }

  private async chooseProof(
    session: MissionSession,
    choiceId: string,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    const grounded = choiceId === "strong-proof" && proofMatches(session);
    const updated = await this.update(session, now, {
      status: grounded ? "complete" : "active",
      stage: grounded ? "complete" : "proof",
      events: [
        ...session.events,
        {
          id: this.eventId(),
          sequence: session.events.length + 1,
          kind: grounded ? "outcome" : "coach",
          label: grounded
            ? "The confirmation matches the cancelled Streamly account"
            : choiceId === "agent-claim"
              ? "AI saying “Done” is a claim. Check the confirmation instead."
              : "That is a clue. The saved confirmation is stronger proof.",
          createdAt: now,
        },
      ],
    });
    return this.present(updated, now);
  }

  private async approve(
    request: Extract<MissionRuntimeRequest, { type: "approve" }>,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    const claims = await verifyMissionToken(
      request.sessionToken,
      this.signingSecret,
      { now },
    );
    const decision = await this.approvals.decide({
      sessionId: claims.sessionId,
      actionId: request.pendingActionId,
      sessionVersion: claims.version,
      decision: request.decision,
      now,
    });
    if (decision.kind === "already_completed") {
      const current = await this.store.getSession(claims.sessionId, now);
      if (!current) throw new CancellationMissionServiceError("expired");
      return this.present(current, now);
    }
    if (decision.kind === "expired") {
      throw new CancellationMissionServiceError("expired");
    }
    if (decision.kind !== "resumable") {
      throw new CancellationMissionServiceError("conflict");
    }
    return this.runPhase(
      decision.session,
      { continuation: resetToolHops(decision.continuation) },
      request.decision === "approve" ? "proof" : "stopped",
      now,
      false,
    );
  }

  private async retry(
    request: Extract<MissionRuntimeRequest, { type: "retry" }>,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    const { session } = await this.current(request.sessionToken, now);
    if (!session.continuation) {
      throw new CancellationMissionServiceError("invalid_state");
    }
    return this.runPhase(
      session,
      { continuation: resetToolHops(parseMissionContinuation(session.continuation)) },
      session.stage,
      now,
      session.pendingActionId === null,
    );
  }

  private async runPhase(
    session: MissionSession,
    modelInput:
      | { initialInput: MissionModelItem[] }
      | { continuation: MissionContinuation },
    nextStage: string,
    now: number,
    allowPendingAction = true,
  ): Promise<MissionRuntimeResponse> {
    const result = await this.orchestrator.run({
      session,
      now,
      ...modelInput,
      attachPendingAction: allowPendingAction
        ? async (action, state) =>
            this.store.attachPendingAction({
              sessionId: session.id,
              expectedVersion: session.version,
              action,
              now,
              events: state.events,
              continuation: state.continuation,
            })
        : undefined,
    });

    if (result.kind === "awaiting_approval") {
      const attached = await this.store.getSession(session.id, now);
      if (!attached) throw new CancellationMissionServiceError("conflict");
      return this.present(attached, now, result.pendingAction);
    }
    return this.persistRun(session, result, nextStage, now);
  }

  private async persistRun(
    session: MissionSession,
    result: Exclude<MissionRunResult, { kind: "awaiting_approval" }>,
    nextStage: string,
    now: number,
  ): Promise<MissionRuntimeResponse> {
    const updated = await this.update(session, now, {
      status: result.kind === "retryable_error" ? "retryable_error" : "active",
      stage: result.kind === "retryable_error" ? session.stage : nextStage,
      events:
        result.kind === "retryable_error"
          ? [
              ...result.events,
              {
                id: this.eventId(),
                sequence: result.events.length + 1,
                kind: "error",
                label: "AI got stuck. Try that step again.",
                createdAt: now,
              },
            ]
          : result.events,
      continuation: result.continuation,
    });
    return this.present(updated, now);
  }

  private async present(
    session: MissionSession,
    now: number,
    knownAction?: PendingMissionAction,
  ): Promise<MissionRuntimeResponse> {
    const action =
      knownAction ??
      (session.pendingActionId
        ? await this.store.getAction(session.id, session.pendingActionId)
        : null);
    return missionRuntimeResponseSchema.parse({
      version: 2,
      sessionToken: await issueMissionToken(
        { sessionId: session.id, version: session.version },
        this.signingSecret,
        { now, ttlMs: Math.max(1, session.expiresAt - now) },
      ),
      stateVersion: session.version,
      status: session.status,
      viewState: {
        scenarioId: "cancel-streamly",
        stage: session.stage,
        progress: progress(session.stage),
        visiblePermissions: visiblePermissions(session.permissions),
      },
      events: publicEvents(session.events),
      pendingAction: action
        ? {
            id: action.id,
            label: action.preview.label,
            consequence: action.preview.consequence,
            details: action.preview.details,
            expiresAt: action.expiresAt,
          }
        : null,
      provenance: {
        mode: "live",
        model: "gpt-5.6",
        responseIds: responseIds(session),
      },
    });
  }
}
