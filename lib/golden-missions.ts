export interface GoldenMissionConfig {
  scenarioId: "cancel-streamly" | "suspicious-email" | "send-client-update";
  priority: "required" | "target" | "stretch";
  learnerGoal: string;
  proofOfLearning: string;
}

export interface SyntheticInboxMessage {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  preview: string;
  body: string;
  tags: string[];
  links: Array<{ id: string; label: string; host: string; path: string }>;
}

export interface CancellationWorldSeed {
  id: string;
  account: {
    id: string;
    firstName: string;
    email: string;
  };
  subscription: {
    id: string;
    service: "Streamly";
    plan: string;
    price: number;
    currency: "USD";
    renewsAt: string;
    serviceEndsAt: string;
    status: "active" | "cancelled";
  };
  inbox: SyntheticInboxMessage[];
  confirmation: null | {
    confirmationId: string;
    subscriptionId: string;
    cancelledAt: string;
  };
}

export const goldenMissionConfigs: GoldenMissionConfig[] = [
  {
    scenarioId: "cancel-streamly",
    priority: "required",
    learnerGoal: "Stop a subscription renewal without falling for a fake email.",
    proofOfLearning: "The learner controls access, checks evidence, and approves the cancellation before it happens.",
  },
  {
    scenarioId: "suspicious-email",
    priority: "target",
    learnerGoal: "Figure out whether a worrying email is real before acting on it.",
    proofOfLearning: "The learner sees how AI compares claims, sender details, links, and trusted account data.",
  },
  {
    scenarioId: "send-client-update",
    priority: "stretch",
    learnerGoal: "Turn project facts into a clear client update and send it safely.",
    proofOfLearning: "The learner separates drafting from sending and approves the final audience and message.",
  },
];

const seedFacts = [
  ["cancel-a", "Avery", "2026-08-03T14:00:00.000Z", "2026-08-03T23:59:59.000Z", "18.99", "billing-streamly.example.net"],
  ["cancel-b", "Jordan", "2026-08-11T09:30:00.000Z", "2026-08-11T23:59:59.000Z", "21.49", "streamly-renewal.example.net"],
  ["cancel-c", "Riley", "2026-08-19T17:15:00.000Z", "2026-08-19T23:59:59.000Z", "16.99", "streamly-account.example.net"],
  ["cancel-d", "Casey", "2026-08-27T12:45:00.000Z", "2026-08-27T23:59:59.000Z", "19.99", "secure-streamly.example.net"],
  ["cancel-e", "Morgan", "2026-09-04T08:00:00.000Z", "2026-09-04T23:59:59.000Z", "22.99", "streamly-support.example.net"],
] as const;

export const cancellationWorldSeeds: CancellationWorldSeed[] = seedFacts.map(
  ([id, firstName, renewsAt, serviceEndsAt, price, phishingHost], index) => ({
    id,
    account: {
      id: `acct_streamly_${index + 1}`,
      firstName,
      email: `${firstName.toLowerCase()}@learner.example`,
    },
    subscription: {
      id: `sub_streamly_${index + 1}`,
      service: "Streamly",
      plan: index % 2 === 0 ? "Premium" : "Premium Family",
      price: Number(price),
      currency: "USD",
      renewsAt,
      serviceEndsAt,
      status: "active",
    },
    inbox: [
      {
        id: `msg_${id}_receipt`,
        from: "receipts@streamly.example",
        subject: `Your Streamly plan renews ${new Date(renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
        receivedAt: new Date(Date.parse(renewsAt) - 7 * 86_400_000).toISOString(),
        preview: `Your ${index % 2 === 0 ? "Premium" : "Premium Family"} plan is scheduled to renew for $${price}.`,
        body: `Hi ${firstName}, your Streamly ${index % 2 === 0 ? "Premium" : "Premium Family"} trial renews for $${price} on ${new Date(renewsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}. You can manage the subscription from your Streamly account.`,
        tags: ["subscription", "renewal", "legitimate"],
        links: [
          { id: `link_${id}_account`, label: "Manage subscription", host: "account.streamly.example", path: `/subscriptions/sub_streamly_${index + 1}` },
        ],
      },
      {
        id: `msg_${id}_phish`,
        from: "urgent@streamly-billing.example.net",
        subject: "Urgent: your payment failed",
        receivedAt: new Date(Date.parse(renewsAt) - 6 * 86_400_000).toISOString(),
        preview: "Verify your card in the next 30 minutes to keep your account open.",
        body: "Urgent: your payment failed. Verify your card in the next 30 minutes or your account will close. Click the payment link below.",
        tags: ["subscription", "urgent", "suspicious"],
        links: [
          { id: `link_${id}_phish`, label: "Verify payment", host: phishingHost, path: `/verify/${id}` },
        ],
      },
      {
        id: `msg_${id}_unrelated`,
        from: "news@neighborhood.example",
        subject: index % 2 === 0 ? "Weekend events near you" : "Your weekly neighborhood digest",
        receivedAt: new Date(Date.parse(renewsAt) - 5 * 86_400_000).toISOString(),
        preview: "A quick look at what is happening nearby this week.",
        body: "Here are this week's neighborhood events, notices, and local updates.",
        tags: ["newsletter"],
        links: [
          { id: `link_${id}_unrelated`, label: "Read the digest", host: "news.neighborhood.example", path: `/digest/${index + 1}` },
        ],
      },
    ],
    confirmation: null,
  }),
);

export function getCancellationWorldSeed(id: string): CancellationWorldSeed {
  const seed = cancellationWorldSeeds.find((candidate) => candidate.id === id);
  if (!seed) throw new Error("Unknown cancellation world seed");
  return structuredClone(seed);
}
