---
name: adversarial-code-review
description: "Reviews a code change with several independent reviewer subagents, each using a different lens (edge cases, verification gaps, adversarial, intent), then triages every finding with one strict verdict and one action bucket. Use when the user says \"adversarial review\", \"thorough code review\", \"tear this diff apart\", \"review this branch/PR hard\", or before merging a risky change."
---

# Adversarial Code Review

## Overview

Review a change adversarially: no noise, no filler. Several reviewers each read the diff through one lens, in separate subagents with no shared context, so they cannot drift into agreement. You coordinate: reviewers **find**, you **judge**. You verify every finding against the code and give it exactly one verdict and one bucket before the user sees it.

For a quick single-reviewer check, use `requesting-code-review` or `code-review-and-quality` instead.

## Step 1: Gather Context

Writing the temp files below is the only change this step makes.

1. **Find the target**, stopping at the first source that identifies it:
   - **Request or conversation:** a PR (`gh pr view`; if that fails, ask for a SHA or branch), commit, branch, commit range, staged or uncommitted changes, a diff or file list, or a plan/spec file.
   - **Git state:** if HEAD is not on the default branch, confirm "Review this branch's changes against `<default>`?"
   - **Ask** with `question`: uncommitted, staged, branch diff (which base), commit range, or a file list.
2. **Write the diff** to a uniquely named temp file outside the repo. A branch diff runs from the merge-base (`git diff <base>...HEAD`) so later base commits do not look like reverts. For uncommitted changes and file lists, include untracked files (e.g. `git diff --no-index /dev/null <file>`). Unresolvable source: ask again. Empty diff: stop. Reviewers read this file; never paste diff text into a prompt.
3. **Stage the claims file:** the change's own narrative, verbatim, in a second temp file: the commit messages it covers (`git log <base>..<head>`) or the description the user gave. Do not summarize it. Only the Edge Case Hunter gets it, and reads it last.
4. **Plan context.** User says there is no plan: mode **no-plan**. A plan/spec/ticket file is known: mode **full**; load the context docs it lists and warn about missing ones. Otherwise ask once for a plan path or to continue without one; do not assume no-plan. **Intent** = the plan's intent section or the user's own words on what the change is for ("review this" is not intent).
5. Over ~3000 diff lines: warn and offer to review one file group at a time.

**Checkpoint:** show diff stats (files, lines added/removed), mode, and loaded docs. Ask via `question` whether to proceed.

## Step 2: Launch the Reviewers

Launch every active lens **in one message** as parallel `task` calls with `subagent_type: general` (Tiancode's general-purpose agent). Wait for all of them before reading or reacting to any result. Substitute **absolute** paths for the diff, claims and plan files (reviewers share neither your working directory nor your history), paste the lens text, and end every prompt with:

> Do not invoke skills or start subagents: you are the reviewer. Do not edit files. Return your findings as text in your final message.

**Active lenses:** thorough (default) runs A, B and C, plus D when an intent exists (otherwise tell the user D was skipped and why). If the user asks for a **quick** review, run only the Quick lens.

### A. Edge Case Hunter (correctness)

```
You are a pure path tracer: never judge whether code is good, only list missing handling.
Content: the unified diff at <DIFF_FILE>. Scan only the hunks; list boundaries reachable from the
changed lines that lack an explicit guard. Read other code only where the diff calls into it.
Claims file: <CLAIMS_FILE or "none">. Do NOT open it before step 4.
1. Walk every branch and boundary (conditionals, loops, error handlers, early returns, state
   transitions). Derive edge classes from the code: missing else/default, unguarded or null/empty
   input, off-by-one, overflow, implicit coercion, races, timeout gaps. Also:
   - Implicit branches: if the diff changes handling for some members of a fixed set (enum, status
     codes, flags, ranges), the other members are branches too.
   - Handle lifetime: if changed code re-checks something it already held (handle, index, id), find
     the call that can invalidate it and what is skipped when the re-check fails.
   - Call sites: for each call the diff adds or changes (tests too), check argument count, order,
     types and defaults against the callee's declaration.
   Report only unhandled paths.
2. Revisit every edge class once more; add what you missed.
3. Deletion check (meaningful code removed or replaced): did it carry behavior or a contract the
   change neither re-established nor retired? Report regressions, orphaned references, dead code.
4. Claims check (claims file given): read it now. It is testimony, not evidence. Try to falsify
   each checkable claim (what it does or preserves, ordering, arithmetic, "same as X") against the
   code. Report only falsified claims.
Output ONLY a JSON array, no prose, no severity ([] is valid):
[{"location":"file:start-end","trigger_condition":"<=15 words","guard_snippet":"one-line fix",
  "potential_consequence":"<=15 words"}]
Deletion/claim findings add "kind":"deletion"|"claim" and "confidence":"high"|"medium"|"low".
```

### B. Verification Gap

```
Ask one question: if the behavior this change should produce broke where it is used, would
verification fail? Do not hunt for correctness bugs. Content: the unified diff at <DIFF_FILE>.
Gaps: Regression (it regresses where used, no test fails); Missing-adoption (a site that should now
use the new behavior does its own thing, no test flags it); Broken-verification (a test seems to
cover it but is skipped, flaky, outside the normal run, or too weak to see the regression).
Evidence: read a test before saying what it covers; before saying no test exists, search the whole
repo by symbol and imports; never assert what you did not verify; say how far you looked.
1. Skip parts that change no return value, error, caller-visible side effect or observable state
   (formatting, renames, type-only, static text, LLM output). Dependency, build/config and
   data-file changes count as behavioral.
2. Name each changed behavior: output, side effect, branch, error path, schema/event shape,
   default, validation/authorization rule, contract.
3. Trace it to the places that observe it (callers, entry points, contract consumers), usually 1-3
   hops. Stop where a test would fail, the consumer does not observe it, or the next hop is guesswork.
4. Per consumer, name the smallest realistic regression it would see (invert the branch, drop the
   default, omit the field): the Demonstration. None -> drop it. Missing-adoption needs a
   supersession signal (intent, naming/docs, replaced sibling, deleted duplicate, a test defining
   the rule) AND a shared observable contract. Would the Demonstration fail an assertion? Counts
   only: tests that run normally and assert the changed output. Not: source-text matches,
   no-throw/snapshot-only, mock/log-call checks, mocked-away integrations, stale fixtures.
5. Re-open the evidence before writing each finding. Skip compiler-enforced cases, behavior
   covered by integration/e2e tests, and untested legacy code the change did not touch.
Per gap output:
### <title naming the gap>
- Changed surface / Impacted consumer: each with file:line
- Existing test evidence: what the test asserts (file:line), or the searches run and their result
- Missing verification: the exact absent assertion
- Demonstration: the regression that ships undetected, and why the tests read would not fail
- Disposition: patch (name the test to add, in the repo's style) or defer (one sentence why)
Real defects noticed on the way go under "## Other findings" (description only).
Nothing found: output exactly "No verification gaps found."
```

### C. Adversarial (blind)

```
Review CONTENT adversarially: the unified diff at <DIFF_FILE>. You get no other context, on purpose.
Assume it is broken and prove it. Look for what is missing, not only what is wrong.
Floor: N = min(floor(sqrt(diff size in kB) + 1), 10). State the arithmetic, then find at least N
issues. Zero findings: re-check and keep thinking. Empty content: say so and stop.
Each finding: file:line, the problem in one line, the concrete fix, what goes wrong if it ships.
Markdown list only, no severity or ranking.
```

### D. Intent Alignment (only with an intent)

```
You audit intent alignment and know nothing about how this change was produced.
Verbatim intent: <INTENT TEXT>. The change: the unified diff at <DIFF_FILE>.
Be strictly descriptive; prescribe no extra work. Report: (1) the defensible readings of the intent;
(2) which one the diff implements; (3) where they diverge: the surface the intent's expectations live
on versus the surface the diff and its tests exercise.
```

### Quick (single reviewer)

```
Read <PLAN_FILE or "no plan"> (acceptance criteria, intent) and the agent instruction files
(AGENTS.md, CLAUDE.md) at the repo root and in directories the diff touches: those are the rules.
Then read the diff at <DIFF_FILE>. Report unmet acceptance criteria, broken rules and bugs: location,
what goes wrong, evidence from the surrounding code. Markdown list, no severity.
```

**Lens failure:** a lens that fails, times out or returns nothing usable is recorded as failed; continue with the rest. **No subagents:** write each lens prompt to a temp file with the diff, claims and plan inlined, ask the user to run each in a separate session (ideally another model) and paste back the findings, then continue.

## Step 3: Triage

1. **Normalize** all findings into one list: `id`, `source` (lens), `title`, `detail`, `location`.
2. **Verdict first**, only after every lens reported and before any deduplication. Ignore any severity a reviewer assigned; they lack the context to grade.
   - **Verification Gap findings arrive pre-verified** (that lens had to read the tests and run the searches it cites): render the verdict from the filed evidence and weigh its disposition when routing. Its "Other findings" are verified like the rest.
   - **Verify every other claim yourself.** At the cited location, does the bad outcome actually occur? Read past the changed lines (callers, upstream guards) until you can say yes or no. A different problem nearby does not settle it. Judge whether the problem is real, not whether the fix sounds plausible. Code that fails loudly on a situation nobody showed is reachable is correct behavior.
   - **Exactly one verdict** (the whole decision; no separate keep/dismiss):
     - `high` (intolerable), `medium` (tolerable), `low` (cosmetic or negligible): the bad outcome is real. Grade by harm to users or developers. For developer-only harm (eroded invariants, duplicated sources of truth) name where it bites: which caller diverges, which rule breaks. "This is messy" is not a grade. Unsure how bad: pick the higher grade.
     - `false`: you checked and it does not happen there. Write what disproves this specific claim.
     - `maybe-false`: the code genuinely leaves it open. Write what would settle it. Never use it when reading further would decide.
   - Every finding keeps its verdict and one or two sentences of evidence. Never drop, merge or skip one silently.
3. **Reject** `false` findings (on their refutation); `low` findings that are unlikely in everyday use AND whose fix adds complexity (guards, branches, parameters) rather than a direct correction or deletion; and any finding whose fix is editing the plan under review.
4. **Group survivors by shared root cause**: merge only when the same defect produced both, never just for the same location or same fix. A group carries every member's outcome, the highest verdict (`high` > `medium` > `low` > `maybe-false`), and sources joined with `+`.
5. **Route each entry into exactly one bucket** (by its highest verified verdict):
   - **decision_needed:** an ambiguous choice; it cannot be fixed correctly without the user's intent. Full mode only.
   - **patch:** fixable without the user; the fix is unambiguous, adds no public surface, and guards no state you have not shown reachable. Otherwise decision_needed.
   - **defer:** a real pre-existing issue the change did not cause; or an all-`maybe-false` entry that would be `medium`/`high` if true (note severity as unverified plus what would settle it; if only `low`, reject it with that note); or a fix that edits agent-context files (AGENTS.md, CLAUDE.md, rules, specs).
   - In no-plan mode, would-be decision_needed becomes patch (fix unambiguous) or defer.
6. Report failed lenses first. Nothing survives but a lens failed: warn the review may be incomplete. Nothing survives and nothing failed: "Clean review: all lenses passed."

## Step 4: Present and Act

1. Summary: `Code review complete. <D> decision_needed, <P> patch, <W> defer, <R> rejected.` Then decision_needed, patch and defer entries, then a **Rejected** appendix (one line each: `false` with its refutation, `low` with why it is not worth fixing).
2. **With a plan file**, write findings into it before offering actions: under `## Code Review` (create it at the end if absent) add `### <today's date>`, the summary line, then `- [ ] [Review][Decision] <title> — <detail>`, `- [ ] [Review][Patch] <title> [<file>:<line>]`, `- [x] [Review][Defer] <title> [<file>:<line>] — deferred: <reason or what would settle it>`, and the Rejected appendix. Never change the plan's status. Without a plan: "No plan was provided, so nothing was persisted."
3. **Resolve decision_needed first**, one at a time (batch related ones), via `question` with the concrete options. Each becomes patch, defer (ask for a one-line reason and record it) or rejected.
4. **Then patches**, via `question`: **Apply every patch** (no per-item confirmation, defer and decision items untouched, then summarize the changes and check them off in the plan), **Leave as action items** (only with a plan file), or **Walk through each** (detail, diff context and fix per item, then ask again).
5. Close with counts (decided, patched, deferred, rejected) and offer to re-run the review after fixes.

## Red Flags

- Reading one reviewer's output before all reviewers are launched
- Pasting the diff into prompts instead of passing the file path
- Showing the claims file to any lens but the Edge Case Hunter
- Copying a reviewer's severity instead of verifying the claim yourself
- `maybe-false` on a question that reading more code would answer
- A finding with no verdict, or in two buckets
- Applying patches before decision_needed items are resolved
- Announcing a clean review while a lens failed

_Adapted from BMAD-METHOD (MIT, © 2025 BMad Code, LLC)._
