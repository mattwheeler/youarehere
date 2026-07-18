// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyClient } from "@/lib/journey-client";
import { createDemoJourney } from "@/lib/journey";
import { JourneyExperience } from "./JourneyExperience";

afterEach(cleanup);

describe("JourneyExperience", () => {
  it("starts from familiar outcomes instead of AI product categories", () => {
    render(<JourneyExperience />);

    expect(
      screen.getByRole("heading", {
        name: "What are you trying to get done today?",
      }),
    ).toBeVisible();
    for (const path of [
      "Write",
      "Understand",
      "Find",
      "Compare",
      "Decide",
      "Create",
    ]) {
      expect(screen.getByText(path)).toBeVisible();
    }
    expect(screen.queryByText(/model picker/i)).not.toBeInTheDocument();
  });

  it("moves from a goal through evidence to an explainable refinement", async () => {
    const user = userEvent.setup();
    const client = vi.fn<JourneyClient>(async (request) =>
      createDemoJourney(request),
    );
    render(<JourneyExperience client={client} />);

    await user.type(
      screen.getByLabelText("Your goal"),
      "I need to write my performance review.",
    );
    await user.click(screen.getByRole("button", { name: "Map my task" }));

    expect(await screen.findByLabelText("Task map")).toBeVisible();
    expect(screen.getByText("Work notes")).toBeVisible();
    expect(screen.getByText(/no evidence from your year/i)).toBeVisible();
    expect(screen.getByText("Web search: unnecessary")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /add work notes/i }));
    await user.type(
      screen.getByRole("textbox", { name: "Add work notes" }),
      "Led a migration early. Reduced the support backlog by 30%. Mentored two teammates.",
    );
    await user.click(screen.getByRole("button", { name: "Use these notes" }));

    expect(await screen.findByText("Added evidence")).toBeVisible();
    expect(screen.getByText(/30%/)).toBeVisible();
    expect(screen.getByText("Used in this result")).toBeVisible();

    await user.type(
      screen.getByLabelText("Refine this result"),
      "Make it confident but not boastful, for my director.",
    );
    await user.click(screen.getByRole("button", { name: "Refine" }));

    expect(await screen.findByText("Set audience and tone")).toBeVisible();
    expect(screen.getByText("Audience")).toBeVisible();
    expect(screen.getByText("Tone")).toBeVisible();
    expect(screen.getByText("Refine for audience")).toBeVisible();
    expect(client).toHaveBeenCalledTimes(3);
  });

  it("keeps the user oriented when generation fails", async () => {
    const user = userEvent.setup();
    const client = vi.fn<JourneyClient>().mockRejectedValue(
      new Error("The map could not be generated."),
    );
    render(<JourneyExperience client={client} />);

    await user.type(screen.getByLabelText("Your goal"), "Draft my review");
    await user.click(screen.getByRole("button", { name: "Map my task" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The map could not be generated.",
      );
    });
    expect(screen.getByDisplayValue("Draft my review")).toBeVisible();
  });
});
