---
name: photoshop
description: Adobe Photoshop MCP server - open documents, install and run JSX scripts, drive a UXP bridge.
---

# Photoshop MCP Server

Controls Adobe Photoshop from an MCP client (OpenCode, Claude, etc.) over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `photoshop_exe` | `C:/Program Files/Adobe/Adobe Photoshop 2024/Photoshop.exe` | Path to Photoshop; used by `open_document` |
| `uxp_bridge_url` | `http://127.0.0.1:24000` | Base URL of a running UXP bridge; used by `run_script` and as a fallback for `open_document` |
| `scripts_dir` | `%USERPROFILE%/AppData/Roaming/Adobe/Adobe Photoshop 2024/Presets/Scripts` | Where `install_script` writes `.jsx`/`.jsxbin` files (`%USERPROFILE%` is expanded at load) |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `open_document` | `path` | Spawns `photoshop_exe` with the document; falls back to a UXP bridge POST when the exe is missing |
| `install_script` | `name`, `content` | Writes the script (`.jsx` default; `.jsxbin`/`.js` allowed) into `scripts_dir`, creating it if needed |
| `run_script` | `name` | POSTs `{"script": name}` to `{uxp_bridge_url}/run`; errors if the bridge is not configured |
| `list_scripts` | - | Lists installed script files |
| `diagnostics` | - | Config summary, exe/bridge/scripts_dir availability, platform, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"install_script","arguments":{"name":"export_png.jsx","content":"app.activeDocument.saveAs(Folder.desktop + '/out.png')\n"}}}
```

## Notes

- Scripts are written as UTF-8 with BOM (Adobe's ExtendScript parser expects it).
- `run_script` needs a UXP bridge process (e.g. the `uxp-bridge` community project) listening on `uxp_bridge_url`; the bridge then executes the script inside Photoshop.
- The server starts cleanly even when Photoshop is not installed; affected tools report typed errors instead of crashing.
