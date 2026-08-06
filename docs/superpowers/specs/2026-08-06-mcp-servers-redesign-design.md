# MCP Servers Tab Redesign

**Date:** 2026-08-06
**Status:** Approved (user: "sí ese")

## Goal

Redesign the MCP Servers tab in the Tian settings dialog to match the MCP servers section of ZCode (the CLI agent): live connection status with health checks, tool counts, searchable/grouped server list, and an improved add/edit form — while keeping the existing two-column layout (list left, form right).

## Scope

- `frontend/app/src/components/settings-v2/mcp-servers.tsx` — list rows, live status polling, grouping, search
- `frontend/app/src/components/settings-v2/mcp-servers.css` — row layout, status dot, group headers, search input
- `frontend/app/src/i18n/en.ts` / `es.ts` — new strings
- `backend/tiancode/src/mcp/index.ts` — expose tool count in `StatusConnected`
- Regenerate SDK from `backend/client` (`bun run generate`; never edit `src/generated` by hand)

Out of scope: OAuth UI flow (backend endpoints already exist but are not wired into this tab), plugin tab, other settings tabs.

## Backend change

`StatusConnected` currently is `{ status: "connected" }`. Add `tools: number`.

In the `status()` effect, for each server whose runtime status is `connected`, set `tools` to `(s.defs[name] ?? []).length`. Other statuses keep their current shape.

SDK types (`McpStatusConnected`) are regenerated via `bun run generate` from `backend/client`. Do not hand-edit `src/generated` / `src/generated-effect`.

## UI — server list (left column)

### Search

- Small `TextInputV2` above the list, only rendered when there is more than one configured server.
- Filters servers by name (case-insensitive substring). Empty query shows everything.

### Row layout

Each row has three zones:

1. **Status dot** — 8px circle, live color per status:
   - `connected` → green
   - `failed` → red
   - `needs_auth` / `needs_client_registration` → yellow
   - `disabled` / `unknown` → gray
2. **Copy column**:
   - Server name (weight 560), followed by chips: type (`local`/`remote`), `N tools` (only when `connected`, from the new backend field), textual status chip (existing tones).
   - Sub-detail line: truncated command in mono (local) or truncated URL (remote).
   - When `failed`: existing truncated red error message.
3. **Actions** — unchanged: Connect/Disconnect (outline), Edit (ghost), Export (ghost), Remove (danger, with confirm).

### Grouping

Group servers under subtle headers only when more than one group is present:
`Connected` → `Errors` → `Disabled` → `Unknown`. Within a group, keep alphabetical order by name.

### Live status

- Poll `GET /mcp/status` every 10 seconds while the settings dialog is open.
- Refetch immediately after every mutation (connect/disconnect/toggle/save/remove), as today.
- Use `createResource` + a timer that calls `refetch()`; clear the timer on component cleanup so polling stops when the dialog closes.

## UI — form (right column)

Structure stays as-is: name, type (local/remote), presets + command, environment, URL/headers/OAuth, cwd, timeout.

One change: the submit button label becomes "Save changes" while editing (today it always says "Save").

## i18n

New keys (both `en.ts` and `es.ts`):

- `settings.mcpServers.search.placeholder`
- `settings.mcpServers.group.connected` / `.errors` / `.disabled` / `.unknown`
- `settings.mcpServers.tools.count` — "{count} tools"
- `settings.mcpServers.save.changes`

## Verification

- `bun typecheck` from `backend/tiancode` and `frontend/app`.
- SDK regenerated files compile; `McpStatusConnected` includes `tools`.
- No UI test suite exists in the repo; validate visually in the running app.
