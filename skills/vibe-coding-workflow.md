---
name: vibe-coding-workflow
description: Metodología estructurada de 3 fases para desarrollo ágil y seguro de aplicaciones full-stack asistido por IA (estilo Lovable Vibe Coding).
tags: ["vibe-coding", "lovable", "fullstack", "architecture", "planning", "workflow"]
---

# Metodología de Vibe Coding Disciplinado (Estilo Lovable)

Esta habilidad define el protocolo de ingeniería en 3 fases para concebir, construir, desplegar y depurar aplicaciones web completas sin degradar la base de código ni provocar alucinaciones de backend.

---

## 🚀 Las 3 Fases del Flujo

### Fase 1: Planificación de Contratos y Esquema (Plan-First)
Antes de generar vistas o código reactivo masivo, define los cimientos:
1. **Modelo de Datos**: Tablas, tipos, claves foráneas y políticas de seguridad (RLS o auth middleware).
2. **Rutas y Vistas**: Lista explícita de URLs y estados esperados (`loading`, `empty`, `error`, `success`).
3. **Contratos de API**: Tipos de entrada y salida fuertemente tipados (Zod, Effect Schema o TypeScript interfaces).
4. **Decisiones de Autenticación**: Roles permitidos, sesiones públicas vs. protegidas.

### Fase 2: Implementación Modular Incremental (Build-Safe)
1. **Unidad Atómica por Iteración**: Implementa un endpoint o componente a la vez; nunca reescribas archivos gigantes de golpe.
2. **Tipado Estricto**: Todo dato externo que ingrese a la app debe validarse con esquemas. Cero tipos `any`.
3. **Componentes Puros y Desacoplados**: Separa lógica de negocio (hooks/actions) de la presentación visual (componentes JSX/TSX).
4. **Manejo Defensivo de Errores**: Todo llamado a base de datos o API debe contemplar fallback visual y mensajes comprensibles para el usuario.

### Fase 3: Verificación Visual, Resiliencia y Polish (Verification)
1. **Auditoría de Estados Límite**: Valida qué sucede cuando la lista está vacía, la red falla o el payload es inesperado.
2. **Consistencia de UI**: Contrasta que la nueva vista cumpla rigurosamente con los tokens de `DESIGN.md`.
3. **Chequeo de Tipos y Compilación**: Ejecuta `typecheck` y el comando de build antes de dar la tarea por concluida.

---

## 💡 Patrones de Prompting para Vibe Coding

Cuando instruyas al agente o actúes como orquestador:
- **Específico en comportamiento, flexible en implementación**: Declara qué debe ver y poder hacer el usuario, no solo "hazlo bonito".
- **Contexto incremental**: Si vas a modificar una pantalla existente, menciona únicamente los archivos involucrados para preservar la ventana de contexto.
- **Evitar re-generaciones destructivas**: Pide ediciones quirúrgicas sobre bloques específicos en lugar de sobrescribir archivos completos sin necesidad.
