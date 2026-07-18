"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  advanceMission,
  createMissionState,
  type CoachResponse,
  type MissionDecision,
  type MissionFeedback,
  type MissionStage,
  type MissionState,
} from "@/lib/mission";
import { postCoach, type CoachClient } from "@/lib/mission-client";
import { getMissionRuntimeStatus } from "@/lib/mission-runtime-client";
import { LiveCancellationMission } from "./LiveCancellationMission";
import {
  categoryLabels,
  getScenario,
  scenarioCatalog,
  type Scenario,
  type ScenarioCategory,
  type ScenarioId,
} from "@/lib/scenarios";

const missionSteps = [
  { id: "share", short: "Share", label: "Choose what AI can see" },
  { id: "check", short: "Check", label: "Check where it is going" },
  { id: "approve", short: "Decide", label: "Look before it acts" },
  { id: "prove", short: "Prove", label: "Make sure it worked" },
] as const;

type DecisionOption = {
  id: MissionDecision;
  label: string;
  description: string;
  tone?: "recommended" | "careful" | "stop";
};

type DecisionScreen = {
  eyebrow: string;
  title: string;
  description: string;
  options: DecisionOption[];
};

type ConversationTurn = {
  stage: Exclude<MissionStage, "complete">;
  decision: MissionDecision;
  response: CoachResponse;
  feedback: MissionFeedback | null;
};

function decisionScreen(scenario: Scenario, stage: Exclude<MissionStage, "complete">): DecisionScreen {
  if (stage === "share") {
    return {
      eyebrow: "AI needs something from you",
      title: "What should AI be allowed to see?",
      description: `To help, AI needs ${scenario.steps.share.need}. Pick the smallest choice that works.`,
      options: [
        {
          id: "focused-access",
          label: scenario.steps.share.focused,
          description: "Give AI just what this job needs.",
          tone: "recommended",
        },
        {
          id: "paste-item",
          label: scenario.steps.share.manual,
          description: "Share one thing without connecting an account.",
        },
        {
          id: "all-access",
          label: scenario.steps.share.broad,
          description: "This works, but AI will see unrelated things too.",
          tone: "careful",
        },
      ],
    };
  }

  if (stage === "check") {
    return {
      eyebrow: "AI found two possible places",
      title: "Is this really the right place?",
      description: "A name can look real. Check the actual address before AI opens it.",
      options: [
        {
          id: "trusted-route",
          label: scenario.steps.check.trusted,
          description: scenario.steps.check.clue,
          tone: "recommended",
        },
        {
          id: "risky-route",
          label: scenario.steps.check.risky,
          description: "The name looks familiar, but the address is different.",
          tone: "careful",
        },
      ],
    };
  }

  if (stage === "approve") {
    return {
      eyebrow: "AI is ready—but it has not acted",
      title: "Take one last look before AI does it",
      description: scenario.steps.approve.consequence,
      options: [
        {
          id: "approve-action",
          label: scenario.steps.approve.yes,
          description: "AI will make this exact change.",
          tone: "recommended",
        },
        {
          id: "stop-action",
          label: scenario.steps.approve.no,
          description: "AI will stop and nothing will change.",
          tone: "stop",
        },
      ],
    };
  }

  return {
    eyebrow: "AI says it finished",
    title: "How do you know it worked?",
    description: "Pick the answer that gives you real proof—not just a confident reply.",
    options: [
      {
        id: "strong-proof",
        label: scenario.steps.prove.strong,
        description: "A saved result you can check again later.",
        tone: "recommended",
      },
      {
        id: "screen-proof",
        label: scenario.steps.prove.okay,
        description: "A useful clue, but there may be stronger proof.",
      },
      {
        id: "agent-claim",
        label: "AI says, “Done!”",
        description: "That is a claim from the same AI that did the work.",
        tone: "careful",
      },
    ],
  };
}

function optionFor(scenario: Scenario, stage: Exclude<MissionStage, "complete">, decision: MissionDecision) {
  return decisionScreen(scenario, stage).options.find((option) => option.id === decision);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true"><i /><i /></span>
      <strong>On Your Behalf</strong>
    </span>
  );
}

function MissionCard({ scenario, onStart, live }: { scenario: Scenario; onStart: (id: ScenarioId) => void; live: boolean }) {
  return (
    <article className={`scenario-card category-${scenario.category} ${scenario.featured ? "scenario-featured" : ""}`}>
      <div className="scenario-card-top">
        <span className="scenario-glyph" aria-hidden="true">{scenario.glyph}</span>
        <span className={`scenario-mode ${live ? "mode-live" : ""}`}><i />{live ? "Live GPT-5.6" : "Practice"}</span>
      </div>
      <div className="scenario-card-copy">
        <span className="scenario-category">{categoryLabels[scenario.category]}</span>
        <h3>{scenario.title}</h3>
        <p>{scenario.summary}</p>
      </div>
      <button
        aria-label={`Start mission: ${scenario.title}`}
        className="scenario-start"
        onClick={() => onStart(scenario.id)}
        type="button"
      >
        <span>{scenario.featured ? "Start here" : "Start mission"}</span>
        <span aria-hidden="true">↗</span>
      </button>
    </article>
  );
}

function MissionLibrary({ onStart, liveCancellation }: { onStart: (id: ScenarioId) => void; liveCancellation: boolean }) {
  const [category, setCategory] = useState<ScenarioCategory | "all">("all");
  const visible = useMemo(
    () => category === "all" ? scenarioCatalog : scenarioCatalog.filter((item) => item.category === category),
    [category],
  );

  return (
    <main className="library-shell">
      <header className="library-nav">
        <Brand />
        <div className="library-nav-right">
          <span className="mission-count">20 learn-by-doing missions</span>
          <span className="practice-avatar" aria-hidden="true">MW</span>
        </div>
      </header>

      <section className="library-hero">
        <div className="hero-status"><span aria-hidden="true">✦</span> Built for people, not AI experts</div>
        <h1>Learn AI by doing it.</h1>
        <p>Pick a short, everyday mission. You make the calls. AI shows you what happens next.</p>
        <div className="hero-composer" aria-label="Learning promise">
          <span className="composer-spark" aria-hidden="true">✦</span>
          <span>What would you like AI to help with?</span>
          <span className="composer-key">Choose a mission below</span>
        </div>
      </section>

      <section className="library-section" aria-labelledby="mission-library-title">
        <div className="library-heading">
          <div>
            <span className="section-kicker">Practice library</span>
            <h2 id="mission-library-title">Start with something familiar</h2>
          </div>
          <div className="category-tabs" role="group" aria-label="Filter missions">
            {(Object.keys(categoryLabels) as Array<ScenarioCategory | "all">).map((id) => (
              <button
                aria-pressed={category === id}
                className={category === id ? "active" : ""}
                key={id}
                onClick={() => setCategory(id)}
                type="button"
              >
                {id === "all" ? "All" : categoryLabels[id].replace(" life", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="scenario-grid">
          {visible.map((item) => <MissionCard key={item.id} scenario={item} live={item.id === "cancel-streamly" && liveCancellation} onStart={onStart} />)}
        </div>
      </section>

      <footer className="library-footer">
        <Brand compact />
        <p>Safe practice. Made-up data. Real AI habits.</p>
        <span>OpenAI Build Week · Education</span>
      </footer>
    </main>
  );
}

function MissionProgress({ stage }: { stage: MissionStage }) {
  const current = stage === "complete" ? missionSteps.length : missionSteps.findIndex((step) => step.id === stage);
  return (
    <ol className="simple-progress" aria-label="Mission progress">
      {missionSteps.map((step, index) => (
        <li className={index < current ? "done" : index === current ? "current" : ""} key={step.id}>
          <span>{index < current ? "✓" : index + 1}</span>
          <div><strong>{step.short}</strong><small>{step.label}</small></div>
        </li>
      ))}
    </ol>
  );
}

function ToolCall({ scenario, turn }: { scenario: Scenario; turn: ConversationTurn }) {
  const stopped = turn.response.proposedAction.tool === "stop";
  return (
    <div className={`tool-call ${stopped ? "tool-stopped" : ""}`}>
      <div className="tool-call-head">
        <span className="tool-icon" aria-hidden="true">{stopped ? "×" : "⌁"}</span>
        <span>AI used a tool</span>
        <span className="tool-status"><i />{stopped ? "Stopped" : "Done"}</span>
      </div>
      <div className="tool-command">
        <code>{scenario.tools[turn.stage]}</code>
        <span>{turn.response.proposedAction.label}</span>
      </div>
      <p>{turn.response.proposedAction.why}</p>
    </div>
  );
}

function ConversationHistory({ scenario, turns }: { scenario: Scenario; turns: ConversationTurn[] }) {
  return turns.map((turn, index) => {
    const option = optionFor(scenario, turn.stage, turn.decision);
    return (
      <div className="conversation-turn" key={`${turn.stage}-${turn.decision}-${index}`}>
        <div className="message message-user"><p>{option?.label ?? turn.decision}</p></div>
        <div className="assistant-row">
          <span className="assistant-mark" aria-hidden="true"><i /><i /></span>
          <div className="assistant-content">
            <ToolCall scenario={scenario} turn={turn} />
            <div className="message message-assistant"><p>{turn.response.agentMessage}</p></div>
            {turn.feedback ? (
              <div className={`plain-feedback feedback-${turn.feedback.kind}`} role={turn.feedback.kind === "warning" ? "alert" : undefined}>
                <span aria-hidden="true">{turn.feedback.kind === "warning" ? "!" : turn.feedback.kind === "success" ? "✓" : "i"}</span>
                <div><strong>{turn.feedback.title}</strong><p>{turn.feedback.body}</p></div>
              </div>
            ) : null}
            <p className="tiny-lesson"><span>What you just learned</span>{turn.response.teachingNote}</p>
          </div>
        </div>
      </div>
    );
  });
}

function DecisionPanel({ scenario, stage, busy, onChoose }: {
  scenario: Scenario;
  stage: Exclude<MissionStage, "complete">;
  busy: boolean;
  onChoose: (decision: MissionDecision) => void;
}) {
  const screen = decisionScreen(scenario, stage);
  return (
    <section className="chat-decision" aria-labelledby="decision-title">
      <span className="decision-kicker">{screen.eyebrow}</span>
      <h2 id="decision-title">{screen.title}</h2>
      <p>{screen.description}</p>
      <div className="chat-options">
        {screen.options.map((option) => (
          <button
            aria-label={option.label}
            className={option.tone ? `option-${option.tone}` : ""}
            disabled={busy}
            key={option.id}
            onClick={() => onChoose(option.id)}
            type="button"
          >
            <span className="choice-radio" aria-hidden="true" />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
            <span className="choice-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      {busy ? <span className="thinking-line">AI is thinking…</span> : null}
    </section>
  );
}

function Completion({ scenario, state, onAgain, onLibrary }: {
  scenario: Scenario;
  state: MissionState;
  onAgain: () => void;
  onLibrary: () => void;
}) {
  const total = Object.values(state.score).reduce((sum, value) => sum + value, 0);
  return (
    <section className="chat-completion">
      <span className="completion-orbit" aria-hidden="true"><i>✓</i></span>
      <span className="decision-kicker">Mission complete</span>
      <h2>You made {total} smart moves.</h2>
      <p>{scenario.steps.prove.result} That is how you stay in charge of AI.</p>
      <div className="plain-recap">
        {missionSteps.map((step) => (
          <div className={state.score[step.id] ? "recap-done" : "recap-missed"} key={step.id}>
            <span>{state.score[step.id] ? "✓" : "!"}</span>
            <div><strong>{step.label}</strong><small>{state.score[step.id] ? "Smart move" : "Try this one again"}</small></div>
          </div>
        ))}
      </div>
      <div className="completion-actions">
        <button className="button-primary" onClick={onLibrary} type="button">Try another mission</button>
        <button className="button-secondary" onClick={onAgain} type="button">Run this one again</button>
      </div>
    </section>
  );
}

function MissionChat({ scenario, client, onExit }: { scenario: Scenario; client: CoachClient; onExit: () => void }) {
  const [state, setState] = useState<MissionState>(() => createMissionState(scenario.id));
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length === 0) return;
    latestRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [turns.length]);

  async function choose(decision: MissionDecision) {
    if (state.stage === "complete") return;
    const stage = state.stage;
    setBusy(true);
    setError(null);
    try {
      const response = await client({ scenarioId: scenario.id, stage, decision });
      const next = advanceMission(state, decision);
      setTurns((current) => [...current, { stage, decision, response, feedback: next.feedback }]);
      setState(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setState(createMissionState(scenario.id));
    setTurns([]);
    setError(null);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  return (
    <main className="mission-app">
      <aside className="mission-sidebar">
        <button className="back-link" onClick={onExit} type="button"><span aria-hidden="true">←</span> All missions</button>
        <Brand compact />
        <div className="sidebar-mission">
          <span className={`scenario-glyph category-${scenario.category}`} aria-hidden="true">{scenario.glyph}</span>
          <span>{categoryLabels[scenario.category]} · {scenario.minutes} min</span>
          <h1>{scenario.title}</h1>
          <p>{scenario.summary}</p>
        </div>
        <MissionProgress stage={state.stage} />
        <div className="safe-note"><span aria-hidden="true">⌁</span><div><strong>Practice mode</strong><small>Nothing here is real or connected.</small></div></div>
      </aside>

      <section className="chat-workspace">
        <header className="chat-header">
          <div><Brand compact /><span className="model-pill">AI practice <i /></span></div>
          <button onClick={restart} type="button">Start over</button>
        </header>

        <div className="chat-thread">
          <div className="thread-date"><span />Practice mission<span /></div>
          <div className="message message-user prompt-message"><p>{scenario.prompt}</p></div>
          <div className="assistant-row opening-row">
            <span className="assistant-mark" aria-hidden="true"><i /><i /></span>
            <div className="assistant-content">
              <div className="message message-assistant"><p>{scenario.opening}</p></div>
            </div>
          </div>

          <ConversationHistory scenario={scenario} turns={turns} />
          {error ? <p className="chat-error" role="alert">{error}</p> : null}
          <div className="latest-turn" ref={latestRef}>
            {state.stage === "complete" ? (
              <Completion scenario={scenario} state={state} onAgain={restart} onLibrary={onExit} />
            ) : (
              <DecisionPanel scenario={scenario} stage={state.stage} busy={busy} onChoose={(decision) => void choose(decision)} />
            )}
          </div>
        </div>

        {state.stage === "complete" ? null : (
          <footer className="chat-composer">
            <span>Choose an answer above to keep going</span>
            <button aria-label="Voice input unavailable in practice mode" disabled type="button">⌁</button>
            <button aria-label="Send unavailable in practice mode" disabled type="button">↑</button>
          </footer>
        )}
      </section>
    </main>
  );
}

export function MissionExperience({ client = postCoach }: { client?: CoachClient }) {
  const [activeId, setActiveId] = useState<ScenarioId | null>(null);
  const [liveCancellation, setLiveCancellation] = useState(false);

  useEffect(() => {
    let active = true;
    void getMissionRuntimeStatus()
      .then((status) => {
        if (active) setLiveCancellation(status.cancelStreamly === "live");
      })
      .catch(() => {
        if (active) setLiveCancellation(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const resetScroll = () => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      scrollingElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = previousBehavior;
    };

    resetScroll();
    const timeout = window.setTimeout(resetScroll, 0);
    return () => window.clearTimeout(timeout);
  }, [activeId]);

  if (!activeId) return <MissionLibrary liveCancellation={liveCancellation} onStart={setActiveId} />;

  if (activeId === "cancel-streamly" && liveCancellation) {
    return <LiveCancellationMission onExit={() => setActiveId(null)} />;
  }

  return <MissionChat key={activeId} scenario={getScenario(activeId)} client={client} onExit={() => setActiveId(null)} />;
}
