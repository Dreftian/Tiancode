# SOURCES

## Provenance

This package was **rebuilt from scratch** after the original
`AI-LIVE-FRONTEND-MCP` source folder was deleted. There was no surviving
source tree to copy from — the package was recreated from a written
functional specification covering the tool surface (13 tools, names and
argument shapes), the stdio MCP protocol, the dashboard behavior, the file
watcher, and the configuration schema.

All code, UI assets and documentation in this directory are original work
written for this rebuild. No code was copied from external projects, and no
third-party assets (fonts, icons, libraries, CDNs) are used — the dashboard
must work fully offline.

## Dependency policy

* Python 3.10+ **standard library only**. No pip dependencies, no
  requirements.txt, no vendored third-party modules.
* The MCP protocol runtime (`mcp_runtime.py`) is a deliberately small
  vendored implementation of the subset of MCP the server needs (JSON-RPC
  2.0 over newline-delimited stdio, initialize handshake, tools/list,
  tools/call, ping). It exists so the package does not require `pip install
  mcp` on machines where the app's users may not have pip packages
  installed.

## File inventory

| File                         | Role                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `live_server.py`             | MCP stdio server: 13 tools, file watcher, HTTP dashboard    |
| `mcp_runtime.py`             | Vendored MCP stdio runtime (stdlib only)                    |
| `validate.py`                | End-to-end validation (exit 0 + required output line)       |
| `config.json`                | Default configuration                                       |
| `config.example.json`        | Example configuration (installers copy it)                  |
| `make_opencode_config.py`    | Generates/merges the OpenCode-style MCP config block        |
| `ui/index.html`              | Dashboard markup                                            |
| `ui/styles.css`              | Dashboard styles (dark theme, offline)                      |
| `ui/app.js`                  | Dashboard client (vanilla JS, SSE via EventSource)          |
| `scripts/install.ps1`        | Windows installer: validate + config + print block          |
| `scripts/install.sh`         | POSIX installer                                             |
| `live-frontend-mcp/SKILL.md` | Agent skill describing the intended workflow                |
| `examples/demo/index.html`   | Static demo page for preview + watching tests               |
| `README.md`                  | Usage documentation                                         |
| `SOURCES.md`                 | This file                                                   |
| `INSTALLATION.md`            | Installation / registration instructions                    |

## Notes for maintainers

* `validate.py` must keep printing exactly `Validated live frontend MCP
  with 13 tools` and exiting 0 — other tools and processes key off that
  line. If the tool surface changes, update `EXPECTED_TOOLS` there.
* Keep `live_server.py` and `mcp_runtime.py` importable as plain modules;
  they must run on Python 3.10+ with no third-party imports.
* The dashboard UI must stay dependency-free (no CDNs) so it works offline.
* When the dashboard port is taken by another process, `validate.py` falls
  back to the next free port and reports it; the default port 8790 is used
  whenever it is free.
