import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  journeyContentSchema,
  journeyRequestSchema,
  journeyResponseSchema,
  type JourneyRequest,
  type JourneyResponse,
} from "./journey";

const systemPrompt = `You create a visible task map for a nontechnical adult who is learning to use AI through real work.

Return only the structured task model requested by the schema. Separate the user's goal, supplied context, missing or unavailable context, the observable action, and the artifact. Never claim to expose hidden reasoning or chain-of-thought. Do not invent personal evidence. If context is absent, make the limitation explicit and keep the artifact honestly generic. Mark web search required only when current external information is necessary; otherwise mark it unnecessary. Explain changes in plain language and name one adjacent capability at most.`;

export async function generateLiveJourney(
  rawInput: JourneyRequest,
  apiKey: string,
): Promise<JourneyResponse> {
  const input = journeyRequestSchema.parse(rawInput);
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: "gpt-5.6",
    store: false,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Create the next visible state for this journey:\n${JSON.stringify(input)}`,
      },
    ],
    text: {
      format: zodTextFormat(journeyContentSchema, "journey_map"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("GPT-5.6 did not return a task map.");
  }

  return journeyResponseSchema.parse({
    ...response.output_parsed,
    stage: input.stage,
    provenance: {
      live: true,
      model: "gpt-5.6",
      responseId: response.id,
    },
  });
}
