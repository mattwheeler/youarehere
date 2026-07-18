import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  coachContentSchema,
  coachRequestSchema,
  coachResponseSchema,
  type CoachRequest,
  type CoachResponse,
} from "./mission";

const systemPrompt = `You are the concise coach inside a consumer education simulation about supervising AI agents.

The learner is cancelling a fictional Streamly subscription inside a synthetic workspace. Explain the observable consequence of the learner's decision in plain language. Never claim to reveal hidden reasoning. Do not invent facts beyond the fixed scenario. Keep the learner in control, distinguish an agent assertion from external evidence, and teach one transferable supervision principle. Return only the requested structured output.`;

export async function generateLiveCoach(
  rawInput: CoachRequest,
  apiKey: string,
): Promise<CoachResponse> {
  const input = coachRequestSchema.parse(rawInput);
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: "gpt-5.6",
    store: false,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Respond to this simulation decision:\n${JSON.stringify(input)}`,
      },
    ],
    text: { format: zodTextFormat(coachContentSchema, "agent_coaching") },
  });

  if (!response.output_parsed) {
    throw new Error("GPT-5.6 did not return a coaching response.");
  }

  return coachResponseSchema.parse({
    ...response.output_parsed,
    provenance: {
      live: true,
      model: "gpt-5.6",
      responseId: response.id,
    },
  });
}
