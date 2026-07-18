import { describe, expect, it, vi } from "vitest";
import { createDemoJourney } from "./journey";
import { postJourney } from "./journey-client";

const request = {
  stage: "goal" as const,
  goal: "Write my performance review",
  notes: "",
  refinement: "",
};

describe("postJourney", () => {
  it("posts a validated request and returns a validated journey", async () => {
    const journey = createDemoJourney(request);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(journey), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(postJourney(request)).resolves.toEqual(journey);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/journey",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces a server-provided error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Try a smaller task." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(postJourney(request)).rejects.toThrow("Try a smaller task.");
  });

  it("uses a stable fallback for an unknown server error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Unknown" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(postJourney(request)).rejects.toThrow(
      "The map could not be generated.",
    );
  });
});
