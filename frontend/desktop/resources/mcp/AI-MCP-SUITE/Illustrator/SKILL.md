---
name: illustrator
description: Adobe Illustrator MCP server - open documents, install and run .jsx scripts.
---

# Illustrator MCP Server

Controls Adobe Illustrator from an MCP client over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `illustrator_exe` | `C:/Program Files/Adobe/Adobe Illustrator 2024/Support Files/Contents/Windows/Illustrator.exe` | Path to Illustrator; used by `open_document` and `run_script` |
| `scripts_dir` | `%USERPROFILE%/AppData/Roaming/Adobe/Adobe Illustrator 2024 Settings/en_US/Scripts` | Where `install_script` writes `.jsx` files (`%USERPROFILE%` expanded at load) |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `open_document` | `path` | Spawns `illustrator_exe` with the document |
| `install_script` | `name`, `content` | Writes the script (`.jsx` default; `.js` allowed) into `scripts_dir`, creating it if needed |
| `run_script` | `name` | Best-effort: launches Illustrator with the script file as a startup argument |
| `list_scripts` | - | Lists installed script files |
| `diagnostics` | - | Config summary, exe/scripts_dir availability, platform, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"install_script","arguments":{"name":"export_svg.jsx","content":"app.activeDocument.exportFile(File('/out.svg'), ExportType.SVG)\n"}}}
```

## Notes

- Scripts are written as UTF-8 with BOM.
- Illustrator exposes no documented remote script-execution CLI. `run_script` launches Illustrator with the script path; for headless execution, run the script from inside Illustrator via File > Scripts, or add a UXP bridge.
- The server starts cleanly even when Illustrator is not installed; affected tools report typed errors instead of crashing.
