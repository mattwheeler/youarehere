# Provenance

## Entrant

Matt Wheeler, entering as an individual. This must remain consistent across Devpost, repository ownership, licensing, and the submission narrative. Confirm the entrant one final time before submission.

## Submission-period creation

You Are Here is a new project and repository created during the OpenAI Build Week 2026 submission period. All application code, prompts, schemas, fixtures, product copy, visual assets, tests, and submission materials in this repository were created from scratch during that period.

No application code, prompts, schemas, fixtures, copy, or visual assets were copied from an existing Rise Up Labs or Matt Wheeler repository.

## Concept lineage

The project thesis comes from a new user interview conducted for Build Week: people can use AI to get an answer but struggle to see where they are, what context the AI used, and what to do next. Existing products and editorials informed the builder's general experience, not this implementation.

Earlier concepts explored during this Build Week—including Promise Compiler—were rejected before implementation. Their local notes are not part of this repository.

## Demo data

The performance-review scenario is a transparent, deterministic fixture written specifically for this project. It contains no client data, unpublished company information, credentials, or personal information. The UI labels fixture output as a demo and the server only enables it when `USE_DEMO_FIXTURES=true`.

## OpenAI usage

Live mode uses the OpenAI Responses API with GPT-5.6, Structured Outputs, low reasoning effort, and `store: false`. The application exposes useful product-level provenance (model, response ID, and live/fixture status) without requesting or displaying hidden chain-of-thought.

## Third-party work

Runtime and development dependencies are enumerated in `package-lock.json`. The interface uses CSS-drawn wayfinding forms and system fonts; no third-party media or brand assets are included.

## Build evidence

The repository history, automated tests, and the primary Codex task document implementation during the submission period. Any future third-party data, code, media, fonts, or assets must be recorded here before submission.
