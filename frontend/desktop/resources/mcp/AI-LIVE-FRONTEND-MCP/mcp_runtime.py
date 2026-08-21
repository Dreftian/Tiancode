#!/usr/bin/env python3
"""Tiny vendored MCP (Model Context Protocol) stdio runtime.

Implements the core of the MCP protocol over a newline-delimited JSON
JSON-RPC 2.0 transport on stdin/stdout:

  * initialize (capabilities: tools.listChanged, prompts.listChanged,
    resources.listChanged; protocolVersion echo)
  * notifications/initialized (and any other notification, ignored)
  * tools/list, tools/call, ping
  * prompts/list, resources/list (capability stubs)

It is intentionally dependency-free (Python 3.10+ stdlib only) so the
server works on machines where pip packages are not installed.

Framing rules:
  * One JSON object per line, UTF-8, terminated with a single LF.
  * Responses and notifications are written on stdout; all logging must
    go to stderr so it never corrupts the protocol stream.
  * Requests carry an "id" and MUST receive a response; notifications
    MUST NOT.
"""

from __future__ import annotations

import json
import logging
import sys
import threading
from typing import Any, Callable, List, Optional

LOG = logging.getLogger("mcp_runtime")

# Oldest stable protocol version we speak; we echo any known client version.
PROTOCOL_VERSION = "2024-11-05"
KNOWN_PROTOCOL_VERSIONS = ("2024-11-05", "2025-03-26", "2025-06-18")

# JSON-RPC 2.0 error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603


class McpError(Exception):
    """Raise from a tool handler to return a structured JSON-RPC error."""

    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


# ---------------------------------------------------------------------------
# JSON Schema argument validation (small subset, enough for our tools)
# ---------------------------------------------------------------------------

def _type_ok(expected: str, value: Any) -> bool:
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "null":
        return value is None
    return True


def _check_value(schema: dict, value: Any, errors: List[str], path: str) -> None:
    stype = schema.get("type")
    if isinstance(stype, list):
        if value is not None and not any(_type_ok(t, value) for t in stype):
            errors.append(f"{path}: expected one of {stype}")
    elif stype and value is not None and not _type_ok(stype, value):
        errors.append(f"{path}: expected {stype}")

    if stype == "object" and isinstance(value, dict):
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in props:
                    errors.append(f"{path}: unknown property {key!r}")
        for key, sub in props.items():
            if key in value:
                _check_value(sub, value[key], errors, f"{path}.{key}" if path else key)

    if stype == "array" and isinstance(value, list) and isinstance(schema.get("items"), dict):
        for index, item in enumerate(value):
            _check_value(schema["items"], item, errors, f"{path}[{index}]")

    if stype == "string" and isinstance(value, str):
        enum = schema.get("enum")
        if enum and value not in enum:
            errors.append(f"{path}: must be one of {enum}")


def validate_arguments(schema: dict, args: Any) -> List[str]:
    """Return a list of human-readable problems; empty list means valid."""
    if not isinstance(args, dict):
        return ["arguments must be an object"]
    errors: List[str] = []
    for required in schema.get("required", []):
        if required not in args or args[required] is None:
            errors.append(f"missing required argument: {required}")
    _check_value(schema, args, errors, "arguments")
    return errors


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

class Tool:
    __slots__ = ("name", "description", "schema", "handler")

    def __init__(self, name: str, description: str, schema: dict, handler: Callable[[dict], Any]):
        self.name = name
        self.description = description
        self.schema = schema
        self.handler = handler


class Server:
    """Minimal MCP server over stdio. Handlers receive an ``args`` dict and
    return a JSON-serializable value (or raise McpError)."""

    def __init__(
        self,
        name: str,
        version: str,
        capabilities: Optional[dict] = None,
        read=None,
        write=None,
    ):
        self.name = name
        self.version = version
        self.capabilities = capabilities if capabilities is not None else {
            "tools": {"listChanged": True},
            "prompts": {"listChanged": True},
            "resources": {"listChanged": True},
        }
        self._tools: dict = {}
        self._read = read if read is not None else sys.stdin.buffer
        self._write = write if write is not None else sys.stdout.buffer
        self._write_lock = threading.Lock()
        self._client_info: Optional[dict] = None
        self._negotiated_version: Optional[str] = None
        self._initialized = False
        self._on_shutdown: Optional[Callable[[], None]] = None

    # -- registration ------------------------------------------------------

    def add_tool(self, name: str, description: str, schema: dict, handler: Callable[[dict], Any]) -> None:
        self._tools[name] = Tool(name, description, schema, handler)

    def tool(self, name: str, description: str = "", schema: Optional[dict] = None):
        """Decorator form of add_tool."""

        def decorator(fn: Callable[[dict], Any]) -> Callable[[dict], Any]:
            self.add_tool(name, description, schema or {"type": "object"}, fn)
            return fn

        return decorator

    def set_shutdown_hook(self, fn: Callable[[], None]) -> None:
        self._on_shutdown = fn

    # -- outbound ----------------------------------------------------------

    def _send(self, message: dict) -> None:
        payload = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        with self._write_lock:
            self._write.write(payload)
            self._write.flush()

    def send_notification(self, method: str, params: Any = None) -> None:
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)

    # -- inbound dispatch --------------------------------------------------

    def _handle_request(self, msg: dict) -> Any:
        method = msg.get("method")
        params = msg.get("params") or {}
        if method == "initialize":
            return self._handle_initialize(params)
        if method == "ping":
            return {}
        if method == "tools/list":
            return {
                "tools": [
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.schema,
                    }
                    for tool in self._tools.values()
                ]
            }
        if method == "tools/call":
            return self._handle_tools_call(params)
        if method == "prompts/list":
            return {"prompts": []}
        if method == "resources/list":
            return {"resources": []}
        raise McpError(METHOD_NOT_FOUND, f"Method not found: {method}")

    def _handle_initialize(self, params: dict) -> dict:
        client_version = params.get("protocolVersion")
        self._client_info = params.get("clientInfo") or {}
        self._negotiated_version = (
            client_version
            if client_version in KNOWN_PROTOCOL_VERSIONS
            else PROTOCOL_VERSION
        )
        LOG.info(
            "Client connected: %s %s (protocol %s)",
            self._client_info.get("name", "unknown"),
            self._client_info.get("version", ""),
            self._negotiated_version,
        )
        return {
            "protocolVersion": self._negotiated_version,
            "capabilities": self.capabilities,
            "serverInfo": {"name": self.name, "version": self.version},
        }

    def _handle_tools_call(self, params: dict) -> dict:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        tool = self._tools.get(name)
        if tool is None:
            raise McpError(INVALID_PARAMS, f"Unknown tool: {name}")
        problems = validate_arguments(tool.schema, arguments)
        if problems:
            raise McpError(INVALID_PARAMS, f"Invalid arguments for {name}: " + "; ".join(problems))
        try:
            result = tool.handler(arguments)
        except McpError:
            raise
        except Exception as exc:  # noqa: BLE001 - surface as JSON-RPC error
            LOG.exception("Tool %r failed", name)
            raise McpError(INTERNAL_ERROR, f"{name} failed: {exc}") from exc
        if result is None:
            result = {}
        return {
            "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}],
            "structuredContent": result,
            "isError": False,
        }

    def _handle_notification(self, msg: dict) -> None:
        method = msg.get("method")
        if method == "notifications/initialized":
            self._initialized = True
            LOG.info("Client initialized")
        elif method in ("notifications/cancelled", "notifications/progress", "notifications/roots/list_changed"):
            pass
        else:
            LOG.debug("Ignoring notification %r", method)

    # -- main loop ---------------------------------------------------------

    def run(self) -> None:
        """Read requests from stdin until EOF, then run the shutdown hook."""
        while True:
            raw = self._read.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                LOG.warning("Ignoring malformed JSON-RPC line")
                self._send({"jsonrpc": "2.0", "id": None, "error": {"code": PARSE_ERROR, "message": "Parse error"}})
                continue

            if not isinstance(msg, dict) or "method" not in msg:
                if isinstance(msg, dict) and "id" in msg and "result" not in msg and "error" not in msg:
                    self._send({"jsonrpc": "2.0", "id": msg["id"], "error": {"code": INVALID_REQUEST, "message": "Invalid Request"}})
                continue

            if "id" not in msg:
                self._handle_notification(msg)
                continue

            rid = msg["id"]
            try:
                result = self._handle_request(msg)
                self._send({"jsonrpc": "2.0", "id": rid, "result": result})
            except McpError as err:
                error = {"code": err.code, "message": err.message}
                if err.data is not None:
                    error["data"] = err.data
                self._send({"jsonrpc": "2.0", "id": rid, "error": error})
            except Exception as exc:  # noqa: BLE001 - never kill the loop
                LOG.exception("Unhandled error while dispatching %r", msg.get("method"))
                self._send({"jsonrpc": "2.0", "id": rid, "error": {"code": INTERNAL_ERROR, "message": f"Internal error: {exc}"}})

        LOG.info("stdin closed, shutting down")
        if self._on_shutdown is not None:
            try:
                self._on_shutdown()
            except Exception:  # noqa: BLE001
                LOG.exception("Shutdown hook failed")
