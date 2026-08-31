---
name: "typescript-strict-patterns"
description: "Patrones avanzados de tipado estricto en TypeScript 5+: branded types, discriminated unions, narrowing exhaustivo y cero any."
---

# TypeScript Strict Engineering & Type Safety Patterns

## Propósito
Garantizar máxima robustez y prevención de errores en tiempo de compilación utilizando sistemas de tipos algebraicos y tipado estricto en TypeScript 5+.

## Principios Fundamentales
1. **Zero `any` Policy**:
   - Sustituye cualquier uso de `any` por `unknown`, generics o tipos discriminados.
   - Aplica type guards (`value is Type`) y aserciones seguras (`asserts value`).

2. **Discriminated Unions & Exhaustiveness**:
   - Modela estados mutuamente excluyentes con un campo discriminador literal (`type: "success" | "error"`).
   - Valida comprobaciones exhaustivas en `switch` mediante función de aserción `never`:
     ```ts
     function assertNever(x: never): never {
       throw new Error(`Unhandled case: ${JSON.stringify(x)}`)
     }
     ```

3. **Branded / Nominal Types**:
   - Protege identificadores primitivos para evitar confusiones de parámetros (ej. `UserId` vs `ProjectId`):
     ```ts
     type Brand<K, T> = K & { readonly __brand: T }
     type UserId = Brand<string, "UserId">
     type ProjectId = Brand<string, "ProjectId">
     ```
