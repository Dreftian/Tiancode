---
name: cloudflare-workers-best-practices
description: Production patterns for Cloudflare Workers, Pages, Durable Objects, D1 SQL databases, KV, R2 object storage, Hyperdrive connection pooling, and Hono routing.
tags: ["cloudflare", "workers", "serverless", "edge", "d1", "r2", "hono"]
---

# Cloudflare Workers Best Practices

Engineering guide for building ultra-low latency, globally distributed serverless services using Cloudflare Workers, Hono, D1, KV, and R2.

## 1. Application Routing with Hono

Prefer [Hono](https://hono.dev) for type-safe routing on Cloudflare Workers:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  KV: KVNamespace
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

export default app
```

---

## 2. Storage Selection Matrix

- **Cloudflare KV**: High read-to-write ratio (100:1+), globally cached, eventually consistent (up to 60s propagation). Ideal for configuration, feature flags, and token caches.
- **Cloudflare D1**: Serverless SQLite at the edge. Read-replicated globally with single-leader writes. Ideal for relational metadata, user state, and auth.
  - Always use parameterized queries: `c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()`
- **Cloudflare R2**: Zero-egress S3-compatible blob storage. Best for media assets, file uploads, backups, and user-generated content.
- **Durable Objects**: Strongly consistent in-memory coordination, actor model, and local WebSockets. Ideal for real-time collaboration, chat rooms, and multiplayer synchronization.
- **Hyperdrive**: Zero-latency pooling and accelerated TCP routing to external PostgreSQL databases (Neon, Supabase, AWS RDS).

---

## 3. Wrangler Configuration (`wrangler.jsonc`)

```jsonc
{
  "name": "my-edge-service",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "prod-db",
      "database_id": "xxxx-xxxx-xxxx"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "prod-assets"
    }
  ]
}
```

---

## 4. Edge Reliability & Error Boundaries

- Never rely on long-running unbuffered connections without heartbeats.
- Use `ctx.waitUntil(promise)` to offload non-blocking telemetry, analytics, or cache priming without delaying the user's HTTP response.
- Wrap external fetches with explicit timeout signals:
  ```typescript
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(targetUrl, { signal: controller.signal })
    return await res.json()
  } finally {
    clearTimeout(timeoutId)
  }
  ```
