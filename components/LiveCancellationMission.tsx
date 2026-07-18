"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MissionRuntimeRequest,
  MissionRuntimeResponse,
} from "@/lib/mission-runtime";
import {
  postMissionRuntime,
  type MissionRuntimeClient,
} from "@/lib/mission-runtime-client";

const progressSteps = [
  { id: "access", short: "Share", label: "Choose what AI can see" },
  { id: "route-choice", short: "Check", label: "Check the real address" },
  { id: "approval", short: "Decide", label: "Look before it acts" },
  { id: "proof", short: "Prove", label: "Make sure it worked" },
] as const;

type RuntimeEvent = MissionRuntimeResponse["events"][number];

interface LinkChoice {
  linkId: string;
  label: string;
  host: string;
  trusted: boolean;
}

function Brand() {
  return (
    <span className="brand brand-compact">
      <span className="brand-mark" aria-hidden="true"><i /><i /></span>
      <strong>On Your Behalf</strong>
    </span>
  );
}

function currentProgress(stage: string, awaitingApproval: boolean): number {
  if (stage === "complete") return progressSteps.length;
  if (stage === "proof") return 3;
  if (awaitingApproval) return 2;
  if (stage === "route-choice") return 1;
  return 0;
}

function LiveProgress({ runtime }: { runtime: MissionRuntimeResponse | null }) {
  const current = currentProgress(
    runtime?.viewState.stage ?? "access",
    runtime?.status === "awaiting_approval",
  );
  return (
    <ol className="simple-progress" aria-label="Mission progress">
      {progressSteps.map((step, index) => (
        <li className={index < current ? "done" : index === current ? "current" : ""} key={step.id}>
          <span>{index < current ? "✓" : index + 1}</span>
          <div><strong>{step.short}</strong><small>{step.label}</small></div>
        </li>
      ))}
    </ol>
  );
}

function ToolEvidence({ event }: { event: RuntimeEvent }) {
  if (!event.technical) return null;
  return (
    <details className="technical-drawer">
      <summary>How it worked</summary>
      <div className="technical-grid">
        <span>Function</span><code>{event.technical.toolName}</code>
        <span>Sent</span><pre>{JSON.stringify(event.technical.arguments, null, 2)}</pre>
        <span>Returned</span><pre>{JSON.stringify(event.technical.result, null, 2)}</pre>
      </div>
    </details>
  );
}

function EventTimeline({ events }: { events: RuntimeEvent[] }) {
  return (
    <div className="live-timeline" aria-live="polite">
      {events.map((event) => {
        if (event.kind === "coach") {
          return (
            <div className="assistant-row live-event" key={event.id}>
              <span className="assistant-mark" aria-hidden="true"><i /><i /></span>
              <div className="assistant-content">
                <div className="message message-assistant"><p>{event.label}</p></div>
              </div>
            </div>
          );
        }
        if (event.kind === "permission") {
          return (
            <div className="live-choice-event" key={event.id}>
              <span>Your choice</span>
              <strong>{event.label}</strong>
            </div>
          );
        }
        return (
          <article className={`live-action-event event-${event.kind}`} key={event.id}>
            <header>
              <span>{event.kind === "outcome" ? "What proves it" : event.kind === "approval" ? "Your decision" : "AI is doing"}</span>
              <i aria-hidden="true">{event.kind === "error" ? "!" : "✓"}</i>
            </header>
            <strong>{event.label}</strong>
            <ToolEvidence event={event} />
          </article>
        );
      })}
    </div>
  );
}

function linksFrom(events: RuntimeEvent[]): LinkChoice[] {
  const choices = events.flatMap((event) => {
    if (event.technical?.toolName !== "read_streamly_message") return [];
    const links = event.technical.result.links;
    if (!Array.isArray(links)) return [];
    return links.flatMap((link) => {
      if (
        !link ||
        typeof link !== "object" ||
        !("linkId" in link) ||
        !("label" in link) ||
        !("host" in link) ||
        typeof link.linkId !== "string" ||
        typeof link.label !== "string" ||
        typeof link.host !== "string"
      ) {
        return [];
      }
      return [{
        linkId: link.linkId,
        label: link.label,
        host: link.host,
        trusted: link.host === "account.streamly.example",
      }];
    });
  });
  return Array.from(new Map(choices.map((choice) => [choice.linkId, choice])).values());
}

function AccessLedger({ runtime }: { runtime: MissionRuntimeResponse }) {
  const search = runtime.events.find(
    (event) => event.technical?.toolName === "search_streamly_messages",
  )?.technical?.result;
  const returnedBodies = runtime.events.filter(
    (event) => event.technical?.toolName === "read_streamly_message",
  );
  if (!search && returnedBodies.length === 0) return null;
  const scanned = Array.isArray(search?.metadataScanned)
    ? search.metadataScanned.length
    : 0;
  return (
    <section className="access-ledger" aria-label="What AI could see">
      <span className="decision-kicker">What AI could see</span>
      <div>
        <p><strong>Allowed to search</strong><span>{runtime.viewState.visiblePermissions[0] ?? "Nothing"}</span></p>
        <p><strong>Metadata checked by the app</strong><span>{scanned} message{scanned === 1 ? "" : "s"}</span></p>
        <p><strong>Bodies returned to GPT</strong><span>{returnedBodies.length} Streamly message{returnedBodies.length === 1 ? "" : "s"}</span></p>
      </div>
    </section>
  );
}

function AccessDecision({ busy, onChoose }: { busy: boolean; onChoose: (choice: string) => void }) {
  const choices = [
    ["focused-access", "Only Streamly messages", "Enough to finish. Other messages stay closed.", "recommended"],
    ["paste-item", "I’ll paste one message", "Share one message without connecting an inbox.", ""],
    ["all-access", "Everything in my inbox", "The app may check unrelated message details too.", "careful"],
  ] as const;
  return (
    <section className="chat-decision">
      <span className="decision-kicker">Start small</span>
      <h2>What should AI be allowed to see?</h2>
      <p>AI needs the Streamly renewal. Pick the smallest choice that can work.</p>
      <div className="chat-options">
        {choices.map(([id, label, description, tone]) => (
          <button className={tone ? `option-${tone}` : ""} disabled={busy} key={id} onClick={() => onChoose(id)} type="button">
            <span className="choice-radio" aria-hidden="true" />
            <span><strong>{label}</strong><small>{description}</small></span>
            <span className="choice-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RouteDecision({ links, busy, onChoose }: { links: LinkChoice[]; busy: boolean; onChoose: (choice: string) => void }) {
  return (
    <section className="chat-decision route-decision">
      <span className="decision-kicker">Check the real address</span>
      <h2>Where should AI go?</h2>
      <p>A familiar name can hide a fake address. The address is the part that matters.</p>
      <div className="chat-options route-options">
        {links.map((link) => (
          <button className={link.trusted ? "option-recommended" : "option-careful"} disabled={busy} key={link.linkId} onClick={() => onChoose(link.trusted ? "trusted-route" : "risky-route")} type="button">
            <span className="route-lock" aria-hidden="true">{link.trusted ? "✓" : "!"}</span>
            <span><strong>{link.host}</strong><small>{link.trusted ? "Matches Streamly’s saved account address." : "Uses Streamly’s name, but the address is different."}</small></span>
            <span className="choice-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function money(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const amount = "amount" in value ? value.amount : null;
  return typeof amount === "number" ? `$${amount.toFixed(2)}` : "—";
}

function ApprovalDecision({ runtime, busy, onDecision }: { runtime: MissionRuntimeResponse; busy: boolean; onDecision: (decision: "approve" | "reject") => void }) {
  const action = runtime.pendingAction;
  if (!action) return null;
  return (
    <section className="approval-card" aria-labelledby="approval-title">
      <span className="decision-kicker">Before it happens</span>
      <div className="approval-heading">
        <div><h2 id="approval-title">{action.label}</h2><p>{action.consequence}</p></div>
        <span>Waiting for you</span>
      </div>
      <dl>
        <div><dt>Plan</dt><dd>{String(action.details.plan ?? "Streamly plan")}</dd></div>
        <div><dt>Charge stopped</dt><dd>{money(action.details.chargeAvoided)}</dd></div>
        <div><dt>Access ends</dt><dd>{typeof action.details.accessEndsAt === "string" ? new Date(action.details.accessEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}</dd></div>
        <div><dt>Account</dt><dd><code>{String(action.details.accountId ?? "—")}</code></dd></div>
      </dl>
      <p className="approval-promise">AI cannot change this card after you approve it.</p>
      <div className="approval-actions">
        <button className="button-primary" disabled={busy} onClick={() => onDecision("approve")} type="button">Yes, cancel it</button>
        <button className="button-secondary" disabled={busy} onClick={() => onDecision("reject")} type="button">No, stop here</button>
      </div>
    </section>
  );
}

function ProofDecision({ busy, onChoose }: { busy: boolean; onChoose: (choice: string) => void }) {
  const choices = [
    ["strong-proof", "The confirmation message", "It has a saved reference that matches the account.", "recommended"],
    ["screen-proof", "The current page says Cancelled", "Helpful, but the saved confirmation is stronger.", ""],
    ["agent-claim", "AI says, “Done!”", "That is AI’s claim, not outside proof.", "careful"],
  ] as const;
  return (
    <section className="chat-decision">
      <span className="decision-kicker">What proves it</span>
      <h2>How do you know it worked?</h2>
      <p>Choose proof you can check outside AI’s own answer.</p>
      <div className="chat-options">
        {choices.map(([id, label, description, tone]) => (
          <button className={tone ? `option-${tone}` : ""} disabled={busy} key={id} onClick={() => onChoose(id)} type="button">
            <span className="choice-radio" aria-hidden="true" />
            <span><strong>{label}</strong><small>{description}</small></span>
            <span className="choice-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LiveCompletion({ onExit, onRestart }: { onExit: () => void; onRestart: () => void }) {
  return (
    <section className="chat-completion live-completion">
      <span className="completion-orbit" aria-hidden="true"><i>✓</i></span>
      <span className="decision-kicker">Mission complete</span>
      <h2>You stayed in charge.</h2>
      <p>You shared only what was needed, checked the real address, approved the exact change, and found proof outside AI.</p>
      <div className="habit-recap">
        <span>Share less</span><span>Check the place</span><span>Look before it acts</span><span>Find real proof</span>
      </div>
      <div className="completion-actions">
        <button className="button-primary" onClick={onExit} type="button">Try another mission</button>
        <button className="button-secondary" onClick={onRestart} type="button">Run this one again</button>
      </div>
    </section>
  );
}

export function LiveCancellationMission({ onExit, client = postMissionRuntime }: { onExit: () => void; client?: MissionRuntimeClient }) {
  const [runtime, setRuntime] = useState<MissionRuntimeResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const latest = useRef<HTMLDivElement>(null);
  const links = useMemo(() => linksFrom(runtime?.events ?? []), [runtime?.events]);

  const send = useCallback(async (request: MissionRuntimeRequest) => {
    setBusy(true);
    setError(null);
    try {
      setRuntime(await client(request));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That step did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }, [client]);

  const start = useCallback(() => {
    void send({ version: 2, type: "start", scenarioId: "cancel-streamly" });
  }, [send]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  const stage = runtime?.viewState.stage;
  const stateVersion = runtime?.stateVersion;

  useEffect(() => {
    if (stateVersion === undefined || stage === "access") return;
    latest.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [stage, stateVersion]);

  function choose(choiceId: string) {
    if (!runtime) return;
    void send({ version: 2, type: "choose", sessionToken: runtime.sessionToken, choiceId });
  }

  function decide(decision: "approve" | "reject") {
    if (!runtime?.pendingAction) return;
    void send({
      version: 2,
      type: "approve",
      sessionToken: runtime.sessionToken,
      pendingActionId: runtime.pendingAction.id,
      decision,
    });
  }

  function restart() {
    setRuntime(null);
    setError(null);
    start();
  }

  return (
    <main className="mission-app live-mission-app">
      <aside className="mission-sidebar">
        <button className="back-link" onClick={onExit} type="button"><span aria-hidden="true">←</span> All missions</button>
        <Brand />
        <div className="sidebar-mission">
          <span className="scenario-glyph category-everyday" aria-hidden="true">S</span>
          <span>Everyday life · 4 min</span>
          <h1>Cancel a subscription</h1>
          <p>Stop a free trial without handing AI your whole inbox.</p>
        </div>
        <LiveProgress runtime={runtime} />
        <div className="safe-note live-safe-note"><span aria-hidden="true">✦</span><div><strong>Safe live mission</strong><small>Real GPT-5.6. Made-up inbox and account.</small></div></div>
      </aside>

      <section className="chat-workspace">
        <header className="chat-header">
          <div><Brand /><span className="model-pill"><i />Live GPT-5.6{runtime?.provenance.responseIds.length ? " · verified" : ""}</span></div>
          <button disabled={busy} onClick={restart} type="button">Start over</button>
        </header>
        <div className="chat-thread live-chat-thread">
          <div className="thread-date"><span />Live mission · synthetic world<span /></div>
          <div className="message message-user prompt-message"><p>Cancel my Streamly trial before I get charged.</p></div>
          {runtime ? <EventTimeline events={runtime.events} /> : null}
          {runtime && stage !== "access" ? <AccessLedger runtime={runtime} /> : null}
          {error ? (
            <div className="live-error" role="alert"><strong>That step got stuck.</strong><p>{error}</p><button onClick={() => runtime?.status === "retryable_error" ? void send({ version: 2, type: "retry", sessionToken: runtime.sessionToken }) : start()} type="button">Try again</button></div>
          ) : null}
          <div className="latest-turn" ref={latest}>
            {!runtime && busy ? <div className="live-loading"><i /><span>Opening the safe practice world…</span></div> : null}
            {runtime && stage === "access" ? <AccessDecision busy={busy} onChoose={choose} /> : null}
            {runtime && stage === "route-choice" && runtime.status !== "awaiting_approval" ? <RouteDecision links={links} busy={busy} onChoose={choose} /> : null}
            {runtime?.status === "awaiting_approval" ? <ApprovalDecision runtime={runtime} busy={busy} onDecision={decide} /> : null}
            {runtime && stage === "proof" ? <ProofDecision busy={busy} onChoose={choose} /> : null}
            {runtime && stage === "stopped" ? <section className="chat-completion"><span className="decision-kicker">Stopped safely</span><h2>Nothing changed.</h2><p>The Streamly trial is still active because you said no.</p><div className="completion-actions"><button className="button-primary" onClick={restart} type="button">Try again</button><button className="button-secondary" onClick={onExit} type="button">All missions</button></div></section> : null}
            {runtime?.status === "complete" ? <LiveCompletion onExit={onExit} onRestart={restart} /> : null}
          </div>
        </div>
        {runtime?.status === "complete" ? null : <footer className="chat-composer live-composer"><span>{busy ? "AI is working…" : "You choose what happens next"}</span><span className="composer-live-dot" aria-hidden="true" /><strong>{runtime?.provenance.responseIds.length ?? 0} live replies</strong></footer>}
      </section>
    </main>
  );
}
