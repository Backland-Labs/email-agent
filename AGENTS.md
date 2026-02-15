# AGENTS

Repository guidance for coding agents.

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again. Strive to write clean, concise, and simple code. Do no over complicate.

Fight entropy. Leave the codebase better than you found it.

## Purpose

- Keep this repo agent-ready by preserving strict typing, full coverage, and automated checks.
- Prefer focused files and domain-driven names.

## Commands

- `bun run check` for the full local quality gate.
- `bun run test` for coverage-enforced tests.
- `bun run structure:check` for file naming and size constraints.

## Conventions

- Keep files under 300 non-comment, non-blank lines.
- Avoid catch-all names like `utils`, `helpers`, `common`, or `misc`.
- Use semantic types over raw `string`/`number` in business logic.
- Add tests with each behavior change.

## Safety

- Never commit secrets.
- Prefer small diffs and explicit error handling.
- Do not skip hooks or CI checks.
