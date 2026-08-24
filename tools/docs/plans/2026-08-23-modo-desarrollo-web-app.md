# Modo "Desarrollo Web y App" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un apartado "Desarrollo Web y App" en Tiancode donde cualquier modelo de IA, activado ese modo, crea apps/webs en full JSX (React, sin configuración) con visualización en tiempo real en el panel de vista previa, al estilo de agentui.ai / v0 / bolt.

**Architecture:** Se apoya en infraestructura YA EXISTENTE: el runtime bare-JSX (`bare-jsx-preview.ts`) transpila JSX/TSX en runtime y auto-recarga el preview (~700 ms) en cada cambio de archivo; las tools `preview_start/…` + HttpApi `/preview` + `LiveViewPanel`/`LivePreview` ya muestran el resultado. Lo nuevo es: (1) un agente nativo `webapp` cuyo system prompt fuerza el contrato full-JSX para cualquier modelo, (2) una entrada de UI (tarjeta en Home + selector de agente en el composer) que crea la sesión en modo webapp, (3) apertura determinista del panel de vista previa, (4) i18n.

**Tech Stack:** TypeScript (backend sidecar `backend/tiancode`, renderer SolidJS `frontend/app`), runtime JSX propio (typescript `transpileModule` + mini-runtime React), i18n propio 7 locales, Electron (desktop).

## Global Constraints

- Version bump obligatorio: `frontend/desktop/package.json` 1.0.95 → **1.0.96**; build con `TIANCODE_CHANNEL=prod`; assets `Tiancode.exe` / `Tiancode-portable.exe` + `latest.yml`; release nueva (nunca reemplazo de assets).
- Actualización no destructiva: no hay migraciones en este feature (todo es aditivo).
- NO tocar `manualChunks` del renderer (pantalla negra, lección v1.0.2).
- i18n: cada clave nueva va a los 7 locales (`en`, `en-150` copia exacta de `en`, `es`, `ja`, `ko`, `ru`, `zh`); interpolación con `{{param}}` (llave doble); insertar claves ANTES de una línea ancla sin comas extra.
- Typecheck con `bun typecheck` desde los directorios de package (nunca `tsc` directo, nunca desde la raíz).
- No usar `Bun.file()` en módulos que van al bundle Node del sidecar (usar `node:fs`) — lección v1.0.34.
- El canal del build se fija en `bun run build` (`TIANCODE_CHANNEL=prod`), no solo en `package`.

## Investigación: cómo lo hace agentui.ai

agentui.ai es una **plataforma cerrada** (marketing: "la IA construye pantallas, módulos, lógica, base de datos… hosting integrado, disponible al instante"). No publica su implementación ni repositorio. Su patrón UX es el estándar del sector (v0, bolt.new, Lovable): chat → el agente escribe archivos JSX en streaming → un sandbox transpila y sirve la app → el preview se refresca en vivo mientras se escribe → panel de código mostrando el archivo actual.

Tiancode ya implementa ese mismo patrón EN LOCAL desde v1.0.34+:

- `backend/tiancode/src/preview/bare-jsx-preview.ts` — servidor http en 127.0.0.1 que transpila `.jsx/.tsx` con `typescript.transpileModule` por petición, resuelve imports relativos (`.tsx .jsx .ts .js .css .json` + assets), inyecta React/ReactDOM (mini-runtime con hooks), overlay de errores, y **hot-reload por revisión de archivos cada 700 ms** (`/__tiancode__/revision` → `window.location.reload()`).
- `backend/tiancode/src/preview/project-detector.ts:22-35,75-93` — detecta proyecto bare-jsx (`src/App.jsx`, `main.tsx`, o `index.html` con script `.jsx`) sin package.json y enruta `preview_start` al runtime.
- `backend/tiancode/src/tool/preview.ts` — tools `preview_start/stop/restart/status/logs`; HttpApi `/preview*` (`server/routes/instance/httpapi/groups/preview.ts`).
- `frontend/app/src/pages/session/live-view-panel.tsx` + `live-preview/live-preview.tsx` — panel con pestañas App/Código, dispositivos, zoom, banner de errores, auto-start cuando aparece una entrada web (líneas 611-617).
- `frontend/app/src/pages/session/live-view-auto-open.ts` + `session.tsx:1191-1199` — apertura automática por intención (`BUILD_INTENT_REGEX`) y por `preview_start`.

WebContainers quedó descartado (WASM sin Node real, COOP/COEP no soportado en webviews — investigación 2026-08-11). El runtime bare-JSX local es la vía correcta: offline, instantáneo, sin `npm install`.

## Limitaciones del runtime que el prompt del agente DEBE codificar (fuente de "bugs" a evitar)

1. Solo imports bare permitidos: `react`, `react-dom`, `react-dom/client` (y jsx-runtime automático). **Cualquier otra librería** (framer-motion, lucide-react, recharts, tailwind…) produce overlay de error: "requiere un package.json". → Iconos SVG inline, animaciones CSS, charts SVG hechos a mano.
2. Mini-runtime NO es React real: **no** soporta class components, `memo`, `forwardRef`, `useId`, `useLayoutEffect`, `useTransition`, `useSyncExternalStore`, Suspense ni portals. Sí soporta `useState/useReducer/useMemo/useCallback/useRef/useEffect/useContext/createContext/Fragment` y `createRoot` de `react-dom/client`. Los globales `React`/`ReactDOM` también existen.
3. Sin `package.json`, sin `npm install`, sin node_modules, sin build step. Entrada: `src/App.jsx` (o `src/main.tsx`, o `index.html` con `<script src="./app.jsx">`) con `export default function App()`.
4. La recarga es full-reload (no preserva estado) — aceptable, así funcionan los sandboxes simples.
5. Escape hatch: si el usuario pide explícitamente un stack real (Next.js, Tailwind, libs externas), el agente crea un proyecto Vite con package.json y lo sirve con `preview_start` (DevServerManager ya lo soporta: `project-detector.ts:203-218`).

---

### Task 1: Agente nativo `webapp` + prompt de contrato

**Files:**
- Create: `backend/tiancode/src/agent/prompt/webapp.txt`
- Modify: `backend/tiancode/src/agent/agent.ts` (bloque de agentes nativos, líneas ~142-267, junto a `build`/`plan`)

**Interfaces:**
- Produces: agente `"webapp"` visible en `GET /agent` con `mode: "primary"`; aparece automáticamente en el selector del composer (`frontend/app/src/context/local.tsx:70` filtra `mode !== "subagent" && !hidden` — cero cambios de UI necesarios para el selector) y en menciones `@`.

- [ ] **Step 1: Crear `backend/tiancode/src/agent/prompt/webapp.txt`** (inglés, como el resto de prompts nativos):

```text
You are the Tiancode Web & App Development agent. You build complete web applications as single-page React apps that run in Tiancode's zero-config JSX live preview. The user watches the preview update in real time while you write code, so show something real as early as possible and never leave the app broken.

# Runtime contract (CRITICAL — the preview only supports this)

- Import React only via bare imports: `react`, `react-dom`, `react-dom/client`. NO other libraries (no framer-motion, lucide-react, recharts, axios, tailwind, shadcn...). Any other bare import fails the preview with an error overlay.
- No package.json, no npm install, no node_modules, no build step, no config files.
- Entry file: `src/App.jsx` (or `src/main.tsx`) with `export default function App()`. The preview mounts it automatically.
- Split code into files and import them with relative paths (`./components/Header.jsx`, `../styles.css`). Supported: .jsx .tsx .ts .js .css .json and image/font assets.
- Icons: inline SVG components. Animations: CSS transitions and keyframes. Charts: hand-rolled SVG. Data fetching: fetch. Persistence: localStorage.
- Hooks available: useState, useReducer, useMemo, useCallback, useRef, useEffect, useContext, createContext, Fragment. NOT available: class components, memo, forwardRef, useId, useLayoutEffect, useTransition, useSyncExternalStore, Suspense, portals.
- Styling: plain CSS files imported relatively, or inline style objects. Use flex/grid, responsive layouts, good visual polish (the user judges quality by what they see).

# Workflow

1. Scaffold FIRST: on the first message in a folder without a web entry, immediately create `src/App.jsx` with a real (not lorem) visible screen, then call preview_start. The user must see the app within seconds.
2. Iterate in small vertical slices: one feature or file at a time. The preview auto-reloads ~1s after every file change; never leave it in an error state between steps.
3. After each meaningful edit, check preview_status and preview_logs; if there is an error overlay, fix it before adding anything new.
4. After writing each file, call the live view MCP tool set_current_file so the user sees the code being written; call set_preview when the app is worth showing.
5. Keep everything at the workspace root: `src/`, `assets/`, `styles.css`. Entry at `src/App.jsx`.
6. On first scaffold also write an `AGENTS.md` at the project root summarizing this contract so future sessions in this folder keep following it.

# Escape hatch

If the user explicitly requires a real stack (Next.js, Tailwind, external libraries, a backend server), say it out loud and switch: create a proper package.json + Vite React project, run the dev server via preview_start, and develop normally. The zero-config JSX runtime above is always the default.

# Quality bar

- Everything the user can see or click must actually work: no dead buttons, no placeholder screens after the first iteration.
- Responsive (mobile-friendly), accessible labels, keyboard navigation where natural.
- Ask nothing twice: if the request is ambiguous, pick the most common interpretation, build it, and note the choice in chat.
```

- [ ] **Step 2: Registrar el agente en `agent.ts`** — import arriba (junto a `import PROMPT_EXPLORE from "./prompt/explore.txt"`, línea 14):

```ts
import PROMPT_WEBAPP from "./prompt/webapp.txt"
```

y dentro del record `agents` (tras `plan`, ~línea 183):

```ts
webapp: {
  name: "webapp",
  description: "Web & App development. Builds full-JSX apps with a real-time live preview.",
  options: {},
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({
      question: "allow",
    }),
    user,
  ),
  prompt: PROMPT_WEBAPP,
  mode: "primary",
  native: true,
  color: "#22c55e",
},
```

Nota: `agent.prompt` sustituye el prompt base del provider (patrón ya usado por `explore`); `sys.environment`, skills, MCP e `instruction.system()` (AGENTS.md) se siguen añadiendo (ver `session/prompt.ts` ~1261 y `session/llm/request.ts:56-66`).

- [ ] **Step 3: Verificar**

```bash
cd backend/tiancode && bun typecheck
```
Expected: sin errores. Arrancar sidecar local y comprobar que `GET /agent` incluye `webapp` con `mode: "primary"`.

- [ ] **Step 4: Commit** — `git add backend/tiancode/src/agent/ && git commit -m "feat(core): add webapp agent for full-JSX web development"`

---

### Task 2: Apertura determinista del panel de vista previa en modo webapp

**Files:**
- Modify: `frontend/app/src/pages/session.tsx:1191-1199` (`maybeOpenLiveView`)

**Interfaces:**
- Consumes: agente actual del composer (ya disponible en el contexto de session.tsx vía `local.agent.current()` o equivalente; copiar cómo lo lee `use-composer-commands.tsx`).
- Produces: el panel se abre SIEMPRE que el agente de la sesión sea `webapp`, sin depender del texto del prompt.

- [ ] **Step 1: Extender `maybeOpenLiveView`** — abrir cuando `agent === "webapp"` además del regex existente:

```tsx
const maybeOpenLiveView = () => {
  ...
  if (agentName === "webapp" || BUILD_INTENT_REGEX.test(text)) view().liveView.open()
}
```

(donde `agentName` es el agente seleccionado en el momento del submit; el call site está en `session.tsx:2289`).

- [ ] **Step 2: Verificar** — `cd frontend/app && bun typecheck`.
- [ ] **Step 3: Commit** — `fix(app): always open live view for webapp sessions`

---

### Task 3: Tarjeta "Desarrollo Web y App" en Home + diálogo de creación

**Files:**
- Create: `frontend/app/src/pages/home/webapp-dialog.tsx`
- Create: `frontend/app/src/pages/home/webapp-project.tsx` (tarjeta)
- Modify: `frontend/app/src/pages/home/home-projects-view.tsx` (montar la tarjeta arriba del listado de proyectos)
- Modify: `frontend/app/src/i18n/{en,en-150,es,ja,ko,ru,zh}.ts` (claves `home.webapp.*`, `webapp.dialog.*`, `webapp.modeBadge`)

**Interfaces:**
- Consumes: `sdk().api.session.create({ agent: "webapp", location: { directory } })` (patrón exacto en `frontend/app/src/components/prompt-input/submit.ts:403-408`), envío de primer prompt (patrón `sendFollowupDraft`, `submit.ts:168-199`), `local.session.promote(directory, sessionID, { agent: "webapp" })` (`submit.ts:423`), navegación a sesión (mismo mecanismo que usa `home-sessions.tsx` al abrir una sesión).
- Produces: flujo completo Home → carpeta → sesión webapp → primer prompt enviado → panel abierto.

- [ ] **Step 1: i18n primero** (7 locales; `en-150` = copia exacta de `en`; insertar antes de una línea ancla existente, sin comas extra). Valores `en` y `es`:

| clave | en | es |
|---|---|---|
| `home.webapp.title` | Web & App Development | Desarrollo Web y App |
| `home.webapp.description` | Build apps and websites in full JSX with a real-time live preview. | Crea apps y webs en full JSX con visualización en tiempo real. |
| `home.webapp.action` | Start building | Empezar a crear |
| `webapp.dialog.title` | New web app | Nueva app web |
| `webapp.dialog.folderLabel` | Destination folder | Carpeta de destino |
| `webapp.dialog.nameLabel` | App name | Nombre de la app |
| `webapp.dialog.ideaLabel` | What do you want to build? | ¿Qué quieres crear? |
| `webapp.dialog.ideaPlaceholder` | e.g. a Kanban board with dark mode | p. ej. un tablero Kanban con modo oscuro |
| `webapp.dialog.submit` | Create | Crear |
| `webapp.dialog.cancel` | Cancel | Cancelar |
| `webapp.dialog.folderRequired` | Choose a folder first | Elige una carpeta primero |
| `webapp.modeBadge` | Full JSX · Live preview | Full JSX · Vista previa en vivo |

- [ ] **Step 2: `webapp-dialog.tsx`** — diálogo con: selector de carpeta (reutilizar el patrón de `dialog-select-directory-v2.tsx` / `directory-picker.tsx`), input nombre, textarea idea, botón Crear. Al enviar:
  1. `const session = await sdk().api.session.create({ agent: "webapp", location: { directory } })`
  2. `local.session.promote(directory, session.id, { agent: "webapp" })`
  3. `await sdk().api.prompt({ sessionID: session.id, id: crypto.randomUUID(), agent: "webapp", text: \`Crea una app web llamada "${name}". ${idea}\`, ...legacyParts })` (copiar la forma exacta de `sendFollowupDraft` en `submit.ts:168-199`)
  4. Navegar a la sesión + `view().liveView.open()` (Task 2 ya lo cubre en el submit normal; aquí forzarlo también).
- [ ] **Step 3: `webapp-project.tsx`** — tarjeta destacada (icono monitor/código, título, descripción, botón) siguiendo el estilo de las tarjetas existentes de `home-projects-view.tsx`. Montarla como primera tarjeta del grid/hero de proyectos.
- [ ] **Step 4: Verificar**

```bash
cd frontend/app && bun typecheck && bun test src/i18n/parity.test.ts
```
Expected: typecheck limpio; parity 7/7.

- [ ] **Step 5: Commit** — `feat(app): home entry for Web & App development mode`

---

### Task 4: Badge de modo en el composer

**Files:**
- Modify: `frontend/app/src/pages/session/composer/session-composer-region.tsx` (o el componente de controles del composer donde ya se pinta el selector de agente)

- [ ] **Step 1:** Cuando el agente seleccionado sea `webapp`, pintar un chip con `language.t("webapp.modeBadge")` + dot verde, junto al selector de agente (`Show when={agent === "webapp"}`). Sin lógica nueva más allá de la visual.
- [ ] **Step 2:** `cd frontend/app && bun typecheck`.
- [ ] **Step 3: Commit** — `feat(app): webapp mode badge in composer`

---

### Task 5: Smoke test manual del flujo completo (dev)

1. Arrancar la app en dev; Home → tarjeta "Desarrollo Web y App" → carpeta vacía nueva → nombre "demo" → idea "un pomodoro timer con modo oscuro".
2. Verificar: sesión creada con agente `webapp`; el agente escribe `src/App.jsx` primero y llama `preview_start`; el panel se abre solo; el preview muestra la app y se refuerza con cada archivo (recarga < 1 s).
3. Probar un modelo distinto (p. ej. uno local y uno de otra familia) — el contrato debe sostenerse por el prompt, no por el modelo.
4. Provocar un error a propósito ("usa lucide-react") → overlay de error → el agente debe corregirlo mirando `preview_logs`.
5. Escape hatch: pedir "quiero Next.js real con Tailwind" → el agente debe cambiar a proyecto Vite/Next con package.json.

---

### Task 6: Release v1.0.96

- [ ] Bump `frontend/desktop/package.json` → `1.0.96`.
- [ ] `cd frontend/desktop && TIANCODE_CHANNEL=prod bun run build` (el canal se fija en build, no solo en package). Verificar "built in" en la salida (no `| tail`).
- [ ] Verificar con la app EMPAQUETADA (lecciones: manualChunks, rutas Temp): tarjeta visible en 7 idiomas, flujo completo, preview sin pantalla negra.
- [ ] `bun typecheck` en los 6 packages.
- [ ] Subir a la release nueva (target `main`): `latest.yml`, `Tiancode.exe`, `Tiancode-portable.exe` vía uploads.github.com (auth por `git credential fill`). Los deletes transitorios (HTTP 000) se reintentan uno a uno.
- [ ] Verificar que la app instalada (1.0.95) ofrece el update ANTES de declarar listo. Entregar artefactos y pasos al usuario — NO ejecutar instaladores.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El modelo ignora el contrato (importa libs externas) | Prompt estricto + overlay de error educativo + `preview_logs` en el loop del agente + AGENTS.md persistido en el proyecto |
| Mini-runtime no es React real (class components, `useId`, portals fallan) | Lista de APIs permitidas/prohibidas en el prompt; (futuro v2: servir React+ReactDOM reales pre-bundleados con esbuild en recursos) |
| Usuario pide stacks reales (Tailwind, Next) | Escape hatch documentado en el prompt → proyecto Vite vía DevServerManager (ya soportado) |
| Regresión pantalla negra renderer | No tocar manualChunks; verificar SIEMPRE con app empaquetada |
| i18n roto (claves literal / ",,") | Insertar antes de línea ancla; test de paridad 7/7 antes de commit |
| Recarga full-reload pierde estado | Acepto (igual que sandboxes simples); documentado |

## Decisiones abiertas (recomendación entre paréntesis)

1. ¿Agente nativo en `agent.ts` o sembrado por config? (nativo — aparece para todos, controlado por versiones).
2. ¿Plantilla starter copiada por Electron main o scaffoldeada por el agente? (agente — cero plumbing nuevo, primera pantalla real al instante).
3. ¿v2 con React real pre-bundleado para libs externas? (posponer hasta demanda real).
