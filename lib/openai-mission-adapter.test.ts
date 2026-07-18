import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { OpenAIMissionAdapter } from "./openai-mission-adapter";

describe("OpenAI mission adapter", () => {
  it("runs a stateless GPT-5.6 response and preserves every output item", async () => {
    const output = [
      {
        id: "rs_1",
        type: "reasoning",
        encrypted_content: "encrypted-reasoning-state",
        summary: [],
      },
      {
        id: "fc_1",
        type: "function_call",
        call_id: "call_1",
        name: "read_subscription",
        arguments: '{"subscriptionId":"sub_1"}',
        status: "completed",
      },
    ];
    const create = vi.fn(async () => ({ id: "resp_1", output }));
    const client = {
      responses: { create },
    } as unknown as Pick<OpenAI, "responses">;
    const adapter = new OpenAIMissionAdapter(client, "Mission instructions");
    const tools = [
      {
        type: "function" as const,
        name: "read_subscription",
        description: "Read the subscription.",
        parameters: {
          type: "object",
          properties: { subscriptionId: { type: "string" } },
          required: ["subscriptionId"],
          additionalProperties: false,
        },
        strict: true as const,
      },
    ];
    const input = [{ role: "user", content: "Cancel Streamly" }];

    const result = await adapter.respond({
      input,
      tools,
      parallelToolCalls: false,
    });

    expect(result).toEqual({ id: "resp_1", output });
    expect(create).toHaveBeenCalledWith(
      {
        model: "gpt-5.6",
        store: false,
        reasoning: { effort: "low" },
        include: ["reasoning.encrypted_content"],
        instructions: "Mission instructions",
        input,
        tools,
        parallel_tool_calls: false,
      },
      { timeout: 15_000, maxRetries: 0 },
    );
  });
});
