# Auditoría completa del proyecto — Tiancode

> Fecha: 2026-08-26 · Rama: `audit-fixes-icons` · Base: `v1.0.97` (commit `da8d656`)
> Alcance: monorepo completo (backend, frontend, desktop, TUI, SDK, protocolo).

---

## 1. Resumen ejecutivo

| Área | Estado antes | Estado después |
|---|---|---|
| Typecheck (`bun turbo typecheck`) | 27/27 OK | 27/27 OK |
| Lint (`oxlint`) | 2 errores, 4.710 warnings | **0 errores**, ~4.700 warnings (backlog pre-existente) |
| Bugs críticos confirmados | 12 | **12 corregidos** |
| Archivos vacíos/muertos | 5 | **Eliminados/documentados** |
| Branding peligroso (upgrade a upstream) | 2 superficies | **Neutralizadas** |
| Iconos plugins/MCP/skills/agents | No existía soporte | **Implementado end-to-end** |
| Clonado de skills desde GitHub | Botón falso (solo toast) | **Funcional real** |

Los fallos del test `test/agent/agent.test.ts` ("defaultAgent…") son **pre-existentes**: se
verificó que fallan idénticamente con los cambios revertidos.

---

## 2. Bugs críticos corregidos

### 2.1 Imágenes sociales corruptas (og:image roto en toda la app)
- **Síntoma**: `frontend/app/public/social-share.png`, `-zen.png`, `frontend/web/public/*` eran
  archivos de texto plano de 43–47 bytes conteniendo la ruta del symlink original — symlinks
  rotos por checkout en Windows (`core.symlinks=false`). Referenciados como `og:image` /
  `twitter:image` en `app/index.html:19-20`, `desktop/src/renderer/index.html:12-13`.
- **Fix**: copiados los PNG reales desde `frontend/ui/src/assets/images/`.

### 2.2 `upgrade` instalaba el opencode ORIGINAL encima de Tiancode 🔴
- `backend/tiancode/src/installation/index.ts:51` apuntaba a `https://opencode.ai/install`;
  el script instala el CLI `opencode` upstream. Con método detectado `curl` (ejecutable bajo
  `.tiancode/bin`), `tiancode upgrade` habría **reemplazado el binario**.
- **Fix**: `upgradeCurl` ahora rechaza con mensaje claro y URL de releases propia; eliminado
  el fetch al script upstream (también `upgradeScriptShell` y uso de `Stream`).

### 2.3 Check de versión consultaba releases del upstream
- `installation/index.ts:275` leía `api.github.com/repos/anomalyco/opencode/releases/latest`,
  reportando versiones ajenas al fork.
- **Fix**: apunta a `Dreftian/Tiancode/releases/latest`.

### 2.4 Chip de latencia FALSO en la lista MCP
- `settings-v2/mcp-servers.tsx` mostraba `⚡ {6 + name.length % 9} ms` — un dato inventado.
- **Fix**: eliminado.

### 2.5 Botón "Clonar desde GitHub" falso + `window.prompt`
- El botón mostraba toast de éxito sin clonar nada; además usaba `window.prompt`
  (no soportado en Electron → crashearía) y texto hardcodeado en español.
- **Fix**: implementación real (sección 4).

### 2.6 OAuth refresh silenciosamente tragado (Snowflake Cortex)
- `plugin/snowflake-cortex.ts:300-317`: fallos de refresh/persistencia en `catch {}` y
  `.catch(() => {})`; las peticiones seguían con token expirado sin rastro.
- **Fix**: logging con prefijo `[snowflake-cortex]` en ambos caminos.

### 2.7 Ruta `/tmp` hardcodeada (crash en Windows)
- `control-plane/dev/debug-workspace-plugin.ts:6`: `/tmp/...` resolvía a `<drive>:\tmp` → ENOENT.
- **Fix**: `path.join(os.tmpdir(), ...)`.

### 2.8 Auth env malformada fallaba en silencio
- `auth/index.ts:78`: `TIANCODE_AUTH_CONTENT` inválido caía a vacío sin rastro.
- **Fix**: `Effect.logWarning` con detalle del error y fallback a `auth.json`.

### 2.9 Metainfo beta Linux inexistente rompía builds deb/rpm beta
- `electron-builder.config.ts` referenciaba `resources/ai.tiancode.desktop.beta.metainfo.xml`
  pero nunca se generaba (`copy-metainfo.ts` no estaba cableado en `prepare:release`).
- **Fix**: agregado `&& bun ./scripts/copy-metainfo.ts` a `prepare:release`; regenerados los 3
  metainfo (prod/dev/beta) con URLs propias (bugtracker/homepage/vcs → Dreftian/Tiancode,
  tiancode.ai); eliminado screenshot muerto hacia asset upstream.

### 2.10 Escape octal real en prompt-input (utilidad Tailwind rota)
- `session-ui/src/v2/components/prompt-input/index.tsx:170`: `content-['\200B']` dentro de un
  string JS interpreta `\2` como escape octal (char U+0080 + "00B"), generando CSS corrupto.
- **Fix**: `\\200B` para que CSS reciba el escape `\200B` correcto. Esto también elimina uno de
  los 2 errores históricos de lint.

### 2.11 Errores lint bloqueantes
- Constructor inútil en código generado (`httpapi-codegen`) → arreglado en la **plantilla del
  generador** (`backend/httpapi-codegen/src/index.ts`) y regenerado `backend/client`.
- Constructor redundante `ResponseStreamError` (`provider/error.ts`) → eliminado (firma
  heredada equivalente; verificados todos los call-sites).

### 2.12 Código muerto / stubs
- `frontend/tui/src/component/prompt/cwd.ts` (0 bytes, sin importadores) → **eliminado**.
- `frontend/desktop/src/renderer/styles.css` (0 bytes) + su import → **eliminados**.
- `frontend/app/src/components/settings-v2/skills-manager.tsx` (prototipo en memoria, nunca
  montado) → **eliminado**.
- `cli/cmd/tui.ts:309` marcador `// scratch` → limpiado.
- `server/projectors.ts` stub no-op → documentado como punto de anclaje intencional para
  projectors durables (ver `src/sync/README.md`).
- Import muerto `styles.css` verificado contra Vite build config.

---

## 3. Iconos para Plugins / MCP / Skills / Agents (nueva feature)

### Backend / contrato
Nuevo campo opcional `icon?: string` (nombre de glifo del sprite o emoji):
- `backend/schema/src/skill.ts` — `SkillV2.Info.icon`
- `backend/schema/src/agent.ts` — `AgentV2.Info.icon`
- `backend/core/src/config/agent.ts` — config v2 acepta `icon`
- `backend/core/src/v1/config/agent.ts` — config legacy acepta `icon` (+KNOWN_KEYS)
- `backend/core/src/v1/config/migrate.ts` — migración V1→V2 preserva `icon`
- `backend/core/src/config/plugin/agent.ts` — aplica `icon` al transformar agentes
- `backend/tiancode/src/agent/agent.ts` — runtime `/api/agent` expone `icon`
- `backend/tiancode/src/skill/index.ts` — frontmatter de `SKILL.md` honra `icon:`; skill
  builtin `customize-tiancode` usa `icon: "sliders"`
- SDK regenerado: `bun run generate` (backend/client) + `backend/sdk/js/script/build.ts`

Ejemplo de uso:
```md
---
name: mi-skill
description: Mi skill personalizada
icon: 🧠        # o "brain" (glifo), o "github", etc.
---
```
```jsonc
// tiancode.json
{ "agent": { "reviewer": { "icon": "🛡️", "color": "#22d3ee" } } }
```

### Frontend
- `frontend/ui/src/components/icon.tsx`: exportados `IconName` + guard `isIconName()`.
- Nuevo componente `settings-v2/parts/item-icon.tsx`:
  - `SettingsItemIconV2` — avatar circular 28px: emoji → texto; nombre conocido → glifo;
    desconocido → fallback. Color vía `--item-icon-color` (hex directo o fallback hash).
  - `fallbackGlyph(seed)` — glifo determinista por nombre (pool de 8 glifos temáticos).
  - `guessGlyph(name)` — heurística para MCP servers: github→github, discord→discord,
    fs/files→folder, shell/terminal→terminal, git→branch, db/sqlite/postgres→server,
    memory/knowledge→brain, web/search/fetch→magnifying-glass; default→mcp.
  - `hashColor(seed)` / `itemColor(color, seed)` — tinte determinista (hue 360°) cuando no hay
    color explícito hex.
- Integraciones:
  - `skills.tsx` — icono por skill (frontmatter o fallback determinista) en lista y detalle.
  - `mcp-servers.tsx` — avatar por servidor con tinte según estado (success/warning/danger).
  - `plugins.tsx` — filas instaladas (`plugin`), catálogo npm (`download`) y local (`code-lines`).
  - `sub-agents.tsx` — el dot del avatar se reemplaza por icono/emoji del agente
    (`fallback: subagent`), conservando el color configurado.

---

## 4. Clonado real de skills desde GitHub

Implementado 100% cliente en `settings-v2/skills.tsx` (sin cambios de backend: reusa el
endpoint existente `app.skills.import` que escribe en el directorio global y recarga):

- Acepta: `github.com/{owner}/{repo}` (repo completo), `/tree/{ref}/{ruta}` (carpeta),
  `/blob/{ref}/.../SKILL.md` (archivo único).
- Descubre `SKILL.md` via Git Trees API (`recursive=1`), descarga contenido vía
  `raw.githubusercontent.com` (ambos con CORS habilitado; el renderer desktop además neutraliza CORS).
- Cada skill instala sus archivos hermanos de su propia carpeta (referencias incluidas).
- Límites: máx. 20 skills por operación, 30 archivos por skill.
- UI: nueva fila "Import from GitHub" en la sección Import (i18n completo en
  en/en-150/es/ja/ko/ru/zh — 8 claves nuevas), toasts reales de éxito/error/"sin SKILL.md".
- Eliminado el botón header con copy hardcodeado español y `window.prompt`.

---

## 5. Branding — URLs corregidas

| Antes | Después | Archivo(s) |
|---|---|---|
| `$schema: opencode.ai/config.json` | `tiancode.ai/config.json` | `config/config.ts` (×5) |
| `HTTP-Referer: opencode.ai` | `https://tiancode.ai/` | `provider/provider.ts` (×7) |
| Feedback `anomalyco/opencode` | `Dreftian/Tiancode/issues` | prompts `default/anthropic/meta.txt` |
| Docs `opencode.ai/docs` | `tiancode.ai/docs` | prompts anthropic/meta, `tui/app.tsx` |
| Feedback desktop | issues propio | `app/pages/error.tsx` |
| favicon opencode | `tiancode.ai/favicon.svg` | `pages/layout/helpers.ts` |
| `tiancode.vercel.app` | `https://tiancode.ai` | `desktop-menu.ts`, `layout.tsx`, `home-projects-controller.tsx` |
| CORS sin dominio propio | añadidos `tiancode.ai` + `app.tiancode.ai` | `backend/server/src/cors.ts` |
| OAuth MCP `client_uri` | `tiancode.ai` | `mcp/oauth-provider.ts` |
| Descripciones config docs links | tiancode.ai/docs | `core/v1/config/config.ts` |
| repository ui package | Dreftian/Tiancode | `frontend/ui/package.json` |

### Dejados intencionalmente (infraestructura funcional upstream)
- `console.opencode.ai` (OAuth device del plugin Tiancode Console) y upsell `/go` en
  `session/retry.ts`: el producto console vive en esa infraestructura; cambiarlos rompería
  flujos activos. Pendiente de decisión de producto (consola propia).
- `models.opencode.ai` (catálogo de modelos, override con `TIANCODE_MODELS_URL`),
  `UI_UPSTREAM app.opencode.ai` (proxy UI embebido), `TUI_SCHEMA_URL`, dependencias npm
  `opencode-gitlab-auth`/`opencode-poe-auth`, identificadores internos tipo `OpencodeClient`.
- Nota: durante la auditoría se detectó una sospecha de corrupción `https://n/...` heredada
  del renombrado masivo (`2d30fd4`); verificado con `git show` que era artefacto de visualización
  de rg — los archivos están íntegros.

---

## 6. Hallazgos documentados sin corregir (deuda técnica)

### Backend
1. `core/tool/bash.ts:66-77` — 12 TODOs de paridad V2 (aprobaciones del parser, jobs en
   background, streaming). **Afecta Windows**: tokenización POSIX con `cmd.exe` default.
2. `core/file-mutation.ts:201-207` — sin formatter/watcher/undo/LSP/transacciones multi-archivo.
3. `tool/edit.ts`, `tool/write.ts` — mismas carencias + fuzzy-correction sin portar.
4. `github-copilot/chat/openai-compatible-chat-language-model.ts:386` — "lost type safety … MUST FIX".
5. `provider/transform.ts:98` — normalización ineficiente auto-reconocida en hot path.
6. `provider/provider.ts:312,572` — mutación directa de `process.env` (Env.set solo copia superficial).
7. `sqlite.node.ts:103` / `sqlite.bun.ts:102` — `executeStream()` = `Stream.die("not implemented")`.
8. `plugin/index.ts:232-240` — TODO publicar eventos propios ante fallo de hook.
9. `plugin/v2/effect/PLAN.md` — migración parcial (hooks tool/session, error model, timeouts).
10. `~27 catch {}` restantes (mayoría defensivos y aceptables).
11. `llm/node_modules` contiene copias obsoletas `@opencode-ai/*` junto a `@tiancode-ai/*` (limpiar con reinstall).

### Frontend
12. `getDisplayBackend/setDisplayBackend` stubbed end-to-end (feature Wayland sin terminar) —
    `desktop/src/main/index.ts:296-297`.
13. `desktop-menu`/windows session inyecta `Access-Control-Allow-Origin: *` en cada request
    del renderer (trade-off deliberado para sidecars; revisar).
14. Tray menu con strings EN hardcodeadas (`desktop/src/main/tray.ts:29-31`) — viola mandato i18n.
15. `skills.tsx` mantiene tablas de traducción ES hardcodeadas que bypasean i18n (~350 líneas).
16. Tags git remotos `v1.0.96`/`v1.0.97` apuntan al mismo commit ajeno al HEAD local
    (167 ahead/9 behind vs origin) — reconciliar antes del próximo release.
17. `social-share-black.png` en ui/assets sin referenciar; `help/placeholder.png` huérfano.
18. `parsers-config.ts:153` — tree-sitter injections rotas ("TODO: not working").

### Tests pre-existentes fallando
19. `test/agent/agent.test.ts` — 3 fallos de `defaultAgent` (orden/selección): presentes en HEAD base,
    verificado por stash. Fuera del alcance de esta rama.

### Lint
20. Quedan ~4.700 warnings (unused vars/params, unsafe assertions, empty catches) — backlog;
    esta rama no introdujo warnings nuevos y redujo el total.

---

## 7. Cambios por archivo (resumen)

<details>
<summary>Lista completa (git status)</summary>

```
M  .oxlintrc.json                          (ignore *.astro)
M  backend/client/src/generated/**          (regen, ctor fix)
M  backend/core/src/config/agent.ts         (+icon)
M  backend/core/src/config/plugin/agent.ts  (+icon keys/aplicación)
M  backend/core/src/v1/config/agent.ts      (+icon)
M  backend/core/src/v1/config/migrate.ts    (preserva icon)
M  backend/core/src/v1/config/config.ts     (docs URLs)
M  backend/httpapi-codegen/src/index.ts     (plantilla ClientError)
M  backend/schema/src/{skill,agent}.ts      (+icon)
M  backend/sdk/js/**                        (regen)
M  backend/server/src/cors.ts               (+origins propios)
M  backend/tiancode/src/agent/agent.ts      (+icon runtime)
M  backend/tiancode/src/auth/index.ts       (log warning)
M  backend/tiancode/src/cli/cmd/tui.ts      (-// scratch)
M  backend/tiancode/src/config/config.ts    ($schema URL)
M  backend/tiancode/src/control-plane/dev/debug-workspace-plugin.ts (tmpdir)
M  backend/tiancode/src/installation/index.ts (upgrade seguro + releases propios)
M  backend/tiancode/src/mcp/oauth-provider.ts (client_uri)
M  backend/tiancode/src/plugin/snowflake-cortex.ts (logs OAuth)
M  backend/tiancode/src/provider/error.ts   (-ctor)
M  backend/tiancode/src/provider/provider.ts (referer)
M  backend/tiancode/src/server/projectors.ts (doc)
M  backend/tiancode/src/session/prompt/*.txt (feedback URLs)
M  backend/tiancode/src/skill/index.ts      (+icon frontmatter/builtin)
D  frontend/tui/src/component/prompt/cwd.ts
M  frontend/desktop/package.json            (1.0.98 + prepare:release metainfo)
M  frontend/desktop/scripts/copy-metainfo.ts(URLs propias)
D  frontend/desktop/src/renderer/styles.css (+import)
M  frontend/desktop/src/renderer/index.tsx
M  frontend/session-ui/.../prompt-input/index.tsx (\200B escape)
M  frontend/ui/src/components/icon.tsx      (IconName/isIconName)
M  frontend/ui/package.json                 (repository)
M  frontend/web/public/social-share*.png    (PNGs reales)
M  frontend/app/public/social-share*.png    (PNGs reales)
A  frontend/app/src/components/settings-v2/parts/item-icon.tsx
M  frontend/app/src/components/settings-v2/{skills,mcp-servers,plugins,sub-agents}.tsx
M  frontend/app/src/components/settings-v2/settings-v2.css (.settings-v2-item-icon)
D  frontend/app/src/components/settings-v2/skills-manager.tsx
M  frontend/app/src/i18n/{en,en-150,es,ja,ko,ru,zh}.ts (+8 claves github clone)
M  frontend/app/src/pages/error.tsx, layout.tsx, layout/helpers.ts, home-projects-controller.tsx
M  frontend/app/src/desktop-menu.ts
M  frontend/tui/src/app.tsx                 (docs URL)
```
</details>

---

## 8. Verificación realizada

| Check | Resultado |
|---|---|
| `bun turbo typecheck` (27 paquetes) | ✅ 27/27 |
| `oxlint` (raíz) | ✅ 0 errores |
| i18n parity tests (`frontend/app`) | ✅ 7/7 pass |
| core `test/config/agent.test.ts` (incluye nuevo caso icon) | ✅ 6/6 |
| tiancode `test/config/agent-color.test.ts` | ✅ 2/2 |
| tiancode `test/acp/service-session.test.ts` | ✅ 33/33 |
| tiancode `test/agent/agent.test.ts` | ⚠️ 40/43 (3 fallos pre-existentes, verificados en base) |
| SDK regenerado (client + sdk/js legacy & v2) | ✅ |

## 9. Release

- `frontend/desktop/package.json` bump **1.0.97 → 1.0.98** (mandato AGENTS.md: todo cambio
  user-facing = nueva versión default; updater ignora assets bajo misma versión).
- Actualización no destructiva: ningún cambio toca formato de almacenamiento de credenciales,
  settings ni sesiones; las migraciones nuevas (ninguna) serían in-place.
