import { z } from "zod";

export const missionStageSchema = z.enum([
  "scope",
  "route",
  "approval",
  "verify",
  "complete",
]);

export const missionDecisionSchema = z.enum([
  "sender-only",
  "entire-inbox",
  "paste-receipt",
  "official-site",
  "forwarded-link",
  "approve-cancellation",
  "reject-cancellation",
  "confirmation-email",
  "account-status",
  "agent-claim",
]);

const decisionsByStage = {
  scope: ["sender-only", "entire-inbox", "paste-receipt"],
  route: ["official-site", "forwarded-link"],
  approval: ["approve-cancellation", "reject-cancellation"],
  verify: ["confirmation-email", "account-status", "agent-claim"],
} as const;

export const coachRequestSchema = z
  .object({
    stage: missionStageSchema.exclude(["complete"]),
    decision: missionDecisionSchema,
  })
  .superRefine((value, context) => {
    const allowed = decisionsByStage[value.stage] as readonly string[];
    if (!allowed.includes(value.decision)) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "That decision is not available at this point in the mission.",
      });
    }
  });

export const coachContentSchema = z.object({
  agentMessage: z.string().min(1).max(500),
  teachingNote: z.string().min(1).max(400),
  proposedAction: z.object({
    label: z.string().min(1).max(120),
    tool: z.enum([
      "search_inbox",
      "open_account_page",
      "cancel_subscription",
      "verify_confirmation",
      "stop",
    ]),
    why: z.string().min(1).max(300),
  }),
});

export const coachResponseSchema = coachContentSchema.extend({
  provenance: z.object({
    live: z.boolean(),
    model: z.string(),
    responseId: z.string().nullable(),
  }),
});

export type MissionStage = z.infer<typeof missionStageSchema>;
export type MissionDecision = z.infer<typeof missionDecisionSchema>;
export type CoachRequest = z.infer<typeof coachRequestSchema>;
export type CoachContent = z.infer<typeof coachContentSchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;

type MissionFeedback = {
  kind: "success" | "warning" | "neutral";
  title: string;
  body: string;
};

export type MissionState = {
  stage: MissionStage;
  workspace: {
    inbox: "locked" | "sender-only" | "entire-inbox" | "receipt-only";
    browser: "idle" | "reviewing-account" | "cancelled";
    subscription: "active" | "cancelled-unverified" | "cancelled";
  };
  score: {
    scope: 0 | 1;
    inspect: 0 | 1;
    approve: 0 | 1;
    verify: 0 | 1;
  };
  feedback: MissionFeedback | null;
};

export function createMissionState(): MissionState {
  return {
    stage: "scope",
    workspace: {
      inbox: "locked",
      browser: "idle",
      subscription: "active",
    },
    score: { scope: 0, inspect: 0, approve: 0, verify: 0 },
    feedback: null,
  };
}

export function advanceMission(
  state: MissionState,
  decision: MissionDecision,
): MissionState {
  if (state.stage === "scope") {
    if (decision === "sender-only") {
      return {
        ...state,
        stage: "route",
        workspace: { ...state.workspace, inbox: "sender-only" },
        score: { ...state.score, scope: 1 },
        feedback: {
          kind: "success",
          title: "Enough access, without the rest",
          body: "Streamly was found. 3 unrelated messages stayed private.",
        },
      };
    }

    if (decision === "paste-receipt") {
      return {
        ...state,
        stage: "route",
        workspace: { ...state.workspace, inbox: "receipt-only" },
        score: { ...state.score, scope: 1 },
        feedback: {
          kind: "success",
          title: "You supplied exactly one item",
          body: "The agent received the renewal notice without inbox access.",
        },
      };
    }

    if (decision === "entire-inbox") {
      return {
        ...state,
        stage: "route",
        workspace: { ...state.workspace, inbox: "entire-inbox" },
        feedback: {
          kind: "warning",
          title: "More access than the task needed",
          body: "The agent could now see payroll, health, and family messages even though only one sender mattered.",
        },
      };
    }
  }

  if (state.stage === "route") {
    if (decision === "forwarded-link") {
      return {
        ...state,
        feedback: {
          kind: "warning",
          title: "Stop and inspect the destination",
          body: "The domain does not match Streamly. A familiar label is not proof that a link is safe.",
        },
      };
    }

    if (decision === "official-site") {
      return {
        ...state,
        stage: "approval",
        workspace: { ...state.workspace, browser: "reviewing-account" },
        score: { ...state.score, inspect: 1 },
        feedback: {
          kind: "success",
          title: "Route checked",
          body: "The account domain matches the service and the renewal email.",
        },
      };
    }
  }

  if (state.stage === "approval") {
    if (decision === "reject-cancellation") {
      return {
        ...state,
        feedback: {
          kind: "neutral",
          title: "The agent stopped",
          body: "Nothing changed. Human approval is a real control, not a courtesy notice.",
        },
      };
    }

    if (decision === "approve-cancellation") {
      return {
        ...state,
        stage: "verify",
        workspace: {
          ...state.workspace,
          browser: "cancelled",
          subscription: "cancelled-unverified",
        },
        score: { ...state.score, approve: 1 },
        feedback: {
          kind: "success",
          title: "Approved and executed",
          body: "The subscription changed only after you reviewed the account, price, and consequence.",
        },
      };
    }
  }

  if (state.stage === "verify") {
    if (decision === "agent-claim") {
      return {
        ...state,
        feedback: {
          kind: "warning",
          title: "Keep looking",
          body: "An assertion is not evidence. Check a source that changed outside the agent's own reply.",
        },
      };
    }

    if (decision === "account-status") {
      return {
        ...state,
        feedback: {
          kind: "neutral",
          title: "Good evidence; one stronger signal remains",
          body: "The account page changed, but a durable confirmation with a reference is easier to prove later.",
        },
      };
    }

    if (decision === "confirmation-email") {
      return {
        ...state,
        stage: "complete",
        workspace: { ...state.workspace, subscription: "cancelled" },
        score: { ...state.score, verify: 1 },
        feedback: {
          kind: "success",
          title: "Verified independently",
          body: "Confirmation ST-4821 records the cancellation and the final service date.",
        },
      };
    }
  }

  return state;
}

const demoResponses: Record<MissionDecision, CoachContent> = {
  "sender-only": {
    agentMessage: "I found one Streamly renewal notice without opening anything from other senders.",
    teachingNote: "Useful access is specific enough to finish the task and no broader.",
    proposedAction: {
      label: "Inspect the account destination",
      tool: "search_inbox",
      why: "The renewal notice contains the official account URL and renewal date.",
    },
  },
  "entire-inbox": {
    agentMessage: "I found the Streamly notice, but the permission also exposed unrelated personal messages.",
    teachingNote: "A successful result can still use an unnecessarily risky permission.",
    proposedAction: {
      label: "Inspect the account destination",
      tool: "search_inbox",
      why: "Only the Streamly result is relevant to the mission.",
    },
  },
  "paste-receipt": {
    agentMessage: "The pasted receipt gives me the renewal date and account URL without inbox access.",
    teachingNote: "Sometimes the safest connector is no connector at all.",
    proposedAction: {
      label: "Inspect the account destination",
      tool: "search_inbox",
      why: "The supplied receipt contains enough evidence to continue.",
    },
  },
  "official-site": {
    agentMessage: "The destination is account.streamly.example, matching the sender and billing notice.",
    teachingNote: "Inspect the destination before letting an agent follow a consequential route.",
    proposedAction: {
      label: "Prepare cancellation for review",
      tool: "open_account_page",
      why: "The verified account page shows the subscription and its renewal terms.",
    },
  },
  "forwarded-link": {
    agentMessage: "This link says Streamly, but it opens streamly-cancel.example.net instead.",
    teachingNote: "Labels can be copied. The actual destination is the stronger signal.",
    proposedAction: {
      label: "Stop before opening the link",
      tool: "stop",
      why: "The domain does not match the service account domain.",
    },
  },
  "approve-cancellation": {
    agentMessage: "Cancellation submitted. The account now says service ends July 18, 2026.",
    teachingNote: "Approval should happen at the last responsible moment, with consequences visible.",
    proposedAction: {
      label: "Look for independent confirmation",
      tool: "cancel_subscription",
      why: "Execution is complete, but the outcome still needs verification.",
    },
  },
  "reject-cancellation": {
    agentMessage: "Stopped. I did not change the subscription.",
    teachingNote: "Rejecting an approval must leave the external state unchanged.",
    proposedAction: {
      label: "Wait for your decision",
      tool: "stop",
      why: "The pending action requires explicit human approval.",
    },
  },
  "confirmation-email": {
    agentMessage: "Confirmation ST-4821 arrived from billing@streamly.example with the final service date.",
    teachingNote: "Verification comes from changed external evidence, not the agent's confidence.",
    proposedAction: {
      label: "Complete the mission",
      tool: "verify_confirmation",
      why: "The durable confirmation matches the account state and action.",
    },
  },
  "account-status": {
    agentMessage: "The account page now says cancelled, but there is also a confirmation message available.",
    teachingNote: "Prefer durable evidence you can return to after the session ends.",
    proposedAction: {
      label: "Check for a confirmation reference",
      tool: "verify_confirmation",
      why: "A reference number provides stronger evidence than transient page text.",
    },
  },
  "agent-claim": {
    agentMessage: "I believe the cancellation succeeded.",
    teachingNote: "The agent repeating its own conclusion does not independently verify it.",
    proposedAction: {
      label: "Inspect an external confirmation",
      tool: "verify_confirmation",
      why: "A changed account or confirmation message can prove the outcome.",
    },
  },
};

export function createDemoCoach(rawInput: CoachRequest): CoachResponse {
  const input = coachRequestSchema.parse(rawInput);
  return coachResponseSchema.parse({
    ...demoResponses[input.decision],
    provenance: { live: false, model: "demo-fixture", responseId: null },
  });
}
