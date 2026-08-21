---
name: unity
description: Unity MCP server - project discovery, editor launch and -executeMethod automation.
---

# Unity MCP Server

Automates Unity from an MCP client over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `unity_exe` | `C:/Program Files/Unity/Hub/Editor/6000.0.32f1/Editor/Unity.exe` | Path to the Unity editor executable |
| `project_path` | `%USERPROFILE%/Documents/Unity Projects` | Where projects are scanned (`%USERPROFILE%` expanded at load) |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `open_editor` | `project` (optional), `batchmode` (default true) | Spawns `[exe, -projectPath <project>, -batchmode]`; set `batchmode: false` to open the interactive editor UI |
| `run_method` | `method`, `args` (array, optional), `project` (optional), `timeout` | Runs `[exe, -projectPath <p>, -executeMethod <method>, -batchmode, -quit] + args`; captures output |
| `locate_projects` | - | Scans `project_path` (4 levels deep) for directories containing `Assets` and `ProjectSettings` |
| `diagnostics` | - | Config summary, Unity availability, project count, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_method","arguments":{"method":"My.Editor.Build.BuildAll"}}}
```

## Notes

- `run_method` includes `-batchmode -quit` so the editor terminates after the method returns; `-quit` is required for a synchronous run.
- All subprocess launches use argument arrays; never shell strings.
- The server starts cleanly even when Unity is not installed; affected tools report typed errors.
