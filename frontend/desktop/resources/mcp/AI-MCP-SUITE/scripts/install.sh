#!/usr/bin/env bash
# Install AI-MCP-SUITE: copies the suite to ~/.mcp-servers/AI-MCP-SUITE,
# validates it, and generates an OpenCode config file.
set -euo pipefail

SUITE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${HOME}/.mcp-servers/AI-MCP-SUITE"

if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
    echo "error: Python 3.10+ is required but was not found on PATH." >&2
    exit 1
fi
PYTHON="$(command -v python3 || command -v python)"
VERSION="$("$PYTHON" -c "import sys; print('%d.%d' % sys.version_info[:2])")"
if [ "$(printf '%s\n' "3.10" "$VERSION" | sort -V | head -n1)" != "3.10" ]; then
    echo "error: Python 3.10+ is required (found $VERSION)." >&2
    exit 1
fi

echo "Installing AI-MCP-SUITE to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -R "$SUITE_ROOT"/. "$INSTALL_DIR"/

"$PYTHON" "$INSTALL_DIR/scripts/validate_package.py"

"$PYTHON" "$INSTALL_DIR/scripts/make_opencode_config.py" --python "$PYTHON"

echo ""
echo "Installed. Launch any server with its MCP_CONFIG environment set, e.g.:"
echo "  MCP_CONFIG=\"\$(cat \"$INSTALL_DIR/Photoshop/config.json\")\" \\"
echo "  $PYTHON \"$INSTALL_DIR/Photoshop/server.py\""
