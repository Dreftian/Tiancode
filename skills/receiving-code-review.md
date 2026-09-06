---
name: receiving-code-review
description: Technical evaluation and verification of code review feedback. Enforces understanding before implementing, technical correctness over performative agreement, and YAGNI checks.
tags: ["code-review", "quality", "verification", "refactoring"]
---

# Receiving Code Review

Code review requires rigorous technical evaluation, not emotional performance or blind acquiescence.

**Core Principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

---

## Response Protocol

1. **Read Completely**: Parse all reviewer feedback without reacting or jumping to code changes immediately.
2. **Understand Requirements**: Restate technical requirements in your own words. If any item is ambiguous, stop and clarify before implementing anything.
3. **Verify Against Codebase Reality**: Check whether suggestions are compatible with current architecture, runtime constraints, and performance requirements.
4. **Evaluate Pragmatically (YAGNI)**: If a reviewer suggests expanding an interface or adding speculative "enterprise" features, inspect actual usages. If unused, question the necessity with technical reasoning.
5. **Implement Systematically**: Apply approved changes one item at a time, testing each independently.

---

## Forbidden Responses
- **Never performative agreement**: Avoid empty phrases like "You're completely right!", "Great suggestion!", or "I will fix that right away".
- **Action over talk**: Restate the technical solution, discuss trade-offs if applicable, and present the concrete diff and test results.
