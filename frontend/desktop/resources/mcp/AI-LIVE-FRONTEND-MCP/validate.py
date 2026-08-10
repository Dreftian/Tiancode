#!/usr/bin/env python3
"""Validate the AI LIVE FRONTEND MCP package.

End-to-end check against a live subprocess:
  1. MCP stdio handshake (initialize echoes the protocol version,
     capabilities advertise tools/prompts/resources listChanged).
  2. tools/list returns exactly the 13 expected tool names.
  3. create_session via tools/call, then a few state tools.
  4. HTTP dashboard: GET / returns 200, static assets are served,
     /api/health reports ok.
  5. SSE /events streams a snapshot, and the file watcher emits a
     file_modified event when a file under the session root changes.

Exits 0 and prints "Validated live frontend MCP with 13 tools" on success.

Stdlib only. Run from any directory:  python validate.py
"""

from __future__ import annotations

import json
import os
import queue
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
SERVER_SCRIPT = PKG_DIR / "live_server.py"
DEFAULT_PORT = 8790

EXPECTED_TOOLS = {
    "create_session",
    "set_phase",
    "set_preview",
    "set_current_file",
    "refresh_current_code",
    "publish_screenshot",
    "publish_log",
    "process_started",
    "process_update",
    "file_changed",
    "get_session",
    "list_sessions",
    "diagnostics",
}

SUCCESS_LINE = "Validated live frontend MCP with 13 tools"


class MCPClient:
    """Tiny interactive JSON-RPC client over a subprocess stdio pipe."""

    def __init__(self, proc):
        self.proc = proc
        self.responses = queue.Queue()
        self.next_id = 0
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self):
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict) and "id" in msg:
                self.responses.put(msg)

    def request(self, method, params=None, timeout=20):
        self.next_id += 1
        rid = self.next_id
        payload = {"jsonrpc": "2.0", "id": rid, "method": method}
        if params is not None:
            payload["params"] = params
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"no response for {method} within {timeout}s")
            try:
                msg = self.responses.get(timeout=remaining)
            except queue.Empty:
                continue
            if msg.get("id") == rid:
                return msg

    def notify(self, method, params=None):
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()


def pick_free_port(preferred=8790):
    """Return the preferred port if free, else the next free port after it."""
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"no free dashboard port in range {preferred}..{preferred + 19}")


def http_get(base_url, path, timeout=5):
    with urllib.request.urlopen(base_url + path, timeout=timeout) as resp:
        return resp.status, resp.read()


def wait_for_health(base_url, timeout=15):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            status, body = http_get(base_url, "/api/health", timeout=3)
            if status == 200 and b'"ok": true' in body:
                return
            last_error = f"status {status}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(0.4)
    raise RuntimeError(f"dashboard /api/health never became healthy: {last_error}")


def wait_for_sse_event(base_url, path, wanted_types, on_snapshot=None, timeout=12):
    """Subscribe to /events, wait for the initial snapshot, then return the
    first update event of a wanted type. ``on_snapshot`` is called once the
    subscriber is confirmed connected (first snapshot received) so callers
    can perform the action that should trigger the event afterwards."""
    deadline = time.monotonic() + timeout
    saw_snapshot = False
    called = False
    with urllib.request.urlopen(base_url + path, timeout=5) as resp:
        while time.monotonic() < deadline:
            try:
                line = resp.readline()
            except socket.timeout:
                continue
            if not line:
                return None
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            if text.startswith("event:"):
                event_name = text.split(":", 1)[1].strip()
                data_line = resp.readline().decode("utf-8", errors="replace").strip()
                if not data_line.startswith("data:"):
                    continue
                try:
                    data = json.loads(data_line.split(":", 1)[1].strip())
                except json.JSONDecodeError:
                    continue
                if event_name == "snapshot":
                    saw_snapshot = True
                    if on_snapshot is not None and not called:
                        called = True
                        on_snapshot()
                elif event_name == "update" and saw_snapshot and data.get("type") in wanted_types:
                    return data
    return None


def main() -> int:
    print("== AI LIVE FRONTEND MCP validation ==")
    proc = None
    stderr_lines = []

    def drain_stderr():
        for line in proc.stderr:
            stderr_lines.append(line)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)

            # Deterministic config + a demo session root with a couple of files.
            port = pick_free_port(DEFAULT_PORT)
            if port != DEFAULT_PORT:
                print(f"note: port {DEFAULT_PORT} is busy (another live-frontend instance?), using {port}")
            base_url = f"http://127.0.0.1:{port}"

            config_path = tmp_dir / "config.json"
            config_path.write_text(json.dumps({
                "dashboard_host": "127.0.0.1",
                "dashboard_port": port,
                "poll_interval_seconds": 0.5,
                "max_file_bytes": 1000000,
                "max_event_history": 500,
                "desktop_capture_interval_seconds": 2,
                "auto_open_dashboard": False,
            }), encoding="utf-8")

            demo_root = tmp_dir / "demo"
            demo_root.mkdir()
            (demo_root / "index.html").write_text("<!doctype html><title>demo</title>", encoding="utf-8")
            (demo_root / "app.js").write_text("console.log('demo');", encoding="utf-8")

            env = dict(os.environ)
            env["LIVE_FRONTEND_CONFIG"] = str(config_path)
            env["PYTHONUNBUFFERED"] = "1"

            proc = subprocess.Popen(
                [sys.executable, str(SERVER_SCRIPT)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                cwd=str(PKG_DIR),
            )
            threading.Thread(target=drain_stderr, daemon=True).start()

            # 1. MCP handshake.
            init = client_request_initialize(proc)
            result = init.get("result") or {}
            negotiated = result.get("protocolVersion")
            if negotiated != "2024-11-05":
                raise RuntimeError(f"initialize did not echo protocolVersion 2024-11-05, got {negotiated!r}")
            caps = result.get("capabilities") or {}
            for cap in ("tools", "prompts", "resources"):
                if not isinstance(caps.get(cap), dict) or not caps[cap].get("listChanged"):
                    raise RuntimeError(f"capability {cap}.listChanged missing in {caps}")
            if (result.get("serverInfo") or {}).get("name") != "live-frontend-mcp":
                raise RuntimeError(f"unexpected serverInfo: {result.get('serverInfo')}")
            print("initialize handshake: OK (protocolVersion echoed, capabilities advertised)")

            notify_initialized(proc)

            # 2. tools/list — count and names.
            tools_msg = request_tools_list(proc)
            tools = tools_msg.get("result", {}).get("tools", [])
            names = {t.get("name") for t in tools}
            if len(tools) != 13:
                raise RuntimeError(f"tools/list returned {len(tools)} tools, expected 13")
            if names != EXPECTED_TOOLS:
                missing = sorted(EXPECTED_TOOLS - names)
                extra = sorted(names - EXPECTED_TOOLS)
                raise RuntimeError(f"tool name mismatch — missing: {missing}, extra: {extra}")
            for tool in tools:
                if not isinstance(tool.get("inputSchema"), dict):
                    raise RuntimeError(f"tool {tool.get('name')} has no inputSchema")
            print("tools/list: 13 tools found")

            # 3. create_session + state tools.
            created = call_tool(proc, "create_session", {
                "root_text": str(demo_root),
                "mode": "web",
                "label": "validate-demo",
            })
            session_id = created.get("session_id")
            if not session_id:
                raise RuntimeError(f"create_session returned no session_id: {created}")
            call_tool(proc, "set_phase", {"phase": "building", "status": "working", "message": "validation run"})
            call_tool(proc, "publish_log", {"line": "hello from validate.py"})
            call_tool(proc, "process_started", {"process_id": "dev", "command": "python -m http.server"})
            call_tool(proc, "set_current_file", {"rel": "index.html"})

            snap = call_tool(proc, "get_session", {})
            if snap.get("session_id") != session_id or snap.get("root") != str(demo_root):
                raise RuntimeError(f"get_session snapshot mismatch: {snap}")
            if snap.get("phase", {}).get("name") != "building":
                raise RuntimeError("set_phase did not stick in snapshot")
            if not any("hello from validate.py" in l.get("line", "") for l in snap.get("logs", [])):
                raise RuntimeError("publish_log line missing from snapshot")

            sessions = call_tool(proc, "list_sessions", {})
            if sessions.get("count") != 1:
                raise RuntimeError(f"list_sessions count wrong: {sessions}")

            diag = call_tool(proc, "diagnostics", {})
            if not diag.get("dashboard", {}).get("running"):
                raise RuntimeError(f"diagnostics says dashboard not running: {diag}")
            print("tools/call create_session + state tools: OK")

            # 4. HTTP dashboard.
            wait_for_health(base_url)
            status, body = http_get(base_url, "/")
            if status != 200 or b"Live Frontend" not in body:
                raise RuntimeError(f"GET / returned {status}, expected 200 dashboard HTML")
            for asset in ("/styles.css", "/app.js"):
                status, body = http_get(base_url, asset)
                if status != 200 or not body:
                    raise RuntimeError(f"GET {asset} returned {status}")
            print(f"dashboard HTTP: OK ({base_url}/, styles.css, app.js, /api/health)")

            # 5. SSE + watcher: subscribe and confirm the snapshot, THEN modify
            #    a file, so the file_modified event is guaranteed to be seen.
            modified = {"done": False}

            def do_modify():
                (demo_root / "index.html").write_text(
                    "<!doctype html><title>demo v2</title>\n<!-- changed -->\n", encoding="utf-8"
                )
                modified["done"] = True

            event = wait_for_sse_event(base_url, "/events", {"file_modified", "file_added"}, on_snapshot=do_modify, timeout=12)
            if event is None:
                raise RuntimeError("file watcher did not emit file_modified after a change")
            print(f"SSE file watcher: OK (event {event.get('type')} for {event.get('data', {}).get('rel')})")

            print()
            print(SUCCESS_LINE)
            return 0

    except Exception as exc:  # noqa: BLE001 - report and fail
        print(f"VALIDATION FAILED: {exc}", file=sys.stderr)
        if stderr_lines:
            print("--- server stderr (last 30 lines) ---", file=sys.stderr)
            for line in stderr_lines[-30:]:
                print("  " + line.rstrip(), file=sys.stderr)
        return 1

    finally:
        if proc is not None:
            try:
                proc.stdin.close()
            except Exception:  # noqa: BLE001
                pass
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def client_request_initialize(proc):
    client = MCPClient(proc)
    msg = client.request("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "validate.py", "version": "1.0.0"},
    })
    if "error" in msg:
        raise RuntimeError(f"initialize failed: {msg['error']}")
    proc._mcp_client = client
    return msg


def notify_initialized(proc):
    proc._mcp_client.notify("notifications/initialized", {})


def request_tools_list(proc):
    msg = proc._mcp_client.request("tools/list", {})
    if "error" in msg:
        raise RuntimeError(f"tools/list failed: {msg['error']}")
    return msg


def call_tool(proc, name, arguments):
    msg = proc._mcp_client.request("tools/call", {"name": name, "arguments": arguments})
    if "error" in msg:
        raise RuntimeError(f"tools/call {name} failed: {msg['error']}")
    result = msg.get("result") or {}
    if result.get("isError"):
        raise RuntimeError(f"tools/call {name} returned isError: {result}")
    return result.get("structuredContent")


if __name__ == "__main__":
    sys.exit(main())
