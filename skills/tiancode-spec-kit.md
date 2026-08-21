---
name: tiancode-spec-kit
description: Run Tiancode's built-in spec-driven workflow for substantial features: create a durable specification, technical plan, verifiable task list, and evidence record in specs/<feature>/ before implementation. Use when a user asks to specify, plan, break down, verify, converge, or implement a multi-file feature end-to-end, or invokes /spec-kit.
---

# Tiancode Spec Kit

Use this local workflow instead of installing an external Spec Kit CLI. It is
an agent workflow backed by normal versioned Markdown artifacts and Tiancode's
existing read, write, todo, shell, preview, and skill tools. It does not call
GitHub, create issues, install dependencies, or claim an external API exists.

## Artifact contract

Choose a short lower-kebab feature name and keep every durable artifact under:

```text
specs/<feature>/
  spec.md
  plan.md
  tasks.md
  verification.md
```

Do not overwrite a non-empty artifact. Read it first and patch or append it so
decisions and evidence remain auditable. Keep temporary session todo items in
`todowrite`; `tasks.md` is the durable source of truth.

## Phases and gates

1. **specify** — Inspect only enough project context to understand the request,
   then write `spec.md`. Include `## Problem`, `## Goals`, `## Out of scope`,
   `## User stories`, `## Acceptance criteria`, `## Assumptions`, and
   `## Open questions`. Give every acceptance criterion a stable ID such as
   `AC-01`. Do not write product code in this phase.

2. **plan** — Read `spec.md`, then write `plan.md` with `## Architecture`,
   `## Interfaces and data`, `## Delivery order`, `## Risks`, and
   `## Validation strategy`. State concrete repository commands only after
   checking them in the repository. Do not invent APIs, libraries, test
   results, or preview capabilities.

3. **tasks** — Read both preceding files and write ordered, vertical slices in
   `tasks.md`. Every task must have an ID, dependencies, acceptance criteria,
   files or areas expected to change, and an exact verification action. Keep
   tasks small enough for one focused implementation session.

   ```md
   - [ ] T001: Short outcome
     - Depends on: none
     - Acceptance: AC-01 is demonstrably true.
     - Verify: `bun test path/to/focused.test.ts`
     - Areas: `src/example.ts`, `src/example.test.ts`
   ```

4. **implement** — Implement only tasks whose prerequisite artifacts exist and
   are sufficiently concrete. Mark a task complete only after its verification
   actually passes. Record the command, manual check, result, and date in
   `verification.md`; preserve failures as failures. For browser work, use the
   embedded Tiancode preview when it is applicable and verify runtime errors
   rather than assuming a rendered page is healthy.

5. **converge** — Compare `spec.md`, `plan.md`, `tasks.md`, source changes, and
   verification evidence. Append uncovered work as new unchecked tasks. Never
   silently check a task merely because the code looks plausible.

## Artifact templates

Start each artifact with these compact headings, then replace the placeholders
with repository-specific facts:

```md
# Spec: <feature>
## Problem
## Goals
## Out of scope
## User stories
## Acceptance criteria
## Assumptions
## Open questions
```

```md
# Plan: <feature>
## Architecture
## Interfaces and data
## Delivery order
## Risks
## Validation strategy
```

```md
# Tasks: <feature>
## Ordered work
```

## Evidence template

Use this shape in `verification.md` and keep failed or blocked checks visible:

```md
# Verification: <feature>

| Requirement/task | Evidence | Result | Status |
| --- | --- | --- | --- |
| AC-01 / T001 | `exact command` or manual scenario | concise real output | pass / fail / blocked |
```

## Operating rules

- If a material decision is unknown, write it as an assumption or open
  question and ask the user before implementation that depends on it.
- `specify`, `plan`, `tasks`, and `converge` change only the artifact set;
  `implement` may change product code after the preceding gates are present.
- Prefer focused tests first, then the package's required typecheck/build.
  Do not run a broad, destructive command simply to fill an evidence row.
- Do not publish issues, commits, pull requests, releases, or external
  messages unless the user explicitly requests that separate action.
- At the end of each phase, report the artifact path, the next gate, and any
  blocker in plain language.

Use the `/spec-kit <phase> <feature or request>` command for the guided entry
point. If the phase is omitted, begin with **specify**.
