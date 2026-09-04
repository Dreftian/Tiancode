---
name: claude-code-review
description: Exhaustive code review and quality auditor in the style of Claude Code Desktop. Analyzes regressions, logic pitfalls, edge cases, type integrity, and idiomatic maintainability.
tags: ["claude", "review", "code-quality", "audit", "best-practices"]
---

# Claude Code Review

Rigorous, actionable code reviews focusing on correctness, edge case handling, performance regressions, and clean architecture.

## 🎯 Key Review Principles
- **Root Cause & Intent**: Evaluate changes against the intended goal, not just cosmetic style.
- **Edge Cases & Failure Modes**: Inspect null/undefined safety, off-by-one errors, async race conditions, and error recovery.
- **Performance & Allocation**: Identify unnecessary allocations, blocking loops, redundant network calls, and memory leaks.
- **Security & Validation**: Ensure all user inputs are validated, outputs escaped, and secrets protected.
- **Constructive Recommendations**: Suggest concrete, drop-in replacement code rather than vague critiques.
