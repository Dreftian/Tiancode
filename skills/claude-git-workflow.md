---
name: claude-git-workflow
description: Intelligent Git workflows and release management inspired by Claude Code Desktop. Enforces atomic commits, conventional semantic messages, branch hygiene, and clean PR descriptions.
tags: ["claude", "git", "workflow", "versioning", "releases"]
---

# Claude Git Workflow

Clean, disciplined Git version control and release automation.

## 🎯 Principles
- **Conventional Commits**: Format commit messages as `type(scope): summary` (feat, fix, refactor, docs, chore).
- **Atomic Commits**: Each commit represents one logical change that passes tests and typechecks independently.
- **Clean Branching**: Use short 2-3 word kebab-case branch names without redundant prefixes (e.g. `session-recovery`).
- **Conflict Resolution**: Systematically resolve merge/rebase conflicts with full test verification before completion.
