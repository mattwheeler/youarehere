import { describe, expect, it } from "vitest";
import {
  cancellationWorldSeeds,
  getCancellationWorldSeed,
  goldenMissionConfigs,
} from "./golden-missions";

describe("golden mission configuration", () => {
  it("keeps the approved required, target, and stretch order", () => {
    expect(goldenMissionConfigs.map(({ scenarioId, priority }) => [scenarioId, priority])).toEqual([
      ["cancel-streamly", "required"],
      ["suspicious-email", "target"],
      ["send-client-update", "stretch"],
    ]);
  });

  it("provides five varied deterministic cancellation seeds", () => {
    expect(cancellationWorldSeeds).toHaveLength(5);
    expect(new Set(cancellationWorldSeeds.map((seed) => seed.id)).size).toBe(5);
    expect(new Set(cancellationWorldSeeds.map((seed) => seed.subscription.renewsAt)).size).toBe(5);
    expect(new Set(cancellationWorldSeeds.flatMap((seed) => seed.inbox.map((message) => message.id))).size).toBeGreaterThan(10);
    expect(
      new Set(
        cancellationWorldSeeds.flatMap((seed) =>
          seed.inbox.flatMap((message) => message.links.map((link) => link.id)),
        ),
      ).size,
    ).toBe(15);
    expect(
      cancellationWorldSeeds.every((seed) =>
        seed.inbox.every((message) => message.body.length > message.preview.length),
      ),
    ).toBe(true);
  });

  it("returns a defensive deterministic seed and uses synthetic destinations", () => {
    const first = getCancellationWorldSeed("cancel-a");
    first.subscription.status = "cancelled";
    const again = getCancellationWorldSeed("cancel-a");

    expect(again.subscription.status).toBe("active");
    expect(
      again.inbox.flatMap((message) => message.links.map((link) => link.host)),
    ).toSatisfy((hosts: string[]) => hosts.every((host) => host.endsWith(".example") || host.endsWith(".example.net")));
  });
});
