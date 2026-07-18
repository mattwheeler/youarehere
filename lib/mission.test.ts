import { describe, expect, it } from "vitest";
import {
  advanceMission,
  coachRequestSchema,
  coachResponseSchema,
  createDemoCoach,
  createMissionState,
} from "./mission";

describe("mission state machine", () => {
  it("begins with the personal workspace locked", () => {
    const state = createMissionState();

    expect(state.stage).toBe("scope");
    expect(state.workspace.inbox).toBe("locked");
    expect(state.score).toEqual({ scope: 0, inspect: 0, approve: 0, verify: 0 });
  });

  it("rewards the narrowest useful inbox permission", () => {
    const state = advanceMission(createMissionState(), "sender-only");

    expect(state.stage).toBe("route");
    expect(state.workspace.inbox).toBe("sender-only");
    expect(state.score.scope).toBe(1);
    expect(state.feedback?.body).toMatch(/3 unrelated messages stayed private/i);
  });

  it("shows the cost of granting the whole inbox", () => {
    const state = advanceMission(createMissionState(), "entire-inbox");

    expect(state.stage).toBe("route");
    expect(state.workspace.inbox).toBe("entire-inbox");
    expect(state.score.scope).toBe(0);
    expect(state.feedback?.title).toBe("More access than the task needed");
  });

  it("blocks an untrusted route and lets the learner retry", () => {
    const scoped = advanceMission(createMissionState(), "sender-only");
    const state = advanceMission(scoped, "forwarded-link");

    expect(state.stage).toBe("route");
    expect(state.feedback?.kind).toBe("warning");
    expect(state.feedback?.body).toMatch(/domain does not match Streamly/i);
  });

  it("pauses at approval after the official route is inspected", () => {
    const scoped = advanceMission(createMissionState(), "sender-only");
    const state = advanceMission(scoped, "official-site");

    expect(state.stage).toBe("approval");
    expect(state.workspace.browser).toBe("reviewing-account");
    expect(state.score.inspect).toBe(1);
  });

  it("stops the agent when cancellation is rejected", () => {
    const scoped = advanceMission(createMissionState(), "sender-only");
    const routed = advanceMission(scoped, "official-site");
    const state = advanceMission(routed, "reject-cancellation");

    expect(state.stage).toBe("approval");
    expect(state.workspace.subscription).toBe("active");
    expect(state.feedback?.title).toBe("The agent stopped");
  });

  it("requires independent evidence before completing", () => {
    const scoped = advanceMission(createMissionState(), "sender-only");
    const routed = advanceMission(scoped, "official-site");
    const approved = advanceMission(routed, "approve-cancellation");
    const asserted = advanceMission(approved, "agent-claim");
    const completed = advanceMission(asserted, "confirmation-email");

    expect(asserted.stage).toBe("verify");
    expect(asserted.feedback?.body).toMatch(/assertion is not evidence/i);
    expect(completed.stage).toBe("complete");
    expect(completed.workspace.subscription).toBe("cancelled");
    expect(completed.score).toEqual({ scope: 1, inspect: 1, approve: 1, verify: 1 });
  });
});

describe("coach contract", () => {
  it("validates a mission decision and returns labeled fixture guidance", () => {
    const request = coachRequestSchema.parse({
      stage: "scope",
      decision: "sender-only",
    });
    const response = createDemoCoach(request);

    expect(coachResponseSchema.parse(response)).toEqual(response);
    expect(response.provenance).toEqual({
      live: false,
      model: "demo-fixture",
      responseId: null,
    });
    expect(response.agentMessage).toMatch(/Streamly/i);
  });
});
