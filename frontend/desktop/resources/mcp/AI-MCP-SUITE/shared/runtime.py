"""AI-MCP-SUITE shared MCP stdio runtime.

A minimal Model Context Protocol server on stdio: JSON-RPC 2.0 messages,
one per line. Implements the MCP handshake (``initialize`` /
``notifications/initialized``), ``tools/list`` and ``tools/call``, plus a
small set of platform helpers shared by the suite's servers.

Standard library only -- there are no external dependencies.
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import traceback

PROTOCOL_VERSION = "2024-11-05"

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603


class ToolError(Exception):
    """A recoverable, user-facing tool failure. Rendered as isError content."""

    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind


class Server:
    """A tiny MCP stdio server. Decorate handlers with ``tool()``, then ``run()``."""

    def __init__(self, name, version="1.0.0"):
        self.name = name
        self.version = version
        self._tools = {}

    def tool(self, name, description, input_schema):
        """Decorator registering a handler (sync or async) with its inputSchema."""

        def register(handler):
            self._tools[name] = {
                "name": name,
                "description": description,
                "inputSchema": input_schema,
                "handler": handler,
            }
            return handler

        return register

    def run(self):
        """Serve requests from stdin until EOF."""
        log(f"{self.name} v{self.version} ready on stdio ({len(self._tools)} tools)")
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            response = self._dispatch(line)
            if response is not None:
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()
        log(f"{self.name}: stdin closed, exiting")

    def _dispatch(self, line):
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            return _error(None, PARSE_ERROR, "Parse error")
        if not isinstance(request, dict) or request.get("jsonrpc") != "2.0" or not isinstance(request.get("method"), str):
            return _error(request.get("id") if isinstance(request, dict) else None, INVALID_REQUEST, "Invalid request")
        method = request["method"]
        request_id = request.get("id")
        if request_id is None:
            self._handle_notification(method, request.get("params"))
            return None
        if method == "initialize":
            return self._initialize(request_id, request.get("params") or {})
        if method == "ping":
            return _result(request_id, {})
        if method == "tools/list":
            return _result(request_id, {"tools": self._tool_schemas()})
        if method == "tools/call":
            return self._call_tool(request_id, request.get("params") or {})
        return _error(request_id, METHOD_NOT_FOUND, f"Method not found: {method}")

    def _handle_notification(self, method, params):
        # notifications/initialized and friends are acknowledged by omission.
        log(f"notification: {method}")

    def _initialize(self, request_id, params):
        requested = params.get("protocolVersion")
        protocol = requested if isinstance(requested, str) else PROTOCOL_VERSION
        return _result(
            request_id,
            {
                "protocolVersion": protocol,
                "capabilities": {"tools": {"listChanged": True}},
                "serverInfo": {"name": self.name, "version": self.version},
            },
        )

    def _tool_schemas(self):
        return [
            {
                "name": tool["name"],
                "description": tool["description"],
                "inputSchema": tool["inputSchema"],
            }
            for tool in self._tools.values()
        ]

    def _call_tool(self, request_id, params):
        tool_name = params.get("name")
        tool = self._tools.get(tool_name) if isinstance(tool_name, str) else None
        if tool is None:
            return _error(request_id, METHOD_NOT_FOUND, f"Unknown tool: {tool_name}")
        arguments = params.get("arguments")
        if arguments is None:
            arguments = {}
        if not isinstance(arguments, dict):
            return _error(request_id, INVALID_PARAMS, "arguments must be an object")
        problem = validate_arguments(tool["inputSchema"], arguments)
        if problem:
            return _error(request_id, INVALID_PARAMS, problem)
        try:
            maybe = tool["handler"](arguments)
            payload = maybe if not asyncio.iscoroutine(maybe) else asyncio.run(maybe)
        except ToolError as exc:
            log(f"tool {tool_name} error: {exc.kind}: {exc}")
            return _result(request_id, _tool_error_content(f"{exc.kind}: {exc}"))
        except Exception as exc:
            log(traceback.format_exc())
            return _result(request_id, _tool_error_content(f"internal_error: {exc}"))
        text = payload if isinstance(payload, str) else json.dumps(payload, indent=2, default=str)
        return _result(request_id, {"content": [{"type": "text", "text": text}]})


def validate_arguments(schema, arguments):
    """Lightweight JSON-Schema validation of a tool call; returns an error string or None."""
    properties = schema.get("properties", {})
    for name in schema.get("required", []):
        if name not in arguments:
            return f"missing required argument: {name}"
    for name, value in arguments.items():
        expected = properties.get(name, {}).get("type")
        if expected and not _type_matches(expected, value):
            return f"argument {name!r} must be of type {expected}"
    return None


def _type_matches(expected, value):
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "null":
        return value is None
    return True


def load_config(defaults, server_dir=None):
    """Load server config: MCP_CONFIG env JSON wins, then ./config.json, then defaults.

    Values may contain %VAR% tokens (e.g. %USERPROFILE%) which are expanded
    against the environment at load time.
    """
    base = server_dir or os.path.dirname(os.path.abspath(sys.argv[0]))
    candidates = []
    if os.environ.get("MCP_CONFIG"):
        candidates.append(("MCP_CONFIG env", os.environ["MCP_CONFIG"]))
    config_path = os.path.join(base, "config.json")
    if os.path.isfile(config_path):
        with open(config_path, encoding="utf-8-sig") as handle:
            candidates.append((config_path, handle.read()))
    config = dict(defaults)
    for source, raw in candidates:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            log(f"WARNING: invalid JSON in {source}: {exc}")
            continue
        if isinstance(parsed, dict):
            config.update(parsed)
            break
    return {key: expand_env(value) for key, value in config.items()}


def expand_env(value):
    """Expand %VAR% tokens in a config value against the environment."""
    if not isinstance(value, str):
        return value

    def replace(match):
        name = match.group(1)
        if name in os.environ:
            return os.environ[name]
        if name in ("USERPROFILE", "HOME"):
            return os.path.expanduser("~")
        return match.group(0)

    return re.sub(r"%([^%]+)%", replace, value)


def log(message):
    print(message, file=sys.stderr, flush=True)


def batch_prefix(path):
    """Return the argv prefix needed to run ``path`` (cmd.exe /c for .bat/.cmd)."""
    if sys.platform == "win32" and path.lower().endswith((".bat", ".cmd")):
        return [os.environ.get("COMSPEC", "cmd.exe"), "/c", path]
    return [path]


def run_capture(command, cwd=None, timeout=None):
    """Run an argv command and capture output; raises ToolError for launch failures."""
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise ToolError("executable_not_found", f"executable not found: {command[0]}")
    except subprocess.TimeoutExpired as exc:
        raise ToolError("timeout", f"command timed out after {timeout}s: {' '.join(str(x) for x in command)}")
    except OSError as exc:
        raise ToolError("os_error", f"failed to run {' '.join(str(x) for x in command)}: {exc}")
    return {
        "exit_code": completed.returncode,
        "stdout": (completed.stdout or "")[-12000:],
        "stderr": (completed.stderr or "")[-12000:],
    }


def spawn_detached(command):
    """Launch a GUI/editor process without waiting; returns its pid."""
    creationflags = 0
    if sys.platform == "win32":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "DETACHED_PROCESS", 0)
    try:
        proc = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    except FileNotFoundError as exc:
        raise ToolError("executable_not_found", f"executable not found: {command[0]}")
    except OSError as exc:
        raise ToolError("os_error", f"failed to start {' '.join(str(x) for x in command)}: {exc}")
    return proc.pid


def _result(request_id, payload):
    return {"jsonrpc": "2.0", "id": request_id, "result": payload}


def _error(request_id, code, message, data=None):
    body = {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
    if data is not None:
        body["error"]["data"] = data
    return body


def _tool_error_content(text):
    return {"content": [{"type": "text", "text": text}], "isError": True}
