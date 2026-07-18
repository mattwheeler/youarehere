import { describe, expect, it } from "vitest";
import type { MissionSession } from "../db/mission-session-store";
import { createCancellationToolRunner } from "./cancellation-tools";
import { getCancellationWorldSeed } from "./golden-missions";
import { MissionToolPolicyError } from "./mission-tool-runner";

const now = Date.parse("2026-07-18T18:00:00.000Z");

function session(
  permissions: string[] = ["mail:streamly"],
  events: unknown[] = [],
): MissionSession {
  return {
    id: "ses_cancel",
    scenarioId: "cancel-streamly",
    seedId: "cancel-a",
    experienceMode: "live",
    status: "active",
    stage: "work",
    version: 2,
    permissions,
    world: getCancellationWorldSeed("cancel-a") as unknown as Record<string, unknown>,
    events,
    continuation: null,
    pendingActionId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 30 * 60_000,
  };
}

function context(current: MissionSession) {
  return { session: current, now };
}

describe("Cancel Streamly tools", () => {
  it("registers exactly the six approved strict functions", () => {
    expect(
      createCancellationToolRunner()
        .openAITools()
        .map((tool) => [tool.name, tool.strict]),
    ).toEqual([
      ["search_streamly_messages", true],
      ["read_streamly_message", true],
      ["resolve_destination", true],
      ["preview_subscription_change", true],
      ["cancel_subscription", true],
      ["get_cancellation_confirmation", true],
    ]);
  });

  it("separates the allowed search boundary, scanned metadata, and returned matches", async () => {
    const runner = createCancellationToolRunner();
    const focused = await runner.handleRead(
      {
        callId: "call_search_focused",
        name: "search_streamly_messages",
        arguments: '{"query":"Streamly renewal"}',
      },
      context(session()),
    );
    const broad = await runner.handleRead(
      {
        callId: "call_search_broad",
        name: "search_streamly_messages",
        arguments: '{"query":"Streamly renewal"}',
      },
      context(session(["mail:metadata:all"])),
    );

    expect(focused.output).toMatchObject({
      authorizedSearch: "Streamly messages only",
      metadataScanned: ["msg_cancel-a_receipt", "msg_cancel-a_phish"],
    });
    expect(broad.output).toMatchObject({
      authorizedSearch: "All inbox metadata",
      metadataScanned: [
        "msg_cancel-a_receipt",
        "msg_cancel-a_phish",
        "msg_cancel-a_unrelated",
      ],
    });
    expect(focused.output.matches).toEqual(broad.output.matches);
    expect(JSON.stringify(focused.output)).not.toContain("neighborhood events");
  });

  it("returns only a requested body from the prior search result", async () => {
    const runner = createCancellationToolRunner();
    const search = await runner.handleRead(
      {
        callId: "call_search",
        name: "search_streamly_messages",
        arguments: '{"query":"Streamly renewal"}',
      },
      context(session(["mail:metadata:all"])),
    );
    const searchedSession = session(["mail:metadata:all"], [search.event]);
    const read = await runner.handleRead(
      {
        callId: "call_read",
        name: "read_streamly_message",
        arguments: '{"messageId":"msg_cancel-a_receipt"}',
      },
      context(searchedSession),
    );

    expect(read.output).toMatchObject({
      messageId: "msg_cancel-a_receipt",
      from: "receipts@streamly.example",
      links: [{ linkId: "link_cancel-a_account", label: "Manage subscription" }],
    });
    await expect(
      runner.handleRead(
        {
          callId: "call_private",
          name: "read_streamly_message",
          arguments: '{"messageId":"msg_cancel-a_unrelated"}',
        },
        context(searchedSession),
      ),
    ).rejects.toMatchObject<Partial<MissionToolPolicyError>>({
      code: "unauthorized_resource",
    });
  });

  it("resolves known links in code and marks the look-alike route unsafe", async () => {
    const runner = createCancellationToolRunner();
    const readEvents = [
      {
        kind: "tool_result",
        toolName: "read_streamly_message",
        result: {
          messageId: "msg_cancel-a_phish",
          links: [{ linkId: "link_cancel-a_phish", label: "Verify payment" }],
        },
      },
    ];
    const resolved = await runner.handleRead(
      {
        callId: "call_resolve",
        name: "resolve_destination",
        arguments: '{"linkId":"link_cancel-a_phish"}',
      },
      context(session(["mail:streamly"], readEvents)),
    );

    expect(resolved.output).toEqual({
      linkId: "link_cancel-a_phish",
      host: "billing-streamly.example.net",
      trusted: false,
      reason: "This address is not the configured Streamly account address.",
    });
    await expect(
      runner.handleRead(
        {
          callId: "call_unsafe_preview",
          name: "preview_subscription_change",
          arguments: '{"subscriptionId":"sub_streamly_1"}',
        },
        context(session(["mail:streamly"], [resolved.event])),
      ),
    ).rejects.toMatchObject({ code: "unauthorized_resource" });
  });

  it("previews the exact account consequence only after a trusted route", async () => {
    const runner = createCancellationToolRunner();
    const trustedRoute = {
      kind: "tool_result",
      toolName: "resolve_destination",
      result: {
        linkId: "link_cancel-a_account",
        host: "account.streamly.example",
        trusted: true,
      },
    };
    const preview = await runner.handleRead(
      {
        callId: "call_preview",
        name: "preview_subscription_change",
        arguments: '{"subscriptionId":"sub_streamly_1"}',
      },
      context(session(["mail:streamly"], [trustedRoute])),
    );

    expect(preview.output).toEqual({
      accountId: "acct_streamly_1",
      subscriptionId: "sub_streamly_1",
      service: "Streamly",
      plan: "Premium",
      chargeAvoided: { amount: 18.99, currency: "USD" },
      renewsAt: "2026-08-03T14:00:00.000Z",
      accessEndsAt: "2026-08-03T23:59:59.000Z",
    });
  });

  it("freezes cancellation, then changes the synthetic world only after approval", async () => {
    const runner = createCancellationToolRunner({
      actionId: () => "act_cancel",
    });
    const previewEvent = {
      kind: "tool_result",
      toolName: "preview_subscription_change",
      result: {
        accountId: "acct_streamly_1",
        subscriptionId: "sub_streamly_1",
      },
    };
    const before = session(["mail:streamly"], [previewEvent]);
    const pending = await runner.freezeWrite(
      {
        callId: "call_cancel",
        name: "cancel_subscription",
        arguments:
          '{"accountId":"acct_streamly_1","subscriptionId":"sub_streamly_1"}',
      },
      context(before),
    );

    expect(
      (before.world.subscription as { status: string }).status,
    ).toBe("active");
    expect(pending.preview).toMatchObject({
      label: "Cancel Streamly Premium",
      details: {
        accountId: "acct_streamly_1",
        subscriptionId: "sub_streamly_1",
        chargeAvoided: { amount: 18.99, currency: "USD" },
      },
    });

    const approved = { ...pending, status: "approved" as const };
    const approvalSession = {
      ...before,
      version: approved.sessionVersion,
      pendingActionId: approved.id,
    };
    const executed = await runner.executeFrozenWrite(
      approved,
      context(approvalSession),
    );

    expect(executed.world).toMatchObject({
      subscription: { status: "cancelled" },
      confirmation: {
        confirmationId: "ST-CANCEL-A",
        subscriptionId: "sub_streamly_1",
        cancelledAt: "2026-07-18T18:00:00.000Z",
      },
    });
  });

  it("returns proof only when confirmation matches the cancelled account", async () => {
    const runner = createCancellationToolRunner();
    const cancelled = session();
    cancelled.world = {
      ...cancelled.world,
      subscription: {
        ...(cancelled.world.subscription as Record<string, unknown>),
        status: "cancelled",
      },
      confirmation: {
        confirmationId: "ST-CANCEL-A",
        subscriptionId: "sub_streamly_1",
        cancelledAt: "2026-07-18T18:00:00.000Z",
      },
    };

    const proof = await runner.handleRead(
      {
        callId: "call_proof",
        name: "get_cancellation_confirmation",
        arguments: '{"subscriptionId":"sub_streamly_1"}',
      },
      context(cancelled),
    );

    expect(proof.output).toEqual({
      subscriptionId: "sub_streamly_1",
      status: "cancelled",
      confirmationId: "ST-CANCEL-A",
      cancelledAt: "2026-07-18T18:00:00.000Z",
      matchesAccountState: true,
    });

    cancelled.world = {
      ...cancelled.world,
      confirmation: {
        confirmationId: "ST-WRONG",
        subscriptionId: "sub_someone_else",
        cancelledAt: "2026-07-18T18:00:00.000Z",
      },
    };
    await expect(
      runner.handleRead(
        {
          callId: "call_bad_proof",
          name: "get_cancellation_confirmation",
          arguments: '{"subscriptionId":"sub_streamly_1"}',
        },
        context(cancelled),
      ),
    ).rejects.toMatchObject({ code: "unauthorized_resource" });
  });
});
