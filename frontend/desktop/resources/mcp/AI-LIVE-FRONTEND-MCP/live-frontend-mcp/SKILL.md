---
name: live-frontend-mcp
description: >
  Show the user a live dashboard of the frontend you are building. Use this
  when you are implementing or iterating on a web/desktop UI and want the
  user to see the file tree, current file, phase, logs, preview and captures
  in real time. Start a session with create_session, then keep it updated
  with set_phase, set_preview, set_current_file, publish_log and process
  events as you work.
---

# Live Frontend MCP

The `AI-LIVE-FRONTEND-MCP` server makes the frontend work visible in a local
dashboard (http://127.0.0.1:8790/) while you build.

## Workflow

1. **Start a session.** Call `create_session` with `root_text` = the absolute
   path of the project directory you are working in, and `mode`:
   - `"web"` for browser work,
   - `"desktop"` for desktop-app work (adds a screenshot pane).
   Optional: `label` (display name) and `preview_url` (the dev-server URL).
2. **Point the preview.** Call `set_preview` with the URL of the running dev
   server (e.g. `http://localhost:5173`) so the dashboard iframe shows the
   app. Prefer reporting the preview URL early — it is the first thing the
   user looks at. In the Tiancode desktop app, `set_preview` also navigates
   the "Vista en vivo" panel automatically; if no preview URL is set, the
   panel detects the first local dev-server URL (`http://localhost:PORT`)
   among the published logs — report the URL when you start the server.
   Do not launch Chrome, the system browser, `Start-Process`, `explorer`, or
   browser-automation tools to show a preview. The embedded panel is the
   preview surface; only open an external browser when the user explicitly
   asks for one. For a Tiancode-managed project, use `preview_start` instead
   of a shell launcher and let its ready state open the embedded panel.
3. **Announce the phase.** Call `set_phase` whenever you start or finish a
   stage: `"scaffolding"`, `"building"`, `"styling"`, `"fixing"`, ... with
   `status` `"working"` while in progress, `"done"` when complete, and
   `"error"` with a short `message` when something failed.
4. **Track the code you are editing.** After writing/editing a file, call
   `set_current_file` with the path relative to the session root; the
   dashboard highlights it in the tree and shows its content in the code
   pane. Use `refresh_current_code` to re-read it when it changed externally.
5. **Stream output.** When you run commands:
   - `process_started` (process_id, command) when you launch something,
   - `publish_log` (line) for each meaningful output line,
   - `process_update` (process_id, status/exit_code) when it finishes.
   For desktop work, publish captures with `publish_screenshot`
   (`data_base64` of the image) — the dashboard shows the latest one.
6. **Report explicit changes.** If the tooling changed files that the
   watcher might not pick up in time (generated files, downloads), call
   `file_changed` (rel, kind, size, mtime).

## Conventions

- Always call `create_session` before any other state tool; the other tools
  act on the most recently created session (they accept an optional
  `session_id` if you manage several).
- Keep log lines short and meaningful; do not dump entire build outputs,
  summarize them.
- `publish_screenshot` payloads are capped at `max_file_bytes` (1 MB).
- The server auto-watches the session root (0.5 s poll) — no need to report
  every edit; `file_changed` is for events the watcher cannot see.
- If the dashboard is not open yet, Tiancode attaches it to Vista en vivo;
  do not open its URL in a system browser.

## Default responsive design

- Validate every website or web app in both a desktop and mobile viewport in
  the embedded panel before declaring it finished. Keep the content usable at
  narrow widths; do not merely shrink the desktop layout.
- Start with a deliberate hierarchy, a compact token set (type, spacing,
  color and radius), visible interaction states and semantic HTML. Use the
  generated project’s existing design system when it has one.
- Treat diagrams as a complementary deliverable: generate a clear SVG/HTML
  diagram or a project-native design artifact when the task calls for one,
  instead of pretending that a browser preview can render a native desktop or
  mobile binary.

## When not to use

- Pure backend/API work with no visible UI — skip it.
- The user just wants a quick answer — do not create sessions for one-shot
  questions.
