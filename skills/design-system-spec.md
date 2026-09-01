---
name: design-system-spec
description: Especificación canónica y auditoría de sistemas de diseño DESIGN.md (estándar Rico UI). Diseña tokens semánticos, paletas de colores, escalas tipográficas y contratos de componentes accesibles.
tags: ["design-system", "design-md", "ricoui", "ui-ux", "tailwind", "tokens"]
---

# Especificación y Auditoría de Sistemas de Diseño (DESIGN.md)

Estándar canónico para definir, auditar y generar especificaciones completas de sistemas de diseño en el archivo `DESIGN.md`. Garantiza que cualquier aplicación creada o modificada por Tiancode mantenga una identidad visual consistente, moderna y libre de inconsistencias o anti-patrones.

## 🎯 Principios del Estándar DESIGN.md
1. **Local-First & Declarativo**: `DESIGN.md` es la fuente única de verdad para estilos, tokens y componentes en el repositorio.
2. **Tokens Semánticos**: Los colores y tamaños no se definen con valores mágicos aislados, sino con variables semánticas (fondo base, superficie elevada, borde tenue, acento interactivo).
3. **Escala Armónica de 4px / 8px**: Todo padding, margin, gap y dimensionamiento debe ser múltiplo de 4px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64px).
4. **Accesibilidad Obligatoria**: Contraste mínimo WCAG AA (4.5:1 para texto normal, 3:1 para texto grande/elementos interactivos) y anillos de foco visibles (`focus-visible:ring-2`).

---

## 📐 Estructura Canónica de `DESIGN.md`

Todo archivo `DESIGN.md` en la raíz de un proyecto debe estructurarse de la siguiente manera:

```markdown
# [Nombre del Proyecto] — Design System Specification

## 1. Brand & Palette Tokens
- **Background Base**: hsl(220, 15%, 8%) / #0e1117 (Dark) | hsl(0, 0%, 100%) / #ffffff (Light)
- **Surface Elevation (Cards, Modals)**:
  - Layer 1: hsl(220, 14%, 12%)
  - Layer 2: hsl(220, 13%, 16%)
- **Borders & Dividers**:
  - Subtle: hsl(220, 13%, 18%)
  - Default: hsl(220, 13%, 24%)
  - Strong: hsl(220, 13%, 32%)
- **Text & Foreground**:
  - Primary: hsl(210, 20%, 98%)
  - Muted: hsl(215, 15%, 65%)
  - Subdued: hsl(215, 10%, 45%)
- **Primary Brand / Accent**:
  - Base: hsl(217, 91%, 60%) (Blue) o hsl(265, 89%, 66%) (Purple)
  - Hover: hsl(217, 91%, 68%)
  - Active: hsl(217, 91%, 52%)
- **Status Indicators**:
  - Success: hsl(142, 71%, 45%)
  - Warning: hsl(38, 92%, 50%)
  - Danger/Error: hsl(0, 84%, 60%)
  - Info: hsl(199, 89%, 48%)

## 2. Typography Scale & Font Pairing
- **Sans Font**: Inter, system-ui, -apple-system, sans-serif
- **Mono Font**: JetBrains Mono, ui-monospace, monospace
- **Hierarchy**:
  - Display: 36px (2.25rem), tracking: -0.025em, leading: 1.15
  - Heading 1: 28px (1.75rem), tracking: -0.02em, leading: 1.2
  - Heading 2: 22px (1.375rem), tracking: -0.015em, leading: 1.25
  - Heading 3: 18px (1.125rem), tracking: -0.01em, leading: 1.3
  - Body: 14px (0.875rem), leading: 1.5
  - Small/Caption: 12px (0.75rem), leading: 1.4
  - Code/Badge: 11px (0.6875rem), uppercase o mono

## 3. Spacing & Radius Scale
- **Border Radius**:
  - Small: 4px (`rounded-sm`) — Inputs pequeños, badges
  - Medium: 8px (`rounded-md`) — Botones, campos de formulario
  - Large: 12px (`rounded-lg`) — Tarjetas, paneles
  - Extra Large: 16px (`rounded-xl`) — Diálogos, modales
  - Full: 9999px (`rounded-full`) — Avatares, pills

## 4. Components Contract
- **Button**:
  - Altura táctil mínima: 36px (desktop) / 44px (touch).
  - Variantes: Primary (sólido con contraste), Secondary (superficie tenue), Outline (borde sutil), Ghost (sin fondo hasta hover).
- **Inputs & Forms**:
  - Fondo sutil, borde tenue con transición a foco con ring de acento.
  - Mensajes de error contextuales con color Danger e icono.
- **Card / Surface**:
  - Padding consistente (16px a 24px).
  - Borde tenue y sombra sutil (`shadow-sm` o `shadow-md`).
```

---

## 🛠️ Cómo Generar `DESIGN.md` desde una Referencia o Web
Cuando el usuario pida *"Copia el diseño de [URL]"* o *"Genera el sistema de diseño para esta app"*:
1. **Inspección de Referencia**: Analiza la hoja de estilos, paleta de colores predominante y tipografías.
2. **Normalización de Tokens**: Mapea colores arbitrarios a la escala HSL semántica.
3. **Escritura de `DESIGN.md`**: Crea el archivo en la raíz del proyecto.
4. **Sincronización en Código**: Configura `tailwind.config` o variables en `index.css` para que coincidan 1:1 con `DESIGN.md`.
