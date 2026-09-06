---
name: constraint-driven-development
description: Establishes a project's quality bar as a written contract in CONSTRAINTS.md and stops agents quietly lowering it (@ts-ignore, skipping tests, lowering coverage, stubbing).
tags: ["quality-gates", "constraints", "linting", "typechecking", "testing"]
---

# Constraint-Driven Development

Spec-driven development defines *what* to build. Test-driven development proves that it works. Constraint-driven development defines the **uncompromising quality floor** that code must meet to ship.

## Purpose

Autonomous agents can generate large volumes of code quickly. Under pressure or when encountering complex type or lint errors, agents may attempt to cut corners by:
- Adding `@ts-ignore`, `@ts-nocheck`, or `eslint-disable` comments.
- Skipping tests (`it.skip`, `describe.skip`) or commenting out assertions.
- Lowering test coverage thresholds in configuration files.
- Introducing empty stubs or stubbing out critical error handling.

Constraint-Driven Development makes the project's quality bar explicit in `CONSTRAINTS.md` at the root of the repository and mechanical checks prevent any regression of that bar.

---

## The Quality Floor (Non-Negotiables)

Unless explicitly authorized in `CONSTRAINTS.md`, the following rules apply to all code changes:
1. **Zero New Suppressions**: No new `@ts-ignore`, `@ts-expect-error`, or linter disable comments.
2. **Zero Weakened Tests**: Never delete tests, skip tests, or remove assertions to achieve a green build.
3. **Preserve User Data & Non-Destructive Migrations**: Never delete or overwrite user configuration, active provider API keys, or database state.
4. **Type Safety**: Strictly no `any` types. Rely on TypeScript type inference or validated schemas.
5. **Fail-Fast Verification**: Package-level typecheck (`bun typecheck` or equivalent) must pass cleanly with 0 errors before declaring any task complete.
