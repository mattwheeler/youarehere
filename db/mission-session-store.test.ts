import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  D1MissionSessionStore,
  type MissionSession,
  type PendingMissionAction,
} from "./mission-session-store";

const now = 1_721_310_000_000;

function session(overrides: Partial<MissionSession> = {}): MissionSession {
  return {
    id: "ses_01J00000000000000000000000",
    scenarioId: "cancel-streamly",
    seedId: "cancel-a",
    experienceMode: "live",
    status: "active",
    stage: "share",
    version: 1,
    permissions: [],
    world: { subscription: { status: "active" } },
    events: [],
    continuation: null,
    pendingActionId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 30 * 60_000,
    ...overrides,
  };
}

function action(): PendingMissionAction {
  return {
    id: "act_01J00000000000000000000000",
    sessionId: "ses_01J00000000000000000000000",
    callId: "call_cancel_123",
    toolName: "cancel_subscription",
    argumentsHash: "sha256:fixed-test-hash",
    arguments: { subscriptionId: "sub_streamly_1" },
    preview: {
      label: "Cancel Streamly Premium",
      consequence: "The $18.99 renewal will not happen.",
      details: { subscriptionId: "sub_streamly_1" },
    },
    status: "pending",
    sessionVersion: 2,
    idempotencyKey: "cancel:sub_streamly_1:v2",
    result: null,
    createdAt: now,
    expiresAt: now + 5 * 60_000,
    decidedAt: null,
    executedAt: null,
  };
}

describe("D1 mission session store", () => {
  let miniflare: Miniflare;
  let store: D1MissionSessionStore;
  let database: Awaited<ReturnType<Miniflare["getD1Database"]>>;

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      d1Databases: ["DB"],
    });
    database = await miniflare.getD1Database("DB");
    store = new D1MissionSessionStore(database);
    await store.initialize();
  });

  beforeEach(async () => {
    await database.prepare("DELETE FROM mission_actions").run();
    await database.prepare("DELETE FROM mission_sessions").run();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  it("persists and retrieves authoritative state", async () => {
    await store.createSession(session());

    await expect(store.getSession(session().id, now + 1_000)).resolves.toEqual(session());
    await expect(store.getSession(session().id, now + 31 * 60_000)).resolves.toBeNull();
  });

  it("allows exactly one compare-and-swap from a version", async () => {
    await store.createSession(session());

    const results = await Promise.all([
      store.updateSession({
        sessionId: session().id,
        expectedVersion: 1,
        now: now + 1,
        patch: { stage: "check" },
      }),
      store.updateSession({
        sessionId: session().id,
        expectedVersion: 1,
        now: now + 1,
        patch: { stage: "approve" },
      }),
    ]);

    expect(results.filter((result) => result.kind === "updated")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "conflict")).toHaveLength(1);
    expect((await store.getSession(session().id, now + 2))?.version).toBe(2);
  });

  it("atomically attaches one pending action to the expected session version", async () => {
    await store.createSession(session());

    const attached = await store.attachPendingAction({
      sessionId: session().id,
      expectedVersion: 1,
      action: action(),
      now: now + 1,
    });

    expect(attached.kind).toBe("attached");
    expect((await store.getSession(session().id, now + 2))?.pendingActionId).toBe(action().id);
    expect((await store.getSession(session().id, now + 2))?.version).toBe(2);
    await expect(
      store.attachPendingAction({
        sessionId: session().id,
        expectedVersion: 1,
        action: { ...action(), id: "act_01J00000000000000000000001" },
        now: now + 2,
      }),
    ).resolves.toMatchObject({ kind: "conflict" });
  });

  it("allows only one caller to claim a pending action", async () => {
    await store.createSession(session());
    await store.attachPendingAction({
      sessionId: session().id,
      expectedVersion: 1,
      action: action(),
      now: now + 1,
    });

    const claims = await Promise.all([
      store.claimPendingAction({
        sessionId: session().id,
        actionId: action().id,
        sessionVersion: 2,
        decision: "approve",
        now: now + 2,
      }),
      store.claimPendingAction({
        sessionId: session().id,
        actionId: action().id,
        sessionVersion: 2,
        decision: "approve",
        now: now + 2,
      }),
    ]);

    expect(claims.filter((claim) => claim.kind === "claimed")).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === "already_decided")).toHaveLength(1);
  });

  it("does not claim an expired pending action", async () => {
    await store.createSession(session());
    await store.attachPendingAction({
      sessionId: session().id,
      expectedVersion: 1,
      action: { ...action(), expiresAt: now + 5 },
      now: now + 1,
    });

    await expect(
      store.claimPendingAction({
        sessionId: session().id,
        actionId: action().id,
        sessionVersion: 2,
        decision: "approve",
        now: now + 6,
      }),
    ).resolves.toMatchObject({ kind: "expired" });
  });

  it("does not claim an action after the session version has moved on", async () => {
    await store.createSession(session());
    await store.attachPendingAction({
      sessionId: session().id,
      expectedVersion: 1,
      action: action(),
      now: now + 1,
    });
    await store.updateSession({
      sessionId: session().id,
      expectedVersion: 2,
      now: now + 2,
      patch: { stage: "complete" },
    });

    await expect(
      store.claimPendingAction({
        sessionId: session().id,
        actionId: action().id,
        sessionVersion: 2,
        decision: "approve",
        now: now + 3,
      }),
    ).resolves.toMatchObject({ kind: "conflict" });
  });

  it("commits an approved world change exactly once", async () => {
    await store.createSession(session());
    await store.attachPendingAction({
      sessionId: session().id,
      expectedVersion: 1,
      action: action(),
      now: now + 1,
    });
    await store.claimPendingAction({
      sessionId: session().id,
      actionId: action().id,
      sessionVersion: 2,
      decision: "approve",
      now: now + 2,
    });

    const completion = {
      sessionId: session().id,
      actionId: action().id,
      sessionVersion: 2,
      argumentsHash: action().argumentsHash,
      world: { subscription: { status: "cancelled" } },
      events: [{ kind: "tool_result", label: "Cancelled" }],
      continuation: { items: [], responseIds: [], toolHops: 1 },
      result: { confirmationId: "confirm_1" },
      now: now + 3,
    };
    const completions = await Promise.all([
      store.completeApprovedAction(completion),
      store.completeApprovedAction(completion),
    ]);

    expect(completions.filter((result) => result.kind === "executed")).toHaveLength(1);
    expect(
      completions.filter((result) => result.kind === "already_executed"),
    ).toHaveLength(1);
    expect(await store.getSession(session().id, now + 4)).toMatchObject({
      version: 3,
      pendingActionId: null,
      world: { subscription: { status: "cancelled" } },
    });
    expect(await store.getAction(session().id, action().id)).toMatchObject({
      status: "executed",
      result: { confirmationId: "confirm_1" },
    });
  });

  it("records rejection without changing the synthetic world", async () => {
    await store.createSession(session());
    await store.attachPendingAction({
      sessionId: session().id,
      expectedVersion: 1,
      action: action(),
      now: now + 1,
    });
    await store.claimPendingAction({
      sessionId: session().id,
      actionId: action().id,
      sessionVersion: 2,
      decision: "reject",
      now: now + 2,
    });

    const rejected = await store.completeRejectedAction({
      sessionId: session().id,
      actionId: action().id,
      sessionVersion: 2,
      events: [{ kind: "approval", label: "You said no" }],
      continuation: { items: [], responseIds: [], toolHops: 1 },
      result: { approved: false, executed: false },
      now: now + 3,
    });

    expect(rejected.kind).toBe("rejected");
    expect(await store.getSession(session().id, now + 4)).toMatchObject({
      version: 3,
      pendingActionId: null,
      world: { subscription: { status: "active" } },
    });
    expect(await store.getAction(session().id, action().id)).toMatchObject({
      status: "rejected",
      result: { approved: false, executed: false },
    });
  });
});
