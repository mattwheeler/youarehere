import { z } from "zod";

const scenarioIdSchema = z.enum([
  "cancel-streamly",
  "suspicious-email",
  "send-client-update",
]);

const sessionTokenSchema = z.string().min(16).max(2_048);
const publicIdSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[A-Za-z0-9_-]+$/);

export const missionRuntimeRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      version: z.literal(2),
      type: z.literal("start"),
      scenarioId: scenarioIdSchema,
    })
    .strict(),
  z
    .object({
      version: z.literal(2),
      type: z.literal("choose"),
      sessionToken: sessionTokenSchema,
      choiceId: publicIdSchema,
    })
    .strict(),
  z
    .object({
      version: z.literal(2),
      type: z.literal("approve"),
      sessionToken: sessionTokenSchema,
      pendingActionId: publicIdSchema,
      decision: z.enum(["approve", "reject"]),
    })
    .strict(),
  z
    .object({
      version: z.literal(2),
      type: z.literal("retry"),
      sessionToken: sessionTokenSchema,
    })
    .strict(),
]);

const missionEventSchema = z
  .object({
    id: publicIdSchema,
    kind: z.enum([
      "coach",
      "permission",
      "tool_call",
      "tool_result",
      "approval",
      "outcome",
      "error",
    ]),
    label: z.string().min(1).max(240),
    createdAt: z.number().int().nonnegative(),
    technical: z
      .object({
        toolName: publicIdSchema,
        callId: publicIdSchema,
        arguments: z.record(z.string(), z.unknown()),
        result: z.record(z.string(), z.unknown()),
      })
      .strict()
      .optional(),
  })
  .strict();

const pendingActionSchema = z
  .object({
    id: publicIdSchema,
    label: z.string().min(1).max(160),
    consequence: z.string().min(1).max(320),
    details: z.record(z.string(), z.unknown()),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict();

/**
 * The public response excludes the authoritative synthetic world, continuation,
 * and idempotency data. It exposes only bounded, sanitized tool evidence.
 */
export const missionRuntimeResponseSchema = z
  .object({
    version: z.literal(2),
    sessionToken: sessionTokenSchema,
    stateVersion: z.number().int().positive(),
    status: z.enum([
      "active",
      "awaiting_approval",
      "complete",
      "retryable_error",
    ]),
    viewState: z
      .object({
        scenarioId: scenarioIdSchema,
        stage: publicIdSchema,
        progress: z.number().min(0).max(1),
        visiblePermissions: z.array(z.string().min(1).max(120)).max(20),
      })
      .strict(),
    events: z.array(missionEventSchema).max(100),
    pendingAction: pendingActionSchema.nullable().optional(),
    provenance: z
      .object({
        mode: z.enum(["live", "practice", "unavailable"]),
        model: z.string().min(1).max(80).nullable(),
        responseIds: z.array(z.string().min(1).max(160)).max(20),
      })
      .strict(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.status === "awaiting_approval" && !response.pendingAction) {
      context.addIssue({
        code: "custom",
        message: "An awaiting-approval response requires a pending action",
        path: ["pendingAction"],
      });
    }
  });

export type MissionRuntimeRequest = z.infer<typeof missionRuntimeRequestSchema>;
export type MissionRuntimeResponse = z.infer<typeof missionRuntimeResponseSchema>;
