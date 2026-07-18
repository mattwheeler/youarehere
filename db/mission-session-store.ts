import { missionSchemaStatements } from "./schema";

interface D1Result {
  success: boolean;
  meta: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  batch<T = D1Result>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export type MissionExperienceMode = "live" | "practice";
export type MissionStatus =
  | "active"
  | "awaiting_approval"
  | "complete"
  | "retryable_error";

export interface MissionSession {
  id: string;
  scenarioId: string;
  seedId: string;
  experienceMode: MissionExperienceMode;
  status: MissionStatus;
  stage: string;
  version: number;
  permissions: string[];
  world: Record<string, unknown>;
  events: unknown[];
  continuation: Record<string, unknown> | null;
  pendingActionId: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export type PendingMissionActionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export interface PendingMissionAction {
  id: string;
  sessionId: string;
  callId: string;
  toolName: string;
  argumentsHash: string;
  arguments: Record<string, unknown>;
  preview: {
    label: string;
    consequence: string;
    details: Record<string, unknown>;
  };
  status: PendingMissionActionStatus;
  sessionVersion: number;
  idempotencyKey: string;
  result: Record<string, unknown> | null;
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
  executedAt: number | null;
}

interface SessionRow {
  id: string;
  scenario_id: string;
  seed_id: string;
  experience_mode: MissionExperienceMode;
  status: MissionStatus;
  stage: string;
  version: number;
  permissions_json: string;
  world_json: string;
  events_json: string;
  continuation_json: string | null;
  pending_action_id: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
}

interface ActionRow {
  id: string;
  session_id: string;
  call_id: string;
  tool_name: string;
  arguments_hash: string;
  arguments_json: string;
  preview_json: string;
  status: PendingMissionActionStatus;
  session_version: number;
  idempotency_key: string;
  result_json: string | null;
  created_at: number;
  expires_at: number;
  decided_at: number | null;
  executed_at: number | null;
}

export interface UpdateSessionInput {
  sessionId: string;
  expectedVersion: number;
  now: number;
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
  >;
}

export type UpdateSessionResult =
  | { kind: "updated"; session: MissionSession }
  | { kind: "conflict" };

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Stored ${label} is invalid`);
  }
}

function sessionFromRow(row: SessionRow): MissionSession {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    seedId: row.seed_id,
    experienceMode: row.experience_mode,
    status: row.status,
    stage: row.stage,
    version: row.version,
    permissions: parseJson<string[]>(row.permissions_json, "mission permissions"),
    world: parseJson<Record<string, unknown>>(row.world_json, "mission world"),
    events: parseJson<unknown[]>(row.events_json, "mission events"),
    continuation: row.continuation_json
      ? parseJson<Record<string, unknown>>(row.continuation_json, "mission continuation")
      : null,
    pendingActionId: row.pending_action_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function actionFromRow(row: ActionRow): PendingMissionAction {
  return {
    id: row.id,
    sessionId: row.session_id,
    callId: row.call_id,
    toolName: row.tool_name,
    argumentsHash: row.arguments_hash,
    arguments: parseJson<Record<string, unknown>>(row.arguments_json, "mission action arguments"),
    preview: parseJson<PendingMissionAction["preview"]>(
      row.preview_json,
      "mission action preview",
    ),
    status: row.status,
    sessionVersion: row.session_version,
    idempotencyKey: row.idempotency_key,
    result: row.result_json
      ? parseJson<Record<string, unknown>>(row.result_json, "mission action result")
      : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    executedAt: row.executed_at,
  };
}

export class D1MissionSessionStore {
  constructor(private readonly database: D1DatabaseLike) {}

  async initialize(): Promise<void> {
    for (const statement of missionSchemaStatements) {
      await this.database.prepare(statement).run();
    }
  }

  async createSession(session: MissionSession): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO mission_sessions (
          id, scenario_id, seed_id, experience_mode, status, stage, version,
          permissions_json, world_json, events_json, continuation_json,
          pending_action_id, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.id,
        session.scenarioId,
        session.seedId,
        session.experienceMode,
        session.status,
        session.stage,
        session.version,
        JSON.stringify(session.permissions),
        JSON.stringify(session.world),
        JSON.stringify(session.events),
        session.continuation === null ? null : JSON.stringify(session.continuation),
        session.pendingActionId,
        session.createdAt,
        session.updatedAt,
        session.expiresAt,
      )
      .run();
  }

  async getSession(sessionId: string, now: number): Promise<MissionSession | null> {
    const row = await this.database
      .prepare(`SELECT * FROM mission_sessions WHERE id = ? AND expires_at > ?`)
      .bind(sessionId, now)
      .first<SessionRow>();
    return row ? sessionFromRow(row) : null;
  }

  async updateSession(input: UpdateSessionInput): Promise<UpdateSessionResult> {
    const current = await this.getSession(input.sessionId, input.now);
    if (!current || current.version !== input.expectedVersion) {
      return { kind: "conflict" };
    }

    const next = { ...current, ...input.patch };
    const result = await this.database
      .prepare(
        `UPDATE mission_sessions SET
          status = ?, stage = ?, permissions_json = ?, world_json = ?,
          events_json = ?, continuation_json = ?, pending_action_id = ?,
          version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND expires_at > ?`,
      )
      .bind(
        next.status,
        next.stage,
        JSON.stringify(next.permissions),
        JSON.stringify(next.world),
        JSON.stringify(next.events),
        next.continuation === null ? null : JSON.stringify(next.continuation),
        next.pendingActionId,
        input.now,
        input.sessionId,
        input.expectedVersion,
        input.now,
      )
      .run();

    if (result.meta.changes !== 1) return { kind: "conflict" };
    const updated = await this.getSession(input.sessionId, input.now);
    if (!updated) return { kind: "conflict" };
    return { kind: "updated", session: updated };
  }

  async attachPendingAction(input: {
    sessionId: string;
    expectedVersion: number;
    action: PendingMissionAction;
    now: number;
    events?: unknown[];
    continuation?: Record<string, unknown>;
  }): Promise<{ kind: "attached"; action: PendingMissionAction } | { kind: "conflict" }> {
    const { action } = input;
    if (
      action.sessionId !== input.sessionId ||
      action.sessionVersion !== input.expectedVersion + 1 ||
      action.status !== "pending" ||
      action.expiresAt <= input.now
    ) {
      return { kind: "conflict" };
    }

    const insert = this.database
      .prepare(
        `INSERT INTO mission_actions (
          id, session_id, call_id, tool_name, arguments_hash, arguments_json,
          preview_json, status, session_version, idempotency_key, result_json, created_at,
          expires_at, decided_at, executed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        action.id,
        action.sessionId,
        action.callId,
        action.toolName,
        action.argumentsHash,
        JSON.stringify(action.arguments),
        JSON.stringify(action.preview),
        action.status,
        action.sessionVersion,
        action.idempotencyKey,
        action.result === null ? null : JSON.stringify(action.result),
        action.createdAt,
        action.expiresAt,
        action.decidedAt,
        action.executedAt,
      );
    const attach = this.database
      .prepare(
        `UPDATE mission_sessions
         SET pending_action_id = ?, status = 'awaiting_approval',
             events_json = COALESCE(?, events_json),
             continuation_json = COALESCE(?, continuation_json),
             version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND pending_action_id IS NULL AND expires_at > ?`,
      )
      .bind(
        action.id,
        input.events ? JSON.stringify(input.events) : null,
        input.continuation ? JSON.stringify(input.continuation) : null,
        input.now,
        input.sessionId,
        input.expectedVersion,
        input.now,
      );

    try {
      const results = await this.database.batch<D1Result>([insert, attach]);
      if (results.length !== 2 || results[1].meta.changes !== 1) {
        return { kind: "conflict" };
      }
      return { kind: "attached", action };
    } catch {
      // Unique keys, a stale version, or the guard trigger all fail closed.
      return { kind: "conflict" };
    }
  }

  async claimPendingAction(input: {
    sessionId: string;
    actionId: string;
    sessionVersion: number;
    decision: "approve" | "reject";
    now: number;
  }): Promise<
    | { kind: "claimed"; action: PendingMissionAction }
    | { kind: "already_decided"; action: PendingMissionAction }
    | { kind: "expired" }
    | { kind: "conflict" }
  > {
    const status = input.decision === "approve" ? "approved" : "rejected";
    const result = await this.database
      .prepare(
        `UPDATE mission_actions
         SET status = ?, decided_at = ?
         WHERE id = ? AND session_id = ? AND session_version = ?
           AND status = 'pending' AND expires_at > ?
           AND EXISTS (
             SELECT 1 FROM mission_sessions
             WHERE id = ? AND version = ? AND pending_action_id = ?
               AND expires_at > ?
           )`,
      )
      .bind(
        status,
        input.now,
        input.actionId,
        input.sessionId,
        input.sessionVersion,
        input.now,
        input.sessionId,
        input.sessionVersion,
        input.actionId,
        input.now,
      )
      .run();

    const row = await this.database
      .prepare(`SELECT * FROM mission_actions WHERE id = ? AND session_id = ?`)
      .bind(input.actionId, input.sessionId)
      .first<ActionRow>();

    if (result.meta.changes === 1 && row) {
      return { kind: "claimed", action: actionFromRow(row) };
    }
    if (!row || row.session_version !== input.sessionVersion) {
      return { kind: "conflict" };
    }
    if (row.expires_at <= input.now && row.status === "pending") {
      return { kind: "expired" };
    }
    if (row.status !== "pending") {
      return { kind: "already_decided", action: actionFromRow(row) };
    }
    return { kind: "conflict" };
  }

  async getAction(
    sessionId: string,
    actionId: string,
  ): Promise<PendingMissionAction | null> {
    const row = await this.database
      .prepare(`SELECT * FROM mission_actions WHERE id = ? AND session_id = ?`)
      .bind(actionId, sessionId)
      .first<ActionRow>();
    return row ? actionFromRow(row) : null;
  }

  async completeApprovedAction(input: {
    sessionId: string;
    actionId: string;
    sessionVersion: number;
    argumentsHash: string;
    world: Record<string, unknown>;
    events: unknown[];
    continuation: Record<string, unknown>;
    result: Record<string, unknown>;
    now: number;
  }): Promise<
    | {
        kind: "executed";
        action: PendingMissionAction;
        session: MissionSession;
      }
    | { kind: "already_executed"; action: PendingMissionAction }
    | { kind: "conflict" }
  > {
    const executeAction = this.database
      .prepare(
        `UPDATE mission_actions
         SET status = 'executed', result_json = ?, executed_at = ?
         WHERE id = ? AND session_id = ? AND session_version = ?
           AND arguments_hash = ? AND status = 'approved' AND expires_at > ?
           AND EXISTS (
             SELECT 1 FROM mission_sessions
             WHERE id = ? AND version = ? AND pending_action_id = ?
               AND expires_at > ?
           )`,
      )
      .bind(
        JSON.stringify(input.result),
        input.now,
        input.actionId,
        input.sessionId,
        input.sessionVersion,
        input.argumentsHash,
        input.now,
        input.sessionId,
        input.sessionVersion,
        input.actionId,
        input.now,
      );
    const updateSession = this.database
      .prepare(
        `UPDATE mission_sessions
         SET world_json = ?, events_json = ?, continuation_json = ?,
             pending_action_id = NULL, status = 'active',
             version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND pending_action_id = ?
           AND expires_at > ?
           AND EXISTS (
             SELECT 1 FROM mission_actions
             WHERE id = ? AND session_id = ? AND session_version = ?
               AND arguments_hash = ? AND status = 'executed'
           )`,
      )
      .bind(
        JSON.stringify(input.world),
        JSON.stringify(input.events),
        JSON.stringify(input.continuation),
        input.now,
        input.sessionId,
        input.sessionVersion,
        input.actionId,
        input.now,
        input.actionId,
        input.sessionId,
        input.sessionVersion,
        input.argumentsHash,
      );

    try {
      const results = await this.database.batch<D1Result>([
        executeAction,
        updateSession,
      ]);
      if (
        results.length === 2 &&
        results[0].meta.changes === 1 &&
        results[1].meta.changes === 1
      ) {
        const [action, session] = await Promise.all([
          this.getAction(input.sessionId, input.actionId),
          this.getSession(input.sessionId, input.now),
        ]);
        if (action && session) return { kind: "executed", action, session };
      }
    } catch {
      // Trigger, hash, expiry, and session conflicts all fail closed.
    }

    const existing = await this.getAction(input.sessionId, input.actionId);
    if (
      existing?.status === "executed" &&
      existing.argumentsHash === input.argumentsHash
    ) {
      return { kind: "already_executed", action: existing };
    }
    return { kind: "conflict" };
  }

  async completeRejectedAction(input: {
    sessionId: string;
    actionId: string;
    sessionVersion: number;
    events: unknown[];
    continuation: Record<string, unknown>;
    result: Record<string, unknown>;
    now: number;
  }): Promise<
    | { kind: "rejected"; action: PendingMissionAction; session: MissionSession }
    | { kind: "already_rejected"; action: PendingMissionAction }
    | { kind: "conflict" }
  > {
    const recordResult = this.database
      .prepare(
        `UPDATE mission_actions SET result_json = ?
         WHERE id = ? AND session_id = ? AND session_version = ?
           AND status = 'rejected' AND result_json IS NULL`,
      )
      .bind(
        JSON.stringify(input.result),
        input.actionId,
        input.sessionId,
        input.sessionVersion,
      );
    const updateSession = this.database
      .prepare(
        `UPDATE mission_sessions
         SET events_json = ?, continuation_json = ?, pending_action_id = NULL,
             status = 'active', version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND pending_action_id = ?
           AND expires_at > ?
           AND EXISTS (
             SELECT 1 FROM mission_actions
             WHERE id = ? AND session_id = ? AND session_version = ?
               AND status = 'rejected' AND result_json IS NOT NULL
           )`,
      )
      .bind(
        JSON.stringify(input.events),
        JSON.stringify(input.continuation),
        input.now,
        input.sessionId,
        input.sessionVersion,
        input.actionId,
        input.now,
        input.actionId,
        input.sessionId,
        input.sessionVersion,
      );

    try {
      const results = await this.database.batch<D1Result>([
        recordResult,
        updateSession,
      ]);
      if (results.length === 2 && results[1].meta.changes === 1) {
        const [action, session] = await Promise.all([
          this.getAction(input.sessionId, input.actionId),
          this.getSession(input.sessionId, input.now),
        ]);
        if (action && session) return { kind: "rejected", action, session };
      }
    } catch {
      // Rejection state conflicts fail closed and leave the world unchanged.
    }

    const existing = await this.getAction(input.sessionId, input.actionId);
    if (existing?.status === "rejected" && existing.result) {
      return { kind: "already_rejected", action: existing };
    }
    return { kind: "conflict" };
  }
}
