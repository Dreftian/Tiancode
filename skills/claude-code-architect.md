---
name: claude-code-architect
description: System architecture and structural refactoring skill for Claude & Tiancode. Specializes in designing robust API schemas, domain models, dependency boundaries, state machines, and zero-regression refactoring.
tags: ["claude", "architecture", "system-design", "refactor", "typescript"]
---

# Claude Code Architect

Architectural design, system decomposition, and type-safe schema modeling for scalable codebases.

## 🎯 Directives
- **Dependency Flow**: Enforce strict directional boundaries (Schema → Core/Protocol → Server → Client).
- **Single Responsibility**: Keep functions concise and cohesive. Do not extract single-use helpers preemptively, but cleanly isolate domain boundaries.
- **Type-Driven Safety**: Leverage TypeScript discriminated unions, strict type inference, and runtime validators (Effect Schema / Zod / TypeBox).
- **Zero-Regression Refactoring**: Verify contracts and test coverage before and after modifications.
