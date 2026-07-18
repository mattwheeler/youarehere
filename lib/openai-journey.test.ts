import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoJourney, journeyContentSchema } from "./journey";

const parseMock = vi.hoisted(() => vi.fn());
const formatMock = vi.hoisted(() => vi.fn(() => ({ type: "mock-format" })));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { parse: parseMock };
  },
}));

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: formatMock,
}));

import { generateLiveJourney } from "./openai-journey";

const request = {
  stage: "goal" as const,
  goal: "Write my performance review",
  notes: "",
  refinement: "",
};

describe("generateLiveJourney", () => {
  beforeEach(() => {
    parseMock.mockReset();
    formatMock.mockClear();
  });

  it("uses GPT-5.6 structured outputs without storing the response", async () => {
    const fixture = createDemoJourney(request);
    const content = journeyContentSchema.parse(fixture);
    parseMock.mockResolvedValue({
      id: "resp_test",
      output_parsed: content,
    });

    const result = await generateLiveJourney(request, "test-key");

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

  it("fails honestly when no parsed task map is returned", async () => {
    parseMock.mockResolvedValue({ id: "resp_empty", output_parsed: null });

    await expect(generateLiveJourney(request, "test-key")).rejects.toThrow(
      "GPT-5.6 did not return a task map.",
    );
  });
});
