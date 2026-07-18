import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachContentSchema, createDemoCoach } from "./mission";

const parseMock = vi.hoisted(() => vi.fn());
const formatMock = vi.hoisted(() => vi.fn(() => ({ type: "mock-format" })));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { parse: parseMock };
  },
}));

vi.mock("openai/helpers/zod", () => ({ zodTextFormat: formatMock }));

import { generateLiveCoach } from "./openai-coach";

const request = { stage: "scope" as const, decision: "sender-only" as const };

describe("generateLiveCoach", () => {
  beforeEach(() => {
    parseMock.mockReset();
    formatMock.mockClear();
  });

  it("uses GPT-5.6 structured outputs without storing the response", async () => {
    const content = coachContentSchema.parse(createDemoCoach(request));
    parseMock.mockResolvedValue({ id: "resp_test", output_parsed: content });

    const result = await generateLiveCoach(request, "test-key");

    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6",
        store: false,
        reasoning: { effort: "low" },
      }),
    );
    expect(formatMock).toHaveBeenCalled();
    expect(result.provenance).toEqual({
      live: true,
      model: "gpt-5.6",
      responseId: "resp_test",
    });
  });

  it("fails honestly when no coaching response is returned", async () => {
    parseMock.mockResolvedValue({ id: "resp_empty", output_parsed: null });

    await expect(generateLiveCoach(request, "test-key")).rejects.toThrow(
      "GPT-5.6 did not return a coaching response.",
    );
  });
});
