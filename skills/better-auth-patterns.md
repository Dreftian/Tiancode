---
name: better-auth-patterns
description: Architecture and security patterns for Better Auth in TypeScript/Node/Bun: multi-tenant sessions, OAuth2 providers, two-factor auth (2FA), passkeys/WebAuthn, email OTP, and database schema migrations.
tags: ["auth", "better-auth", "security", "oauth", "sessions", "passkeys"]
---

# Better Auth Integration Patterns

Comprehensive implementation guide for integrating [Better Auth](https://www.better-auth.com/) into modern TypeScript and fullstack applications.

## 1. Server Configuration (`auth.ts`)

```typescript
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db"
import * as schema from "./db/schema"
import { passkey } from "better-auth/plugins/passkey"
import { twoFactor } from "better-auth/plugins/two-factor"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite", // or "pg", "mysql"
    schema: {
      ...schema,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    passkey(),
    twoFactor({
      issuer: "Tiancode App",
    }),
  ],
})
```

---

## 2. Universal Client Initialization (`auth-client.ts`)

```typescript
import { createAuthClient } from "better-auth/client"
import { passkeyClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [
    passkeyClient(),
  ],
})

export const { signIn, signUp, signOut, useSession } = authClient
```

---

## 3. Session Middleware & Route Protection

In API routes or Next.js / Astro / Hono endpoints:

```typescript
import { auth } from "./auth"
import { headers } from "next/headers"

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) return null
  return session.user
}
```

---

## 4. Best Practices Checklist
- Set secure HTTP-only cookie options in production.
- Use rate-limiting on all authentication endpoints (`/sign-in`, `/sign-up`, `/forgot-password`).
- Store hashed passwords using Argon2id or Scrypt (handled automatically by Better Auth).
- Rotate session tokens on permission changes or credential updates.
