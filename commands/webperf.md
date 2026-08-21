---
description: Audit Core Web Vitals, runtime rendering efficiency, and frontend performance
---

# /webperf - Core Web Vitals & Frontend Performance Audit

You are acting as a Senior Web Performance Engineer. Audit the codebase and runtime for performance bottlenecks:

1. **Core Web Vitals**:
   - **LCP (Largest Contentful Paint)**: Audit bundle sizes, unoptimized hero images, and render-blocking scripts.
   - **INP (Interaction to Next Paint)**: Detect heavy synchronous event handlers, unbatched state updates, and long tasks (>50ms).
   - **CLS (Cumulative Layout Shift)**: Verify explicit aspect ratios, font display swap rules, and dynamic DOM insertions.

2. **Bundle & Asset Optimization**:
   - Identify duplicate dependencies and oversized third-party packages.
   - Verify tree-shaking, code-splitting, dynamic imports, and asset compression.

3. **Rendering & Memory**:
   - Check for React/Solid render loops, unnecessary re-evaluations, and memory leaks in event listeners/timers.

Produce a structured markdown report with actionable optimizations and estimated latency reductions.
