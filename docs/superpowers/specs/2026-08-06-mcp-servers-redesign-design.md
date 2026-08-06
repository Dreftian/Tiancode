# MCP Servers, Plugins, Sub-Agents, Tray & Onboarding — Tian Settings Redesign

**Date:** 2026-08-06
**Status:** Approved in parts (MCP + Plugins design approved; Sub-Agents + Tray + Onboarding added by user request)

## Goal

Bring the Tian settings dialog in line with ZCode's desktop agent:

1. **MCP Servers**: redesigned list (live status, tool counts, search, grouping) + a "Discover" catalog of popular MCP servers with enable/disable toggles.
2. **Plugins**: mixed catalog — popular npm apps (one-click add) + functional local plugins implemented in the repo.
3. **Sub-Agents**: replicate ZCode's sub-agent form (Name, Color swatches, Model, Description, Allowed tools, System prompt, Inject AGENTS.md) and list (search, state filter, groups, edit/delete/toggle).
4. **System tray**: setting to minimize to the system tray instead of closing the app.
5. **First-launch onboarding**: compact dialog — disclaimer/terms → theme (light/dark) + language (es/en) → "Start" button.

## 1. MCP Servers tab (approved design)

### Backend
- `StatusConnected` gains `tools: number` (`backend/tiancode/src/mcp/index.ts`), computed as `(s.defs[name] ?? []).length` in the `status()` effect.
- Regenerate SDK via `bun run generate` from `backend/client` (never hand-edit `src/generated`).

### List (left column)
- Search input above the list (rendered only when >1 server).
- Row: live status dot (green/red/yellow/gray), name (560), chips (type, `N tools` when connected, textual status), mono sub-detail (command or URL), truncated red error when failed. Actions unchanged (Connect/Disconnect, Edit, Export, Remove).
- Grouping under subtle headers only when >1 group: Connected → Errors → Disabled → Unknown; alphabetical within groups.
- Live status: poll `GET /mcp/status` every 10s while dialog open; refetch after every mutation; clear timer on cleanup.

### Discover catalog (below the list)
15 verified presets, each with name, short description, type chip, and an enable/disable switch. Enabling calls `mcp.add({name, config})` with the verified command/URL; disabling sets `enabled: false`. If the server already exists, the switch reflects real state. Presets requiring credentials show hint "requires API key — edit after adding". Remote OAuth presets enable with `oauth: true`.

| Preset | Command / URL |
|---|---|
| android-emulator | `npx -y @mobilenext/mobile-mcp@latest` |
| node-repl | `npx -y repl-mcp@latest` |
| ios-simulator | `npx -y ios-simulator-mcp` |
| chrome-devtools | `npx -y chrome-devtools-mcp@latest` |
| playwright | `npx -y @playwright/mcp@latest` |
| context7 | `npx -y @upstash/context7-mcp` |
| aikido | `npx -y @aikidosec/mcp` |
| airwallex | `npx -y @airwallex/developer-mcp@latest` |
| canva | remote `https://mcp.canva.com/mcp` (OAuth) |
| circle | remote `https://developers.circle.com/mcp` |
| appwrite | remote `https://mcp.appwrite.io/` (OAuth) |
| apollo | remote `https://mcp.apollo.io/mcp` (OAuth) |
| graphos-tools | remote `https://mcp.apollographql.com` |
| atlan | remote `https://mcp.atlan.com/mcp` (OAuth) |
| awsknowledge | remote `https://knowledge-mcp.global.api.aws` |

Excluded with reason: `appwrite-docs` (deprecated/sunset), `airwallex-agentos` (no public preset), `node_repl` (no standard npm package; mapped to `repl-mcp`).

## 2. Plugins tab — mixed catalog

New "Popular apps" section below "Installed":

1. **npm apps** (one-click Add → same `config.update({plugin: [...]})` path as the manual input): `@biomejs/biome`, `@playwright/mcp`, `@octokit/rest`, `@slack/web-api`, `@notionhq/client`, `@sentry/cli`, `agent-notify`, `@chime-io/plugin-claude`. Chip "npm" + discreet note that the package must implement Tian's plugin convention.
2. **Local functional plugins** implemented in the repo at `plugins/` (repo root), using verified runtime hooks (`backend/plugin/src/index.ts`):
   - `env-guard` — `tool.execute.before`: denies edits to `.env`/secrets
   - `commit-helper` — `command.execute.before`: validates commit format
   - `notify-idle` — `session.idle`: notification/sound when idle
   - `shell-env` — `shell.env`: injects `TIAN_PLUGIN_ENABLED=1`
   - `permission-guard` — `permission.ask`: auto-denies dangerous commands (`rm -rf`, `git push --force`)
   - Each with one-click Add (local spec `./plugins/<name>.ts`) and chip "local". Applies to workspaces containing the file.

## 3. Sub-Agents tab — ZCode replica

### Form (exact ZCode 3.7.1 field order, verified from app.asar)
1. **Name** — text input, placeholder `code-reviewer`; validation 3–50 chars, `^[a-zA-Z0-9-]+$`.
2. **Color** — radio group of 8 round swatches: yellow, red, orange, green, cyan, blue, purple, pink. Persisted as hex (Tian supports hex or theme tokens).
3. **Model** — dropdown with "inherit" plus available models (fallback: free-text input with `provider/model` placeholder if no model list endpoint).
4. **Description** — text input, placeholder "Short description shown to the model". Required.
5. **Allowed tools** — segmented control: "Default all permissions" (omit) / "Custom allowed tools" (checkbox grid of 9 tools: Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch, TodoWrite; Bash/Edit/Write marked sensitive). Custom mode persists `permission` with allow for checked, deny for unchecked.
6. **System prompt** — textarea (3 rows), placeholder "Describe this subagent's role and rules...". Required; written as markdown body.
7. **Inject AGENTS.md** — toggle row, default `true`, persisted as `injectAgentsMd` in frontmatter (pass-through field for now; runtime injection not implemented in this iteration).
- Below: "Workspace-level creation or editing is unsupported" info row when `directory` prop is set.
- Footer: Delete (edit mode only, confirm), Save ("Saving…"/"Save"), Cancel.

### List
- Header: description + **New subagent** button.
- Search input + state filter (All / Enabled / Disabled).
- Groups with counts: **User subagents** (editable), **Built-in subagents** (read-only, hint "not editable here").
- Row: avatar (bot icon + color dot), name + badges (model or "inherit", tools "All tools" or "{n} tools"), 2-line description, actions: enabled switch, edit (pencil), delete (trash, confirm) — edit/delete only for user scope.
- Empty state (dashed border): "No subagents found". Footer: "N subagents · M enabled".

### Backend changes
- Extend `AgentCreateInput` (`backend/tiancode/src/server/routes/instance/httpapi/groups/instance.ts`) with `prompt?`, `injectAgentsMd?` (keep existing `tools?`).
- `buildAgentMarkdown`: description in frontmatter (already), system prompt as body (currently body = description), tools → `permission` (allow/deny), `injectAgentsMd` field.
- New endpoints: update (`POST /agent/:name` or PUT) and delete (`DELETE /agent/:name`) + handlers; enable/disable via `disable: true|false` in frontmatter.
- Add `injectAgentsMd` optional field to `ConfigAgentV1.Info` schema.
- Regenerate SDK.

## 4. System tray (Electron)

- **Setting**: toggle in settings-general (persisted in electron-store `tiancode.settings` via existing generic `store-get/store-set` IPC; renderer-only, no backend config change).
- **Main process** (`frontend/desktop/src/main/`): add `Tray` with icon (`resources/icons/icon.ico|png`) and context menu (Show / Quit); add `window-all-closed` + window `close` interception — when the tray setting is enabled, closing the last window hides it (`win.hide()`) and keeps the app running instead of quitting; Quit from tray (or setting off) exits normally. Respect `quitting` flag in `window-registry.ts`.
- App has no Tray or window-all-closed handler today (default: closing last window quits).

## 5. First-launch onboarding

- Existing gate already works: `DesktopFirstLaunchOnboarding` (renderer, currently returns `null`) + `startup={onboarding.promise}` blocks app render; flags in `main/onboarding.ts` (`firstLaunchOnboardingComplete` in electron-store) with IPC `is-first-launch-onboarding-pending` / `finish-first-launch-onboarding`.
- **UI** (replaces the `null` return): compact centered dialog (≈420px) with two steps:
  1. **Disclaimer** — usage terms & policies text, **Accept** button (required to continue).
  2. **Theme + Language** — light/dark selector and es/en selector, **Start** button.
- On Start: `useTheme().setColorScheme(...)`, `useLanguage().setLocale(...)`, `finishFirstLaunchOnboarding(true)` (creates Default Project), dialog closes and app appears.
- i18n keys for both languages; no hardcoded English strings (desktop rule).

## i18n

New keys in `en.ts`/`es.ts`: MCP discover (title, empty, requiresKey), apps catalog (npm/local titles), sub-agents (form fields, color names, tools catalog, groups, filters, workspace-scope notice, confirm dialogs, counts), tray setting label, onboarding (disclaimer, theme, language, start).

## Verification

- `bun typecheck` from `backend/tiancode`, `frontend/app`, `frontend/desktop`.
- SDK regenerated; `McpStatusConnected` includes `tools`.
- Desktop: `electron-vite build` or dev run for tray + onboarding.
- No UI test suite in repo; visual validation in running app.

## Implementation order (parallel agents)

1. **Backend agent** (single, to avoid SDK conflicts): MCP `tools` count + sub-agent create/update/delete/prompt/tools + `injectAgentsMd` schema + SDK regen.
2. **Frontend settings agents** (parallel, separate files): mcp-servers (redesign + catalog), plugins (catalog), sub-agents (form + list).
3. **Desktop agents** (parallel, separate files): tray, onboarding.
4. Local plugins at `plugins/` (repo root).
5. Final: typecheck/build pass across packages.
