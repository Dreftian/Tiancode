#!/usr/bin/env python3
r"""Generate the OpenCode-style MCP config block for AI-LIVE-FRONTEND-MCP.

Prints the JSON block to register this server with OpenCode
(~/.config/opencode/opencode.json, or %USERPROFILE%\.config\opencode on
Windows). Pass --write to apply it to the OpenCode config file directly
(existing entries are preserved and merged).

Stdlib only. Usage:
    python make_opencode_config.py            # print the block
    python make_opencode_config.py --write    # merge into the config file
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
SERVER_SCRIPT = PKG_DIR / "live_server.py"
CONFIG_FILE = PKG_DIR / "config.json"
SERVER_KEY = "AI-LIVE-FRONTEND-MCP"


def python_executable() -> str:
    return sys.executable or shutil.which("python") or shutil.which("python3") or "python"


def opencode_config_path() -> Path:
    override = os.environ.get("OPENCODE_CONFIG")
    if override:
        return Path(override)
    return Path.home() / ".config" / "opencode" / "opencode.json"


def build_block() -> dict:
    command = [python_executable(), str(SERVER_SCRIPT)]
    block = {
        "type": "local",
        "command": command,
        "enabled": True,
    }
    if CONFIG_FILE.is_file():
        block["env"] = {"LIVE_FRONTEND_CONFIG": str(CONFIG_FILE)}
    return block


def print_block() -> None:
    block = {"mcp": {SERVER_KEY: build_block()}}
    print(json.dumps(block, indent=2))
    print()
    print(f"# Add the 'mcp' object above to: {opencode_config_path()}")


def write_config() -> None:
    path = opencode_config_path()
    existing = {}
    if path.is_file():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"error: {path} is not valid JSON; fix it or remove it, then retry", file=sys.stderr)
            sys.exit(1)
        if not isinstance(existing, dict):
            print(f"error: {path} is not a JSON object", file=sys.stderr)
            sys.exit(1)
    mcp = existing.get("mcp")
    if not isinstance(mcp, dict):
        mcp = {}
    mcp[SERVER_KEY] = build_block()
    existing["mcp"] = mcp
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {SERVER_KEY} to {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="merge the block into the OpenCode config file")
    args = parser.parse_args()
    if args.write:
        write_config()
    else:
        print_block()
    return 0


if __name__ == "__main__":
    sys.exit(main())
