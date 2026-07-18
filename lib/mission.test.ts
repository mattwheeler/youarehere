import { describe, expect, it } from "vitest";
import {
  advanceMission,
  coachRequestSchema,
  coachResponseSchema,
  createDemoCoach,
  createMissionState,
} from "./mission";

describe("conversational mission state", () => {
  it("starts with a simple sharing decision", () => {
    const state = createMissionState("cancel-streamly");

    expect(state.scenarioId).toBe("cancel-streamly");
    expect(state.stage).toBe("share");
    expect(state.history).toEqual([]);
    expect(state.score).toEqual({ share: 0, check: 0, approve: 0, prove: 0 });
  });

  it("rewards giving AI only the information it needs", () => {
    const state = advanceMission(
      createMissionState("cancel-streamly"),
      "focused-access",
    );

    expect(state.stage).toBe("check");
    expect(state.score.share).toBe(1);
    expect(state.feedback?.body).toMatch(/other messages stayed private/i);
  });

  it("shows the privacy cost of sharing everything", () => {
    const state = advanceMission(
      createMissionState("cancel-streamly"),
      "all-access",
    );

    expect(state.stage).toBe("check");
    expect(state.score.share).toBe(0);
    expect(state.feedback?.body).toMatch(/saw things it did not need/i);
  });

  it("keeps the learner on the check step after a suspicious destination", () => {
    const shared = advanceMission(createMissionState("suspicious-email"), "focused-access");
    const state = advanceMission(shared, "risky-route");

    expect(state.stage).toBe("check");
    expect(state.feedback?.title).toBe("That does not match");
  });

  it("stops without changing anything when approval is denied", () => {
    const shared = advanceMission(createMissionState("book-flight"), "focused-access");
    const checked = advanceMission(shared, "trusted-route");
    const state = advanceMission(checked, "stop-action");

    expect(state.stage).toBe("approve");
    expect(state.feedback?.body).toMatch(/nothing changed/i);
  });

  it("does not treat the AI saying done as proof", () => {
    const shared = advanceMission(createMissionState("cancel-streamly"), "focused-access");
    const checked = advanceMission(shared, "trusted-route");
    const approved = advanceMission(checked, "approve-action");
    const asserted = advanceMission(approved, "agent-claim");
    const complete = advanceMission(asserted, "strong-proof");

    expect(asserted.stage).toBe("prove");
    expect(asserted.feedback?.body).toMatch(/AI repeating itself is not proof/i);
    expect(complete.stage).toBe("complete");
    expect(complete.score).toEqual({ share: 1, check: 1, approve: 1, prove: 1 });
  });
});

describe("coach contract", () => {
  const request = {
    scenarioId: "cancel-streamly" as const,
    stage: "share" as const,
    decision: "focused-access" as const,
  };

  it("requires the decision to belong to the current step", () => {
    expect(() =>
      coachRequestSchema.parse({ ...request, decision: "strong-proof" }),
    ).toThrow(/not available/i);
  });

  it("returns short, labeled fixture guidance", () => {
    const response = createDemoCoach(request);

    expect(coachResponseSchema.parse(response)).toEqual(response);
    expect(response.agentMessage).toMatch(/only/i);
    expect(response.teachingNote.split(" ").length).toBeLessThan(22);
    expect(response.provenance).toEqual({
      live: false,
      model: "demo-fixture",
      responseId: null,
    });
  });
});
