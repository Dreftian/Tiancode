# Full-Stack Next.js & Modern CSS/Tailwind Architecture

Guidelines for building production-grade full-stack web applications with Next.js (App Router), React Server Components, Server Actions, and clean, responsive UI without anti-pattern clichés.

## Core Rules
1. **Server vs. Client Components**:
   - Default to Server Components (`async function Component()`).
   - Add `"use client"` only for components with state, effects, or browser event listeners.
2. **Data Fetching & Mutations**:
   - Perform mutations via Server Actions (`"use server"`) with validation (Zod/Effect Schema).
   - Revalidate cached data explicitly with `revalidatePath` or `revalidateTag`.
3. **Design System & Styling**:
   - Follow functional design tokens (HSL or modern CSS variables).
   - Never use cliché anti-patterns (no gratuitous gradients, no dark purple themes without reason, no bloated pill badges).
