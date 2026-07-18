// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoCoach } from "@/lib/mission";
import type { CoachClient } from "@/lib/mission-client";
import { MissionExperience } from "./MissionExperience";

afterEach(cleanup);

const fixtureClient = vi.fn<CoachClient>(async (request) => createDemoCoach(request));

describe("MissionExperience", () => {
  it("opens with a plain-language catalog of 20 missions", () => {
    render(<MissionExperience client={fixtureClient} />);

    expect(screen.getByRole("heading", { name: "Learn AI by doing it." })).toBeVisible();
    expect(screen.getByText("20 practice missions")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /start mission/i })).toHaveLength(20);
    expect(screen.queryByText(/scope|inspect|consequential/i)).not.toBeInTheDocument();
  });

  it("filters the mission library without hiding the featured starting point", async () => {
    const user = userEvent.setup();
    render(<MissionExperience client={fixtureClient} />);

    await user.click(screen.getByRole("button", { name: "Work" }));

    expect(screen.getAllByRole("button", { name: /start mission/i })).toHaveLength(5);
    expect(screen.getByText("Send a client update")).toBeVisible();
    expect(screen.queryByText("Return a purchase")).not.toBeInTheDocument();
  });

  it("plays the flagship mission as an AI conversation", async () => {
    const user = userEvent.setup();
    render(<MissionExperience client={fixtureClient} />);

    await user.click(screen.getByRole("button", { name: "Start mission: Cancel a subscription" }));
    expect(screen.getByText("Cancel my Streamly trial before I get charged.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "What should AI be allowed to see?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Only Streamly emails" }));
    expect(await screen.findByText(/other messages stayed private/i)).toBeVisible();
    expect(screen.getByText("AI used a tool")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Is this really the right place?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "account.streamly.example" }));
    expect(await screen.findByRole("heading", { name: "Take one last look before AI does it" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await screen.findByRole("heading", { name: "How do you know it worked?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /confirmation email.*ST-4821/i }));
    expect(await screen.findByRole("heading", { name: "You made 4 smart moves." })).toBeVisible();
    expect(screen.getByText(/That is how you stay in charge of AI/i)).toBeVisible();
    expect(screen.queryByText("Choose an answer above to keep going")).not.toBeInTheDocument();
  });

  it("lets every catalog mission begin with scenario-specific language", async () => {
    const user = userEvent.setup();
    render(<MissionExperience client={fixtureClient} />);

    await user.click(screen.getByRole("button", { name: "Start mission: Book a flight" }));

    expect(screen.getByText(/Find me a flight to Denver/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Only this trip’s dates and budget" })).toBeVisible();
  });

  it("turns a suspicious link into a simple retry", async () => {
    const user = userEvent.setup();
    render(<MissionExperience client={fixtureClient} />);

    await user.click(screen.getByRole("button", { name: "Start mission: Cancel a subscription" }));
    await user.click(screen.getByRole("button", { name: "Only Streamly emails" }));
    await user.click(screen.getByRole("button", { name: "streamly-cancel.example.net" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That does not match");
    expect(screen.getByRole("heading", { name: "Is this really the right place?" })).toBeVisible();
  });
});
