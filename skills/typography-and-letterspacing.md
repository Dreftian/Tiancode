---
name: typography-and-letterspacing
description: "Reglas maestras de tipografía, tracking y jerarquía visual: tracking obligatorio en ALL CAPS, tracking negativo en display, interlineado compacto y disciplina estricta de 3 pesos."
---

# Tipografía, Tracking y Jerarquía Visual

La tipografía es el 90% del diseño de interfaces. La diferencia entre una maqueta burda de IA y un producto pulido de clase mundial radica en el ajuste milimétrico del espaciado entre letras (*letter-spacing* / *tracking*), la altura de línea (*line-height* / *leading*) y la disciplina de pesos.

---

## 1. La Regla Sagrada del Tracking (Letter-Spacing)

Este es el mandato que jamás debe omitirse:

### A. Obligatorio: `ALL CAPS` requiere `letter-spacing: 0.06em` a `0.1em`
Todo texto en mayúsculas sostenidas (**eyebrows, badges, etiquetas de navegación, encabezados de columnas de tabla, botones en mayúsculas**) debe expandirse deliberadamente.

- **Rango exigido**: `0.06em` a `0.1em` (en Tailwind: `tracking-wider` a `tracking-widest`).
- **Por qué**: Las mayúsculas fueron diseñadas históricamente para inscripciones monumentales con espacio entre glifos. En pantalla, las mayúsculas sin tracking colisionan, se leen apretadas y transmiten descuido amateur.
- El umbral de `0.06em` es el límite inferior validado por la tradición tipográfica clásica (Robert Bringhurst, *The Elements of Typographic Style*).

```css
/* ✅ BIEN: Eyebrow profesional */
.eyebrow-badge {
  text-transform: uppercase;
  font-size: 0.75rem; /* 12px */
  font-weight: 600;
  letter-spacing: 0.08em; /* tracking-widest */
  color: var(--muted);
}

/* ❌ MAL: Mayúsculas asfixiadas */
.eyebrow-slop {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0; /* o negativo */
}
```

---

### B. Titulares Display (≥ 32px): Tracking Negativo y Leading Compacto
Los textos gigantescos pierden cohesión visual si se dejan con el espaciado predeterminado del navegador.

- **Tracking Negativo**: Para títulos grandes (de 32px a 72px), aplicar **`-0.01em` a `-0.03em`** (típicamente `-0.02em` o `tracking-tight`). Esto compacta las palabras confiriéndoles solidez y contundencia editorial.
- **Interlineado Compacto (Leading)**:
  - En titulares Display / H1 (≥32px): `line-height: 1.1` a `1.2` (o `1.05` a `1.15` en fuentes display condensadas).
  - Nunca permitir interlineados flotantes (`1.5`) en titulares grandes; desconectan las líneas entre sí.

```css
/* Titular de Hero contundente */
.hero-headline {
  font-size: clamp(2.5rem, 5vw, 4rem); /* 40px - 64px */
  line-height: 1.15;
  letter-spacing: -0.02em; /* tracking-tight */
  font-weight: 600;
}
```

---

### C. Tabla Maestra de Tracking por Contexto

| Rol del texto | Tamaño | Letter-Spacing | Line-Height |
|---|---|:---:|:---:|
| **Display / Hero H1** | $\ge 48\text{px}$ | `-0.02em` a `-0.03em` | `1.1` – `1.15` |
| **Sección H2 / H3** | $24\text{px} - 36\text{px}$ | `-0.015em` a `-0.01em` | `1.2` – `1.25` |
| **Cuerpo de lectura (Body)** | $15\text{px} - 18\text{px}$ | `0` (neutro) | `1.5` – `1.6` |
| **Etiquetas UI / Botones** | $13\text{px} - 15\text{px}$ | `0.01em` a `0.02em` | `1.3` – `1.4` |
| **Microtexto / Captions** | $11\text{px} - 12\text{px}$ | `0.01em` a `0.025em` | `1.4` – `1.5` |
| **TODO ALL CAPS** | Cualquier tamaño | **`+0.06em` a `+0.1em`** | Según contexto |

> **Nota para escrituras ideográficas (CJK - Chino, Japonés, Coreano):**
> Los glifos CJK ocupan un cuadrado em completo. Por lo tanto, en CJK **NO** se aplica tracking negativo (aglomeraría los caracteres) y el leading de titulares debe elevarse a `1.3`–`1.4` para evitar que las líneas choquen.

---

## 2. Disciplina de los Tres Pesos (The Three-Weight System)

Un síntoma recurrente de interfaces caóticas es el uso indiscriminado de pesos: 300, 400, 500, 600, 700, 800 y 900 en la misma pantalla.

El diseño de alto nivel se apoya estrictamente en **3 pesos**:

1. **Peso Lectura (400 o 450 - Regular)**:
   Destinado a texto de cuerpo corrido, descripciones, párrafos y metadatos secundarios.
2. **Peso Énfasis UI (500 o 510 - Medium)**:
   El peso maestro de la interfaz (famoso en Linear con Inter a 510). Se emplea en botones secundarios, items de menú, tabs, celdas de tabla y navegación. Es visible sin gritar.
3. **Peso Anuncio y Títulos (590 o 600 - Semibold)**:
   Reservado para titulares principales (`h1`, `h2`), botones de acción primaria y métricas destacadas.

> **Regla**: El peso 700+ (Bold/Black) rara vez se justifica en interfaces funcionales. Si sientes la necesidad de usar 700 u 800 para dar énfasis, la jerarquía de tamaño o color está fallando.

---

## 3. Longitud de Línea de Lectura (Measure)

- Para párrafos de lectura, el ojo humano pierde la pista al saltar de línea si el ancho supera los 75 caracteres.
- **Límite Canónico**: Mantener el texto entre **50 y 75 caracteres por línea** (`max-width: 65ch` en CSS).
- NUNCA justificar texto en la web (`text-align: justify`); produce ríos blancos antiestéticos. Alinear a la izquierda (`text-align: left`).
