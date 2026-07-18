import { describe, expect, it, vi } from "vitest";
import { createDemoCoach } from "@/lib/mission";

const generateLiveCoachMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openai-coach", () => ({ generateLiveCoach: generateLiveCoachMock }));

import { POST } from "./route";

function request(body: unknown, clientIp?: string) {
  return new Request("http://localhost/api/mission", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(clientIp ? { "cf-connecting-ip": clientIp } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mission", () => {
  const validDecision = {
    scenarioId: "cancel-streamly",
    stage: "share",
    decision: "focused-access",
  } as const;

  it("rejects invalid mission decisions", async () => {
    const response = await POST(request({ ...validDecision, decision: "everything" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("returns a clearly labeled fixture in demo mode", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "true");
    const response = await POST(request(validDecision));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provenance).toEqual(
      expect.objectContaining({ model: "demo-fixture", live: false }),
    );
  });

  it("returns a live response when GPT-5.6 is configured", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateLiveCoachMock.mockResolvedValue({
      ...createDemoCoach(validDecision),
      provenance: { live: true, model: "gpt-5.6", responseId: "resp_test" },
    });

    const response = await POST(request(validDecision));

    expect(response.status).toBe(200);
    expect(generateLiveCoachMock).toHaveBeenCalledWith(
      validDecision,
      "test-key",
    );
  });

  it("fails closed when GPT-5.6 is not configured", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "false");
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(request(validDecision));

    expect(response.status).toBe(503);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/mission", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The request body must be valid JSON.",
    });
  });

  it("rate-limits repeated coaching requests by client IP", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "true");
    const responses = [];
    for (let attempt = 0; attempt < 13; attempt += 1) {
      responses.push(
        await POST(
          request(
            validDecision,
            "203.0.113.77",
          ),
        ),
      );
    }

    expect(responses.at(-1)?.status).toBe(429);
  });
});
