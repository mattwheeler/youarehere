import { afterEach, describe, expect, it } from "vitest";
import { SQLiteD1TestDatabase } from "../../../../test-support/sqlite-d1";
import type { MissionModelAdapter } from "../../../../lib/mission-orchestrator";
import { createMissionRuntimeHandler } from "./route";

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

  afterEach(() => database?.close());

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
});
