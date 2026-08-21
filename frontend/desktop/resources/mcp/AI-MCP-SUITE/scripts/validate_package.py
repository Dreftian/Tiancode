#!/usr/bin/env python3
"""Validate the AI-MCP-SUITE package.

Boots every server.py over stdio through the shared MCP runtime, performs the
initialize + tools/list handshake, calls each server's diagnostics tool, and
checks the exact expected tool lists.

Prints "Validated 9 MCP servers" and exits 0 when everything passes;
prints the failures and exits 1 otherwise.

Usage: python scripts/validate_package.py
"""

import json
import os
import subprocess
import sys
import threading
import time

SUITE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SERVERS = [
    ("Photoshop", ["open_document", "install_script", "run_script", "list_scripts", "diagnostics"]),
    ("InDesign", ["open_document", "install_script", "run_script", "list_scripts", "diagnostics"]),
    ("Illustrator", ["open_document", "install_script", "run_script", "list_scripts", "diagnostics"]),
    ("CorelDRAW", ["application_status", "run_macro", "open_document", "diagnostics"]),
    ("OperaGX", ["browser_status", "list_tabs", "navigate", "execute_js", "diagnostics"]),
    (
        os.path.join("GameDev", "UnrealEngine"),
        ["locate_projects", "open_editor", "run_commandlet", "run_uat", "diagnostics"],
    ),
    (os.path.join("GameDev", "Unity"), ["open_editor", "run_method", "locate_projects", "diagnostics"]),
    (
        os.path.join("GameDev", "Godot"),
        ["open_editor", "run_headless", "export_release", "locate_projects", "diagnostics"],
    ),
    (
        "AndroidStudio",
        ["list_devices", "emulator_list", "launch_emulator", "open_project", "gradle_task", "diagnostics"],
    ),
]

HANDSHAKE_TIMEOUT = 45  # seconds


def validate_server(rel_dir, expected_tools):
    problems = []
    server_dir = os.path.join(SUITE_ROOT, rel_dir)
    server_path = os.path.join(server_dir, "server.py")
    if not os.path.isfile(server_path):
        return [f"missing {server_path}"]
    for filename in ("config.json", "config.example.json", "SKILL.md"):
        if not os.path.isfile(os.path.join(server_dir, filename)):
            problems.append(f"missing {filename} in {rel_dir}")

    env = dict(os.environ)
    config_path = os.path.join(server_dir, "config.json")
    with open(config_path, encoding="utf-8-sig") as handle:
        env["MCP_CONFIG"] = handle.read()

    proc = subprocess.Popen(
        [sys.executable, server_path],
        cwd=server_dir,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    received = []

    def drain():
        try:
            for line in proc.stdout:
                received.append(line)
        except Exception:
            pass

    threading.Thread(target=drain, daemon=True).start()

    requests = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "validate_package", "version": "1.0.0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "diagnostics", "arguments": {}}},
    ]
    try:
        proc.stdin.write("\n".join(json.dumps(request) for request in requests) + "\n")
        proc.stdin.flush()
    except Exception as exc:
        proc.kill()
        return [f"could not write to server stdin: {exc}"]

    responses = {}
    deadline = time.monotonic() + HANDSHAKE_TIMEOUT
    while time.monotonic() < deadline:
        while received:
            line = received.pop(0).strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                problems.append(f"non-JSON stdout line: {line[:120]!r}")
                continue
            if message.get("id") in (1, 2, 3):
                responses[message["id"]] = message
        if all(identifier in responses for identifier in (1, 2, 3)):
            break
        time.sleep(0.05)
    proc.kill()
    stderr_tail = ""
    try:
        stderr_tail = proc.stderr.read()
    except Exception:
        pass

    init_response = responses.get(1)
    if init_response is None:
        problems.append("no initialize response" + (f" (stderr: {stderr_tail[-300:]})" if stderr_tail else ""))
    elif "error" in init_response:
        problems.append(f"initialize error: {init_response['error']}")
    else:
        init_result = init_response.get("result") or {}
        if init_result.get("protocolVersion") != "2024-11-05":
            problems.append(f"protocolVersion mismatch: {init_result.get('protocolVersion')!r}")
        tools_capability = (init_result.get("capabilities") or {}).get("tools") or {}
        if not tools_capability.get("listChanged"):
            problems.append("capabilities.tools.listChanged missing")
        if not (init_result.get("serverInfo") or {}).get("name"):
            problems.append("serverInfo.name missing")

    list_response = responses.get(2)
    if list_response is None:
        problems.append("no tools/list response")
    elif "error" in list_response:
        problems.append(f"tools/list error: {list_response['error']}")
    else:
        tool_names = [tool.get("name") for tool in (list_response.get("result") or {}).get("tools", [])]
        if tool_names != expected_tools:
            problems.append(f"tool list mismatch: got {tool_names}, expected {expected_tools}")

    diag_response = responses.get(3)
    if diag_response is None:
        problems.append("no diagnostics response")
    elif "error" in diag_response:
        problems.append(f"diagnostics error: {diag_response['error']}")
    else:
        if not (diag_response.get("result") or {}).get("content"):
            problems.append("diagnostics returned no content")
    return problems


def main():
    print(f"AI-MCP-SUITE validation (Python {sys.version.split()[0]})")
    failures = []
    for rel_dir, expected_tools in SERVERS:
        problems = validate_server(rel_dir, expected_tools)
        if problems:
            failures.extend(f"{rel_dir}: {problem}" for problem in problems)
            print(f"  FAIL {rel_dir}: {len(expected_tools)} tools expected")
            for problem in problems:
                print(f"       {problem}")
        else:
            print(f"  ok   {rel_dir}: {len(expected_tools)} tools")
    if failures:
        print(f"FAILED: {len(failures)} problem(s) found")
        return 1
    print("Validated 9 MCP servers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
