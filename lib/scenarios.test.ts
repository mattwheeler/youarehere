import { describe, expect, it } from "vitest";
import { getScenario, scenarioCatalog } from "./scenarios";

describe("scenario catalog", () => {
  it("contains 20 unique, playable learning missions", () => {
    expect(scenarioCatalog).toHaveLength(20);
    expect(new Set(scenarioCatalog.map((scenario) => scenario.id)).size).toBe(20);
    expect(scenarioCatalog.every((scenario) => scenario.prompt && scenario.steps)).toBe(true);
  });

  it("offers five missions in each everyday category", () => {
    const counts = scenarioCatalog.reduce<Record<string, number>>((result, scenario) => {
      result[scenario.category] = (result[scenario.category] ?? 0) + 1;
      return result;
    }, {});

    expect(counts.everyday).toBe(5);
    expect(counts.work).toBe(5);
    expect(counts.money).toBe(5);
    expect(counts.safety).toBe(5);
  });

  it("gives the three flagship missions extra prominence", () => {
    expect(scenarioCatalog.filter((scenario) => scenario.featured)).toHaveLength(3);
    expect(getScenario("cancel-streamly").featured).toBe(true);
  });

  it("fails closed for an unknown scenario", () => {
    expect(() => getScenario("not-a-real-mission")).toThrow("Unknown mission");
  });
});
