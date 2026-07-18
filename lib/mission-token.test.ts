import { describe, expect, it } from "vitest";
import { issueMissionToken, verifyMissionToken } from "./mission-token";

const secret = "a-secure-test-secret-that-is-longer-than-thirty-two-characters";

describe("opaque mission tokens", () => {
  it("round-trips only an opaque session reference", async () => {
    const token = await issueMissionToken(
      { sessionId: "ses_01J00000000000000000000000", version: 4 },
      secret,
      { now: 1_721_310_000_000, ttlMs: 30 * 60_000 },
    );

    expect(token).not.toContain("cancel-streamly");
    expect(token).not.toContain("Streamly");
    await expect(
      verifyMissionToken(token, secret, { now: 1_721_310_100_000 }),
    ).resolves.toEqual({
      sessionId: "ses_01J00000000000000000000000",
      version: 4,
      expiresAt: 1_721_311_800_000,
    });
  });

  it("rejects tampering, the wrong secret, and expired tokens", async () => {
    const token = await issueMissionToken(
      { sessionId: "ses_01J00000000000000000000000", version: 1 },
      secret,
      { now: 1_721_310_000_000, ttlMs: 1_000 },
    );
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    await expect(verifyMissionToken(tampered, secret)).rejects.toThrow(
      "Mission token is invalid",
    );
    await expect(
      verifyMissionToken(token, `${secret}-wrong`),
    ).rejects.toThrow("Mission token is invalid");
    await expect(
      verifyMissionToken(token, secret, { now: 1_721_310_001_001 }),
    ).rejects.toThrow("Mission token has expired");
    await expect(
      verifyMissionToken(token, secret, { now: 1_721_310_001_000 }),
    ).rejects.toThrow("Mission token has expired");
  });

  it("requires a strong signing secret", async () => {
    await expect(
      issueMissionToken(
        { sessionId: "ses_01J00000000000000000000000", version: 1 },
        "too-short",
      ),
    ).rejects.toThrow("MISSION_STATE_SECRET");
  });
});
