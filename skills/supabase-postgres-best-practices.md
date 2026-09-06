---
name: supabase-postgres-best-practices
description: Production best practices for Supabase, PostgreSQL, Row Level Security (RLS), Edge Functions, database migrations, connection pooling (Supavisor), and real-time subscriptions.
tags: ["supabase", "postgres", "database", "rls", "sql", "migrations"]
---

# Supabase & PostgreSQL Best Practices

Production architectural patterns and security standards for building applications on Supabase and PostgreSQL.

## 1. Row Level Security (RLS) & Policies

Always enable RLS on every table containing user or tenant data:

```sql
-- Enable RLS
alter table public.profiles enable row level security;

-- Strict policy: users can only read their own profile
create policy "Users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

-- Strict policy: users can update own profile
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

### Performance Pitfalls in RLS:
- **Wrap `auth.uid()` in parentheses `(select auth.uid())`**: This prevents PostgreSQL from re-evaluating `auth.uid()` for every row scanned, turning an $O(N)$ function evaluation into an init-plan evaluation.
- **Index foreign keys used in RLS policies**: Ensure columns like `user_id` or `tenant_id` have indexes:
  ```sql
  create index idx_profiles_user_id on public.profiles (user_id);
  ```

---

## 2. Connection Pooling & Transactions

- **Direct Connection (Port 5432)**: Use only for long-running migrations and schema updates.
- **Supavisor Transaction Pooler (Port 6543)**: Use for serverless functions, Edge Functions, Next.js API routes, and containerized backends. Set connection limit to 1 per serverless instance.
- **Disable Prepared Statements in Transaction Mode**: When using Drizzle or Prisma with transaction poolers, disable prepared statements or set `prepare: false` to prevent protocol mismatch errors.

---

## 3. Database Migrations

- Keep migrations versioned, atomic, and idempotent:
  ```bash
  supabase migration new <migration_name>
  supabase db reset # local testing
  ```
- Never perform destructive schema changes in a single step. Use expand/contract:
  1. Add new column (nullable or with default).
  2. Write dual-write application logic.
  3. Backfill data in chunks.
  4. Switch reads to new column.
  5. Remove old column in subsequent release.

---

## 4. Edge Functions & TypeScript Client

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/supabase'

// Edge-safe client initialization
export const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)
```
