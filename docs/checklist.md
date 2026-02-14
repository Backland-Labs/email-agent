# Agent-Ready Checklist

Use this checklist when adapting this template for a real product.

## 1) Test Coverage

- Keep line coverage at 100%.
- Fail CI when coverage drops.
- Treat uncovered lines as immediate todos.

## 2) File Structure

- Keep files under ~300 non-comment, non-blank lines.
- Prefer domain names (`billing/invoices`) over catch-all names (`utils`, `helpers`).
- Co-locate related code.

## 3) End-to-End Types

- Keep TypeScript strict mode on.
- Avoid `any` in business logic.
- Use semantic types (for IDs, slugs, and payloads).
- Add runtime validation at external boundaries.

## 4) Automated Enforcement

- Run format, lint, typecheck, tests, and structure checks in CI.
- Keep pre-commit hooks enabled.
- Make local checks cheap enough to run often.
