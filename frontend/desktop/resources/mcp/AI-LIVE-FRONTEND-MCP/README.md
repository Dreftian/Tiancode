# AI LIVE FRONTEND MCP

A self-contained local MCP server that gives agents a **live dashboard** of
the frontend work they are doing: watched file tree, current file code pane,
phase/status chip, terminal logs, a web preview iframe and (in desktop mode)
periodic screenshots.

* **Transport:** MCP over stdio (JSON-RPC 2.0, newline-delimited) using the
  vendored runtime in `mcp_runtime.py`.
* **Dashboard:** built-in HTTP server on `http://127.0.0.1:8790/` serving
  `ui/` (vanilla JS/CSS, works offline, no CDNs) plus an SSE endpoint at
  `/events`.
* **Dependencies:** none. Python 3.10+ standard library only — no pip
  packages required on the machine running the agent.
* **Skill:** `live-frontend-mcp/SKILL.md` describes the intended agent
  workflow.

## Quick start

```bash
# 1. Validate the package (must print "Validated live frontend MCP with 13 tools")
python validate.py

# 2. Register the server with your MCP client (OpenCode example)
python make_opencode_config.py          # prints the JSON block
python make_opencode_config.py --write  # merges it into ~/.config/opencode/opencode.json

# 3. Use it
#    The agent calls create_session with the project directory, then
#    set_phase / set_preview / publish_log / ... — the dashboard at
#    http://127.0.0.1:8790/ updates live.
```

The installers (`scripts/install.ps1` on Windows, `scripts/install.sh` on
POSIX) run the validation, create `config.json` from the example if missing,
and print the OpenCode config block.

## Tools (13)

| Tool                  | Arguments                                    | Purpose                                             |
| --------------------- | -------------------------------------------- | --------------------------------------------------- |
| `create_session`      | `root_text`, `mode` (web\|desktop), `label?`, `preview_url?` | Start a live session rooted at a directory; the server then watches files under it |
| `set_phase`           | `phase`, `status` (working\|done\|error), `message?` | Work phase shown in the dashboard            |
| `set_preview`         | `url?`                                       | URL the dashboard preview iframe points at          |
| `set_current_file`    | `rel`                                        | Highlight a file in the dashboard tree + code pane  |
| `refresh_current_code`| `rel`                                        | Re-read a file and refresh the code pane            |
| `publish_screenshot`  | `data_base64`, `mime` (default image/png)    | Publish a desktop capture                            |
| `publish_log`         | `process_id?`, `line`                        | Append a line to the terminal pane                  |
| `process_started`     | `process_id`, `command`                      | Register a child process the agent launched         |
| `process_update`      | `process_id`, `status?`, `exit_code?`        | Update a process status                              |
| `file_changed`        | `rel`, `kind`, `size`, `mtime`               | Explicit change event (in addition to auto-watching)|
| `get_session`         | —                                            | Current session snapshot (files, phase, logs, preview, processes) |
| `list_sessions`       | —                                            | List active sessions                                 |
| `diagnostics`         | —                                            | Health: config, dashboard URL, dashboard running, session count |

All state tools act on the most recently created session; each accepts an
optional `session_id` argument if you manage several.

## Behavior

* **Auto-watching:** while a session exists, the server polls the session
  root every `poll_interval_seconds` (default 0.5 s) for added / modified /
  removed files and pushes SSE events to dashboard subscribers. History is
  bounded by `max_event_history` (500). File reads are capped at
  `max_file_bytes` (1 MB). The snapshot file list contains relative paths.
* **Dashboard:** file tree, code pane, phase chip, live logs, preview
  iframe, screenshot area (desktop mode). Client-side interactions: click a
  file to view it, pick another session, clear the terminal.
* **HTTP API** (same origin as the dashboard):
  `/` (UI), `/events` (SSE), `/api/health`, `/api/snapshot`,
  `/api/sessions`, `POST /api/current_file`, `POST /api/session`.

## Configuration

Loaded from the file given by the `LIVE_FRONTEND_CONFIG` environment
variable, otherwise from `config.json` next to `live_server.py`, otherwise
defaults:

| Field                        | Default  | Meaning                                        |
| ---------------------------- | -------- | ---------------------------------------------- |
| `dashboard_host`             | 127.0.0.1| Bind address for the dashboard                 |
| `dashboard_port`             | 8790     | Port for the dashboard                         |
| `poll_interval_seconds`      | 0.5      | File watcher poll interval                     |
| `max_file_bytes`             | 1000000  | Cap for file content reads / screenshots       |
| `max_event_history`          | 500      | Bounded event history per session              |
| `desktop_capture_interval_seconds` | 2   | Hint for the app-side capture cadence (desktop)|
| `auto_open_dashboard`        | false    | Open the dashboard in a browser on startup     |
| `max_tracked_files`          | 2000     | Cap on tracked entries in the file tree        |
| `log_limit`                  | 2000     | Bounded log lines per session                  |
| `ignored_dirs`               | .git, node_modules, ... | Directories excluded from watching    |

An empty `dashboard_host` disables the HTTP server (stdio MCP still works).

## Running the server directly

```bash
export LIVE_FRONTEND_CONFIG=/absolute/path/to/config.json
python live_server.py
```

The process reads JSON-RPC 2.0 messages from stdin and writes responses to
stdout; all logs go to stderr. It exits when stdin closes.

## Validation

`python validate.py` performs a full end-to-end check against a live
subprocess: MCP handshake, tools/list count (13), create_session + state
tools, dashboard HTTP (200 on `/`, assets, `/api/health`), and the file
watcher via SSE (modify a file, expect `file_modified`). It prints
`Validated live frontend MCP with 13 tools` and exits 0 on success.

## Demo

`examples/demo/index.html` is a static page to test preview + watching:

```bash
python -m http.server 8080 -d examples/demo
# then: create_session(root_text=<this package dir>, mode="web", preview_url="http://localhost:8080/")
```
