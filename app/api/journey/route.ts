import { ZodError } from "zod";
import { createDemoJourney, journeyRequestSchema } from "@/lib/journey";
import { generateLiveJourney } from "@/lib/openai-journey";

const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;

type ClientWindow = {
  count: number;
  resetsAt: number;
};

const clientWindows = new Map<string, ClientWindow>();

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

    if (clientWindows.size > MAX_TRACKED_CLIENTS) {
      for (const [address, window] of clientWindows) {
        if (window.resetsAt <= now) clientWindows.delete(address);
      }

      if (clientWindows.size > MAX_TRACKED_CLIENTS) {
        const oldestAddress = clientWindows.keys().next().value;
        if (oldestAddress) clientWindows.delete(oldestAddress);
      }
    }

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
      { error: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  try {
    const json = (await request.json()) as unknown;
    const input = journeyRequestSchema.parse(json);

    if (process.env.USE_DEMO_FIXTURES === "true") {
      return Response.json(createDemoJourney(input));
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GPT-5.6 is not configured for this environment yet." },
        { status: 503 },
      );
    }

    const journey = await generateLiveJourney(input, apiKey);
    return Response.json(journey);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error:
            error.issues[0]?.message ?? "Check the information and try again.",
        },
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
      { error: "The task map could not be generated. Please try again." },
      { status: 502 },
    );
  }
}
