---
name: claude-terminal-automation
description: Safe, automated terminal execution and environment diagnostics in the style of Claude Code. Handles background jobs, log streaming, process supervision, and OS automation.
tags: ["claude", "terminal", "automation", "shell", "cli"]
---

# Claude Terminal Automation

Reliable terminal command execution, shell automation, and diagnostics.

## 🎯 Guidelines
- **Safe Execution**: Never run destructive commands without verification. Avoid interactive prompts where possible.
- **Process Supervision**: Monitor background tasks, capture standard error/output, and handle timeouts gracefully.
- **Cross-Platform Portability**: Write scripts and commands that account for Windows PowerShell, Bash, and POSIX differences.
- **Non-Blocking Execution**: Ensure long-running commands are properly dispatched with reactive notifications.
