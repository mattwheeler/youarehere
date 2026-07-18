import { z } from "zod";
import { getScenario, scenarioIdSchema, type ScenarioId } from "./scenarios";

export const missionStageSchema = z.enum([
  "share",
  "check",
  "approve",
  "prove",
  "complete",
]);

export const missionDecisionSchema = z.enum([
  "focused-access",
  "paste-item",
  "all-access",
  "trusted-route",
  "risky-route",
  "approve-action",
  "stop-action",
  "strong-proof",
  "screen-proof",
  "agent-claim",
]);

const decisionsByStage = {
  share: ["focused-access", "paste-item", "all-access"],
  check: ["trusted-route", "risky-route"],
  approve: ["approve-action", "stop-action"],
  prove: ["strong-proof", "screen-proof", "agent-claim"],
} as const;

export const coachRequestSchema = z
  .object({
    scenarioId: scenarioIdSchema,
    stage: missionStageSchema.exclude(["complete"]),
    decision: missionDecisionSchema,
  })
  .superRefine((value, context) => {
    const allowed = decisionsByStage[value.stage] as readonly string[];
    if (!allowed.includes(value.decision)) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "That choice is not available at this point in the mission.",
      });
    }
  });

export const coachContentSchema = z.object({
  agentMessage: z.string().min(1).max(400),
  teachingNote: z.string().min(1).max(240),
  proposedAction: z.object({
    label: z.string().min(1).max(120),
    tool: z.enum([
      "read_selected",
      "open_verified",
      "take_action",
      "check_result",
      "stop",
    ]),
    why: z.string().min(1).max(240),
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

export type MissionFeedback = {
  kind: "success" | "warning" | "neutral";
  title: string;
  body: string;
};

export type MissionState = {
  scenarioId: ScenarioId;
  stage: MissionStage;
  history: Array<{
    stage: Exclude<MissionStage, "complete">;
    decision: MissionDecision;
  }>;
  score: {
    share: 0 | 1;
    check: 0 | 1;
    approve: 0 | 1;
    prove: 0 | 1;
  };
  feedback: MissionFeedback | null;
};

export function createMissionState(scenarioId: ScenarioId = "cancel-streamly"): MissionState {
  getScenario(scenarioId);
  return {
    scenarioId,
    stage: "share",
    history: [],
    score: { share: 0, check: 0, approve: 0, prove: 0 },
    feedback: null,
  };
}

function addTurn(
  state: MissionState,
  decision: MissionDecision,
  updates: Partial<MissionState>,
): MissionState {
  if (state.stage === "complete") return state;
  return {
    ...state,
    ...updates,
    history: [...state.history, { stage: state.stage, decision }],
  };
}

export function advanceMission(
  state: MissionState,
  decision: MissionDecision,
): MissionState {
  const scenario = getScenario(state.scenarioId);

  if (state.stage === "share") {
    if (decision === "focused-access" || decision === "paste-item") {
      return addTurn(state, decision, {
        stage: "check",
        score: { ...state.score, share: 1 },
        feedback: {
          kind: "success",
          title: "That is enough",
          body:
            decision === "focused-access"
              ? `AI got ${scenario.steps.share.need}. Your other messages stayed private.`
              : `AI got the one thing it needs. It did not get account access.`,
        },
      });
    }

    if (decision === "all-access") {
      return addTurn(state, decision, {
        stage: "check",
        feedback: {
          kind: "warning",
          title: "That was more than it needed",
          body: `AI found the right thing, but it also saw things it did not need: ${scenario.steps.share.privateThings}.`,
        },
      });
    }
  }

  if (state.stage === "check") {
    if (decision === "risky-route") {
      return addTurn(state, decision, {
        feedback: {
          kind: "warning",
          title: "That does not match",
          body: `${scenario.steps.check.risky} looks related, but it is not the trusted place. Try the other choice.`,
        },
      });
    }

    if (decision === "trusted-route") {
      return addTurn(state, decision, {
        stage: "approve",
        score: { ...state.score, check: 1 },
        feedback: {
          kind: "success",
          title: "Right place",
          body: scenario.steps.check.clue,
        },
      });
    }
  }

  if (state.stage === "approve") {
    if (decision === "stop-action") {
      return addTurn(state, decision, {
        feedback: {
          kind: "neutral",
          title: "AI stopped",
          body: "You said no, so nothing changed. You are still in control.",
        },
      });
    }

    if (decision === "approve-action") {
      return addTurn(state, decision, {
        stage: "prove",
        score: { ...state.score, approve: 1 },
        feedback: {
          kind: "success",
          title: "Done—now check it",
          body: scenario.steps.approve.result,
        },
      });
    }
  }

  if (state.stage === "prove") {
    if (decision === "agent-claim") {
      return addTurn(state, decision, {
        feedback: {
          kind: "warning",
          title: "AI saying “done” is not enough",
          body: "AI repeating itself is not proof. Look for something outside its own answer.",
        },
      });
    }

    if (decision === "screen-proof") {
      return addTurn(state, decision, {
        feedback: {
          kind: "neutral",
          title: "Good clue. There is better proof.",
          body: `The screen helps, but ${scenario.steps.prove.strong.toLowerCase()} is easier to check later.`,
        },
      });
    }

    if (decision === "strong-proof") {
      return addTurn(state, decision, {
        stage: "complete",
        score: { ...state.score, prove: 1 },
        feedback: {
          kind: "success",
          title: "Now you know",
          body: scenario.steps.prove.result,
        },
      });
    }
  }

  return state;
}

const lessons: Record<MissionDecision, string> = {
  "focused-access": "You gave AI only what it needed. Less access means less can leak.",
  "paste-item": "Sharing one item can be safer than connecting a whole account.",
  "all-access": "More access means more risk—even when AI finishes the job.",
  "trusted-route": "Names can be copied. Check the real address before AI opens it.",
  "risky-route": "A familiar name is not proof. The real address matters.",
  "approve-action": "You checked the details before AI made a real change.",
  "stop-action": "When you say stop, a well-behaved AI should change nothing.",
  "strong-proof": "Proof comes from what changed, not from AI sounding confident.",
  "screen-proof": "A screen is a clue. A saved confirmation is stronger proof.",
  "agent-claim": "AI saying it worked is a claim, not proof.",
};

export function createDemoCoach(rawInput: CoachRequest): CoachResponse {
  const input = coachRequestSchema.parse(rawInput);
  const scenario = getScenario(input.scenarioId);

  const contentByDecision: Record<MissionDecision, CoachContent> = {
    "focused-access": {
      agentMessage: `Got it. I’ll use only ${scenario.steps.share.need}.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: `Find ${scenario.steps.share.need}`,
        tool: "read_selected",
        why: `Everything else stays closed.`,
      },
    },
    "paste-item": {
      agentMessage: `That works. I can continue from the one item you shared.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: "Read the shared item",
        tool: "read_selected",
        why: "No account connection is needed.",
      },
    },
    "all-access": {
      agentMessage: `I found what I needed, but I could also see ${scenario.steps.share.privateThings}.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: `Find ${scenario.steps.share.need}`,
        tool: "read_selected",
        why: "The task worked, but the permission was too broad.",
      },
    },
    "trusted-route": {
      agentMessage: `This matches: ${scenario.steps.check.trusted}.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: `Open ${scenario.steps.check.trusted}`,
        tool: "open_verified",
        why: scenario.steps.check.clue,
      },
    },
    "risky-route": {
      agentMessage: `${scenario.steps.check.risky} does not match the trusted place. I stopped.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: "Do not open it",
        tool: "stop",
        why: "The address does not match.",
      },
    },
    "approve-action": {
      agentMessage: scenario.steps.approve.result,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: scenario.steps.approve.yes,
        tool: "take_action",
        why: scenario.steps.approve.consequence,
      },
    },
    "stop-action": {
      agentMessage: "Stopped. I did not change anything.",
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: "Wait for you",
        tool: "stop",
        why: "You did not approve the change.",
      },
    },
    "strong-proof": {
      agentMessage: `${scenario.steps.prove.strong} proves what happened.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: `Check ${scenario.steps.prove.reference}`,
        tool: "check_result",
        why: scenario.steps.prove.result,
      },
    },
    "screen-proof": {
      agentMessage: `That screen is useful, but there is stronger proof available.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: "Look for saved proof",
        tool: "check_result",
        why: `A saved reference is easier to check later.`,
      },
    },
    "agent-claim": {
      agentMessage: `I said it worked, but you should not have to take my word for it.`,
      teachingNote: lessons[input.decision],
      proposedAction: {
        label: "Look for outside proof",
        tool: "check_result",
        why: "My own answer cannot prove my own work.",
      },
    },
  };

  return coachResponseSchema.parse({
    ...contentByDecision[input.decision],
    provenance: { live: false, model: "demo-fixture", responseId: null },
  });
}
