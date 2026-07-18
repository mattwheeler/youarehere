import { ZodError } from "zod";
import { coachRequestSchema, createDemoCoach } from "@/lib/mission";
import { generateLiveCoach } from "@/lib/openai-coach";

const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const clientWindows = new Map<string, { count: number; resetsAt: number }>();

function clientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function allowRequest(client: string, now = Date.now()) {
  const current = clientWindows.get(client);
  if (!current || current.resetsAt <= now) {
    clientWindows.set(client, { count: 1, resetsAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= RATE_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetsAt - now) / 1_000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export async function POST(request: Request) {
  const rateLimit = allowRequest(clientAddress(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many decisions at once. Wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  try {
    const input = coachRequestSchema.parse((await request.json()) as unknown);
    if (process.env.USE_DEMO_FIXTURES === "true") {
      return Response.json(createDemoCoach(input));
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GPT-5.6 is not configured for this environment yet." },
        { status: 503 },
      );
    }

    return Response.json(await generateLiveCoach(input, apiKey));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: error.issues[0]?.message ?? "Check the decision and try again." },
        { status: 400 },
      );
    }
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "The request body must be valid JSON." },
        { status: 400 },
      );
    }
    return Response.json(
      { error: "The simulation could not continue. Please try again." },
      { status: 502 },
    );
  }
}
