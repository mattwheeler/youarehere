import { describe, expect, it, vi } from "vitest";
import { createDemoJourney } from "@/lib/journey";

const generateLiveJourneyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openai-journey", () => ({
  generateLiveJourney: generateLiveJourneyMock,
}));

import { POST } from "./route";

function request(body: unknown, clientIp?: string) {
  return new Request("http://localhost/api/journey", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(clientIp ? { "cf-connecting-ip": clientIp } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/journey", () => {
  it("rejects invalid journey input", async () => {
    const response = await POST(
      request({ stage: "goal", goal: "", notes: "", refinement: "" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "Please describe a goal to continue." }),
    );
  });

  it("returns a clearly labeled fixture when local demo mode is enabled", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "true");

    const response = await POST(
      request({
        stage: "goal",
        goal: "Write my performance review",
        notes: "",
        refinement: "",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provenance.model).toBe("demo-fixture");
    expect(body.provenance.live).toBe(false);
  });

  it("returns a service error when the API is not configured", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "false");
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(
      request({
        stage: "goal",
        goal: "Write my performance review",
        notes: "",
        refinement: "",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "GPT-5.6 is not configured for this environment yet.",
      }),
    );
  });

  it("returns a live GPT-5.6 journey when the API is configured", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fixture = createDemoJourney({
      stage: "goal",
      goal: "Write my performance review",
      notes: "",
      refinement: "",
    });
    generateLiveJourneyMock.mockResolvedValue({
      ...fixture,
      provenance: {
        live: true,
        model: "gpt-5.6",
        responseId: "resp_test",
      },
    });

    const response = await POST(
      request({
        stage: "goal",
        goal: "Write my performance review",
        notes: "",
        refinement: "",
      }),
    );

    expect(response.status).toBe(200);
    expect(generateLiveJourneyMock).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "goal" }),
      "test-key",
    );
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/journey", {
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

  it("returns a safe error when GPT-5.6 generation fails", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateLiveJourneyMock.mockRejectedValue(new Error("provider error"));

    const response = await POST(
      request({
        stage: "goal",
        goal: "Write my performance review",
        notes: "",
        refinement: "",
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "The task map could not be generated. Please try again.",
    });
  });

  it("rate-limits repeated generation requests by client IP", async () => {
    vi.stubEnv("USE_DEMO_FIXTURES", "true");
    const body = {
      stage: "goal",
      goal: "Write my performance review",
      notes: "",
      refinement: "",
    };

    const responses = [];
    for (let attempt = 0; attempt < 13; attempt += 1) {
      responses.push(await POST(request(body, "203.0.113.42")));
    }

    expect(responses.at(-1)?.status).toBe(429);
    expect(responses.at(-1)?.headers.get("retry-after")).toBeTruthy();
    await expect(responses.at(-1)?.json()).resolves.toEqual({
      error: "Too many requests. Please wait a moment and try again.",
    });
  });
});
