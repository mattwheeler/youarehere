# On Your Behalf

> Driver's ed for AI agents.

On Your Behalf is a playable AI-literacy simulation for people who are being asked to delegate work to AI agents before they have learned how to supervise them. A learner completes one familiar task inside a synthetic personal workspace while practicing four observable behaviors:

1. **Scope** what the agent may see.
2. **Inspect** where it plans to go.
3. **Approve** consequential actions.
4. **Verify** what actually changed.

The first mission asks the learner to cancel a fictional streaming trial before it renews. The inbox, browser, account, and confirmation are synthetic; the choices and consequences are real application state.

## Build Week track

**Education** — scenario-based adult AI literacy.

## Why this is different

- The learner controls an agent instead of reading a lesson about agents.
- Unsafe choices reveal consequences and allow a retry.
- The application—not the model—enforces permission, approval, and verification rules.
- A cancellation cannot complete until the learner independently verifies it.
- Fixture and live GPT-5.6 coaching are clearly distinguished.

## Stack

- React 19 and Next.js-compatible App Router on vinext/Vite
- TypeScript and Zod
- OpenAI Responses API with GPT-5.6 Structured Outputs
- Vitest, Testing Library, and rendered-worker tests
- Cloudflare Workers-compatible production output

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>.

For the deterministic judge/demo path:

```dotenv
USE_DEMO_FIXTURES=true
```

For live GPT-5.6 coaching:

```dotenv
OPENAI_API_KEY=your_server_side_key
USE_DEMO_FIXTURES=false
```

The key remains server-side. Never prefix it with `NEXT_PUBLIC_` or commit an environment file.

## Verify

```bash
npm test
npm run test:coverage
npm run lint
npm run build
npm run test:rendered
```

Coverage thresholds are enforced at 80% for statements, branches, functions, and lines.

## Product architecture

The mission state machine owns safety-critical behavior. It decides whether a permission is narrow or broad, whether a route is trusted, whether an action is paused for approval, and whether verification is independent. GPT-5.6 returns short coaching and a typed proposed-action description; it cannot bypass the state machine.

`POST /api/mission` accepts the current mission stage and learner decision. Fixture mode returns deterministic coaching. Live mode uses GPT-5.6, `store: false`, low reasoning effort, and Zod-backed Structured Outputs.

## Codex collaboration

Codex was used throughout the submission period to:

- read and apply the official rules;
- synthesize private user research into product hypotheses;
- challenge and reject the first implemented direction after user review;
- research the competitive and learning-science landscape;
- design the mission state machine and OpenAI response contract;
- implement the responsive prototype through test-driven development;
- run tests, coverage, lint, build, security, and rendered-output verification;
- maintain the canonical decision and build record in Confluence.

Matt Wheeler made the product decisions, supplied user research, rejected the original product direction, approved the pivot scope, and directed the final experience.

## Responsible behavior

- All inbox, account, billing, and confirmation content is fictional.
- The prototype connects to no real personal accounts.
- Sensitive state changes require an explicit learner decision.
- Rejected approvals leave the subscription unchanged.
- The interface teaches users to prefer external evidence over an agent's assertion.
- Hidden chain-of-thought is neither requested nor displayed.

## Provenance

The repository and all product work were created during OpenAI Build Week 2026. See [PROVENANCE.md](./PROVENANCE.md) for the concept lineage and implementation record.

## License

MIT © 2026 Matt Wheeler. See [LICENSE](./LICENSE).
