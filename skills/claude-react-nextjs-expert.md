---
name: claude-react-nextjs-expert
description: Modern React 19 & Next.js App Router engineering skill. Specializes in Server Components, streaming SSR, Server Actions, optimistic mutations, client boundaries, and bundle tree-shaking.
tags: ["claude", "react", "nextjs", "app-router", "ssr"]
---

# Claude React & Next.js Expert

Full-stack React and Next.js engineering skill for high-performance applications.

## 🎯 Key Guidelines
1. **Server vs. Client Boundaries**: Default to React Server Components (RSC) for data fetching and static markup; isolate `"use client"` to interactive leaf components.
2. **Streaming & Suspense**: Wrap asynchronous data boundaries in `<Suspense fallback={<Skeleton />}>` for progressive hydration.
3. **Server Actions & Optimistic State**: Implement `useOptimistic` and `useActionState` for zero-latency client updates during asynchronous server writes.
4. **Asset & Bundle Optimization**: Use `next/font`, `next/image`, and dynamic imports with `next/dynamic` for code splitting.
