---
name: emil-design-engineering
description: "Principios de ingeniería de interacción y pulido de UI de Emil Kowalski (Sonner, animaciones.dev). Respuesta táctil física en :active, transiciones naturales sin scale(0), popovers anclados a triggers y CSS moderno con @starting-style."
---

# Emil Kowalski: Principios de Ingeniería de Diseño e Interacción

Inspirado en el trabajo de Emil Kowalski (creador de Sonner, Vaul y [animations.dev](https://animations.dev/)), este documento codifica la filosofía de microinteracciones, pulido de componentes y detalles invisibles que transforman una interfaz funcional en una experiencia inolvidable.

> *"Todos esos detalles invisibles se combinan para producir algo simplemente deslumbrante, como mil voces apenas audibles cantando en perfecta afinación."* — Paul Graham

---

## 1. Los Tres Postulados Fundamentales

1. **El gusto se entrena, no es innato**: Desarrollar sensibilidad visual implica observar con lupa por qué las mejores interfaces se sienten fluidas, desarmar sus curvas de bezier y cuestionar cada milisegundo de animación.
2. **Los detalles invisibles se acumulan**: El usuario rara vez nota de forma consciente un `transform-origin` bien calculado o una reducción de escala en `:active`. Lo que percibe es que el software "responde a su mano" y se siente vivo.
3. **La belleza es apalancamiento**: En un ecosistema saturado de aplicaciones técnicamente correctas, el placer táctil y la fluidez visual son los mayores diferenciadores competitivos.

---

## 2. Reglas Canónicas de Interacción Física

### A. Respuesta Táctil en `:active` (Scale Down)
Todo elemento pulsable (botones, tarjetas clicables, switches, pestañas) debe acusar recibo inmediato del toque.
- **Transformación**: `transform: scale(0.97)` (o entre `0.95` y `0.98` según el tamaño del elemento).
- **Transición**: `transition: transform 150ms ease-out` (o `160ms ease-out`).
- **Comportamiento**: Al hacer clic o presionar, el botón se hunde sutilmente. Al soltar, vuelve con agilidad.

```css
/* Implementación estándar de botón físico */
.interactive-btn {
  transition: transform 150ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms ease;
  user-select: none;
}

.interactive-btn:active {
  transform: scale(0.97);
}
```

### B. Prohibido Animar Entradas desde `scale(0)`
En el mundo real, los objetos no se materializan desde un punto invisible de cero dimensiones. Animar desde `scale(0)` parece un efecto de dibujo animado tosco y desprolijo.
- **La Regla**: Las entradas deben partir desde **`scale(0.95)` combinado con `opacity: 0`** (o `scale(0.9)` para elementos muy pequeños) hasta `scale(1)` y `opacity: 1`.
- Esto produce la sensación de una superficie que se acerca ligeramente a la pantalla con naturalidad.

```css
/* ❌ MAL: Aparece de la nada */
.modal-bad-enter {
  transform: scale(0);
  opacity: 0;
}

/* ✅ BIEN: Elevación física natural */
.modal-good-enter {
  transform: scale(0.95);
  opacity: 0;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease-out;
}
.modal-good-enter.open {
  transform: scale(1);
  opacity: 1;
}
```

### C. Popovers y Menús Anclados al Activador (`transform-origin`)
El origen de la escala (`transform-origin`) nunca debe dejarse en `center` para elementos dependientes de un disparador (dropdowns, tooltips, context menus).
- **Popovers y menús desplegables**: Deben escalar desde el botón que los abrió (ej. `transform-origin: top left`, `top right`, o la coordenada del trigger mediante `var(--radix-popover-content-transform-origin)`).
- **Excepción explícita**: Los **modales centrales** sí conservan `transform-origin: center`, porque su contexto visual es el centro del viewport, no un botón localizado.

```css
/* Dropdown anclado a la esquina superior */
.dropdown-menu {
  transform-origin: top right;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease-out;
}
```

### D. Entradas Fluidas Modernas con `@starting-style`
El estándar CSS moderno permite animar elementos cuando entran al DOM o cambian de `display: none` a `display: block` sin recurrir a estados intermedios de React (`useEffect` con `isMounted`).

```css
.toast-notice {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: opacity 250ms ease-out, transform 250ms cubic-bezier(0.23, 1, 0.32, 1);

  @starting-style {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
}
```

### E. Desenfoque Táctico (`filter: blur`) para Transiciones de Estado
Cuando se realiza una transición o crossfade entre dos estados (por ejemplo, el texto de un botón que pasa a "Cargando..." o un número que muta), añadir un desenfoque sutil (`filter: blur(2px)`) durante el cambio oculta la superposición brusca de glifos y crea la ilusión de una sola superficie que se transforma elásticamente.

```css
.state-transitioning {
  filter: blur(2px);
  opacity: 0.6;
  transition: filter 150ms ease, opacity 150ms ease;
}
```

---

## 3. Decision Framework de Animación

Antes de agregar una animación, responde en este orden:

### 1. ¿Debe animarse en absoluto?
- **Acciones ejecutadas 100+ veces al día** (atajos de teclado, alternar command palette / Raycast, tabs rápidos): **CERO animación**. El retraso perceptivo irrita al usuario experto.
- **Acciones frecuentes** (hovers, navegación por lista): Transiciones mínimas e instantáneas (<100ms).
- **Acciones intermedias** (abrir modal, drawer lateral, toast): Animación estándar optimizada (150-250ms).
- **Momentos únicos / onboarding**: Se permite mayor expresión visual.

### 2. ¿Qué curva de aceleración (Easing) usar?
- **NUNCA usar `ease-in` en interfaces interactivas**: `ease-in` arranca lento, transmitiendo pereza y letargo al usuario en el instante exacto en que espera una respuesta.
- **Elementos que entran**: `ease-out` (comienza rápido, frena suave).
- **Curva maestra de interacción**: `cubic-bezier(0.23, 1, 0.32, 1)` (arranque instantáneo con desaceleración orgánica).

### 3. Duración estricta
- Respuestas a clics / `:active`: **100 – 160 ms**.
- Tooltips y menús pequeños: **125 – 180 ms**.
- Modales y drawers: **200 – 280 ms** (nunca exceder 300 ms en UI productiva).

---

## 4. Formato Obligatorio de Revisión (Before / After / Why)

Al auditar o refactorizar estilos interactivos, presentar las correcciones estrictamente en una tabla markdown con el siguiente formato:

| Antes | Después | Por qué |
|---|---|---|
| `transition: all 300ms ease;` | `transition: transform 150ms ease-out, opacity 150ms ease;` | Especificar propiedades exactas evita repaints masivos; `all 300ms` se siente lento. |
| `transform: scale(0);` | `transform: scale(0.95); opacity: 0;` | Los elementos reales no brotan de un punto cero; el escalado suave desde 0.95 da peso físico. |
| `button:hover { opacity: 0.8; }` | `button:active { transform: scale(0.97); }` | La opacidad sola es aburrida; la compresión en `:active` otorga respuesta táctil inmediata. |
| `transform-origin: center;` (en popover) | `transform-origin: top right;` | El popover debe emerger espacialmente desde el botón que lo activó. |
| Transición con `ease-in` en dropdown | `cubic-bezier(0.23, 1, 0.32, 1)` | `ease-in` demora el primer movimiento perceptible; el bezier rápido da dinamismo instantáneo. |
