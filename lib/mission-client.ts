import {
  coachRequestSchema,
  coachResponseSchema,
  type CoachRequest,
  type CoachResponse,
} from "./mission";

export type CoachClient = (request: CoachRequest) => Promise<CoachResponse>;

export const postCoach: CoachClient = async (rawRequest) => {
  const request = coachRequestSchema.parse(rawRequest);
  const response = await fetch("/api/mission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "The simulation could not continue.";
    throw new Error(message);
  }

  return coachResponseSchema.parse(body);
};
