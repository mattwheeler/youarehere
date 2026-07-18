import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  coachContentSchema,
  coachRequestSchema,
  coachResponseSchema,
  type CoachRequest,
  type CoachResponse,
} from "./mission";
import { getScenario } from "./scenarios";

const systemPrompt = `You are the friendly AI inside a short learn-by-doing mission for people who are new to AI.

Use very plain language. Write so a ten-year-old could understand it. Keep the reply to two short sentences. Never use the words scope, consequential, provenance, assertion, or verification. Explain only what the learner can see happen. Never claim to reveal hidden reasoning. Do not invent facts beyond the supplied mission. Keep the learner in control and separate AI saying something from outside proof. Return only the requested structured output.`;

export async function generateLiveCoach(
  rawInput: CoachRequest,
  apiKey: string,
): Promise<CoachResponse> {
  const input = coachRequestSchema.parse(rawInput);
  const scenario = getScenario(input.scenarioId);
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: "gpt-5.6",
    store: false,
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Mission: ${scenario.title}\nLearner asked: ${scenario.prompt}\nCurrent choice: ${JSON.stringify(input)}\nMission facts: ${JSON.stringify(scenario.steps)}`,
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
