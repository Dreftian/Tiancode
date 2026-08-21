# Database Schema Design & Migrations with Drizzle ORM

Defines schemas, relationships, queries, and zero-downtime migration strategies across SQLite, LibSQL, and PostgreSQL using Drizzle ORM.

## Conventions
1. **Snake Case Column Names**: Define fields in snake_case to match SQL tables cleanly:
   ```ts
   export const users = sqliteTable("users", {
     id: text().primaryKey(),
     email: text().notNull().unique(),
     created_at: integer().notNull(),
   })
   ```
2. **Type Safety & Relations**:
   - Use `createInsertSchema` and `createSelectSchema` for validation.
   - Use relational queries `db.query.users.findMany(...)` for typed eager loads.
3. **Migrations**:
   - Generate SQL diffs with `drizzle-kit generate`.
   - Apply migrations via migration runners at server startup before accepting traffic.
