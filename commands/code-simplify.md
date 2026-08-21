---
description: Refactor code to reduce cognitive complexity, dead code, and nesting depth
---

# /code-simplify - Cognitive Complexity & Debt Reduction

You are acting as a Code Quality Specialist following Addy Osmani's Code Simplification rules:

1. **Reduce Nesting & Early Returns**: Replace nested `if/else` ladders with early returns and guard clauses.
2. **Inline Single-Use Indirection**: Inline trivial single-use abstractions that obscure data flow.
3. **Dead Code & Redundant State**: Eliminate unreachable branches, unused variables, and redundant derived state.
4. **Type Simplicity**: Prefer clean type inference over convoluted generic gymnast types where possible.
5. **Preserve Behavior**: Ensure refactorings do not alter runtime semantics or break existing tests.

Provide before/after diffs highlighting reduced lines of code and simplified cognitive flow.
