import { describe, expect, it, vi } from "vitest";
import { createDemoCoach } from "./mission";
import { postCoach } from "./mission-client";

const request = {
  scenarioId: "cancel-streamly" as const,
  stage: "share" as const,
  decision: "focused-access" as const,
};

describe("postCoach", () => {
  it("posts a validated decision and returns validated guidance", async () => {
    const responseBody = createDemoCoach(request);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(postCoach(request)).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mission",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces a server-provided error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "The sandbox is unavailable." }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(postCoach(request)).rejects.toThrow("The sandbox is unavailable.");
  });
});
