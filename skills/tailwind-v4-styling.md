---
name: "tailwind-v4-styling"
description: "Estilizado moderno con Tailwind CSS v4: variables de tema CSS (@theme), utilidades nativas, nesting y diseño estilo Apple."
---

# Tailwind CSS v4 Modern Styling & Apple-Grade UI

## Propósito
Implementar interfaces de usuario refinadas, responsivas y altamente accesibles aprovechando el nuevo motor CSS de Tailwind CSS v4.

## Pautas Clave
1. **Configuración de Tema CSS-First (@theme)**:
   - Configura tokens de diseño directamente en CSS con directivas `@theme`:
     ```css
     @theme {
       --font-sans: var(--font-inter), -apple-system, system-ui, sans-serif;
       --color-accent: #06b6d4;
       --color-surface: #0e111a;
     }
     ```

2. **Diseño Visual Estilo Apple**:
   - Bordes sutiles y traslúcidos (`border: 0.5px solid rgba(255, 255, 255, 0.1)`).
   - Fondos con elevación y capas (`bg-layer-01`, `bg-layer-02`).
   - Micro-interacciones suaves con `transition-all duration-150 ease-out`.
   - Sombras atmosféricas discretas (`shadow-[0_4px_16px_rgba(0,0,0,0.25)]`).

3. **Accesibilidad y Estados**:
   - Soporte nativo para modo oscuro y claro.
   - Anillos de foco visibles y accesibles (`focus-visible:ring-2 focus-visible:ring-accent`).
   - Cumplimiento de ratios de contraste WCAG 2.2.
