---
name: tiancode-taste-frontend
description: "Framework de diseño para agentes de IA con los 3 diales (DESIGN_VARIANCE, MOTION_INTENSITY, VISUAL_DENSITY), formulación de Design Read previa, regla de 80% patrones probados + 20% alma/originalidad, y prohibición explícita de los 7 pecados capitales del diseño de IA."
---

# Tiancode Taste Frontend: Framework de Diseño Anti-Slop

Este framework establece el estándar de calidad visual, jerarquía y criterio estético para interfaces y aplicaciones desarrolladas por agentes en Tiancode. El objetivo es eliminar de raíz los patrones genéricos de IA ("AI slop") y producir software con intención de diseño, identidad propia y ejecución de grado profesional.

---

## 0. Paso Obligatorio: "Design Read" Previo

Antes de generar cualquier línea de CSS, JSX o HTML, el agente DEBE inferir el contexto del usuario y declarar una formulación explícita de **Design Read**.

### Señales a Evaluar
1. **Tipo de producto o superficie**: Landing page (SaaS, consumidor, agencia), webapp/herramienta (dashboard, editor, terminal, productividad), portfolio o sitio editorial.
2. **Vocabulario y tono del usuario**: Palabras clave como *"minimalista"*, *"técnico"*, *"estilo Linear"*, *"cálido"*, *"editorial"*, *"alta densidad"*, *"brutalista"*.
3. **Referencias y marcas citadas**: Si el usuario menciona Linear, Vercel, Stripe, Claude, Raycast, etc., adoptar su filosofía de diseño sin plagiar activos propietarios.
4. **Audiencia objetivo**: Compradores técnicos B2B, consumidores premium, reclutadores, diseñadores o usuarios masivos.
5. **Restricciones silenciosas**: Accesibilidad estricta, entornos con poca luz, cumplimiento corporativo o velocidad de lectura.

### Formulación del Design Read (Declaración de una línea)
El agente debe formular mentalmente o en su primer bloque explicativo:
> **"Design Read: [Tipo de aplicación] para [Audiencia objetivo], con lenguaje visual [Vibe / Estilo], fundamentado en [Sistema de diseño / Preset canónico]."**

*Ejemplo:*
> *"Design Read: Herramienta SaaS de observabilidad para desarrolladores, con lenguaje minimalista oscuro de alta precisión, fundamentado en el preset Linear Dark."*

Si el contexto es ambiguo, formula **una sola** pregunta clarificadora concisa en vez de hacer conjeturas aleatorias o una lista abrumadora.

---

## 1. Los Tres Diales de Configuración (Core Dials)

Toda decisión de maquetación, ritmo visual y animación se calibra a través de 3 diales numéricos del 1 al 10:

```
DESIGN_VARIANCE:  [1 ─── 5 ─── 10]  (1 = Simetría estricta / Corporativo ── 10 = Asimetría artística / Experimental)
MOTION_INTENSITY: [1 ─── 5 ─── 10]  (1 = Completamente estático ────────── 10 = Cinemático / Micro-físicas ricas)
VISUAL_DENSITY:   [1 ─── 5 ─── 10]  (1 = Galería de arte / Gran aire ──── 10 = Cabina de avión / Datos densos)
```

### Calibración por Caso de Uso

| Caso de uso | DESIGN_VARIANCE | MOTION_INTENSITY | VISUAL_DENSITY | Justificación |
|---|:---:|:---:|:---:|---|
| **B2B SaaS / Productividad (Linear style)** | `6` | `4` | `6` | Estructura predecible, microinteracciones táctiles rápidas, densidad informativa controlada. |
| **Herramientas de Desarrollador / DevTools (Vercel style)** | `4` | `3` | `7` | Rigor monocromático, cero distracciones cinemáticas, alta densidad de código y tablas. |
| **Plataformas de Finanzas / Fintech (Stripe style)** | `6` | `5` | `5` | Confianza institucional, elevación atmosférica, tipografía impecable y acentos medidos. |
| **Editorial / AI Assistant (Claude style)** | `7` | `3` | `3` | Ritmo de lectura pausado, lienzos cálidos tipo papel pergamino, serifs elegantes. |
| **Landing Page de Agencia / Creativa** | `9` | `8` | `3` | Asimetría audaz, composiciones dinámicas, transiciones envolventes. |
| **Dashboards / Analytics / Monitoreo** | `3` | `2` | `8` | Máxima legibilidad, actualización fluida, sin rebotes ni animaciones decorativas. |

---

## 2. La Regla del 80% / 20%: Estructura Probada + Alma

El software estéril se siente como una plantilla vacía; el software sobrecargado se vuelve inusable. La proporción dorada es:

$$\mathbf{80\%\ \text{Patrones Probados}} \;+\; \mathbf{20\%\ \text{Alma y Originalidad}}$$

### El 80% (Patrones de Confianza)
- Navegación clara y predecible (sidebar lateral o navbar superior limpia).
- Convenciones estándar de interacción (escritura en inputs, clics en botones nativos, scroll suave).
- Ratios de contraste WCAG 2.2 AA garantizados (4.5:1 en texto normal).
- Manejo impecable de estados de carga, vacío y error.

### El 20% (El Alma del Producto)
Elegir **1 o 2 movimientos visuales distintivos** que den identidad memorable a la aplicación:
- **Una decisión tipográfica de autor**: Encabezados en display serif con tracking negativo sutil, o un estilo mono condensado con OpenType features.
- **Un acento de color inesperado y restringido**: Un tono terracota cálido (`#c96442`), un ámbar técnico (`#f59e0b`), o un verde terminal (`#10b981`), nunca el índigo comodín de IA.
- **Respuesta táctil física**: Botones que se comprimen con precisión elástica al pulsar (`:active { transform: scale(0.97); }`).
- **Microcopia humana**: Mensajes concisos con tono de producto real, evitando textos corporativos robotizados.

---

## 3. Los 7 Pecados Capitales del Diseño de IA (Prohibición Absoluta)

Los siguientes 7 vicios delatan inmediatamente una interfaz generada por IA sin supervisión humana. **Están formalmente prohibidos:**

1. ❌ **El índigo de Tailwind como acento comodín**:
   Prohibido usar `#6366f1` (indigo-500), `#4f46e5`, `#4338ca` o morados genéricos de forma automática. El color primario debe derivarse del propósito de la marca.
2. ❌ **El gradiente de confianza morado-azul en el Hero**:
   Prohibido el degradado genérico púrpura a cian/azul (`from-indigo-500 to-purple-600`) detrás o dentro del texto. Una superficie plana bien contrastada con tipografía de calidad siempre luce más profesional.
3. ❌ **Emojis sueltos como iconos de interfaz**:
   Prohibido usar `🚀`, `✨`, `🔥`, `💡`, `🎯`, `⚡` en botones, títulos o tarjetas. Toda iconografía debe ser SVG monolineal consistente (stroke de 1.6 a 1.8px con `currentColor`).
4. ❌ **Sans-serif genérica sin escala ni tracking**:
   Prohibido usar `system-ui` o `Inter` en mayúsculas sin tracking, o display en 64px sin tracking negativo. La tipografía requiere tratamiento artesanal.
5. ❌ **Tarjetas redondeadas con borde izquierdo de color brillante**:
   Prohibido el arquetipo de tarjeta de dashboard con `border-l-4 border-indigo-500` y esquinas redondeadas (`rounded-xl`). Elige: o una tarjeta limpia con borde perimetral sutil (`rgba(255,255,255,0.08)`), o una división de lista plana sin radio.
6. ❌ **Métricas y datos inventados absurdos**:
   Prohibido incluir sin contexto textos como *"10x faster"*, *"99.99% uptime"* o estadísticas sin significado real en una demo funcional. Usar datos coherentes con el dominio.
7. ❌ **Copy de relleno y títulos perezosos**:
   Prohibido `Lorem ipsum`, `Feature 1 / Feature 2 / Feature 3`, `Title goes here`. Redactar microcopia realista, específica y funcional.

---

## 4. Arquitectura de Espaciado y Composición

- **Espacio en blanco intencional**: La elegancia proviene de la pausa entre bloques, no de saturar la vista con contenedores innecesarios.
- **Contención de viewport**: Usar `min-h-[100dvh]` en lugar de `h-screen` para evitar saltos bruscos en navegadores móviles debido a la barra de direcciones dinámica.
- **Límites de ancho de lectura**: En párrafos de contenido, limitar siempre a `max-w-[65ch]` para evitar fatiga visual del usuario.
- **Jerarquía de capas de elevación**:
  - Capa 0: Lienzo de fondo (`--bg`).
  - Capa 1: Superficie de panel/sidebar (`--surface`).
  - Capa 2: Elemento elevado/tarjeta (`--surface-elevated`).
  - Capa 3: Superposición flotante/modal/menú desplegable (`--overlay`).
