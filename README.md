# On Your Behalf

> Learn AI by doing it.

On Your Behalf is an interactive AI-literacy prototype for OpenAI Build Week 2026. Instead of explaining AI with lessons and jargon, it gives people 20 short, familiar missions. The learner makes the important calls while an AI agent shows what would happen next.

## What learners practise

Every mission uses four plain-language habits:

1. Choose what AI can see.
2. Check where AI is going.
3. Look before AI acts.
4. Make sure the result is real.

The library covers everyday life, work, money, and safety. Examples include cancelling a subscription, booking a flight, sending a client update, disputing a charge, and checking a suspicious email.

## Build Week track

**Education** — practical AI literacy for adults who are new to action-taking AI.

## Product thesis

People should not have to finish a course before they can use AI safely. AI should teach people how to use it while they are using it.

## How it works

- The flagship cancellation mission uses GPT-5.6 and six strict tools inside a fictional Streamly inbox and account.
- D1 holds the authoritative mission state, while signed browser tokens carry only an opaque session reference.
- Write arguments are frozen before the learner sees the approval card, then executed at most once after an exact approval.
- Deterministic application logic—not model text—controls permissions, unsafe-route blocking, world changes, and completion proof.
- The other 19 missions remain clearly labeled Practice experiences. If the live runtime is unhealthy, cancellation is also labeled Practice before it starts; a started live mission is never silently replaced with a fixture.

## Local development

Requires Node.js 22.13 or later.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

## Environment

```bash
# Live Cancel Streamly mission (disabled by default)
OPENAI_API_KEY=...
MISSION_STATE_SECRET=use-a-strong-random-secret-at-least-32-characters
LIVE_GOLDEN_MISSIONS=true

# Legacy deterministic coach for the remaining Practice missions
USE_DEMO_FIXTURES=true

# Use the live coach for those Practice missions
USE_DEMO_FIXTURES=false
```

The app uses `store: false`, strict function schemas, encrypted reasoning continuation, bounded tool results, and a four-hop ceiling. The OpenAI key, mission secret, authoritative world state, continuation state, and action hashes stay server-side.

## Documentation

The canonical build record is maintained in the OpenAI Build Week Confluence space. Submission-period authorship and asset lineage are recorded in [PROVENANCE.md](./PROVENANCE.md).
