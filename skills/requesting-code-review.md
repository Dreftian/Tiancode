---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---


# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code reviewer subagent:**

Dispatch a `general` subagent (Tiancode's general-purpose agent) with the `task` tool, using this prompt with the placeholders filled in:

````
You are reviewing code changes for production readiness. You have no context beyond this prompt;
read the code yourself. Do not edit any files.

## What was implemented
{DESCRIPTION}

## Requirements / plan
{PLAN_OR_REQUIREMENTS}

## Git range
Base: {BASE_SHA}   Head: {HEAD_SHA}
Run `git diff --stat {BASE_SHA}..{HEAD_SHA}` and `git diff {BASE_SHA}..{HEAD_SHA}`,
then read the surrounding code as needed.

## Check
- Requirements: everything in the plan implemented? Anything added that was not asked for?
- Correctness: edge cases, error handling, null/empty input, off-by-one, races.
- Code quality: clear names, no duplication, follows the project's conventions (AGENTS.md, CLAUDE.md).
- Architecture: fits existing patterns, sound boundaries, no needless abstraction.
- Testing: tests exercise real behavior (not just mocks), cover edge cases, and pass.
- Production readiness: security, performance, migrations and backward compatibility.

## Output
### Strengths
Specific things done well (brief).
### Issues
#### Critical (must fix): bugs, security holes, data loss, broken functionality
#### Important (should fix): missing requirements, weak error handling, test gaps, design problems
#### Minor (nice to have): style, naming, small optimizations
For each issue: file:line, what is wrong, why it matters, how to fix (if not obvious).
Write "None" for an empty category.
### Assessment
Ready to merge? Yes / No / With fixes, plus one or two sentences of reasoning.

Rules: grade by actual severity (not everything is Critical); be specific (file:line, not
"improve error handling"); only report what you verified in the code.
````

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll just review the diff myself instead of dispatching a reviewer" | You're the coordinator — reviewing the diff inline burns the context window you need to keep driving the work. Dispatch a reviewer subagent: the diff and the evaluation live in its context, and only the findings come back to you. |
| "The reviewer needs my whole session history to understand the change" | Hand it precisely crafted context, never your session's history. That keeps the reviewer on the work product, not your thought process. |

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

The reviewer prompt template is in step 2 above. For a multi-reviewer review with strict triage, use `adversarial-code-review`.
