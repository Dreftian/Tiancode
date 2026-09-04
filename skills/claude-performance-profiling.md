---
name: claude-performance-profiling
description: Extreme performance analysis and profiling: identifying CPU bottlenecks, memory leaks, rendering layout thrashing, and bundle bloat.
tags: ["claude", "performance", "profiling", "optimization", "memory"]
---

# Claude Performance Profiling

High-throughput, low-latency optimization for frontend, backend, and desktop runtimes.

## 🎯 Key Focus Areas
- **Paint & Layout Containment**: Eliminate DOM reflows, enforce CSS `contain: paint layout`, and leverage GPU composite layers.
- **Zero-Copy & Streaming**: Stream large binary buffers (audio, IPC, files) without intermediate string conversions.
- **Memory Footprint**: Prevent detached DOM trees, retain event listener cleanups on unmount, and monitor heap usage.
- **Startup Latency**: Defer heavy modules with dynamic imports to ensure sub-second application launch.
