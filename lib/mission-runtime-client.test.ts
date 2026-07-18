import { describe, expect, it, vi } from "vitest";
import {
  getMissionRuntimeStatus,
  postMissionRuntime,
} from "./mission-runtime-client";

describe("mission runtime browser client", () => {
  it("posts versioned mission requests without caching", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: 2,
          sessionToken: "opaque.session.token",
          stateVersion: 1,
          status: "active",
          viewState: {
            scenarioId: "cancel-streamly",
            stage: "access",
            progress: 0.1,
            visiblePermissions: [],
          },
          events: [],
          pendingAction: null,
          provenance: {
            mode: "live",
            model: "gpt-5.6",
            responseIds: [],
          },
        }),
      ),
    );

    await postMissionRuntime(
      { version: 2, type: "start", scenarioId: "cancel-streamly" },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/mission/runtime",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
  });

  it("returns a plain learner-facing API error", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "This live mission is paused right now." }, { status: 503 }),
    );

    await expect(
      postMissionRuntime(
        { version: 2, type: "start", scenarioId: "cancel-streamly" },
        fetcher,
      ),
    ).rejects.toThrow("This live mission is paused right now.");
  });

  it("checks whether the live cancellation is ready", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ cancelStreamly: "live" }),
    );
    await expect(getMissionRuntimeStatus(fetcher)).resolves.toEqual({
      cancelStreamly: "live",
    });
  });
});
