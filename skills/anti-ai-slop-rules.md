---
name: anti-ai-slop-rules
description: "Reglas estrictas contra el 'AI slop' en interfaces: arquitectura de color en 4 capas, eliminación del índigo por defecto, fin a gradientes genéricos y bordes izquierdos coloreados, fondos oscuros balanceados y SVGs monolineales."
---

# Anti-AI-Slop Rules: Directrices Contra el Diseño Genérico de IA

Estas reglas establecen los límites y criterios no negociables para erradicar las características que delatan el software generado por modelos de lenguaje sin pulido humano.

---

## 1. Arquitectura de Color en 4 Capas

Toda paleta cromática debe planificarse y distribuirse en 4 estratos con cuotas estrictas de píxeles:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. NEUTROS CÁLIDOS O TÉCNICOS (70% - 90% de la superficie)  │
│    Lienzo (--bg), Paneles (--surface), Texto (--fg, --muted)│
├─────────────────────────────────────────────────────────────┤
│ 2. ACENTO ÚNICO (5% - 10%)                                  │
│    Un solo tono característico. MÁXIMO 2 usos visibles.     │
├─────────────────────────────────────────────────────────────┤
│ 3. SEMÁNTICOS (0% - 5%)                                     │
│    Éxito (--success), Alerta (--warn), Error (--danger)     │
├─────────────────────────────────────────────────────────────┤
│ 4. EFECTOS / ATMÓSFERA (< 1%)                               │
│    Resplandores calculados, sombras ambientales             │
└─────────────────────────────────────────────────────────────┘
```

### Disciplina de Acento: Máximo 2 Usos Visibles por Pantalla
El error más común en UIs generadas por IA es inundar la pantalla con el color de acento.
- **Límite Estricto**: No más de 2 elementos visibles compartiendo `--accent` a la vez en el viewport.
- *Ejemplo de combinación válida:*
  - Opción A: 1 Badge/Pill en el hero + 1 Botón CTA primario.
  - Opción B: 1 Pestaña activa en la navegación + 1 Switch encendido.
- Si hay un botón primario presente, los enlaces del cuerpo deben estilizarse en color de texto (`--fg`) con subrayado sutil, nunca con `--accent`.

---

## 2. Los Prohibidos (P0 Anti-Slop Enforcements)

### A. Prohibición del Índigo de Tailwind por Defecto
El uso automático de los tonos índigo/púrpura de Tailwind es el síntoma definitivo de pereza algorítmica:
- 🚫 Prohibidos como acento por defecto: `#6366f1` (indigo-500), `#4f46e5`, `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`.
- **Qué usar en su lugar**: Definir un acento intencional acorde al producto: un ámbar técnico (`#d97706`), un terracota editorial (`#c96442`), un esmeralda sobrio (`#059669`), un azul marino refinado (`#0a72ef`), o una paleta monocromática estricta donde el contraste mande.

### B. Prohibición del Gradiente Púrpura-Azul en Encabezados
- 🚫 Prohibido el degradado "trust gradient" de dos paradas (`linear-gradient(to right, #6366f1, #3b82f6)` o `from-purple-600 to-blue-500`) sobre el texto principal (`h1`).
- **Qué hacer en su lugar**: Un titular en color sólido de alto contraste (`#ffffff` en tema oscuro o `#111111` en tema claro) con peso tipográfico adecuado y tracking negativo transmite diez veces más solidez y confianza.

### C. Prohibición de Tarjetas con Borde Izquierdo Brillante
- 🚫 Prohibido el arquetipo de tarjeta redondeada con borde izquierdo de color (`border-l-4 border-indigo-500 rounded-xl`).
- **Qué hacer en su lugar**:
  - Si es una tarjeta: Contorno perimetral completo y sutil (`1px solid rgba(255,255,255,0.08)` en oscuro, o `1px solid #e5e7eb` en claro).
  - Si es una alerta o log de auditoría: Una fila plana sin radio excesivo con icono monolineal y tipografía clara.

### D. Fondos Oscuros Balanceados (No #000000 Puro Sin Brillo)
El negro absoluto `#000000` crea un contraste excesivamente agresivo que vibra en la pantalla e incomoda a la vista:
- **Fondos oscuros profesionales**:
  - Lienzo frío de alta tecnología: `#08090a` o `#0f0f0f`.
  - Lienzo cálido/oliva con alma humana: `#141413` o `#181816`.
- **Estructura con bordes translúcidos**: En lugar de bordes grises opacos, usar blanco con baja opacidad (`rgba(255, 255, 255, 0.06)` a `rgba(255, 255, 255, 0.08)`). Separa las áreas limpiamente como filigranas de luz.
- **En modo claro**: Evitar el `#ffffff` clínico absoluto para fondos enteros; preferir `#fafafa` o crema papel `#f5f4ed`.

### E. SVGs Monolineales Limpios vs. Emojis Sueltos
- 🚫 Prohibido colocar emojis (`✨`, `🚀`, `🔥`, `💡`, `🎯`) como iconos de botones, tarjetas o bullets en software profesional.
- **Qué usar en su lugar**: Iconos vectoriales SVG limpios con trazado monolineal:
  - `stroke-width`: entre `1.6px` y `1.8px`.
  - `stroke: currentColor` para que hereden el color del texto.
  - Dimensiones estándar consistentes (típicamente `16x16px` o `20x20px`).

```jsx
// ✅ Icono monolineal limpio en SVG puro
function ShieldIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
```

---

## 3. Señales Suaves (Soft Tells a Erradicar)

1. **La secuencia idéntica de plantilla**: Hero centrado $\to$ 3 tarjetas idénticas $\to$ Pricing de 3 columnas con la del medio destacada en morado $\to$ FAQ $\to$ CTA final.
   *Alternativa*: Romper el ritmo con una vista previa funcional real, tablas densas o citas de autor a ancho completo.
2. **Imágenes de CDNs genéricos**: Nada de URLs de `unsplash.com` o `picsum.photos` rotas o lentas. Diseñar con datos, tipografía, diagramas SVG y maquetas interactivas.
3. **Múltiples valores hexadecimales dispersos**: Centralizar los colores en variables CSS semánticas (`--bg`, `--surface`, `--border`, `--accent`, `--fg`, `--muted`).

---

## 4. Checklist Rápido Anti-Slop

- [ ] ¿El acento es diferente al índigo comodín de Tailwind?
- [ ] ¿Hay como máximo 2 instancias visibles de `--accent` simultáneas?
- [ ] ¿El fondo oscuro tiene carácter (`#0f0f0f`, `#141413`, `#08090a`) en vez de `#000000` ciego?
- [ ] ¿Los botones usan iconos SVG monolineales en lugar de emojis?
- [ ] ¿Las tarjetas usan bordes suaves translúcidos en lugar de barras izquierdas de colores?
- [ ] ¿El hero tiene tipografía con autoridad y contraste sin degradados cliché?
