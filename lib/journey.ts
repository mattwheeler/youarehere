import { z } from "zod";

export const journeyStageSchema = z.enum(["goal", "context", "refine"]);

export const journeyRequestSchema = z
  .object({
    stage: journeyStageSchema,
    goal: z
      .string()
      .trim()
      .min(1, "Please describe a goal to continue.")
      .max(600, "Keep the goal under 600 characters."),
    notes: z
      .string()
      .trim()
      .max(6_000, "Keep the supporting context under 6,000 characters."),
    refinement: z
      .string()
      .trim()
      .max(1_000, "Keep the refinement under 1,000 characters."),
  })
  .superRefine((value, context) => {
    if (value.stage === "context" && !value.notes) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Add some context before continuing.",
      });
    }

    if (value.stage === "refine" && !value.refinement) {
      context.addIssue({
        code: "custom",
        path: ["refinement"],
        message: "Describe what should change.",
      });
    }
  });

const contextStateSchema = z.enum([
  "supplied",
  "missing",
  "unavailable",
  "inferred",
  "used",
]);

const contextItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: contextStateSchema,
  source: z.enum(["user", "system", "model"]),
  value: z.string().nullable(),
  whyItMatters: z.string(),
});

const capabilitySchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["practiced", "next"]),
});

export const journeyContentSchema = z.object({
  goal: z.string(),
  mode: z.enum(["write", "understand", "find", "compare", "decide", "create"]),
  summary: z.string(),
  contextItems: z.array(contextItemSchema).min(1).max(8),
  action: z.object({
    label: z.string(),
    explanation: z.string(),
    webSearch: z.enum(["required", "unnecessary", "unavailable"]),
  }),
  artifact: z.object({
    title: z.string(),
    body: z.string(),
    limitation: z.string().nullable(),
  }),
  delta: z.object({
    label: z.string(),
    changed: z.array(z.string()).max(6),
    because: z.string(),
  }),
  capabilities: z.array(capabilitySchema).min(1).max(6),
  questionLabel: z.string(),
});

export const journeyResponseSchema = journeyContentSchema.extend({
  stage: journeyStageSchema,
  provenance: z.object({
    live: z.boolean(),
    model: z.string(),
    responseId: z.string().nullable(),
  }),
});

export type JourneyStage = z.infer<typeof journeyStageSchema>;
export type JourneyRequest = z.infer<typeof journeyRequestSchema>;
export type JourneyContent = z.infer<typeof journeyContentSchema>;
export type JourneyResponse = z.infer<typeof journeyResponseSchema>;
export type ContextItem = JourneyResponse["contextItems"][number];

const genericDraft =
  "Over the past year, I contributed to important team priorities, collaborated across functions, and continued to develop my skills. I am proud of the progress I made and look forward to building on it in the coming year.";

const evidenceDraft =
  "This year, I focused on making complex work easier for both customers and teammates. I led our customer-data migration two weeks ahead of schedule, redesigned weekly triage to reduce the open support backlog by 30%, and mentored two teammates through their first production releases. Together, those efforts improved delivery reliability while strengthening the team’s capacity.";

const refinedDraft =
  "This year, I delivered measurable operational improvements while investing in the people around me. I led the customer-data migration two weeks ahead of schedule, redesigned weekly triage to reduce the open support backlog by 30%, and mentored two teammates through their first production releases. I am proud of those outcomes and of the steadier delivery habits they helped establish. Next year, I want to build on that foundation by taking ownership of another cross-functional initiative and continuing to develop teammates.";

function contextItemsFor(
  stage: JourneyStage,
  notes: string,
): JourneyContent["contextItems"] {
  const hasNotes = stage !== "goal";
  const hasRefinement = stage === "refine";

  return [
    {
      id: "role",
      label: "Role and scope",
      state: "missing",
      source: "user",
      value: null,
      whyItMatters: "Helps the review reflect the responsibilities you actually held.",
    },
    {
      id: "work-notes",
      label: "Work notes",
      state: hasNotes ? "used" : "missing",
      source: "user",
      value: hasNotes ? notes : null,
      whyItMatters: "Provides concrete evidence instead of generic praise.",
    },
    {
      id: "audience",
      label: "Audience",
      state: hasRefinement ? "used" : "missing",
      source: "user",
      value: hasRefinement ? "My director" : null,
      whyItMatters: "Changes the level of context and the framing of impact.",
    },
    {
      id: "tone",
      label: "Tone",
      state: hasRefinement ? "used" : "missing",
      source: "user",
      value: hasRefinement ? "Confident, not boastful" : null,
      whyItMatters: "Guides how directly accomplishments are presented.",
    },
  ];
}

export function createDemoJourney(input: JourneyRequest): JourneyResponse {
  const request = journeyRequestSchema.parse(input);
  const hasNotes = request.stage !== "goal";
  const refined = request.stage === "refine";

  const content: JourneyContent = {
    goal: request.goal,
    mode: "write",
    summary: refined
      ? "Your evidence is now shaped for a specific reader and tone."
      : hasNotes
        ? "Your notes now ground the draft in work you actually completed."
        : "I can draft from the goal, but I cannot yet see evidence from your year.",
    contextItems: contextItemsFor(request.stage, request.notes),
    action: {
      label: refined
        ? "Revise for audience and tone"
        : hasNotes
          ? "Revise using your evidence"
          : "Create a first draft",
      explanation: refined
        ? "Use the supplied accomplishments, audience, and tone to make the review specific and appropriately confident."
        : hasNotes
          ? "Use only the accomplishments you supplied to replace broad claims with evidence."
          : "Create a useful starting point without inventing accomplishments you did not provide.",
      webSearch: "unnecessary",
    },
    artifact: {
      title: refined
        ? "Performance review · version 3"
        : hasNotes
          ? "Performance review · version 2"
          : "Performance review · version 1",
      body: refined ? refinedDraft : hasNotes ? evidenceDraft : genericDraft,
      limitation: refined
        ? null
        : hasNotes
          ? "This uses your notes, but your exact role and review criteria are still not available."
          : "This is broad because I have your goal, but no evidence from your year yet.",
    },
    delta: refined
      ? {
          label: "Set audience and tone",
          changed: ["Audience", "Tone"],
          because: "You identified the reader and how you want to sound.",
        }
      : hasNotes
        ? {
            label: "Added evidence",
            changed: ["Work notes", "Artifact"],
            because: "You supplied three concrete outcomes from your year.",
          }
        : {
            label: "Set the goal",
            changed: ["Goal", "First action"],
            because: "You identified the work you want AI to help complete.",
          },
    capabilities: refined
      ? [
          { id: "write", label: "Write with AI", status: "practiced" },
          { id: "context", label: "Add context", status: "practiced" },
          {
            id: "audience",
            label: "Refine for audience",
            status: "practiced",
          },
          { id: "analyze", label: "Analyze a document", status: "next" },
        ]
      : hasNotes
        ? [
            { id: "write", label: "Write with AI", status: "practiced" },
            { id: "context", label: "Add context", status: "practiced" },
            {
              id: "audience",
              label: "Refine for audience",
              status: "next",
            },
          ]
        : [
            { id: "write", label: "Write with AI", status: "practiced" },
            { id: "context", label: "Add context", status: "next" },
          ],
    questionLabel: refined
      ? "Refine for your director"
      : hasNotes
        ? "Add work evidence"
        : "Set the goal",
  };

  return journeyResponseSchema.parse({
    ...content,
    stage: request.stage,
    provenance: {
      live: false,
      model: "demo-fixture",
      responseId: null,
    },
  });
}
