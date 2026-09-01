---
name: fullstack-nextjs-tailwind
description: Arquitectura y desarrollo fullstack moderno con Next.js 15+ (App Router), React Server Components (RSC), Server Actions y Tailwind CSS v4.
tags: ["nextjs", "react", "tailwind", "rsc", "server-actions", "fullstack"]
---

# Full-Stack Next.js 15+ & Modern Tailwind Architecture

Directrices para diseñar y construir aplicaciones web completas, escalables y de alto rendimiento utilizando Next.js 15+ (App Router), React Server Components, Server Actions y Tailwind CSS v4 siguiendo las mejores prácticas de la industria.

---

## 🏛️ 1. Arquitectura de Componentes (RSC vs Client)

- **Servidor por Defecto**: Todo componente dentro del directorio `app/` es un Server Component (`async function`) por defecto. Obtén datos directamente en el componente sin hooks como `useEffect` o librerías de fetching adicionales.
- **Hojas de Cliente Quirúrgicas (`"use client"`)**: Empuja la directiva `"use client"` a las hojas más bajas del árbol de componentes (ej. botones interactivos, formularios con estado o modales).
- **Composición Híbrida**: Pasa Server Components como `children` a Client Components para preservar el renderizado del servidor y reducir el bundle de JavaScript en el navegador.

---

## ⚡ 2. Mutaciones con Server Actions

- **Archivos Dedicados**: Agrupa mutaciones en archivos con `"use server"` (ej. `app/actions/users.ts`).
- **Validación Fuerte**: Valida todos los argumentos recibidos utilizando Zod, Valibot o Effect Schema antes de ejecutar consultas en base de datos.
- **Manejo de Estados en UI**: Usa `useActionState` para gestionar el ciclo de vida del formulario y `useOptimistic` para retroalimentación instantánea al usuario.
- **Revalidación Quirúrgica**: Invoca `revalidatePath` o `revalidateTag` inmediatamente después de mutaciones exitosas para sincronizar el caché del servidor.

---

## 🎨 3. Estilizado con Tailwind CSS v4 y DESIGN.md

- **Tokens Funcionales `@theme`**: Define la paleta de colores, radios y fuentes de `DESIGN.md` en el bloque `@theme` de tu CSS principal (`app/globals.css`).
- **Cero Clichés Visuales**: Evita gradientes estridentes innecesarios, fondos violetas sin justificación o tarjetas sobrecargadas. Prioriza fondos neutros oscuros/claros, bordes sutiles y tipografía legible.
- **Micro-Interacciones Accesibles**: Todo elemento interactivo debe incluir transiciones suaves (`transition-colors duration-150`), estados activos táctiles (`active:scale-[0.98]`) y focos accesibles (`focus-visible:ring-2`).

---

## 🛡️ 4. Streaming y Resiliencia de Carga

- **Streaming Progresivo**: Envuelve componentes lentos o que dependan de APIs externas en `<Suspense fallback={<Skeleton />}>`.
- **Límites de Error**: Implementa `error.tsx` en los segmentos de ruta críticos para aislar fallos sin romper toda la aplicación.
