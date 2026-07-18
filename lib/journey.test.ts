import { describe, expect, it } from "vitest";
import {
  createDemoJourney,
  journeyRequestSchema,
  journeyResponseSchema,
} from "./journey";

describe("journey request contract", () => {
  it("trims a valid goal", () => {
    const parsed = journeyRequestSchema.parse({
      stage: "goal",
      goal: "  I need to write my performance review.  ",
      notes: "",
      refinement: "",
    });

    expect(parsed.goal).toBe("I need to write my performance review.");
  });

  it("rejects a blank goal", () => {
    const parsed = journeyRequestSchema.safeParse({
      stage: "goal",
      goal: "   ",
      notes: "",
      refinement: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires notes for the context stage", () => {
    const parsed = journeyRequestSchema.safeParse({
      stage: "context",
      goal: "Write my review",
      notes: "",
      refinement: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires a refinement for the refine stage", () => {
    const parsed = journeyRequestSchema.safeParse({
      stage: "refine",
      goal: "Write my review",
      notes: "Reduced backlog by 30%",
      refinement: "",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("transparent demo journey", () => {
  it("makes missing context and the generic draft limitation visible", () => {
    const journey = createDemoJourney({
      stage: "goal",
      goal: "I need to write my performance review.",
      notes: "",
      refinement: "",
    });

    expect(journeyResponseSchema.parse(journey)).toEqual(journey);
    expect(journey.provenance.model).toBe("demo-fixture");
    expect(journey.action.webSearch).toBe("unnecessary");
    expect(journey.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "work-notes", state: "missing" }),
      ]),
    );
    expect(journey.artifact.limitation).toMatch(/no evidence/i);
  });

  it("routes the artifact through supplied work notes", () => {
    const journey = createDemoJourney({
      stage: "context",
      goal: "I need to write my performance review.",
      notes:
        "Led a migration early. Reduced the support backlog by 30%. Mentored two teammates.",
      refinement: "",
    });

    expect(journey.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "work-notes", state: "used" }),
      ]),
    );
    expect(journey.delta.label).toBe("Added evidence");
    expect(journey.artifact.body).toContain("30%");
  });

  it("makes audience and tone visible in the refinement delta", () => {
    const journey = createDemoJourney({
      stage: "refine",
      goal: "I need to write my performance review.",
      notes:
        "Led a migration early. Reduced the support backlog by 30%. Mentored two teammates.",
      refinement: "Make it confident but not boastful, for my director.",
    });

    expect(journey.delta.label).toBe("Set audience and tone");
    expect(journey.delta.changed).toEqual(
      expect.arrayContaining(["Audience", "Tone"]),
    );
    expect(journey.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "audience", state: "used" }),
        expect.objectContaining({ id: "tone", state: "used" }),
      ]),
    );
  });
});
