import { afterEach, describe, expect, it } from "vitest";
import { SQLiteD1TestDatabase } from "../../../../test-support/sqlite-d1";
import type { MissionModelAdapter } from "../../../../lib/mission-orchestrator";
import { installMissionRuntimeBindings } from "../../../../lib/runtime-bindings";
import { createMissionRuntimeHandler, GET } from "./route";

const secret = "a-route-test-secret-that-is-more-than-thirty-two-characters";

function request(body: unknown) {
  return new Request("http://localhost/api/mission/runtime", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mission/runtime", () => {
  let database: SQLiteD1TestDatabase | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
    delete (globalThis as typeof globalThis & { __onYourBehalfRuntime?: unknown })
      .__onYourBehalfRuntime;
  });

  function handler(live = true) {
    database = new SQLiteD1TestDatabase();
    const adapter: MissionModelAdapter = {
      respond: async () => {
        throw new Error("The start request should not call the model");
      },
    };
    return createMissionRuntimeHandler({
      getBindings: () => ({
        DB: database as never,
        OPENAI_API_KEY: "test-key",
        MISSION_STATE_SECRET: secret,
        LIVE_GOLDEN_MISSIONS: live ? "true" : "false",
      }),
      createAdapter: () => adapter,
      now: () => Date.parse("2026-07-18T18:00:00.000Z"),
      clientKey: () => `route-test-${crypto.randomUUID()}`,
    });
  }

  it("starts the live mission with no-store browser state", async () => {
    const response = await handler()(request({
      version: 2,
      type: "start",
      scenarioId: "cancel-streamly",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      version: 2,
      status: "active",
      viewState: { stage: "access" },
    });
  });

  it("fails closed when live missions are disabled", async () => {
    const response = await handler(false)(request({
      version: 2,
      type: "start",
      scenarioId: "cancel-streamly",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "This live mission is paused right now.",
    });
  });

  it("rejects malformed and oversized requests", async () => {
    const post = handler();
    const malformed = await post(
      new Request("http://localhost/api/mission/runtime", {
        method: "POST",
        body: "{not-json",
      }),
    );
    const oversized = await post(
      new Request("http://localhost/api/mission/runtime", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(33_000) }),
      }),
    );

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
  });

  it("rejects a declared oversized body before reading it", async () => {
    const response = await handler()(
      new Request("http://localhost/api/mission/runtime", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "40000",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(413);
  });

  it("fails safely for missing credentials, invalid choices, and server errors", async () => {
    database = new SQLiteD1TestDatabase();
    const missingCredentials = createMissionRuntimeHandler({
      getBindings: () => ({
        DB: database as never,
        LIVE_GOLDEN_MISSIONS: "true",
      }),
      now: () => Date.parse("2026-07-18T18:00:00.000Z"),
      clientKey: () => "missing-credentials",
    });
    const invalidChoice = handler();
    const serverError = createMissionRuntimeHandler({
      getBindings: () => {
        throw new Error("binding failure");
      },
      now: () => Date.parse("2026-07-18T18:00:00.000Z"),
      clientKey: () => "server-error",
    });

    expect((await missingCredentials(request({ version: 2, type: "start", scenarioId: "cancel-streamly" }))).status).toBe(503);
    expect((await invalidChoice(request({ version: 2, type: "not-a-step" }))).status).toBe(400);
    expect((await serverError(request({ version: 2, type: "start", scenarioId: "cancel-streamly" }))).status).toBe(502);
  });

  it("enforces minute and hour limits and resets elapsed windows", async () => {
    let now = Date.parse("2026-07-18T18:00:00.000Z");
    const post = createMissionRuntimeHandler({
      getBindings: () => ({
        DB: {} as never,
        LIVE_GOLDEN_MISSIONS: "false",
      }),
      now: () => now,
      clientKey: () => "rate-test",
    });

    for (let index = 0; index < 10; index += 1) {
      expect((await post(request({}))).status).toBe(503);
    }
    const minuteLimited = await post(request({}));
    expect(minuteLimited.status).toBe(429);
    expect(minuteLimited.headers.get("retry-after")).toBe("60");

    now += 60_001;
    expect((await post(request({}))).status).toBe(503);

    for (let index = 0; index < 49; index += 1) {
      now += 60_001;
      expect((await post(request({}))).status).toBe(503);
    }
    const hourLimited = await post(request({}));
    expect(hourLimited.status).toBe(429);
    expect(Number(hourLimited.headers.get("retry-after"))).toBeGreaterThan(1);

    now += 60 * 60_000;
    expect((await post(request({}))).status).toBe(503);
  });

  it("identifies clients from each supported forwarding header", async () => {
    const post = createMissionRuntimeHandler({
      getBindings: () => ({ DB: {} as never, LIVE_GOLDEN_MISSIONS: "false" }),
      now: () => Date.parse("2026-07-18T18:00:00.000Z"),
    });
    const headers = [
      { "cf-connecting-ip": "203.0.113.1" },
      { "x-real-ip": "203.0.113.2" },
      { "x-forwarded-for": "203.0.113.3, 203.0.113.4" },
      {},
    ];

    for (const forwarded of headers) {
      const response = await post(new Request("http://localhost/api/mission/runtime", {
        method: "POST",
        headers: { "content-type": "application/json", ...forwarded },
        body: "{}",
      }));
      expect(response.status).toBe(503);
    }
  });

  it("reports whether the live mission is ready", async () => {
    installMissionRuntimeBindings({
      DB: {} as never,
      OPENAI_API_KEY: "test-key",
      MISSION_STATE_SECRET: secret,
      LIVE_GOLDEN_MISSIONS: "true",
    });
    await expect(GET().then((response) => response.json())).resolves.toEqual({
      cancelStreamly: "live",
    });

    installMissionRuntimeBindings({ DB: {} as never, LIVE_GOLDEN_MISSIONS: "false" });
    await expect(GET().then((response) => response.json())).resolves.toEqual({
      cancelStreamly: "practice",
    });

    delete (globalThis as typeof globalThis & { __onYourBehalfRuntime?: unknown })
      .__onYourBehalfRuntime;
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ cancelStreamly: "unavailable" });
  });
});
