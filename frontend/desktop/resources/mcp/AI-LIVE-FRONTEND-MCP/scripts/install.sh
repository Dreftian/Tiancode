#!/usr/bin/env bash
# AI LIVE FRONTEND MCP — POSIX installer
# Validates the package, creates config.json from the example if missing,
# and prints the OpenCode-style config block for your MCP client.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PKG_DIR"

PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY="python"

echo ""
echo "==> Validating AI LIVE FRONTEND MCP (tools, handshake, dashboard)..."
"$PY" validate.py

if [ ! -f config.json ]; then
    cp config.example.json config.json
    echo "==> Created config.json from config.example.json (edit it to change ports/limits)."
else
    echo "==> config.json already exists, leaving it untouched."
fi

echo "==> OpenCode-style config block:"
"$PY" make_opencode_config.py

echo ""
echo "==> Done. Add the block above to your MCP client (see INSTALLATION.md)."
echo "    Dashboard URL: http://127.0.0.1:8790/  (configurable in config.json)"
