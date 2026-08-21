---
name: operagx
description: Opera GX MCP server - browser automation over the Chrome DevTools Protocol (CDP).
---

# OperaGX MCP Server

Controls Opera GX from an MCP client over stdio, using the Chrome DevTools Protocol.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `cdp_port` | `9222` | Port Opera GX exposes for remote debugging |
| `browser_exe` | `C:/Program Files/Opera GX/opera.exe` | Path to the browser (used for diagnostics/hints) |

## Prerequisites

Start Opera GX with remote debugging enabled:

```
"C:/Program Files/Opera GX/opera.exe" --remote-debugging-port=9222
```

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `browser_status` | - | GET `/json/version`; reports browser, protocol version, user data dir |
| `list_tabs` | - | GET `/json`; lists page targets (id, title, url, debugger websocket) |
| `navigate` | `tab_id`, `url` | Activates the tab (`/json/activate/{id}`), then CDP `Page.navigate` over the tab websocket; falls back to opening a new tab via `/json/new` |
| `execute_js` | `tab_id`, `expression` | CDP `Runtime.evaluate` (returnByValue, awaitPromise) over a minimal RFC 6455 websocket client (stdlib only) |
| `diagnostics` | - | Config summary, CDP reachability, platform, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute_js","arguments":{"tab_id":"0","expression":"document.title"}}}
```

## Notes

- `tab_id` accepts a target id, a 0-based page index, or a page URL/title.
- The websocket client implements RFC 6455 (masked client frames, ping/pong, close) with `socket` + `base64` + `hashlib` from the standard library; no external websocket dependency.
- Without a running CDP endpoint every tool reports a clear `cdp_unreachable` error; the server never crashes.
