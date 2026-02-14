---
date: 2026-02-14
topic: gmail-insights-agent
---

# Gmail Insights Agent

## What We're Building

We are defining a TypeScript AI agent in this repository that connects directly to Gmail, reviews emails, and returns custom insights through an AG-UI-compatible response format for `../agent-ui`.

The first release is scoped to insights only (no draft generation yet). The target insight set is priority and urgency, extracted action items, relationship context, and sentiment or tone cues. For data handling, full email bodies remain transient during processing, while only derived insights and metadata are retained.

## Why This Approach

We evaluated three options for the core agent SDK direction: (A) AG-UI endpoint with Vercel AI SDK, (B) Mastra with AG-UI integration, and (C) custom AG-UI runtime built from low-level protocol primitives.

Approach A was selected because it best matches YAGNI for v1: it is provider-agnostic from day one, aligns with the TypeScript/Bun stack already used in this repo, and minimizes upfront framework overhead while preserving a clean path to future draft-generation capabilities.

## Key Decisions

- Build in TypeScript in this repository.
- Use direct Gmail inbox integration, not manual forwarding.
- Use an AG-UI endpoint backed by Vercel AI SDK.
- Keep v1 scope to insights only.
- Start with Gmail read-only plus metadata permissions.
- Prioritize insight accuracy as the primary success metric.
- Keep full email bodies transient; persist only derived insights and metadata.
- Output insights in AG-UI schema compatible with `../agent-ui`.

## Resolved Questions

- Forwarded payload vs direct Gmail: direct Gmail was chosen for long-term draft and Gmail-native workflow goals.
- Insight surface: expose results through AG-UI schema for compatibility with `../agent-ui`.

## Open Questions

- None at this stage.

## Next Steps

-> `/workflows:plan` for implementation details, sequencing, and test strategy.
