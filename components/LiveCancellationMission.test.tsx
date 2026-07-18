// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissionRuntimeResponse } from "@/lib/mission-runtime";
import type { MissionRuntimeClient } from "@/lib/mission-runtime-client";
import { LiveCancellationMission } from "./LiveCancellationMission";

afterEach(cleanup);

function runtime(
  stage: string,
  overrides: Partial<MissionRuntimeResponse> = {},
): MissionRuntimeResponse {
  return {
    version: 2,
    sessionToken: `opaque.session.${stage}`,
    stateVersion: 1,
    status: "active",
    viewState: {
      scenarioId: "cancel-streamly",
      stage,
      progress: 0.25,
      visiblePermissions: stage === "access" ? [] : ["Streamly messages only"],
    },
    events: [],
    pendingAction: null,
    provenance: {
      mode: "live",
      model: "gpt-5.6",
      responseIds: stage === "access" ? [] : ["resp_1"],
    },
    ...overrides,
  };
}

describe("LiveCancellationMission", () => {
  it("shows the live access, route, approval, and proof decisions", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const responses = [
      runtime("access"),
      runtime("route-choice", {
        stateVersion: 3,
        events: [
          {
            id: "evt_read_real",
            kind: "tool_result",
            label: "Read the real renewal",
            createdAt: 1,
            technical: {
              toolName: "read_streamly_message",
              callId: "call_read_real",
              arguments: { messageId: "msg_real" },
              result: {
                links: [
                  {
                    linkId: "link_cancel-a_account",
                    label: "Manage subscription",
                    host: "account.streamly.example",
                  },
                ],
              },
            },
          },
          {
            id: "evt_read_fake",
            kind: "tool_result",
            label: "Read the suspicious copy",
            createdAt: 2,
            technical: {
              toolName: "read_streamly_message",
              callId: "call_read_fake",
              arguments: { messageId: "msg_fake" },
              result: {
                links: [
                  {
                    linkId: "link_cancel-a_phish",
                    label: "Verify payment",
                    host: "billing-streamly.example.net",
                  },
                ],
              },
            },
          },
        ],
      }),
      runtime("route-choice", {
        stateVersion: 5,
        status: "awaiting_approval",
        pendingAction: {
          id: "act_cancel",
          label: "Cancel Streamly Premium",
          consequence: "The $18.99 renewal will not happen.",
          details: {
            plan: "Premium",
            chargeAvoided: { amount: 18.99, currency: "USD" },
            accessEndsAt: "2026-08-03T23:59:59.000Z",
            accountId: "acct_streamly_1",
          },
          expiresAt: Date.now() + 60_000,
        },
      }),
      runtime("proof", { stateVersion: 7 }),
      runtime("complete", { stateVersion: 8, status: "complete" }),
    ];
    const client = vi.fn<MissionRuntimeClient>(
      async () => {
        const response = responses.shift();
        if (!response) throw new Error("No response remains");
        return response;
      },
    );
    const user = userEvent.setup();
    render(<LiveCancellationMission client={client} onExit={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "What should AI be allowed to see?" })).toBeVisible();
    expect(scrollIntoView).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Only Streamly messages/i }));
    expect(await screen.findByRole("heading", { name: "Where should AI go?" })).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText("billing-streamly.example.net")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /account\.streamly\.example/i }));
    expect(await screen.findByRole("heading", { name: "Cancel Streamly Premium" })).toBeVisible();
    expect(screen.getByText("$18.99")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await screen.findByRole("heading", { name: "How do you know it worked?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /The confirmation message/i }));
    expect(await screen.findByRole("heading", { name: "You stayed in charge." })).toBeVisible();
  });
});
