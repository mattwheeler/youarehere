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

- The UI resembles a modern AI conversation, including visible tool calls and human approval moments.
- All missions use fictional data and make no real external changes.
- Deterministic application logic controls the lesson state, scores, and safe/unsafe consequences.
- GPT-5.6 can provide brief, structured coaching through the OpenAI Responses API.
- Demo mode uses labeled deterministic fixtures so the prototype remains reliable without live credentials.

## Local development

Requires Node.js 22.13 or later.

```bash
npm ci
USE_DEMO_FIXTURES=true npm run dev
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
# Reliable public demo mode
USE_DEMO_FIXTURES=true

# Live GPT-5.6 coaching mode
OPENAI_API_KEY=...
USE_DEMO_FIXTURES=false
```

The app uses `store: false` and Structured Outputs for live coaching. Model output never controls mission permissions, approvals, or proof.

## Documentation

The canonical build record is maintained in the OpenAI Build Week Confluence space. Submission-period authorship and asset lineage are recorded in [PROVENANCE.md](./PROVENANCE.md).
