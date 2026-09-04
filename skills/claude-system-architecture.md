---
name: claude-system-architecture
description: High-level system architecture, modular design, and service decomposition guided by Anthropic Claude principles. Designs extensible boundaries and contracts.
tags: ["claude", "system-design", "architecture", "modularity"]
---

# Claude System Architecture

Scalable system design, service contracts, and robust modular decomposition.

## 🎯 Guidelines
- **Deep Modules**: Design interfaces that hide implementation complexity behind clear, expressive abstractions.
- **Strict Data Flow**: Enforce unidirectional dependencies; avoid circular relationships between packages.
- **Resilience**: Design for network timeouts, retry policies with exponential backoff, and graceful degradation.
- **Clarity over Abstraction**: Avoid speculative abstractions; favor simple, composable primitives.
