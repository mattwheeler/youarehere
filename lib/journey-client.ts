import {
  journeyRequestSchema,
  journeyResponseSchema,
  type JourneyRequest,
  type JourneyResponse,
} from "./journey";

export type JourneyClient = (
  request: JourneyRequest,
) => Promise<JourneyResponse>;

export const postJourney: JourneyClient = async (rawRequest) => {
  const request = journeyRequestSchema.parse(rawRequest);
  const response = await fetch("/api/journey", {
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
        : "The map could not be generated.";
    throw new Error(message);
  }

  return journeyResponseSchema.parse(body);
};
