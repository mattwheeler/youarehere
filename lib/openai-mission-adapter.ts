import OpenAI from "openai";
import type {
  ResponseInput,
  Tool,
} from "openai/resources/responses/responses";
import type {
  MissionModelAdapter,
  MissionModelItem,
  MissionModelRequest,
  MissionModelResponse,
} from "./mission-orchestrator";

const MISSION_MODEL = "gpt-5.6";
const MODEL_TIMEOUT_MS = 15_000;

export class OpenAIMissionAdapter implements MissionModelAdapter {
  constructor(
    private readonly client: Pick<OpenAI, "responses">,
    private readonly instructions: string,
  ) {}

  async respond(request: MissionModelRequest): Promise<MissionModelResponse> {
    const response = await this.client.responses.create(
      {
        model: MISSION_MODEL,
        store: false,
        reasoning: { effort: "low" },
        include: ["reasoning.encrypted_content"],
        instructions: this.instructions,
        input: request.input as unknown as ResponseInput,
        tools: request.tools as Tool[],
        parallel_tool_calls: request.parallelToolCalls,
      },
      { timeout: MODEL_TIMEOUT_MS, maxRetries: 0 },
    );

    return {
      id: response.id,
      output: response.output as unknown as MissionModelItem[],
    };
  }
}

export function createOpenAIMissionAdapter(
  apiKey: string,
  instructions: string,
): OpenAIMissionAdapter {
  if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required");
  return new OpenAIMissionAdapter(new OpenAI({ apiKey }), instructions);
}
