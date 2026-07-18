import { z } from "zod";
import {
  missionRuntimeResponseSchema,
  type MissionRuntimeRequest,
  type MissionRuntimeResponse,
} from "./mission-runtime";

const runtimeStatusSchema = z
  .object({
    cancelStreamly: z.enum(["live", "practice", "unavailable"]),
  })
  .strict();

export type MissionRuntimeClient = (
  request: MissionRuntimeRequest,
) => Promise<MissionRuntimeResponse>;

type Fetcher = typeof fetch;

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function postMissionRuntime(
  request: MissionRuntimeRequest,
  fetcher: Fetcher = fetch,
): Promise<MissionRuntimeResponse> {
  const response = await fetcher("/api/mission/runtime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(request),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "That step did not work. Try again.";
    throw new Error(message);
  }
  return missionRuntimeResponseSchema.parse(body);
}

export async function getMissionRuntimeStatus(fetcher: Fetcher = fetch) {
  const response = await fetcher("/api/mission/runtime", {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) return { cancelStreamly: "unavailable" as const };
  return runtimeStatusSchema.parse(await responseBody(response));
}
