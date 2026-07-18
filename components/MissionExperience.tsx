"use client";

import { useMemo, useState } from "react";
import {
  advanceMission,
  createMissionState,
  type CoachResponse,
  type MissionDecision,
  type MissionStage,
  type MissionState,
} from "@/lib/mission";
import { postCoach, type CoachClient } from "@/lib/mission-client";

const progressSteps = [
  { id: "scope", number: "01", label: "Scope" },
  { id: "route", number: "02", label: "Inspect" },
  { id: "approval", number: "03", label: "Approve" },
  { id: "verify", number: "04", label: "Verify" },
] as const;

type DecisionOption = {
  id: MissionDecision;
  label: string;
  description: string;
  tone?: "safe" | "risky" | "stop";
};

type DecisionContent = {
  eyebrow: string;
  title: string;
  description: string;
  options: DecisionOption[];
};

const decisionContent: Record<Exclude<MissionStage, "complete">, DecisionContent> = {
  scope: {
    eyebrow: "Permission request",
    title: "How much should it see?",
    description:
      "The agent needs the renewal notice. Choose the smallest amount of access that can still complete the task.",
    options: [
      {
        id: "sender-only",
        label: "Only messages from Streamly",
        description: "Search one sender. Everything else stays hidden.",
        tone: "safe",
      },
      {
        id: "paste-receipt",
        label: "I'll paste the receipt",
        description: "Share one item and grant no inbox access.",
        tone: "safe",
      },
      {
        id: "entire-inbox",
        label: "My entire inbox",
        description: "Fast, but exposes unrelated personal messages.",
        tone: "risky",
      },
    ],
  },
  route: {
    eyebrow: "Route check",
    title: "Which route do you trust?",
    description:
      "The inbox contains two links that claim to cancel Streamly. Inspect where each one actually goes.",
    options: [
      {
        id: "official-site",
        label: "Open the official account page",
        description: "account.streamly.example — matches the billing sender.",
        tone: "safe",
      },
      {
        id: "forwarded-link",
        label: "Use the forwarded cancel-now link",
        description: "streamly-cancel.example.net — urgent, but the domain differs.",
        tone: "risky",
      },
    ],
  },
  approval: {
    eyebrow: "Human approval required",
    title: "This action changes the account.",
    description:
      "Review the exact subscription, price, and consequence. The agent is paused until you decide.",
    options: [
      {
        id: "approve-cancellation",
        label: "Approve cancellation",
        description: "End Streamly on July 18 and prevent the $18.99 renewal.",
        tone: "stop",
      },
      {
        id: "reject-cancellation",
        label: "Reject and stop the agent",
        description: "Leave the subscription unchanged.",
      },
    ],
  },
  verify: {
    eyebrow: "Outcome check",
    title: "What proves it worked?",
    description:
      "The agent says the cancellation succeeded. Choose the strongest evidence that changed outside its reply.",
    options: [
      {
        id: "confirmation-email",
        label: "Confirmation email with reference ST-4821",
        description: "Durable evidence from billing with the final service date.",
        tone: "safe",
      },
      {
        id: "account-status",
        label: "The account page now says cancelled",
        description: "Useful, but less durable than a confirmation reference.",
      },
      {
        id: "agent-claim",
        label: "The agent says it is done",
        description: "A conclusion from the same system that performed the action.",
        tone: "risky",
      },
    ],
  },
};

const inboxMessages = [
  { sender: "Payroll", subject: "Q3 compensation statement", private: true },
  { sender: "Northside Clinic", subject: "Your lab results", private: true },
  { sender: "Streamly Billing", subject: "Your free trial renews tomorrow", target: true },
  { sender: "Maya", subject: "Family trip photos", private: true },
] as const;

function InboxPanel({ state }: { state: MissionState }) {
  const access = state.workspace.inbox;
  const locked = access === "locked";

  return (
    <section className="sim-panel inbox-panel" aria-label="Synthetic inbox">
      <div className="panel-heading">
        <div className="app-icon mail-icon" aria-hidden="true">M</div>
        <div>
          <strong>Mail</strong>
          <span>4 messages</span>
        </div>
        <span className={`access-badge access-${access}`}>
          {access === "locked"
            ? "Locked"
            : access === "sender-only"
              ? "1 sender"
              : access === "receipt-only"
                ? "No access"
                : "Full access"}
        </span>
      </div>

      <div className="message-list">
        {inboxMessages.map((message) => {
          const shielded =
            locked ||
            access === "receipt-only" ||
            (access === "sender-only" && !message.target);
          return (
            <div
              className={`message-row ${message.target ? "target-message" : ""} ${shielded ? "shielded" : ""}`}
              key={message.sender}
            >
              <span className="message-avatar" aria-hidden="true">
                {shielded ? "•" : message.sender.slice(0, 1)}
              </span>
              <span className="message-copy">
                <strong>{shielded ? "Private message" : message.sender}</strong>
                <small>{shielded ? "Not available to the agent" : message.subject}</small>
              </span>
              {message.target && !shielded ? (
                <span className="found-tag">Found</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {locked ? (
        <div className="panel-lock">
          <span aria-hidden="true">⌁</span>
          <strong>No inbox permission</strong>
          <small>You decide what becomes visible.</small>
        </div>
      ) : null}
    </section>
  );
}

function BrowserPanel({ state }: { state: MissionState }) {
  const browser = state.workspace.browser;
  return (
    <section className="sim-panel browser-panel" aria-label="Synthetic browser">
      <div className="browser-chrome">
        <span className="browser-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="address-bar">
          {browser === "idle" ? "No page open" : "account.streamly.example"}
        </span>
        <span className="secure-mark" aria-label="Secure connection">✓</span>
      </div>

      {browser === "idle" ? (
        <div className="browser-empty">
          <span className="empty-orbit" aria-hidden="true" />
          <strong>Waiting for a trusted route</strong>
          <small>The agent cannot browse until you choose where it may go.</small>
        </div>
      ) : (
        <div className="account-card">
          <div className="streamly-brand">
            <span aria-hidden="true">S</span>
            <strong>Streamly</strong>
          </div>
          <div className="account-status-row">
            <div>
              <small>Premium trial</small>
              <strong>$18.99 / month</strong>
            </div>
            <span className={browser === "cancelled" ? "status-cancelled" : "status-active"}>
              {browser === "cancelled" ? "Cancelled" : "Active"}
            </span>
          </div>
          <dl>
            <div><dt>Renews</dt><dd>July 18, 2026</dd></div>
            <div><dt>Account</dt><dd>m•••@example.com</dd></div>
            <div><dt>Access until</dt><dd>July 18, 2026</dd></div>
          </dl>
          <div className={`pending-action ${browser === "cancelled" ? "action-done" : ""}`}>
            <span aria-hidden="true">{browser === "cancelled" ? "✓" : "!"}</span>
            <div>
              <strong>{browser === "cancelled" ? "Cancellation submitted" : "Cancellation ready"}</strong>
              <small>{browser === "cancelled" ? "Now verify the outcome." : "Waiting for your approval."}</small>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Workspace({ state }: { state: MissionState }) {
  return (
    <section className="sandbox" aria-labelledby="sandbox-title">
      <div className="sandbox-bar">
        <div>
          <span className="sandbox-signal" aria-hidden="true" />
          <strong id="sandbox-title">Practice workspace</strong>
        </div>
        <span className="simulation-badge">Synthetic data · no real accounts</span>
      </div>
      <div className="sandbox-grid">
        <InboxPanel state={state} />
        <BrowserPanel state={state} />
      </div>
    </section>
  );
}

function AgentPanel({ coach, busy }: { coach: CoachResponse | null; busy: boolean }) {
  return (
    <section className="agent-panel" aria-live="polite">
      <div className="agent-avatar" aria-hidden="true">A</div>
      <div className="agent-copy">
        <div className="agent-label">
          <strong>Agent</strong>
          <span className="agent-state">{busy ? "Working…" : "Paused for you"}</span>
        </div>
        <p>
          {busy
            ? "Reading only the decision you just made…"
            : coach?.agentMessage ??
              "I can cancel the trial, but I need the renewal notice first. You control what I can see."}
        </p>
        {coach ? (
          <div className="action-preview">
            <span className="tool-chip">{coach.proposedAction.tool.replaceAll("_", " ")}</span>
            <span>{coach.proposedAction.label}</span>
          </div>
        ) : null}
      </div>
      {coach ? (
        <span className={`model-badge ${coach.provenance.live ? "model-live" : ""}`}>
          {coach.provenance.live ? "GPT-5.6 live" : "Scenario fixture"}
        </span>
      ) : null}
    </section>
  );
}

function Progress({ stage }: { stage: MissionStage }) {
  const activeIndex =
    stage === "complete"
      ? progressSteps.length
      : progressSteps.findIndex((step) => step.id === stage);
  return (
    <ol className="mission-progress" aria-label="Mission progress">
      {progressSteps.map((step, index) => (
        <li
          className={index < activeIndex ? "complete" : index === activeIndex ? "active" : ""}
          key={step.id}
        >
          <span>{index < activeIndex ? "✓" : step.number}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

function DecisionCard({
  state,
  busy,
  onChoose,
}: {
  state: MissionState;
  busy: boolean;
  onChoose: (decision: MissionDecision) => void;
}) {
  if (state.stage === "complete") return null;
  const content = decisionContent[state.stage];
  return (
    <section className="decision-card" aria-labelledby="decision-title">
      <p className="decision-eyebrow">{content.eyebrow}</p>
      <h2 id="decision-title">{content.title}</h2>
      <p className="decision-description">{content.description}</p>
      <div className="decision-options">
        {content.options.map((option) => (
          <button
            aria-label={option.label}
            className={`decision-option ${option.tone ? `option-${option.tone}` : ""}`}
            disabled={busy}
            key={option.id}
            onClick={() => onChoose(option.id)}
            type="button"
          >
            <span className="option-marker" aria-hidden="true" />
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            <span className="option-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Completion({ state, onRestart }: { state: MissionState; onRestart: () => void }) {
  const total = useMemo(
    () => Object.values(state.score).reduce<number>((sum, value) => sum + value, 0),
    [state.score],
  );
  const perfect = total === progressSteps.length;
  return (
    <section className="completion-card">
      <div className="completion-mark" aria-hidden="true">✓</div>
      <p className="decision-eyebrow">Mission complete</p>
      <h2>{perfect ? "You stayed in charge." : "Mission complete. One risk remains."}</h2>
      <p className="completion-lede">
        {perfect
          ? "The trial is cancelled, unrelated messages stayed private, and confirmation ST-4821 proves the outcome."
          : "The trial is cancelled and confirmation ST-4821 proves the outcome—but the agent saw 3 unrelated messages it never needed."}
      </p>
      <div className="score-line"><strong>{total} of 4 supervision moves</strong><span>completed</span></div>
      <div className="learned-grid">
        <div><span>01</span><strong>Scope</strong><small>Share only what the task needs.</small></div>
        <div><span>02</span><strong>Inspect</strong><small>Check where the agent is going.</small></div>
        <div><span>03</span><strong>Approve</strong><small>Pause before consequences.</small></div>
        <div><span>04</span><strong>Verify</strong><small>Trust evidence, not confidence.</small></div>
      </div>
      <button className="primary-action restart-action" onClick={onRestart} type="button">
        Run the mission again
      </button>
    </section>
  );
}

export function MissionExperience({ client = postCoach }: { client?: CoachClient }) {
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<MissionState>(() => createMissionState());
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(decision: MissionDecision) {
    if (state.stage === "complete") return;
    setBusy(true);
    setError(null);
    try {
      const response = await client({ stage: state.stage, decision });
      setCoach(response);
      setState((current) => advanceMission(current, decision));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The simulation could not continue.");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStarted(false);
    setState(createMissionState());
    setCoach(null);
    setError(null);
  }

  if (!started) {
    return (
      <main className="landing-shell">
        <header className="product-bar">
          <a className="product-mark" href="#top" aria-label="On Your Behalf home">
            <span className="mark-symbol" aria-hidden="true">OYB</span>
            <span>On Your Behalf</span>
          </a>
          <span className="build-week-label">OpenAI Build Week · Education</span>
        </header>

        <section className="landing-hero" id="top">
          <div className="landing-copy">
            <p className="hero-eyebrow">Driver&apos;s ed for AI agents</p>
            <h1>Before an AI acts on your behalf, learn how to stay in charge.</h1>
            <p className="hero-body">
              Practice permissions, approvals, and verification in a safe agent simulation—not your actual accounts.
            </p>
            <button className="primary-action" onClick={() => setStarted(true)} type="button">
              Begin simulation <span aria-hidden="true">→</span>
            </button>
            <p className="hero-footnote">One mission · Four decisions · About two minutes</p>
          </div>

          <div className="mission-brief" aria-label="Simulation mission">
            <div className="brief-topline"><span>Mission 01</span><span>Everyday life</span></div>
            <div className="brief-icon" aria-hidden="true">S</div>
            <p>Your streaming trial renews tomorrow.</p>
            <h2>Cancel it safely before the $18.99 charge.</h2>
            <div className="brief-stakes">
              <span><i aria-hidden="true">✓</i> Synthetic inbox</span>
              <span><i aria-hidden="true">✓</i> Real decisions</span>
              <span><i aria-hidden="true">✓</i> Consequences contained</span>
            </div>
            <div className="brief-route" aria-label="Mission skills">
              {progressSteps.map((step) => <span key={step.id}>{step.label}</span>)}
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <span>Built with GPT-5.6 + Codex</span>
          <span>Simulation data only</span>
        </footer>
      </main>
    );
  }

  return (
    <main className="mission-shell">
      <header className="mission-header">
        <button className="product-mark reset-mark" onClick={restart} type="button">
          <span className="mark-symbol" aria-hidden="true">OYB</span>
          <span>On Your Behalf</span>
        </button>
        <div className="mission-title">
          <span>Mission 01</span>
          <strong>Cancel the Streamly trial</strong>
        </div>
        <span className="sandbox-mode">Safe simulation</span>
      </header>

      <Progress stage={state.stage} />

      <div className="mission-layout">
        <div className="mission-world">
          <Workspace state={state} />
          <AgentPanel coach={coach} busy={busy} />
        </div>

        <aside className="decision-rail">
          {state.feedback ? (
            <div
              className={`feedback-card feedback-${state.feedback.kind}`}
              role={state.feedback.kind === "warning" ? "alert" : undefined}
            >
              <span className="feedback-icon" aria-hidden="true">
                {state.feedback.kind === "warning" ? "!" : state.feedback.kind === "success" ? "✓" : "i"}
              </span>
              <div><strong>{state.feedback.title}</strong><p>{state.feedback.body}</p></div>
            </div>
          ) : null}
          {error ? <p className="error-card" role="alert">{error}</p> : null}
          {state.stage === "complete" ? (
            <Completion state={state} onRestart={restart} />
          ) : (
            <DecisionCard state={state} busy={busy} onChoose={(decision) => void choose(decision)} />
          )}
          {coach?.teachingNote && state.stage !== "complete" ? (
            <p className="teaching-note"><span>What this teaches</span>{coach.teachingNote}</p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
