import { describe, expect, it } from "vitest";
import {
  missionRuntimeRequestSchema,
  missionRuntimeResponseSchema,
} from "./mission-runtime";

describe("mission runtime contracts", () => {
  it.each([
    { version: 2, type: "start", scenarioId: "cancel-streamly" },
    {
      version: 2,
      type: "choose",
      sessionToken: "opaque.session.token",
      choiceId: "focused-access",
    },
    {
      version: 2,
      type: "approve",
      sessionToken: "opaque.session.token",
      pendingActionId: "act_01J00000000000000000000000",
      decision: "approve",
    },
    {
      version: 2,
      type: "retry",
      sessionToken: "opaque.session.token",
    },
  ])("accepts a versioned $type request", (request) => {
    expect(missionRuntimeRequestSchema.parse(request)).toEqual(request);
  });

  it("rejects legacy and unbounded input", () => {
    expect(() =>
      missionRuntimeRequestSchema.parse({
        type: "choose",
        sessionToken: "x".repeat(2_049),
        choiceId: "focused-access",
      }),
    ).toThrow();
  });

  it("accepts a learner-safe response without authoritative world state", () => {
    const response = missionRuntimeResponseSchema.parse({
      version: 2,
      sessionToken: "opaque.session.token",
      stateVersion: 3,
      status: "awaiting_approval",
      viewState: {
        scenarioId: "cancel-streamly",
        stage: "approve",
        progress: 0.5,
        visiblePermissions: ["Streamly message metadata"],
      },
      events: [
        {
          id: "evt_01J00000000000000000000000",
          kind: "tool_result",
          label: "Found the renewal message",
          createdAt: 1_721_310_000_000,
          technical: {
            toolName: "search_streamly_messages",
            callId: "call_search_1",
            arguments: { query: "Streamly renewal" },
            result: { matches: 2 },
          },
        },
      ],
      pendingAction: {
        id: "act_01J00000000000000000000000",
        label: "Cancel Streamly Premium",
        consequence: "The $18.99 renewal will not happen.",
        details: {
          subscriptionId: "sub_streamly_1",
          chargeAvoided: { amount: 18.99, currency: "USD" },
        },
        expiresAt: 1_721_310_300_000,
      },
      provenance: {
        mode: "live",
        model: "gpt-5.6",
        responseIds: ["resp_123"],
      },
    });

    expect(response.viewState).not.toHaveProperty("world");
    expect(response.status).toBe("awaiting_approval");
  });

  it("fails closed when approval state has no visible pending action", () => {
    expect(() =>
      missionRuntimeResponseSchema.parse({
        version: 2,
        sessionToken: "opaque.session.token",
        stateVersion: 2,
        status: "awaiting_approval",
        viewState: {
          scenarioId: "cancel-streamly",
          stage: "approve",
          progress: 0.5,
          visiblePermissions: [],
        },
        events: [],
        provenance: { mode: "live", model: "gpt-5.6", responseIds: [] },
      }),
    ).toThrow();
  });
});
