---
name: database-drizzle-sqlite-pg
description: Modelado de esquemas relacionales, consultas fuertemente tipadas y migraciones seguras sin tiempo de inactividad con Drizzle ORM en SQLite, LibSQL y PostgreSQL.
tags: ["database", "drizzle", "sqlite", "postgres", "migrations", "orm", "schema"]
---

# Database Schema Design & Migrations with Drizzle ORM

Directrices técnicas completas para diseñar bases de datos relacionales, crear esquemas tipados, ejecutar consultas de alto rendimiento y gestionar migraciones seguras y reproducibles utilizando Drizzle ORM en entornos SQLite, LibSQL/Turso y PostgreSQL.

---

## 🎯 Cuándo Usar (Trigger Conditions)

- Creación, modificación o refactorización de tablas y entidades de base de datos relacionales.
- Configuración de clientes Drizzle (`drizzle-orm/better-sqlite3`, `drizzle-orm/libsql`, `drizzle-orm/node-postgres` o `@effect/sql-sqlite-bun`).
- Definición de relaciones 1-a-1, 1-a-Muchos y Muchos-a-Muchos con Drizzle Relations.
- Generación y ejecución de migraciones automáticas mediante `drizzle-kit`.
- Validación de entradas y salidas en endpoints mediante integración de esquemas con Zod, Valibot o Effect Schema (`drizzle-zod` / `drizzle-typebox`).
- Optimización de consultas SQL, creación de índices compuestos y transacciones ACID atómicas.

---

## 🤖 Directivas para el Agente (Agent Guidelines)

1. **Snake Case Estricto en Columnas y Nombres de Tablas**:
   - Define los nombres de columnas en `snake_case` para coincidir naturalmente con SQL sin mapeos manuales de cadenas repetitivas:
     ```ts
     // Correcto
     export const users = sqliteTable("users", {
       id: text().primaryKey(),
       email: text().notNull().unique(),
       avatar_url: text(),
       created_at: integer({ mode: "timestamp" }).notNull(),
       updated_at: integer({ mode: "timestamp" }).notNull(),
     })

     // Incorrecto
     export const users = sqliteTable("users", {
       id: text("id").primaryKey(),
       email: text("email_address"),
       createdAt: integer("created_at"),
     })
     ```
2. **Cero `any` o Tipos Implícitos**:
   - Extrae los tipos inferidos de selección e inserción con `typeof table.$inferSelect` y `typeof table.$inferInsert`.
3. **Migraciones No Destructivas (Zero-Downtime)**:
   - Toda nueva columna obligatoria (`notNull()`) debe tener un valor por defecto (`default(...)`) para no fallar sobre filas existentes.
   - Para renombrar columnas, utiliza una estrategia en dos pasos: añade la nueva columna, migra datos y elimina la antigua en una versión posterior.
4. **Relaciones Tipadas**:
   - Declara siempre las relaciones utilizando la API `relations(table, ({ one, many }) => ...)` para habilitar el motor relacional `db.query.*`.

---

## 🛠️ Herramientas y Comandos CLI (drizzle-kit)

```bash
# Generar archivos de migración SQL analizando cambios en el esquema TypeScript
bunx drizzle-kit generate

# Aplicar migraciones directamente al entorno de desarrollo (prototipado rápido)
bunx drizzle-kit push

# Abrir el panel interactivo Drizzle Studio para explorar y editar registros
bunx drizzle-kit studio

# Comprobar la coherencia de migraciones y prevenir desincronizaciones
bunx drizzle-kit check
```

---

## 📐 Modelado de Esquemas

### 1. SQLite / LibSQL (`drizzle-orm/sqlite-core`)

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"

export const sessions = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    project_id: text().notNull(),
    title: text().notNull(),
    directory: text().notNull(),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (table) => [
    index("session_project_id_idx").on(table.project_id),
    index("session_updated_at_idx").on(table.updated_at),
  ],
)

export const messages = sqliteTable(
  "message",
  {
    id: text().primaryKey(),
    session_id: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text({ enum: ["user", "assistant", "system"] }).notNull(),
    content: text().notNull(),
    created_at: integer().notNull(),
  },
  (table) => [index("message_session_id_idx").on(table.session_id)],
)

export const sessionRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
}))

export const messageRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.session_id],
    references: [sessions.id],
  }),
}))
```

### 2. PostgreSQL (`drizzle-orm/pg-core`)

```ts
import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core"

export const organizations = pgTable("organizations", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
})
```

---

## 🔍 Consultas Relacionales Tipadas (Drizzle Queries)

Utiliza el motor de consultas relacionales para lecturas estructuradas con carga ansiosa (*eager loading*):

```ts
// Obtener una sesión con sus últimos 50 mensajes asociados
const sessionWithMessages = await db.query.sessions.findFirst({
  where: (sessions, { eq }) => eq(sessions.id, sessionID),
  with: {
    messages: {
      limit: 50,
      orderBy: (messages, { asc }) => [asc(messages.created_at)],
    },
  },
})

// Búsqueda con filtros compuestos
const activeSessions = await db.query.sessions.findMany({
  where: (sessions, { eq, gt, and }) =>
    and(
      eq(sessions.project_id, projectID),
      gt(sessions.updated_at, Date.now() - 7 * 24 * 60 * 60 * 1000),
    ),
  orderBy: (sessions, { desc }) => [desc(sessions.updated_at)],
})
```

---

## ⚡ Transacciones Atómicas

Envuelve cualquier mutación multi-tabla en `db.transaction(...)` para garantizar atomicidad e integridad referencial:

```ts
await db.transaction(async (tx) => {
  await tx.insert(sessions).values({
    id: newSessionId,
    project_id: projectId,
    title: "Nueva Sesión",
    directory: "/workspace",
    created_at: Date.now(),
    updated_at: Date.now(),
  })

  await tx.insert(messages).values({
    id: initialMessageId,
    session_id: newSessionId,
    role: "system",
    content: "Sesión inicializada con contexto de agente.",
    created_at: Date.now(),
  })
})
```

---

## 🛡️ Checklist de Verificación para Base de Datos
- [ ] ¿Los nombres de las columnas están en `snake_case` nativo?
- [ ] ¿Las claves foráneas incluyen cláusula de eliminación (`onDelete: "cascade"` o `"restrict"`)?
- [ ] ¿Existen índices explícitos en columnas utilizadas comúnmente en cláusulas `WHERE`, `JOIN` y `ORDER BY`?
- [ ] ¿Toda migración nueva ha sido probada hacia adelante y con datos precargados?
