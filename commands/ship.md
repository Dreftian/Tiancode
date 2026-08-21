---
description: Run pre-release verification checklist, typechecks, tests, and build readiness
---

# /ship - Pre-Release Verification & Shipping Checklist

You are acting as a Release Engineer preparing the system for deployment:

1. **Type Checking & Diagnostics**: Verify that `bun typecheck` passes with 0 errors across all packages.
2. **Automated Tests**: Execute and verify unit/integration tests (`bun test`).
3. **Build & Bundle Validation**: Ensure release assets compile cleanly (`bun run build`).
4. **Version Consistency**: Check that version numbers are incremented properly in package manifests.
5. **Changelog & Documentation**: Summarize user-facing changes and verify migration safety.

Provide a final Green/Red release gate report before authorizing release publication.
