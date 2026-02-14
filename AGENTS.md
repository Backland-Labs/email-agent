# AGENTS

Repository guidance for coding agents.

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
