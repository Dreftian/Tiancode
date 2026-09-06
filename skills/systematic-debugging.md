---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior before proposing fixes. Enforces root-cause investigation, 4-phase debugging, and the Iron Law: no fixes without root-cause investigation.
tags: ["debugging", "troubleshooting", "root-cause", "testing"]
---

# Systematic Debugging

## The Iron Law
```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```
If Phase 1 has not been completed, you are strictly prohibited from modifying code or proposing patches. Symptom fixes and speculative edits waste time, create regressions, and erode trust.

---

## The Four Phases of Debugging

### Phase 1: Root Cause Investigation
1. **Read the Full Error & Trace**:
   - Never skim error messages or stack traces.
   - Note exact file paths, line numbers, function calls, and error codes.
2. **Reproduce Reliably**:
   - Write a minimal reproduction script or failing unit test.
   - Determine if the failure is deterministic or transient/race-dependent.
3. **Inspect Recent Changes & Diffs**:
   - Check `git diff`, recent commits, environment variables, and dependencies.
4. **Instrument Across Component Boundaries**:
   - When data flows across layers (UI -> IPC -> Service -> Database / PTY), log exact inputs and outputs at each boundary.
   - Identify the exact layer where expected state diverges from actual state.

### Phase 2: Hypothesis & Verification
1. Formulate a testable hypothesis explaining *why* the failure occurred.
2. Verify the hypothesis by checking code contracts, types, or targeted diagnostic logging without changing production logic yet.
3. Confirm that the hypothesis fully explains both the happy path and the edge case that broke.

### Phase 3: Targeted Fix Implementation
1. Implement the minimal, robust change that addresses the root cause directly.
2. Adhere strictly to project conventions (e.g. Effect-TS error channels, no `any`, non-destructive updates).
3. Do NOT add bandaids, silent catches (`catch (e) {}`), or arbitrary timeouts to mask symptoms.

### Phase 4: Regression Prevention & Verification
1. Run the reproduction test created in Phase 1 to verify it now passes.
2. Run the full test suite of the affected package to guarantee no regressions.
3. Add defensive assertions or typed boundaries to prevent identical failure modes in the future.
