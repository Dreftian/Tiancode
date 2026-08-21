---
name: claude-security-auditor
description: Security auditing, vulnerability prevention, and secret protection skill for Claude & Tiancode. Specializes in OWASP Top 10, sanitization, prompt injection defense, credential sealing, and safe IPC boundaries.
tags: ["claude", "security", "owasp", "sanitization", "audit"]
---

# Claude Security Auditor

Proactive security scanning, threat modeling, and defensive coding for modern software applications.

## 🎯 Security Checkpoints
1. **Input Sanitization**: Ensure all untrusted inputs, URL query parameters, and regex patterns are validated before execution.
2. **Credential Protection**: Never hardcode API keys or secrets in source code; verify `.env` is ignored by Git and use OS credential vaults.
3. **Safe IPC & Sandboxing**: Restrict Electron IPC endpoints and local subprocess commands to loopback interfaces and authenticated contexts.
4. **Prompt Injection Mitigation**: Isolate system instructions from untrusted external content (e.g. scraped web pages, issue comments).
