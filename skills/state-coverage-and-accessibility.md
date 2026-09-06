---
name: state-coverage-and-accessibility
description: "Cobertura obligatoria de los 5 estados de UI (Loading, Empty, Error, Populated, Edge) y fundamentos de accesibilidad WCAG 2.2 AA con navegación por teclado y :focus-visible."
---

# Cobertura de Estados y Accesibilidad WCAG 2.2 AA

El fallo más recurrente y delator de la IA es generar interfaces que únicamente contemplan el escenario ideal poblado (*happy path*). Una aplicación de producción debe ser resiliente a fallos de red, ausencias de datos y desbordes, siendo operable por cualquier persona mediante teclado o tecnologías de asistencia.

---

## 1. La Cobertura Obligatoria de los 5 Estados

Toda superficie interactiva que acepte, liste o transforme datos (tablas, listados, paneles, formularios, feeds) debe implementar de forma nativa los **5 estados fundamentales**:

```
           ┌───────────────────────────────────────────────┐
           │            1. LOADING (Cargando)              │
           │  Skeleton contextual con shimmer sutil        │
           └──────────────────────┬────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  2. EMPTY STATE  │    │  3. ERROR STATE  │    │  4. POPULATED    │
│  Explicación +   │    │  Causa + Botón   │    │  Datos reales    │
│  CTA de creación │    │  de reintento    │    │  bien espaciados │
└──────────────────┘    └──────────────────┘    └─────────┬────────┘
                                                          │
                                                ┌─────────▼────────┐
                                                │  5. EDGE STATE   │
                                                │  Textos largos,  │
                                                │  10k items, 0s   │
                                                └──────────────────┘
```

### 1. Estado Loading (Carga Fluida)
- **Regla**: Reemplazar spinners genéricos giratorios por **esqueletos (skeletons)** que reflejen la forma del contenido entrante.
- **Efecto visual**: Shimmer sutil con gradiente lineal animado (`opacity: 0.6` a `0.9` en ciclo de 1.5s).
- **Temporizador de cortesía**: Si la carga demora más de 15 segundos, mostrar un aviso: *"Está tardando más de lo esperado..."* con opción de cancelar o refrescar. Nunca dejar un spinner infinito.

```css
.skeleton-shimmer {
  background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### 2. Estado Empty (Vacío Constructivo)
Un estado vacío no es la ausencia de diseño; es una oportunidad de bienvenida y onboarding.
- 🚫 **Prohibido**: Dejar un recuadro blanco desierto o un texto gris desganado como *"No hay datos"*.
- ✅ **Composición obligatoria**:
  1. Icono ilustrativo monolineal (ej. carpeta vacía o documento).
  2. Titular positivo y claro (ej. *"Aún no tienes proyectos creados"*).
  3. Párrafo explicativo del beneficio de crear uno.
  4. **CTA principal de acción directa** (ej. *"Crear primer proyecto"*).

### 3. Estado Error (Accionable y Humano)
Todo estado de error debe responder a tres preguntas sin rodeos:
1. **Qué pasó**: *"No pudimos conectar con el servidor"*. (Prohibido *"Something went wrong"*).
2. **Por qué**: *"Se agotó el tiempo de espera de la solicitud"*.
3. **Qué puede hacer el usuario**: Incluir siempre un **botón de reintento** (*"Reintentar"*) y preservar íntegros los datos que el usuario ya había escrito en el formulario.

### 4. Estado Populated (Poblado Óptimo)
El estado normal donde la información se presenta con jerarquía, contrastes y alineaciones limpias.

### 5. Estado Edge (Límites y Casos Extremos)
La interfaz debe someterse a pruebas de estrés visual:
- Títulos o nombres con más de 200 caracteres (truncamiento con tooltip o salto de línea controlado).
- Strings sin espacios que podrían desbordar el contenedor (`overflow-wrap: break-word`).
- Volúmenes masivos (paginación o scroll virtual).
- Valores numéricos en 0, nulos o formateados como moneda con decimales extensos.

---

## 2. Estados de Formularios

Para evitar envíos dobles o validaciones prematuras molestas:
- **Untouched**: El campo no ha recibido interacción; sin estilos de error ni validaciones.
- **Dirty (válido)**: El usuario escribió y el dato es conforme; mantener texto de ayuda neutral sin saturar de verde.
- **Submitted-pending**: El botón entra en estado cargando y **los inputs se bloquean** contra re-envío accidental.
- **Timing de validación**: Validar en **`onBlur`**, jamás en la primera tecla pulsada (genera frustración antes de que el usuario termine de escribir su correo).

---

## 3. Accesibilidad WCAG 2.2 AA

El cumplimiento de accesibilidad es un compromiso de ingeniería irrenunciable:

### A. Ratios de Contraste Obligatorios
- **Texto estándar** (menor a 24px regular o 18.5px negrita): Mínimo **4.5:1** contra su fondo inmediato.
- **Texto grande** (≥24px regular o ≥18.5px negrita) y componentes UI esenciales (bordes de input, iconos activos): Mínimo **3:1**.
- En modo oscuro, evitar textos en gris oscuro sobre fondo negro que no alcanzan el ratio 4.5:1.

### B. Navegación por Teclado y `:focus-visible`
- **Prohibición absoluta**: NUNCA declarar `outline: none` sin proveer un reemplazo visible de foco.
- Usar siempre la pseudoclase `:focus-visible` para que los usuarios de teclado obtengan un anillo evidente mientras los clics con ratón se mantienen limpios:

```css
/* Anillo de foco de alta accesibilidad */
:focus-visible {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: 2px;
}
```

- Todo elemento interactivo debe ser alcanzable con la tecla `Tab`.
- Los botones deben activarse con `Enter` y `Espacio`; los enlaces con `Enter`.

### C. Semántica HTML Nativa vs. ARIA
- Usar siempre elementos nativos: `<button>` en vez de `<div onClick>`, `<a href="...">` para navegación, `<label for="...">` conectado al id del `<input>`.
- Emplear landmarks estructurales: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`.
- Para anuncios dinámicos de errores o notificaciones, incorporar `role="alert"` o `aria-live="polite"`.
- Tamaño mínimo del objetivo táctil (*touch target*): mínimo **24x24px** (WCAG 2.5.8 AA), recomendado **44x44px** para ergonomía táctil en pantallas móviles.
