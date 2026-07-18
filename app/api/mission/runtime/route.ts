import { ZodError } from "zod";
import { D1MissionSessionStore } from "@/db/mission-session-store";
import {
  CancellationMissionService,
  CancellationMissionServiceError,
} from "@/lib/cancellation-mission-service";
import { cancellationMissionInstructions } from "@/lib/cancellation-prompt";
import type { MissionModelAdapter } from "@/lib/mission-orchestrator";
import { createOpenAIMissionAdapter } from "@/lib/openai-mission-adapter";
import {
  getMissionRuntimeBindings,
  type MissionRuntimeBindings,
} from "@/lib/runtime-bindings";

const MAX_REQUEST_BYTES = 32 * 1_024;
const MINUTE_LIMIT = 10;
const HOUR_LIMIT = 60;

interface ClientWindow {
  minuteCount: number;
  minuteResetsAt: number;
  hourCount: number;
  hourResetsAt: number;
}

interface MissionRuntimeHandlerDependencies {
  getBindings?: () => MissionRuntimeBindings;
  createAdapter?: (apiKey: string) => MissionModelAdapter;
  now?: () => number;
  clientKey?: (request: Request) => string;
}

function defaultClientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function createMissionRuntimeHandler(
  dependencies: MissionRuntimeHandlerDependencies = {},
) {
  const getBindings = dependencies.getBindings ?? getMissionRuntimeBindings;
  const createAdapter =
    dependencies.createAdapter ??
    ((apiKey: string) =>
      createOpenAIMissionAdapter(apiKey, cancellationMissionInstructions));
  const clock = dependencies.now ?? Date.now;
  const identify = dependencies.clientKey ?? defaultClientKey;
  const clientWindows = new Map<string, ClientWindow>();

  return async function post(request: Request): Promise<Response> {
    const now = clock();
    const client = identify(request);
    const existing = clientWindows.get(client);
    const window: ClientWindow = existing
      ? {
          minuteCount:
            existing.minuteResetsAt <= now ? 0 : existing.minuteCount,
          minuteResetsAt:
            existing.minuteResetsAt <= now
              ? now + 60_000
              : existing.minuteResetsAt,
          hourCount: existing.hourResetsAt <= now ? 0 : existing.hourCount,
          hourResetsAt:
            existing.hourResetsAt <= now
              ? now + 60 * 60_000
              : existing.hourResetsAt,
        }
      : {
          minuteCount: 0,
          minuteResetsAt: now + 60_000,
          hourCount: 0,
          hourResetsAt: now + 60 * 60_000,
        };
    if (window.minuteCount >= MINUTE_LIMIT || window.hourCount >= HOUR_LIMIT) {
      const retryAt =
        window.minuteCount >= MINUTE_LIMIT
          ? window.minuteResetsAt
          : window.hourResetsAt;
      return json(
        { error: "Too many steps at once. Wait a moment and try again." },
        429,
        { "Retry-After": String(Math.max(1, Math.ceil((retryAt - now) / 1_000))) },
      );
    }
    window.minuteCount += 1;
    window.hourCount += 1;
    clientWindows.set(client, window);

    try {
      const declaredLength = Number(request.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_REQUEST_BYTES) {
        return json({ error: "That request is too large." }, 413);
      }
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return json({ error: "That request is too large." }, 413);
      }
      const input = JSON.parse(rawBody) as unknown;
      const bindings = getBindings();
      if (bindings.LIVE_GOLDEN_MISSIONS !== "true") {
        return json({ error: "This live mission is paused right now." }, 503);
      }
      if (!bindings.OPENAI_API_KEY || !bindings.MISSION_STATE_SECRET) {
        return json({ error: "This live mission is not ready yet." }, 503);
      }

      const store = new D1MissionSessionStore(bindings.DB);
      await store.initialize();
      const mission = new CancellationMissionService(
        store,
        createAdapter(bindings.OPENAI_API_KEY),
        bindings.MISSION_STATE_SECRET,
      );
      return json(await mission.handle(input as never, now));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return json({ error: "The request body must be valid JSON." }, 400);
      }
      if (error instanceof ZodError) {
        return json({ error: "Check that choice and try again." }, 400);
      }
      if (error instanceof CancellationMissionServiceError) {
        if (error.code === "expired") {
          return json({ error: "This mission expired. Start it again." }, 410);
        }
        if (error.code === "conflict") {
          return json({ error: "That step already changed. Refresh and try again." }, 409);
        }
        return json({ error: "That choice does not fit this step." }, 400);
      }
      if (
        error instanceof Error &&
        error.message.startsWith("Mission token")
      ) {
        return json({ error: "That mission link is no longer valid." }, 409);
      }
      return json({ error: "AI got stuck. Try that step again." }, 502);
    }
  };
}

export const POST = createMissionRuntimeHandler();

export async function GET(): Promise<Response> {
  try {
    const bindings = getMissionRuntimeBindings();
    const live =
      bindings.LIVE_GOLDEN_MISSIONS === "true" &&
      !!bindings.OPENAI_API_KEY &&
      !!bindings.MISSION_STATE_SECRET;
    return json({ cancelStreamly: live ? "live" : "practice" });
  } catch {
    return json({ cancelStreamly: "unavailable" }, 503);
  }
}
