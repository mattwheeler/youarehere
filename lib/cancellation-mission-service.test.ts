import { afterEach, describe, expect, it, vi } from "vitest";
import { D1MissionSessionStore } from "../db/mission-session-store";
import { SQLiteD1TestDatabase } from "../test-support/sqlite-d1";
import {
  CancellationMissionService,
  type CancellationMissionServiceFactories,
} from "./cancellation-mission-service";
import type {
  MissionModelAdapter,
  MissionModelResponse,
} from "./mission-orchestrator";

const now = Date.parse("2026-07-18T18:00:00.000Z");
const secret = "a-test-mission-secret-that-is-more-than-thirty-two-characters";

function scriptedAdapter(responses: MissionModelResponse[]): MissionModelAdapter {
  return {
    respond: vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("No scripted model response remains");
      return response;
    }),
  };
}

function functionCall(
  id: string,
  name: string,
  argumentsValue: Record<string, unknown>,
): MissionModelResponse {
  return {
    id: `resp_${id}`,
    output: [
      { type: "reasoning", id: `rs_${id}`, summary: [] },
      {
        type: "function_call",
        call_id: `call_${id}`,
        name,
        arguments: JSON.stringify(argumentsValue),
      },
    ],
  };
}

function message(id: string, text: string): MissionModelResponse {
  return {
    id: `resp_${id}`,
    output: [
      {
        type: "message",
        id: `msg_${id}`,
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  };
}

describe("live cancellation mission service", () => {
  let database: SQLiteD1TestDatabase | undefined;

  afterEach(() => database?.close());

  async function service(responses: MissionModelResponse[] = []) {
    database = new SQLiteD1TestDatabase();
    const store = new D1MissionSessionStore(database as never);
    await store.initialize();
    const factories: CancellationMissionServiceFactories = {
      sessionId: () => "ses_cancel_live",
      eventId: (() => {
        let value = 0;
        return () => `evt_service_${++value}`;
      })(),
      seedId: () => "cancel-a",
      actionId: () => "act_cancel_live",
      toolEventId: (() => {
        let value = 0;
        return () => `evt_tool_${++value}`;
      })(),
    };
    return {
      store,
      mission: new CancellationMissionService(
        store,
        scriptedAdapter(responses),
        secret,
        factories,
      ),
    };
  }

  it("starts an opaque, server-authoritative cancellation mission", async () => {
    const { mission, store } = await service();
    const response = await mission.handle(
      { version: 2, type: "start", scenarioId: "cancel-streamly" },
      now,
    );

    expect(response).toMatchObject({
      status: "active",
      stateVersion: 1,
      viewState: {
        scenarioId: "cancel-streamly",
        stage: "access",
        visiblePermissions: [],
      },
      provenance: { mode: "live", model: "gpt-5.6", responseIds: [] },
    });
    expect(response.sessionToken).not.toContain("cancel-streamly");
    expect(await store.getSession("ses_cancel_live", now + 1)).toMatchObject({
      seedId: "cancel-a",
      world: { subscription: { status: "active" }, confirmation: null },
    });
  });

  it("uses the chosen access, lets GPT inspect one message, and pauses at route choice", async () => {
    const { mission, store } = await service([
      functionCall("search", "search_streamly_messages", {
        query: "Streamly renewal",
      }),
      functionCall("read", "read_streamly_message", {
        messageId: "msg_cancel-a_receipt",
      }),
      functionCall("read_phish", "read_streamly_message", {
        messageId: "msg_cancel-a_phish",
      }),
      message("route", "I found the renewal. Check the account address before I go there."),
    ]);
    const started = await mission.handle(
      { version: 2, type: "start", scenarioId: "cancel-streamly" },
      now,
    );
    const response = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: started.sessionToken,
        choiceId: "focused-access",
      },
      now + 1,
    );

    expect(response).toMatchObject({
      status: "active",
      viewState: {
        stage: "route-choice",
        visiblePermissions: ["Streamly messages only"],
      },
      provenance: {
        responseIds: [
          "resp_search",
          "resp_read",
          "resp_read_phish",
          "resp_route",
        ],
      },
    });
    expect(response.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "permission" }),
        expect.objectContaining({ kind: "tool_result", label: "Found 2 Streamly messages" }),
        expect.objectContaining({ kind: "coach", label: expect.stringContaining("Check the account address") }),
      ]),
    );
    expect(await store.getSession("ses_cancel_live", now + 2)).toMatchObject({
      stage: "route-choice",
      permissions: ["mail:streamly"],
      world: { subscription: { status: "active" } },
    });
  });

  it("freezes the trusted cancellation, approves once, and reaches grounded proof", async () => {
    const { mission, store } = await service([
      functionCall("search", "search_streamly_messages", {
        query: "Streamly renewal",
      }),
      functionCall("read", "read_streamly_message", {
        messageId: "msg_cancel-a_receipt",
      }),
      functionCall("read_phish", "read_streamly_message", {
        messageId: "msg_cancel-a_phish",
      }),
      message("route", "I found the renewal. Check the account address."),
      functionCall("resolve", "resolve_destination", {
        linkId: "link_cancel-a_account",
      }),
      functionCall("preview", "preview_subscription_change", {
        subscriptionId: "sub_streamly_1",
      }),
      functionCall("cancel", "cancel_subscription", {
        accountId: "acct_streamly_1",
        subscriptionId: "sub_streamly_1",
      }),
      functionCall("proof", "get_cancellation_confirmation", {
        subscriptionId: "sub_streamly_1",
      }),
      message("done", "Streamly is cancelled. The confirmation is ready to check."),
    ]);
    const started = await mission.handle(
      { version: 2, type: "start", scenarioId: "cancel-streamly" },
      now,
    );
    const found = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: started.sessionToken,
        choiceId: "focused-access",
      },
      now + 1,
    );
    const pending = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: found.sessionToken,
        choiceId: "trusted-route",
      },
      now + 2,
    );

    expect(pending).toMatchObject({
      status: "awaiting_approval",
      pendingAction: {
        id: "act_cancel_live",
        label: "Cancel Streamly Premium",
      },
    });
    expect(
      ((await store.getSession("ses_cancel_live", now + 3))?.world
        .subscription as { status: string }).status,
    ).toBe("active");

    const approved = await mission.handle(
      {
        version: 2,
        type: "approve",
        sessionToken: pending.sessionToken,
        pendingActionId: "act_cancel_live",
        decision: "approve",
      },
      now + 3,
    );

    expect(approved).toMatchObject({
      status: "active",
      viewState: { stage: "proof" },
      provenance: {
        responseIds: expect.arrayContaining(["resp_proof", "resp_done"]),
      },
    });
    expect(await store.getSession("ses_cancel_live", now + 4)).toMatchObject({
      world: {
        subscription: { status: "cancelled" },
        confirmation: {
          confirmationId: "ST-CANCEL-A",
          subscriptionId: "sub_streamly_1",
        },
      },
    });

    const duplicate = await mission.handle(
      {
        version: 2,
        type: "approve",
        sessionToken: pending.sessionToken,
        pendingActionId: "act_cancel_live",
        decision: "approve",
      },
      now + 4,
    );
    expect(duplicate.stateVersion).toBe(approved.stateVersion);

    const complete = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: approved.sessionToken,
        choiceId: "strong-proof",
      },
      now + 5,
    );
    expect(complete).toMatchObject({
      status: "complete",
      viewState: { stage: "complete", progress: 1 },
    });
  });

  it("blocks the look-alike route and leaves the subscription active", async () => {
    const { mission, store } = await service([
      functionCall("search", "search_streamly_messages", {
        query: "Streamly renewal",
      }),
      functionCall("read", "read_streamly_message", {
        messageId: "msg_cancel-a_receipt",
      }),
      functionCall("read_phish", "read_streamly_message", {
        messageId: "msg_cancel-a_phish",
      }),
      message("route", "I found two addresses. Check the real one."),
      functionCall("resolve_fake", "resolve_destination", {
        linkId: "link_cancel-a_phish",
      }),
      message("blocked", "That address does not match Streamly. I stopped."),
    ]);
    const started = await mission.handle(
      { version: 2, type: "start", scenarioId: "cancel-streamly" },
      now,
    );
    const found = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: started.sessionToken,
        choiceId: "focused-access",
      },
      now + 1,
    );
    const blocked = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: found.sessionToken,
        choiceId: "risky-route",
      },
      now + 2,
    );

    expect(blocked).toMatchObject({
      status: "active",
      viewState: { stage: "route-choice" },
      pendingAction: null,
    });
    expect(blocked.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Blocked a look-alike address" }),
      ]),
    );
    expect(await store.getSession("ses_cancel_live", now + 3)).toMatchObject({
      world: { subscription: { status: "active" }, confirmation: null },
    });
  });

  it("records a rejection, executes nothing, and reports a safe stop", async () => {
    const { mission, store } = await service([
      functionCall("search", "search_streamly_messages", {
        query: "Streamly renewal",
      }),
      functionCall("read", "read_streamly_message", {
        messageId: "msg_cancel-a_receipt",
      }),
      functionCall("read_phish", "read_streamly_message", {
        messageId: "msg_cancel-a_phish",
      }),
      message("route", "I found two addresses. Check the real one."),
      functionCall("resolve", "resolve_destination", {
        linkId: "link_cancel-a_account",
      }),
      functionCall("preview", "preview_subscription_change", {
        subscriptionId: "sub_streamly_1",
      }),
      functionCall("cancel", "cancel_subscription", {
        accountId: "acct_streamly_1",
        subscriptionId: "sub_streamly_1",
      }),
      message("stopped", "I stopped. Nothing changed."),
    ]);
    const started = await mission.handle(
      { version: 2, type: "start", scenarioId: "cancel-streamly" },
      now,
    );
    const found = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: started.sessionToken,
        choiceId: "focused-access",
      },
      now + 1,
    );
    const pending = await mission.handle(
      {
        version: 2,
        type: "choose",
        sessionToken: found.sessionToken,
        choiceId: "trusted-route",
      },
      now + 2,
    );
    const rejected = await mission.handle(
      {
        version: 2,
        type: "approve",
        sessionToken: pending.sessionToken,
        pendingActionId: "act_cancel_live",
        decision: "reject",
      },
      now + 3,
    );

    expect(rejected).toMatchObject({
      status: "active",
      viewState: { stage: "stopped" },
    });
    expect(await store.getSession("ses_cancel_live", now + 4)).toMatchObject({
      world: { subscription: { status: "active" }, confirmation: null },
    });
    expect(await store.getAction("ses_cancel_live", "act_cancel_live")).toMatchObject({
      status: "rejected",
      result: { approved: false, executed: false },
    });
  });
});
