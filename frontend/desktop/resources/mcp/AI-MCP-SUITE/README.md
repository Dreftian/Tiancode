# AI-MCP-SUITE

A self-contained suite of 9 local MCP (Model Context Protocol) servers for creative and development tools on Windows. Each server speaks MCP over stdio (JSON-RPC 2.0, newline-delimited) using a tiny shared runtime built exclusively on the Python 3.10+ standard library — no pip dependencies.

```
frontend/desktop/resources/mcp/AI-MCP-SUITE/
  README.md  INSTALLATION.md  SOURCES.md  requirements.txt
  shared/            __init__.py  runtime.py           (shared MCP stdio runtime)
  scripts/           install.ps1  install.sh  validate_package.py  make_opencode_config.py
  Photoshop/         server.py  config.json  config.example.json  SKILL.md
  InDesign/          server.py  config.json  config.example.json  SKILL.md
  Illustrator/       server.py  config.json  config.example.json  SKILL.md
  CorelDRAW/         server.py  config.json  config.example.json  SKILL.md
  OperaGX/           server.py  config.json  config.example.json  SKILL.md
  GameDev/UnrealEngine/  server.py  config.json  config.example.json  SKILL.md
  GameDev/Unity/         server.py  config.json  config.example.json  SKILL.md
  GameDev/Godot/         server.py  config.json  config.example.json  SKILL.md
  AndroidStudio/     server.py  config.json  config.example.json  SKILL.md
```

## Requirements

- Python 3.10+ (standard library only)
- Windows recommended (targets are Windows applications); the servers still start cleanly on other platforms and report their targets as unavailable
- Optional, per server: the target application installed and reachable (see INSTALLATION.md)

## Quick start

```bash
# 1. Validate the package (boots every server, MCP handshake, tool list check)
python scripts/validate_package.py
# -> Validated 9 MCP servers

# 2. Run one server with its config injected via the MCP_CONFIG env var
export MCP_CONFIG="$(cat Photoshop/config.json)"
python Photoshop/server.py

# 3. (PowerShell)
# $env:MCP_CONFIG = Get-Content -Raw Photoshop/config.json
# python Photoshop/server.py
```

## Servers and tools

| Server | Tools |
| --- | --- |
| Photoshop | `open_document`, `install_script`, `run_script`, `list_scripts`, `diagnostics` |
| InDesign | `open_document`, `install_script`, `run_script`, `list_scripts`, `diagnostics` |
| Illustrator | `open_document`, `install_script`, `run_script`, `list_scripts`, `diagnostics` |
| CorelDRAW | `application_status`, `run_macro`, `open_document`, `diagnostics` |
| OperaGX | `browser_status`, `list_tabs`, `navigate`, `execute_js`, `diagnostics` |
| UnrealEngine | `locate_projects`, `open_editor`, `run_commandlet`, `run_uat`, `diagnostics` |
| Unity | `open_editor`, `run_method`, `locate_projects`, `diagnostics` |
| Godot | `open_editor`, `run_headless`, `export_release`, `locate_projects`, `diagnostics` |
| AndroidStudio | `list_devices`, `emulator_list`, `launch_emulator`, `open_project`, `gradle_task`, `diagnostics` |

Every server exposes a `diagnostics` tool that reports the config summary, whether the target app/CLI was found, the platform, and health hints.

## Configuration

Each server reads its config from the `MCP_CONFIG` environment variable (a JSON string). When the variable is absent it falls back to the `config.json` next to `server.py` (identical to `config.example.json`). Values may contain `%VAR%` tokens (e.g. `%USERPROFILE%`, `%LOCALAPPDATA%`) which are expanded against the environment at load time.

Example:

```json
{
  "photoshop_exe": "C:/Program Files/Adobe/Adobe Photoshop 2024/Photoshop.exe",
  "uxp_bridge_url": "http://127.0.0.1:24000",
  "scripts_dir": "%USERPROFILE%/AppData/Roaming/Adobe/Adobe Photoshop 2024/Presets/Scripts"
}
```

## MCP client integration (OpenCode)

Generate an `opencode.json` registering all 9 servers:

```bash
python scripts/make_opencode_config.py            # writes opencode.json
opencode --config opencode.json
```

Each entry is a local stdio server whose `MCP_CONFIG` environment is set to the server's `config.json`:

```json
{
  "mcp": {
    "photoshop": {
      "type": "local",
      "command": ["C:/path/to/python.exe", "C:/path/to/AI-MCP-SUITE/Photoshop/server.py"],
      "environment": { "MCP_CONFIG": "{...}" }
    }
  }
}
```

## Protocol details

- JSON-RPC 2.0, one message per line, responses flushed after each line
- `initialize` echoes the client's `protocolVersion` and advertises `capabilities.tools.listChanged`
- `notifications/initialized` and other notifications are acknowledged silently
- `tools/list` returns name/description/inputSchema per tool; `tools/call` validates arguments (JSON Schema types + required) and returns `-32602` on failure
- Tool failures are typed (`config_error`, `file_not_found`, `com_unavailable`, `cdp_unreachable`, ...) and returned as `isError` content; the server never crashes
- JSON-RPC error codes: `-32700` parse, `-32600` invalid request, `-32601` method not found, `-32602` invalid params, `-32603` internal

## Design rules

- All subprocess launches use argument arrays; never shell strings
- `.bat`/`.cmd` scripts are executed through `cmd.exe /c`
- Every server starts cleanly on stdio even when its target application is missing; affected tools then report the application as unavailable
- Stdlib only: `asyncio`, `json`, `os`, `re`, `socket`, `subprocess`, `urllib`, ...

See INSTALLATION.md for per-application setup and SOURCES.md for protocol/API provenance.
