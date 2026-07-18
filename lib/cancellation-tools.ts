import { z } from "zod";
import type { MissionSession } from "../db/mission-session-store";
import type {
  CancellationWorldSeed,
  SyntheticInboxMessage,
} from "./golden-missions";
import {
  MissionToolRunner,
  type MissionToolContext,
  type MissionToolDefinition,
} from "./mission-tool-runner";

const TRUSTED_STREAMLY_HOST = "account.streamly.example";
const WORK_STAGE = "work";

type RunnerFactories = ConstructorParameters<typeof MissionToolRunner>[1];

function worldFrom(session: MissionSession): CancellationWorldSeed {
  const world = session.world as unknown as Partial<CancellationWorldSeed>;
  if (
    !world.account ||
    !world.subscription ||
    !Array.isArray(world.inbox) ||
    !("confirmation" in world)
  ) {
    throw new Error("Cancellation world is invalid");
  }
  return world as CancellationWorldSeed;
}

function eventResults(
  context: MissionToolContext,
  toolName: string,
): Record<string, unknown>[] {
  return context.session.events.flatMap((event) => {
    if (
      !event ||
      typeof event !== "object" ||
      !("toolName" in event) ||
      event.toolName !== toolName ||
      !("result" in event) ||
      !event.result ||
      typeof event.result !== "object" ||
      Array.isArray(event.result)
    ) {
      return [];
    }
    return [event.result as Record<string, unknown>];
  });
}

function searchReturnedMessage(
  messageId: string,
  context: MissionToolContext,
): boolean {
  return eventResults(context, "search_streamly_messages").some((result) =>
    Array.isArray(result.matches)
      ? result.matches.some(
          (match) =>
            match !== null &&
            typeof match === "object" &&
            "messageId" in match &&
            match.messageId === messageId,
        )
      : false,
  );
}

function readReturnedLink(linkId: string, context: MissionToolContext): boolean {
  return eventResults(context, "read_streamly_message").some((result) =>
    Array.isArray(result.links)
      ? result.links.some(
          (link) =>
            link !== null &&
            typeof link === "object" &&
            "linkId" in link &&
            link.linkId === linkId,
        )
      : false,
  );
}

function trustedRouteSeen(context: MissionToolContext): boolean {
  return eventResults(context, "resolve_destination").some(
    (result) =>
      result.trusted === true && result.host === TRUSTED_STREAMLY_HOST,
  );
}

function previewMatches(
  accountId: string,
  subscriptionId: string,
  context: MissionToolContext,
): boolean {
  return eventResults(context, "preview_subscription_change").some(
    (result) =>
      result.accountId === accountId &&
      result.subscriptionId === subscriptionId,
  );
}

function metadata(message: SyntheticInboxMessage) {
  return {
    messageId: message.id,
    from: message.from,
    subject: message.subject,
    receivedAt: message.receivedAt,
    preview: message.preview,
  };
}

function definitions(): MissionToolDefinition[] {
  return [
    {
      name: "search_streamly_messages",
      description:
        "Search authorized inbox metadata for Streamly messages. This never returns message bodies.",
      kind: "read",
      allowedStages: [WORK_STAGE],
      inputSchema: z
        .object({ query: z.string().min(3).max(48) })
        .strict(),
      authorize: (_input, context) =>
        context.session.permissions.includes("mail:streamly") ||
        context.session.permissions.includes("mail:metadata:all"),
      execute: (input, context) => {
        const world = worldFrom(context.session);
        const broad = context.session.permissions.includes("mail:metadata:all");
        const scannable = broad
          ? world.inbox
          : world.inbox.filter((message) =>
              message.tags.includes("subscription"),
            );
        const query = (input.query as string).toLowerCase();
        const matches = scannable
          .filter((message) => message.tags.includes("subscription"))
          .filter((message) => {
          const searchable = [
            message.from,
            message.subject,
            message.preview,
            ...message.tags,
          ]
            .join(" ")
            .toLowerCase();
          return query
            .split(/\s+/)
            .filter(Boolean)
            .some((term) => searchable.includes(term));
          });
        return {
          authorizedSearch: broad
            ? "All inbox metadata"
            : "Streamly messages only",
          metadataScanned: scannable.map((message) => message.id),
          matches: matches.map(metadata),
          bodiesReturned: [],
        };
      },
      summarize: (output) => ({
        label: `Found ${Array.isArray(output.matches) ? output.matches.length : 0} Streamly messages`,
      }),
    },
    {
      name: "read_streamly_message",
      description:
        "Read one message body only when that message was returned by the authorized search or pasted by the learner.",
      kind: "read",
      allowedStages: [WORK_STAGE],
      inputSchema: z.object({ messageId: z.string().min(3).max(96) }).strict(),
      authorize: (input, context) => {
        const messageId = input.messageId as string;
        return (
          context.session.permissions.includes(`mail:message:${messageId}`) ||
          searchReturnedMessage(messageId, context)
        );
      },
      execute: (input, context) => {
        const messageId = input.messageId as string;
        const message = worldFrom(context.session).inbox.find(
          (candidate) => candidate.id === messageId,
        );
        if (!message) throw new Error("Authorized message is missing");
        return {
          messageId: message.id,
          from: message.from,
          subject: message.subject,
          receivedAt: message.receivedAt,
          body: message.body,
          links: message.links.map((link) => ({
            linkId: link.id,
            label: link.label,
            host: link.host,
          })),
        };
      },
      summarize: (output) => ({
        label: `Read ${String(output.subject ?? "one Streamly message")}`,
      }),
    },
    {
      name: "resolve_destination",
      description:
        "Resolve a known message link to a host and trust reason without opening or returning a clickable URL.",
      kind: "read",
      allowedStages: [WORK_STAGE, "route-choice"],
      inputSchema: z.object({ linkId: z.string().min(3).max(96) }).strict(),
      authorize: (input, context) =>
        readReturnedLink(input.linkId as string, context),
      execute: (input, context) => {
        const linkId = input.linkId as string;
        const link = worldFrom(context.session).inbox
          .flatMap((message) => message.links)
          .find((candidate) => candidate.id === linkId);
        if (!link) throw new Error("Authorized destination is missing");
        const host = link.host.toLowerCase().replace(/\.$/, "");
        const trusted = host === TRUSTED_STREAMLY_HOST;
        return {
          linkId,
          host,
          trusted,
          reason: trusted
            ? "This matches the configured Streamly account address."
            : "This address is not the configured Streamly account address.",
        };
      },
      summarize: (output) => ({
        label:
          output.trusted === true
            ? "Checked the real Streamly address"
            : "Blocked a look-alike address",
      }),
    },
    {
      name: "preview_subscription_change",
      description:
        "Show the exact Streamly plan, renewal, charge avoided, and access end date. This does not cancel anything.",
      kind: "read",
      allowedStages: [WORK_STAGE, "route-choice"],
      inputSchema: z
        .object({ subscriptionId: z.string().min(3).max(96) })
        .strict(),
      authorize: (input, context) => {
        const world = worldFrom(context.session);
        return (
          input.subscriptionId === world.subscription.id &&
          world.subscription.status === "active" &&
          trustedRouteSeen(context)
        );
      },
      execute: (_input, context) => {
        const { account, subscription } = worldFrom(context.session);
        return {
          accountId: account.id,
          subscriptionId: subscription.id,
          service: subscription.service,
          plan: subscription.plan,
          chargeAvoided: {
            amount: subscription.price,
            currency: subscription.currency,
          },
          renewsAt: subscription.renewsAt,
          accessEndsAt: subscription.serviceEndsAt,
        };
      },
      summarize: () => ({ label: "Checked exactly what cancellation changes" }),
    },
    {
      name: "cancel_subscription",
      description:
        "Request cancellation of the exact previewed Streamly subscription. The application pauses for learner approval before execution.",
      kind: "write",
      allowedStages: [WORK_STAGE, "route-choice"],
      inputSchema: z
        .object({
          accountId: z.string().min(3).max(96),
          subscriptionId: z.string().min(3).max(96),
        })
        .strict(),
      authorize: (input, context) => {
        const world = worldFrom(context.session);
        return (
          input.accountId === world.account.id &&
          input.subscriptionId === world.subscription.id &&
          world.subscription.status === "active" &&
          previewMatches(
            input.accountId as string,
            input.subscriptionId as string,
            context,
          )
        );
      },
      preview: (_input, context) => {
        const { account, subscription } = worldFrom(context.session);
        return {
          label: `Cancel Streamly ${subscription.plan}`,
          consequence: `The $${subscription.price.toFixed(2)} renewal will not happen. Access ends ${new Date(subscription.serviceEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.`,
          details: {
            accountId: account.id,
            subscriptionId: subscription.id,
            plan: subscription.plan,
            chargeAvoided: {
              amount: subscription.price,
              currency: subscription.currency,
            },
            accessEndsAt: subscription.serviceEndsAt,
          },
          idempotencyKey: `cancel:${subscription.id}`,
        };
      },
      execute: (_input, context) => {
        const world = structuredClone(worldFrom(context.session));
        const confirmationId = `ST-${context.session.seedId.toUpperCase()}`;
        world.subscription.status = "cancelled";
        world.confirmation = {
          confirmationId,
          subscriptionId: world.subscription.id,
          cancelledAt: new Date(context.now).toISOString(),
        };
        return {
          world: world as unknown as Record<string, unknown>,
          result: {
            subscriptionId: world.subscription.id,
            status: world.subscription.status,
            confirmationId,
          },
        };
      },
    },
    {
      name: "get_cancellation_confirmation",
      description:
        "Read the confirmation reference and current subscription state after cancellation. This is outside proof of the result.",
      kind: "read",
      allowedStages: [WORK_STAGE, "route-choice", "proof"],
      inputSchema: z
        .object({ subscriptionId: z.string().min(3).max(96) })
        .strict(),
      authorize: (input, context) => {
        const world = worldFrom(context.session);
        return (
          input.subscriptionId === world.subscription.id &&
          world.subscription.status === "cancelled" &&
          world.confirmation?.subscriptionId === world.subscription.id
        );
      },
      execute: (_input, context) => {
        const world = worldFrom(context.session);
        if (!world.confirmation) throw new Error("Confirmation is missing");
        return {
          subscriptionId: world.subscription.id,
          status: world.subscription.status,
          confirmationId: world.confirmation.confirmationId,
          cancelledAt: world.confirmation.cancelledAt,
          matchesAccountState:
            world.confirmation.subscriptionId === world.subscription.id &&
            world.subscription.status === "cancelled",
        };
      },
      summarize: () => ({ label: "Found the cancellation confirmation" }),
    },
  ];
}

export function createCancellationToolRunner(
  factories: RunnerFactories = {},
): MissionToolRunner {
  return new MissionToolRunner(definitions(), factories);
}
