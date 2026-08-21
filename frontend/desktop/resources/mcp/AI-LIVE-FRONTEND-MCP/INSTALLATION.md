# Installation

Requirements: **Python 3.10 or newer** (any Python with the standard
library; no pip packages are needed).

The package is self-contained at:

```
frontend/desktop/resources/mcp/AI-LIVE-FRONTEND-MCP/
```

## 1. Validate

From a terminal (PowerShell on Windows, bash/zsh elsewhere):

```bash
cd frontend/desktop/resources/mcp/AI-LIVE-FRONTEND-MCP
python validate.py
```

On success it prints:

```
Validated live frontend MCP with 13 tools
```

and exits 0. It also checks the dashboard (HTTP 200), the SSE endpoint and
the file watcher, so a passing run means the whole package works on this
machine.

## 2. Run the installer (optional but recommended)

Windows (PowerShell — if the execution policy blocks scripts, run
`Set-ExecutionPolicy -Scope Process Bypass` first, or copy
`config.example.json` to `config.json` and run `python validate.py`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

POSIX:

```bash
bash scripts/install.sh
```

The installer validates the package, creates `config.json` from
`config.example.json` if it does not exist, and prints the OpenCode-style
config block.

## 3. Register the server with your MCP client

### OpenCode

```bash
python make_opencode_config.py            # print the block
python make_opencode_config.py --write    # merge into ~/.config/opencode/opencode.json
```

The generated block looks like (paths are absolute on your machine):

```json
{
  "mcp": {
    "AI-LIVE-FRONTEND-MCP": {
      "type": "local",
      "command": ["C:\\...\\python.exe", "C:\\...\\live_server.py"],
      "enabled": true,
      "env": { "LIVE_FRONTEND_CONFIG": "C:\\...\\config.json" }
    }
  }
}
```

### Any other MCP client (Claude Desktop, Cursor, custom, ...)

Register a local stdio server whose command is:

```
python C:\<absolute-path>\live_server.py
```

with environment variable `LIVE_FRONTEND_CONFIG` set to the absolute path
of `config.json`. For JSON-config clients, the equivalent entry is:

```json
{
  "command": "python",
  "args": ["C:\\<absolute-path>\\live_server.py"],
  "env": { "LIVE_FRONTEND_CONFIG": "C:\\<absolute-path>\\config.json" },
  "type": "stdio"
}
```

## 4. Use it

1. Restart/reload your MCP client so it launches the server.
2. Open the dashboard at http://127.0.0.1:8790/ (it shows an empty state
   until a session exists).
3. Ask the agent to start working on a frontend; it calls `create_session`
   with the project directory and the dashboard fills up live. See
   `live-frontend-mcp/SKILL.md` for the intended agent workflow.

## Configuration

The server reads `config.json` (next to `live_server.py`) or the file in
the `LIVE_FRONTEND_CONFIG` environment variable. All fields are optional;
see README.md for the full table. Common tweaks:

* `"dashboard_port": 8790` — change if the port is taken.
* `"poll_interval_seconds": 0.5` — watcher frequency.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `validate.py` says "port 8790 is busy" | Another live-frontend instance (e.g. the old server from the deleted folder) holds the port. Stop it, or change `dashboard_port` in the temp/real config. |
| Tools respond but the dashboard shows nothing | Make sure a session exists (`create_session`); the dashboard is empty until then. |
| Preview is blank | Check the runtime URL and its build errors in Tiancode; the preview stays embedded and does not open a browser automatically. |
| Server exits immediately | stdin closed — that is the normal shutdown signal for stdio MCP servers. |

## Uninstall

* Remove the `AI-LIVE-FRONTEND-MCP` entry from your MCP client config
  (and delete the `mcp` key it added in `opencode.json` if no other servers
  use it).
* Delete the package directory
  `frontend/desktop/resources/mcp/AI-LIVE-FRONTEND-MCP/`.
* Stop any running `live_server.py` process (it exits on its own when the
  client that launched it closes).
