---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session. Dispatches isolated implementer and reviewer subagents per task.
tags: ["subagents", "workflow", "plan-execution", "code-review", "testing"]
---

# Subagent-Driven Development

Execute implementation plans with exceptional quality and rapid iteration by dispatching fresh, isolated implementer subagents per task, running focused task reviews (spec compliance + code quality) after each task, and performing comprehensive verification at the end.

## Core Principles

1. **Context Isolation**: Subagents receive strictly the task description, relevant file paths, and plan excerpts—never the entire session transcript or history. This prevents hallucinations from context degradation and preserves parent context.
2. **Continuous Execution**: Do not stall to ask "Should I continue?" between tasks. Decide ambiguities proactively using the plan as the authority, record rulings in the execution ledger, and keep moving forward.
3. **Double Quality Gate**: Every task requires:
   - Self-review & verification by the implementer.
   - Dedicated task review verifying both specification adherence and code quality before advancing.
4. **Ruling over Stalling**: If a plan conflict or minor ambiguity arises, make a firm ruling, document `Ruling: <decision> — <reason> — <cost if wrong>`, and proceed. Only pause for destructive operations, security barriers, or fundamentally broken plans.

---

## Workflow

### 1. Task Pre-Flight
- Read the implementation plan and verify dependencies for the target task.
- Ensure the working tree is clean and baseline tests/lints pass.

### 2. Dispatch Implementer Subagent
Prepare a targeted prompt for the subagent containing:
- **Task Goal**: Exactly what needs to be created or modified.
- **Constraints & Conventions**: Adhere to project guidelines (e.g. `AGENTS.md`, style guides, no `any`, Effect-TS patterns).
- **Verification Requirements**: Run local package typechecks (`bun typecheck`) and relevant unit tests.

### 3. Review Gate
Once the subagent completes the task:
- Verify git diff against task requirements (`git status`, `git diff`).
- Inspect newly added tests and assert that coverage is genuine, not mocked out.
- Ensure no silent error suppressions (`@ts-ignore`, `eslint-disable`) were introduced.

### 4. Progress Ledger & Commit
- Record task completion in the task ledger.
- Create a conventional git commit: `type(scope): message`.
- Move immediately to the next task in the plan without waiting for human confirmation.

### 5. Final Whole-Branch Review
After all tasks are complete:
- Run full typecheck and test suite across affected packages.
- Review full cumulative diff (`git diff HEAD~<N>`).
- Present a concise walkthrough summary to the user.
