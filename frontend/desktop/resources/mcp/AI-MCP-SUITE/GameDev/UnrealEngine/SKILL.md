---
name: unreal-engine
description: Unreal Engine MCP server - project discovery, editor launch, commandlets and UAT automation.
---

# Unreal Engine MCP Server

Automates Unreal Engine from an MCP client over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `engine_root` | `C:/Program Files/Epic Games/UE_5.4` | Engine install root; binaries are resolved under `Engine/Binaries/Win64` |
| `project_path` | `%USERPROFILE%/Documents/Unreal Projects` | Where `.uproject` files are scanned (`%USERPROFILE%` expanded at load) |
| `uat_script` | `{engine_root}/Engine/Build/BatchFiles/RunUAT.bat` | Path to the Unreal Automation Tool batch file |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `locate_projects` | - | Scans `project_path` (4 levels deep) for `.uproject` files |
| `open_editor` | `project` (optional) | Spawns `UnrealEditor.exe` with the project (defaults to the first `.uproject` found) |
| `run_commandlet` | `argv` (array), `project` (optional), `timeout` | Runs `UnrealEditor-Cmd.exe` with the given arguments; captures output |
| `run_uat` | `args` (array), `timeout` | Runs `RunUAT.bat` (via `cmd /c`) with the given arguments |
| `diagnostics` | - | Config summary, engine/UAT availability, project count, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_uat","arguments":{"args":["BuildCookRun","-project=C:/My/Proj.uproject","-platform=Win64"]}}}
```

## Notes

- All subprocess launches use argument arrays; never shell strings.
- `.bat` scripts are executed through `cmd.exe /c` for compatibility.
- The server starts cleanly even when the engine is not installed; affected tools report typed errors.
