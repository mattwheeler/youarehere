# You Are Here

> See what AI can see. Learn what to do next.

You Are Here is a map-first AI workspace for people who can get an answer from AI but cannot see where they are in the work. It turns a plain-language goal into a visible journey: goal, available context, next action, artifact, and what changed.

The first complete scenario helps someone prepare for a performance review. The experience intentionally begins broad, reveals the missing evidence, lets the person add work notes, and then updates the artifact so the value of context is visible rather than magical.

## Why this is different

- The map is the primary work surface, not decoration around a chat box.
- Context is visible as `used`, `missing`, or `unnecessary`.
- Every meaningful change creates a history entry tied to the user's question.
- Live output uses a strict schema; demo output is explicitly labeled as a fixture.
- The product explains what changed without exposing or inventing chain-of-thought.

## Build Week track

**Apps for your life** — a consumer learning and productivity experience for everyday AI use.

## Stack

- Next.js-compatible App Router on vinext/Vite
- React 19 and TypeScript
- OpenAI Responses API with GPT-5.6
- Zod Structured Outputs
- Vitest, Testing Library, and Node rendered-output tests
- Cloudflare Workers-compatible production output

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>.

For the deterministic, no-key demo shown in the hackathon walkthrough:

```dotenv
USE_DEMO_FIXTURES=true
```

For live GPT-5.6 output:

```dotenv
OPENAI_API_KEY=your_server_side_key
USE_DEMO_FIXTURES=false
```

The API key is read only by the server route. Never prefix it with `NEXT_PUBLIC_` or commit an environment file.

## Verify

```bash
npm test
npm run test:coverage
npm run lint
npm run build
npm run test:rendered
```

Coverage thresholds are enforced at 80% for statements, branches, functions, and lines.

## Response contract

`POST /api/journey` accepts a stage (`goal`, `context`, or `refine`), a goal, and optional context/refinement. It returns:

- a four-node journey map;
- visible context-state decisions;
- the current artifact and an honest limitation note;
- a concise description of what changed;
- capability guidance and safe product-level provenance.

Live requests use `gpt-5.6`, low reasoning effort, `store: false`, and Zod-backed Structured Outputs. If the server has neither an API key nor fixture mode enabled, it fails closed with a configuration error.

## Demo flow

1. Choose **Write** and ask: “Help me prepare for my performance review.”
2. See a useful but intentionally broad first draft and the missing **Work notes** node.
3. Add evidence such as: “Improved activation by 30% and mentored two teammates.”
4. Watch the same map update: context becomes used, the artifact gains specifics, and the history records the change.
5. Refine the artifact for a manager with a confident, evidence-led tone.

This is paced as a real user journey, not a compressed 90-second feature reel.

## Responsible behavior

- The model is instructed not to invent personal evidence.
- Context states distinguish missing information from unnecessary tools.
- Demo fixtures are labeled in both the UI and API response.
- Provider errors are converted to safe user-facing messages.
- OpenAI response storage is disabled.
- Hidden chain-of-thought is neither requested nor displayed.

## Documentation and provenance

Product decisions and the evolving submission narrative live in the Build Week Confluence space. Repository-specific provenance is recorded in [PROVENANCE.md](./PROVENANCE.md).

Built with Codex and the OpenAI API for OpenAI Build Week 2026.

## License

MIT © 2026 Matt Wheeler. See [LICENSE](./LICENSE).
