// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoCoach } from "@/lib/mission";
import type { CoachClient } from "@/lib/mission-client";
import { MissionExperience } from "./MissionExperience";

afterEach(cleanup);

describe("MissionExperience", () => {
  it("opens with a consequential mission instead of an AI taxonomy", () => {
    render(<MissionExperience />);

    expect(
      screen.getByRole("heading", {
        name: "Before an AI acts on your behalf, learn how to stay in charge.",
      }),
    ).toBeVisible();
    expect(screen.getByText(/streaming trial renews tomorrow/i)).toBeVisible();
    expect(screen.queryByText("Capability map")).not.toBeInTheDocument();
  });

  it("completes the mission through scope, inspect, approve, and verify", async () => {
    const user = userEvent.setup();
    const client = vi.fn<CoachClient>(async (request) =>
      createDemoCoach(request),
    );
    render(<MissionExperience client={client} />);

    await user.click(screen.getByRole("button", { name: "Begin simulation" }));
    expect(screen.getByRole("heading", { name: "How much should it see?" })).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /only messages from streamly/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Which route do you trust?" }),
    ).toBeVisible();
    expect(screen.getByText(/3 unrelated messages stayed private/i)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /open the official account page/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "This action changes the account." }),
    ).toBeVisible();
    expect(screen.getByText("account.streamly.example")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Approve cancellation" }));
    expect(
      await screen.findByRole("heading", { name: "What proves it worked?" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /confirmation email with reference/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "You stayed in charge." }),
    ).toBeVisible();
    expect(screen.getByText("4 of 4 supervision moves")).toBeVisible();
    expect(client).toHaveBeenCalledTimes(4);
  });

  it("turns an unsafe choice into a retry instead of silently advancing", async () => {
    const user = userEvent.setup();
    const client = vi.fn<CoachClient>(async (request) =>
      createDemoCoach(request),
    );
    render(<MissionExperience client={client} />);

    await user.click(screen.getByRole("button", { name: "Begin simulation" }));
    await user.click(
      screen.getByRole("button", { name: /only messages from streamly/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /use the forwarded cancel-now link/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The domain does not match Streamly",
    );
    expect(
      screen.getByRole("heading", { name: "Which route do you trust?" }),
    ).toBeVisible();
  });

  it("does not accept the agent's assertion as verification", async () => {
    const user = userEvent.setup();
    const client = vi.fn<CoachClient>(async (request) =>
      createDemoCoach(request),
    );
    render(<MissionExperience client={client} />);

    await user.click(screen.getByRole("button", { name: "Begin simulation" }));
    await user.click(screen.getByRole("button", { name: /only messages from streamly/i }));
    await user.click(screen.getByRole("button", { name: /open the official account page/i }));
    await user.click(screen.getByRole("button", { name: "Approve cancellation" }));
    await user.click(screen.getByRole("button", { name: /the agent says it is done/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An assertion is not evidence",
    );
    expect(screen.getByRole("heading", { name: "What proves it worked?" })).toBeVisible();
  });

  it("reports the privacy cost when a learner completes with broad access", async () => {
    const user = userEvent.setup();
    const client = vi.fn<CoachClient>(async (request) =>
      createDemoCoach(request),
    );
    render(<MissionExperience client={client} />);

    await user.click(screen.getByRole("button", { name: "Begin simulation" }));
    await user.click(screen.getByRole("button", { name: "My entire inbox" }));
    await user.click(screen.getByRole("button", { name: /open the official account page/i }));
    await user.click(screen.getByRole("button", { name: "Approve cancellation" }));
    await user.click(screen.getByRole("button", { name: /confirmation email with reference/i }));

    expect(
      await screen.findByRole("heading", { name: "Mission complete. One risk remains." }),
    ).toBeVisible();
    expect(screen.getByText(/agent saw 3 unrelated messages/i)).toBeVisible();
    expect(screen.getByText("3 of 4 supervision moves")).toBeVisible();
    expect(screen.queryByText(/unrelated messages stayed private/i)).not.toBeInTheDocument();
  });
});
