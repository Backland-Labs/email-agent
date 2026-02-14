# Agent-Ready TypeScript Template

A minimal, strict TypeScript repository template designed for high agent effectiveness.

It scaffolds the four agent-ready principles:

1. 100% line coverage workflow
2. Thoughtful file structure
3. End-to-end type safety
4. Automated enforcement (local + CI)

## Included

- Strict TypeScript (`tsconfig.json`)
- Vitest with coverage thresholds locked to 100%
- ESLint + Prettier + lint-staged
- Git hooks via `simple-git-hooks`
- CI workflow that runs the full quality gate
- Structure checks for catch-all filenames and oversized files
- A reusable checklist in `docs/checklist.md`

## Quick Start

```bash
bun install
bun run check
```

## Scripts

- `bun run build` - build `src` into `dist`
- `bun run typecheck` - run TypeScript checks with no emit
- `bun run lint` - run ESLint
- `bun run format` - apply Prettier
- `bun run format:check` - verify formatting
- `bun run test` - run tests with coverage
- `bun run test:watch` - run tests in watch mode
- `bun run structure:check` - enforce file naming and size rules
- `bun run opencode:append-thread` - append latest Opencode session transcript to a PR comment
- `bun run check` - run structure, format, lint, typecheck, and tests

## Suggested Next Steps

1. Rename `package.json` fields for your project.
2. Replace the sample domain in `src/domain` and `src/services`.
3. Keep coverage at 100% as you build features.
