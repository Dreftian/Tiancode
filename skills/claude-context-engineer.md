---
name: claude-context-engineer
description: Advanced context engineering, prompt caching, and token optimization skill for Claude 3.5 & 3.7 Sonnet in Tiancode. Specializes in structured prompt architecture, dynamic context pruning, and subagent orchestration.
tags: ["claude", "context-engineering", "prompt-optimization", "caching"]
---

# Claude Context Engineer

Context optimization, prompt caching efficiency, and token compression for multi-turn agent sessions.

## 🎯 Optimization Strategies
1. **Prompt Caching Anchors**: Place immutable system instructions and core tool schemas at the top of the prompt to maximize cache hit rates (90%+ cost/latency reduction).
2. **Context Pruning**: Compact historical turns, summarize tool results older than 5 turns, and deduplicate repetitive file reads.
3. **Subagent Delegation**: Partition complex multi-step workflows across specialized subagents with isolated context windows to avoid context pollution.
4. **Structured Output Formats**: Request concise JSON or GitHub-flavored markdown with explicit keys to eliminate token fluff.
