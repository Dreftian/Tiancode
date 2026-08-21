#!/usr/bin/env python3
"""Generate an OpenCode (opencode.json) config that registers every MCP server in this suite.

Each server is registered as a local stdio MCP server with its MCP_CONFIG
environment set to the contents of its config.json (compact JSON string).

Usage:
    python scripts/make_opencode_config.py [--out opencode.json] [--python C:/path/to/python.exe]
"""

import argparse
import json
import os
import sys

SUITE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SERVERS = [
    "Photoshop",
    "InDesign",
    "Illustrator",
    "CorelDRAW",
    "OperaGX",
    os.path.join("GameDev", "UnrealEngine"),
    os.path.join("GameDev", "Unity"),
    os.path.join("GameDev", "Godot"),
    "AndroidStudio",
]


def build_config(python_exe):
    mcp = {}
    for rel_dir in SERVERS:
        server_dir = os.path.join(SUITE_ROOT, rel_dir)
        server_path = os.path.join(server_dir, "server.py")
        config_path = os.path.join(server_dir, "config.json")
        if not os.path.isfile(server_path):
            print(f"skipping {rel_dir}: missing server.py", file=sys.stderr)
            continue
        environment = {}
        if os.path.isfile(config_path):
            with open(config_path, encoding="utf-8-sig") as handle:
                environment["MCP_CONFIG"] = json.dumps(json.load(handle))
        name = rel_dir.replace(os.sep, "-").replace("/", "-").lower()
        mcp[name] = {"type": "local", "command": [python_exe, server_path], "environment": environment}
    return mcp


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.join(SUITE_ROOT, "opencode.json"))
    parser.add_argument("--python", default=sys.executable)
    args = parser.parse_args()
    config = {"mcp": build_config(args.python)}
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
    print(f"Wrote {args.out} with {len(config['mcp'])} MCP servers")
    print(f"Use it with OpenCode, e.g.: opencode --config {args.out}")


if __name__ == "__main__":
    main()
