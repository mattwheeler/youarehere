import { z } from "zod";

const MIN_SECRET_LENGTH = 32;
const DEFAULT_TTL_MS = 30 * 60_000;

const payloadSchema = z
  .object({
    sid: z.string().min(3).max(96),
    v: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .strict();

export interface MissionTokenInput {
  sessionId: string;
  version: number;
}

export interface MissionTokenClaims extends MissionTokenInput {
  expiresAt: number;
}

interface MissionTokenOptions {
  now?: number;
  ttlMs?: number;
}

function requireSigningSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error("MISSION_STATE_SECRET must be at least 32 characters");
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid encoding");
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueMissionToken(
  input: MissionTokenInput,
  secret: string,
  options: MissionTokenOptions = {},
): Promise<string> {
  requireSigningSecret(secret);
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("Mission token TTL must be a positive integer");
  }

  const payload = payloadSchema.parse({
    sid: input.sessionId,
    v: input.version,
    exp: now + ttlMs,
  });
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    new TextEncoder().encode(encodedPayload),
  );

  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyMissionToken(
  token: string,
  secret: string,
  options: Pick<MissionTokenOptions, "now"> = {},
): Promise<MissionTokenClaims> {
  requireSigningSecret(secret);

  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("invalid token shape");
    const [encodedPayload, encodedSignature] = parts;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      fromBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!verified) throw new Error("invalid signature");

    const payload = payloadSchema.parse(
      JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))),
    );
    if (payload.exp <= (options.now ?? Date.now())) {
      throw new Error("expired");
    }

    return {
      sessionId: payload.sid,
      version: payload.v,
      expiresAt: payload.exp,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "expired") {
      throw new Error("Mission token has expired");
    }
    throw new Error("Mission token is invalid");
  }
}
