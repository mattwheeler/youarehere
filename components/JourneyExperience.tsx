"use client";

import { FormEvent, useState } from "react";
import {
  type ContextItem,
  type JourneyRequest,
  type JourneyResponse,
  type JourneyStage,
} from "@/lib/journey";
import { postJourney, type JourneyClient } from "@/lib/journey-client";

const outcomePaths = [
  { label: "Write", hint: "Shape words" },
  { label: "Understand", hint: "Make sense of it" },
  { label: "Find", hint: "Locate an answer" },
  { label: "Compare", hint: "See the differences" },
  { label: "Decide", hint: "Weigh a choice" },
  { label: "Create", hint: "Make something new" },
];

function contextStatus(item: ContextItem) {
  switch (item.state) {
    case "used":
      return "Used in this result";
    case "supplied":
      return "You supplied this";
    case "inferred":
      return "Inferred by AI";
    case "unavailable":
      return "Unavailable";
    default:
      return "Not provided";
  }
}

function ContextNode({
  item,
  onAddNotes,
}: {
  item: ContextItem;
  onAddNotes: () => void;
}) {
  const content = (
    <>
      <span className="node-eyebrow">Context</span>
      <strong>{item.label}</strong>
      <span className="node-status">{contextStatus(item)}</span>
    </>
  );

  if (item.id === "work-notes" && item.state === "missing") {
    return (
      <button
        className="map-node context-node missing-node"
        type="button"
        aria-label="Add work notes"
        onClick={onAddNotes}
      >
        {content}
        <span className="node-action">Add this →</span>
      </button>
    );
  }

  return (
    <div className={`map-node context-node state-${item.state}`}>{content}</div>
  );
}

function TaskMap({
  journey,
  onAddNotes,
}: {
  journey: JourneyResponse;
  onAddNotes: () => void;
}) {
  return (
    <section className="map-panel" aria-label="Task map">
      <div className="map-topline">
        <div>
          <p className="section-kicker">Your task map</p>
          <h2>{journey.summary}</h2>
        </div>
        <span
          className={`provenance-pill ${journey.provenance.live ? "live" : "fixture"}`}
        >
          <span aria-hidden="true" />
          {journey.provenance.live ? "GPT-5.6 live" : "Transparent demo data"}
        </span>
      </div>

      <div className="map-canvas">
        <div className="map-route" aria-hidden="true" />

        <div className="map-column identity-column">
          <div className="you-marker">
            <span className="you-dot" aria-hidden="true" />
            <span>
              <small>You are here</small>
              <strong>You</strong>
            </span>
          </div>
          <div className="map-node goal-node">
            <span className="node-eyebrow">Your goal</span>
            <strong>{journey.goal}</strong>
          </div>
        </div>

        <div className="map-column context-column">
          <div className="column-label">
            <span>What AI can use</span>
            <small>{journey.contextItems.length} signals</small>
          </div>
          <div className="context-stack">
            {journey.contextItems.map((item) => (
              <ContextNode
                key={item.id}
                item={item}
                onAddNotes={onAddNotes}
              />
            ))}
          </div>
        </div>

        <div className="map-column action-column">
          <div className="column-label">
            <span>What AI does</span>
            <small>Observable action</small>
          </div>
          <div className="map-node action-node">
            <span className="node-eyebrow">Action</span>
            <strong>{journey.action.label}</strong>
            <p>{journey.action.explanation}</p>
          </div>
          <div className="resource-state">
            <span className="resource-icon" aria-hidden="true">⌁</span>
            <span>
              <strong>Web search: {journey.action.webSearch}</strong>
              <small>The app says when a resource is not part of the route.</small>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArtifactCard({ journey }: { journey: JourneyResponse }) {
  return (
    <article className="artifact-card">
      <div className="artifact-head">
        <div>
          <p className="section-kicker">The work</p>
          <h2>{journey.artifact.title}</h2>
        </div>
        <div className="delta-badge">
          <span>{journey.delta.label}</span>
          <small>{journey.delta.because}</small>
        </div>
      </div>
      <div className="artifact-paper">
        {journey.artifact.body.split("\n\n").map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {journey.artifact.limitation ? (
        <div className="honesty-note">
          <span aria-hidden="true">i</span>
          <p>{journey.artifact.limitation}</p>
        </div>
      ) : null}
    </article>
  );
}

function CapabilityMap({ journey }: { journey: JourneyResponse }) {
  return (
    <section className="capability-card" aria-labelledby="capability-title">
      <div>
        <p className="section-kicker">What you practiced</p>
        <h2 id="capability-title">Your capability map</h2>
      </div>
      <div className="capability-route">
        <span className="capability-you">You</span>
        {journey.capabilities.map((capability) => (
          <span
            className={`capability-node ${capability.status}`}
            key={capability.id}
          >
            {capability.label}
            <small>
              {capability.status === "next" ? "Try next" : "Practiced"}
            </small>
          </span>
        ))}
      </div>
    </section>
  );
}

export function JourneyExperience({
  client = postJourney,
}: {
  client?: JourneyClient;
}) {
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [refinement, setRefinement] = useState("");
  const [journey, setJourney] = useState<JourneyResponse | null>(null);
  const [history, setHistory] = useState<JourneyResponse[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [contextOpen, setContextOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance(stage: JourneyStage) {
    setBusy(true);
    setError(null);

    const request: JourneyRequest = {
      stage,
      goal,
      notes,
      refinement,
    };

    try {
      const next = await client(request);
      setJourney(next);
      setHistory((current) => {
        const updated = [...current, next];
        setActiveIndex(updated.length - 1);
        return updated;
      });
      if (stage === "context") setContextOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The map could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void advance("goal");
  }

  function handleNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void advance("context");
  }

  function handleRefinement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void advance("refine");
  }

  function inspectHistory(index: number) {
    setJourney(history[index]);
    setActiveIndex(index);
  }

  return (
    <main className="site-shell">
      <header className="brand-bar">
        <a className="wordmark" href="#top" aria-label="You Are Here home">
          <span className="wordmark-pin" aria-hidden="true" />
          <span>You Are Here</span>
        </a>
        <div className="brand-meta">
          <span>OpenAI Build Week</span>
          <span className="brand-divider" aria-hidden="true" />
          <span>Adult AI fluency</span>
        </div>
      </header>

      {!journey ? (
        <section className="orientation" id="top">
          <div className="orientation-copy">
            <p className="hero-kicker">Start with you, not the technology.</p>
            <h1>What are you trying to get done today?</h1>
            <p className="hero-lede">
              Tell us the real task. We’ll show what AI understands, what it can
              use, and why the result changes—while you do the work.
            </p>
          </div>

          <div className="orientation-map" aria-label="Available starting paths">
            <div className="orientation-lines" aria-hidden="true" />
            <div className="orientation-you">
              <span className="you-dot" aria-hidden="true" />
              <small>You are here</small>
              <strong>You</strong>
            </div>
            <ul className="outcome-paths">
              {outcomePaths.map((path) => (
                <li key={path.label}>
                  <strong>{path.label}</strong>
                  <span>{path.hint}</span>
                </li>
              ))}
            </ul>
          </div>

          <form className="goal-composer" onSubmit={handleGoal}>
            <label htmlFor="goal">Your goal</label>
            <div className="composer-row">
              <textarea
                id="goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="I need to write my performance review…"
                rows={2}
                required
              />
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Mapping…" : "Map my task"}
              </button>
            </div>
            <button
              className="sample-link"
              type="button"
              onClick={() =>
                setGoal("I need to write my performance review.")
              }
            >
              Use the interview scenario
            </button>
          </form>

          {error ? <p className="error-banner" role="alert">{error}</p> : null}
        </section>
      ) : (
        <div className="workspace" id="top">
          <div className="workspace-heading">
            <div>
              <p className="hero-kicker">A visible path through your work</p>
              <h1>See the question work.</h1>
            </div>
            <button
              className="quiet-button"
              type="button"
              onClick={() => {
                setJourney(null);
                setHistory([]);
                setActiveIndex(-1);
                setNotes("");
                setRefinement("");
              }}
            >
              Start a new goal
            </button>
          </div>

          {error ? <p className="error-banner" role="alert">{error}</p> : null}

          <TaskMap journey={journey} onAddNotes={() => setContextOpen(true)} />

          {contextOpen ? (
            <form className="context-composer" onSubmit={handleNotes}>
              <div>
                <p className="section-kicker">Add what AI cannot see</p>
                <h2>Give the draft evidence from your year.</h2>
                <p>
                  These notes stay visibly attached to this task so you can see
                  when they affect the result.
                </p>
              </div>
              <label htmlFor="work-notes">Add work notes</label>
              <textarea
                id="work-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Led the migration early… Reduced the backlog… Mentored two teammates…"
                rows={5}
                required
              />
              <div className="composer-actions">
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => setContextOpen(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? "Updating…" : "Use these notes"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="work-grid">
            <ArtifactCard journey={journey} />

            <aside className="journey-sidebar">
              <section className="history-card" aria-labelledby="history-title">
                <p className="section-kicker">Each meaningful question</p>
                <h2 id="history-title">Your journey</h2>
                <ol>
                  {history.map((snapshot, index) => (
                    <li key={`${snapshot.stage}-${index}`}>
                      <button
                        type="button"
                        className={activeIndex === index ? "active" : ""}
                        onClick={() => inspectHistory(index)}
                      >
                        <span>{index + 1}</span>
                        <span>
                          <strong>{snapshot.questionLabel}</strong>
                          <small>{snapshot.delta.because}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>

              <CapabilityMap journey={journey} />
            </aside>
          </div>

          {journey.stage !== "goal" ? (
            <form className="refinement-composer" onSubmit={handleRefinement}>
              <div>
                <p className="section-kicker">One more move</p>
                <h2>Who is this for, and how should it sound?</h2>
              </div>
              <label htmlFor="refinement">Refine this result</label>
              <div className="composer-row">
                <input
                  id="refinement"
                  value={refinement}
                  onChange={(event) => setRefinement(event.target.value)}
                  placeholder="Make it confident but not boastful, for my director."
                  required
                />
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? "Refining…" : "Refine"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      )}

      <footer>
        <p>AI should teach you how to use AI while you are using it.</p>
        <span>Built with GPT-5.6 + Codex</span>
      </footer>
    </main>
  );
}
