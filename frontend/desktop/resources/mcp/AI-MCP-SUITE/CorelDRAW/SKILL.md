---
name: coreldraw
description: CorelDRAW MCP server - COM automation: status, macros and document opening.
---

# CorelDRAW MCP Server

Drives CorelDRAW through its COM automation interface from an MCP client over stdio.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `prog_id` | `CorelDRAW.Application` | COM ProgID used to dispatch CorelDRAW |

## Prerequisites (Windows only)

- CorelDRAW installed (any recent version with VBA/COM automation support).
- `pywin32` in the same Python that runs the server: `pip install pywin32`

Without `pywin32` every tool returns a clear "CorelDRAW COM not available" error; the server never crashes.

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `application_status` | - | Dispatches `prog_id` and reports version, or why COM is unavailable |
| `run_macro` | `macro_name` | Calls `Application.ExecuteMacro` (e.g. `GlobalMacros.CreateBox`) |
| `open_document` | `path` | Calls `Application.OpenDocument` on a `.cdr`/`.eps`/`.pdf` file |
| `diagnostics` | - | Config summary, pywin32/COM availability, platform, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_macro","arguments":{"macro_name":"GlobalMacros.CreateBox"}}}
```

## Notes

- `ExecuteMacro` expects the full macro name including the macro storage (e.g. `GlobalMacros.`).
- On macOS/Linux COM is unavailable by definition; `application_status` reports this instead of raising.
