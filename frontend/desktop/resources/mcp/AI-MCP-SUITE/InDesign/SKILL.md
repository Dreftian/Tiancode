---
name: indesign
description: Adobe InDesign MCP server - open documents, install and run .idjs scripts, drive a UXP bridge.
---

# InDesign MCP Server

Controls Adobe InDesign from an MCP client over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `indesign_exe` | `C:/Program Files/Adobe/Adobe InDesign 2024/InDesign.exe` | Path to InDesign; used by `open_document` |
| `scripts_dir` | `%USERPROFILE%/AppData/Roaming/Adobe/InDesign/Version 19.0/en_US/Scripts/Scripts Panel` | Where `install_script` writes `.idjs` files (`%USERPROFILE%` expanded at load) |
| `uxp_bridge_url` | `http://127.0.0.1:24001` | Base URL of a running UXP bridge; used by `run_script` |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `open_document` | `path` | Spawns `indesign_exe` with the document; falls back to a UXP bridge POST when the exe is missing |
| `install_script` | `name`, `content` | Writes the script (`.idjs` default; `.jsx`/`.js` allowed) into `scripts_dir`, creating it if needed |
| `run_script` | `name` | POSTs `{"script": name}` to `{uxp_bridge_url}/run`; errors if the bridge is not configured |
| `list_scripts` | - | Lists installed script files |
| `diagnostics` | - | Config summary, exe/bridge/scripts_dir availability, platform, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"install_script","arguments":{"name":"export_pdf.idjs","content":"app.activeDocument.exportFile(ExportFormat.PDF_TYPE, File('/out.pdf'))\n"}}}
```

## Notes

- Scripts are written as UTF-8 with BOM.
- `run_script` requires a UXP bridge process listening on `uxp_bridge_url`.
- The server starts cleanly even when InDesign is not installed; affected tools report typed errors instead of crashing.
