---
name: godot
description: Godot MCP server - project discovery, editor launch, headless scripts and exports.
---

# Godot MCP Server

Automates the Godot engine from an MCP client over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `godot_exe` | `C:/Program Files/Godot/Godot_v4.3-stable_win64.exe` | Path to the Godot executable |
| `project_path` | `%USERPROFILE%/Documents/Godot Projects` | Where projects are scanned (`%USERPROFILE%` expanded at load) |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `open_editor` | `project` (optional) | Spawns `[exe, -e, --path, <project>]` |
| `run_headless` | `script`, `project` (optional), `timeout` | Runs `[exe, --headless, --path, <project>, -s, <script>]`; captures output |
| `export_release` | `preset`, `project` (optional), `timeout` | Runs `[exe, --headless, --path, <project>, --export-release, <preset>]` |
| `locate_projects` | - | Scans `project_path` (4 levels deep) for `project.godot` |
| `diagnostics` | - | Config summary, Godot availability, project count, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_headless","arguments":{"script":"res://tools/build.gd"}}}
```

## Notes

- `export_release` requires an `export_presets.cfg` with a matching preset name; errors surface as typed tool errors.
- All subprocess launches use argument arrays; never shell strings.
- The server starts cleanly even when Godot is not installed; affected tools report typed errors.
