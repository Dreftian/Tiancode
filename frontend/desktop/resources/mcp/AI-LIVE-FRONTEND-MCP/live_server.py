#!/usr/bin/env python3
"""AI LIVE FRONTEND MCP — stdio MCP server with a built-in HTTP dashboard.

The server lets an agent (or any MCP client) open a "live session" rooted
at a project directory. While a session is active it:

  * polls the session root for file changes and streams them as events,
  * serves the dashboard UI (ui/) plus an SSE endpoint on
    http://<dashboard_host>:<dashboard_port>/,
  * accepts tool calls that update the phase, preview URL, current file,
    logs, child processes and desktop screenshots shown in the dashboard.

Transport: MCP over stdio (JSON-RPC 2.0, newline-delimited) via the
vendored runtime in mcp_runtime.py. Stdlib only — no pip dependencies.

Config file: path from env LIVE_FRONTEND_CONFIG (JSON), otherwise
./config.json next to this script, otherwise built-in defaults.
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import queue
import sys
import threading
import time
import uuid
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from mcp_runtime import INVALID_PARAMS, McpError, Server as McpServer

LOG = logging.getLogger("live-frontend")

PKG_DIR = Path(__file__).resolve().parent
UI_DIR = PKG_DIR / "ui"
SERVER_NAME = "live-frontend-mcp"
VERSION = "1.0.0"

DEFAULT_CONFIG = {
    "dashboard_host": "127.0.0.1",
    "dashboard_port": 8790,
    "poll_interval_seconds": 0.5,
    "max_file_bytes": 1000000,
    "max_event_history": 500,
    "desktop_capture_interval_seconds": 2,
    "auto_open_dashboard": False,
    # extensions with sane defaults (kept out of the dashboard)
    "max_tracked_files": 2000,
    "log_limit": 2000,
    "ignored_dirs": [".git", "node_modules", ".venv", "venv", "__pycache__", ".next", ".turbo"],
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
}

SNAPSHOT_INTERVAL = 3.0       # seconds between full snapshot pushes on SSE
MAX_EVENTS_PER_TICK = 100     # above this, emit a single tree_changed event
MAX_SSE_LOG_LINES = 1000      # logs included in a snapshot payload
MAX_RECENT_EVENTS = 200       # events included in a snapshot payload


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config() -> dict:
    config = dict(DEFAULT_CONFIG)
    env_path = os.environ.get("LIVE_FRONTEND_CONFIG")
    candidates = [Path(env_path)] if env_path else [PKG_DIR / "config.json"]
    for path in candidates:
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception as exc:
                LOG.warning("Could not read config %s: %s", path, exc)
                break
            if isinstance(data, dict):
                config.update({key: value for key, value in data.items() if value is not None})
                LOG.info("Loaded config from %s", path)
            break
    return config


# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------

def to_rel(path: Path, root: Path) -> str:
    return os.path.relpath(path, root).replace("\\", "/")


def scan_root(root: Path, max_files: int, ignored_dirs: list) -> dict:
    """Walk the session root and return {rel: {kind, size, mtime}}."""
    entries: dict = {}
    if not root.is_dir():
        return entries
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ignored_dirs]
        current = Path(dirpath)
        rel = to_rel(current, root)
        if rel != ".":
            try:
                entries[rel] = {"kind": "dir", "size": 0, "mtime": current.stat().st_mtime}
            except OSError:
                entries[rel] = {"kind": "dir", "size": 0, "mtime": 0}
            count += 1
        for name in filenames:
            if count >= max_files:
                return entries
            full = current / name
            try:
                stat = full.stat()
            except OSError:
                continue
            entries[to_rel(full, root)] = {"kind": "file", "size": stat.st_size, "mtime": stat.st_mtime}
            count += 1
        if count >= max_files:
            return entries
    return entries


def diff_scan(previous: dict, current: dict) -> list:
    """Return [(rel, meta, change)] with change in added|removed|modified."""
    changes = []
    for rel, meta in current.items():
        if rel not in previous:
            changes.append((rel, meta, "added"))
        else:
            prev = previous[rel]
            if prev.get("kind") == "file" and (prev.get("size") != meta.get("size") or prev.get("mtime") != meta.get("mtime")):
                changes.append((rel, meta, "modified"))
    for rel in previous:
        if rel not in current:
            changes.append((rel, previous[rel], "removed"))
    return changes


def validate_rel(rel: str) -> str:
    """Normalize a tool-supplied relative path; reject traversal."""
    if not isinstance(rel, str) or not rel.strip():
        raise McpError(INVALID_PARAMS, "rel must be a non-empty relative path")
    normalized = rel.replace("\\", "/").strip("/")
    if not normalized or normalized.startswith("/") or any(part == ".." for part in normalized.split("/")):
        raise McpError(INVALID_PARAMS, f"rel must stay inside the session root: {rel!r}")
    return normalized


def read_capped(path: Path, max_bytes: int) -> str:
    """Read a file as UTF-8, capping the payload at max_bytes."""
    try:
        with open(path, "rb") as handle:
            data = handle.read(max_bytes + 1)
    except OSError as exc:
        return f"<unreadable: {exc}>"
    truncated = len(data) > max_bytes
    text = data[:max_bytes].decode("utf-8", errors="replace")
    if truncated:
        text += "\n\n\u2026 [truncated at {} bytes]".format(max_bytes)
    return text


def normalize_preview_url(url):
    if url is None:
        return None
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    if "://" not in url and not url.startswith("about:"):
        url = "http://" + url
    return url


def preview_default_url(session: dict) -> str | None:
    """URL local del preview en vivo (estilo Xcode) para sesiones web.

    Si la sesión no fija un preview_url externo y la raíz tiene index.html,
    el dashboard muestra el sitio servido por este mismo servidor en
    /preview/, refrescándose solo conforme cambian los archivos.
    """
    if session["mode"] != "web":
        return None
    if (Path(session["root"]) / "index.html").is_file():
        return "/preview/"
    return None


def coerce_process_id(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    raise McpError(INVALID_PARAMS, "process_id must be a string or integer")


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

class LiveState:
    def __init__(self, config: dict):
        self.config = config
        self.lock = threading.RLock()
        self.sessions: dict = {}            # session_id -> session dict
        self.current_id: str | None = None  # most recently created session
        self.last_scan: dict = {}           # session_id -> {rel: meta}
        self.event_seq = 0
        self.subscribers: set = set()       # set of queue.Queue for SSE
        self.http_server = None
        self.dashboard_url = None
        self.started_at = time.time()


def new_session(state: LiveState, root_text: str, mode: str, label: str | None, preview_url) -> dict:
    root = Path(root_text).expanduser().resolve()
    if not root.is_dir():
        raise McpError(INVALID_PARAMS, f"Session root is not an existing directory: {root_text}")
    if mode not in ("web", "desktop"):
        raise McpError(INVALID_PARAMS, "mode must be 'web' or 'desktop'")
    config = state.config
    now = time.time()
    session = {
        "session_id": uuid.uuid4().hex[:12],
        "root": str(root),
        "mode": mode,
        "label": label if label else (root.name or str(root)),
        "preview_url": normalize_preview_url(preview_url),
        "phase": {"name": "idle", "status": "working", "message": None},
        "current_file": None,
        "current_code": None,
        "files": {},
        "events": deque(maxlen=config.get("max_event_history", 500)),
        "logs": deque(maxlen=config.get("log_limit", 2000)),
        "processes": {},
        "screenshot": None,
        "created_at": now,
        "updated_at": now,
    }
    scan = scan_root(root, config.get("max_tracked_files", 2000), config.get("ignored_dirs", []))
    session["files"] = scan
    with state.lock:
        state.last_scan[session["session_id"]] = {rel: dict(meta) for rel, meta in scan.items()}
        state.sessions[session["session_id"]] = session
        state.current_id = session["session_id"]
    emit_event(state, session["session_id"], "session_created", session_summary(session))
    return session


def session_summary(session: dict) -> dict:
    return {
        "session_id": session["session_id"],
        "label": session["label"],
        "mode": session["mode"],
        "root": session["root"],
        "preview_url": session["preview_url"],
        "preview_default": preview_default_url(session),
        "phase": dict(session["phase"]),
        "file_count": len(session["files"]),
        "created_at": session["created_at"],
        "updated_at": session["updated_at"],
    }


def require_session(state: LiveState, args: dict | None = None) -> dict:
    session_id = (args or {}).get("session_id")
    if session_id is None:
        session_id = state.current_id
    with state.lock:
        session = state.sessions.get(session_id) if session_id else None
    if session is None:
        raise McpError(INVALID_PARAMS, "No active session — call create_session first")
    return session


def emit_event(state: LiveState, session_id: str, etype: str, data) -> None:
    with state.lock:
        state.event_seq += 1
        event = {"id": state.event_seq, "type": etype, "session_id": session_id, "data": data, "ts": time.time()}
        session = state.sessions.get(session_id)
        if session is not None:
            session["events"].append(event)
            session["updated_at"] = event["ts"]
        for subscriber in list(state.subscribers):
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                pass  # slow subscriber catches up on the next snapshot


def build_snapshot(state: LiveState, session: dict) -> dict:
    recent = []
    for event in list(session["events"])[-MAX_RECENT_EVENTS:]:
        data = event["data"]
        if event["type"] == "screenshot" and isinstance(data, dict):
            data = dict(data, data_base64="<omitted>")  # keep payloads small
        recent.append({"type": event["type"], "ts": event["ts"], "data": data})
    return {
        "session_id": session["session_id"],
        "root": session["root"],
        "mode": session["mode"],
        "label": session["label"],
        "preview_url": session["preview_url"],
        "preview_default": preview_default_url(session),
        "phase": dict(session["phase"]),
        "current_file": session["current_file"],
        "current_code": session["current_code"],
        "files": [
            {"rel": rel, "kind": meta.get("kind", "file"), "size": meta.get("size", 0), "mtime": meta.get("mtime", 0)}
            for rel, meta in sorted(session["files"].items())
        ],
        "file_count": len(session["files"]),
        "logs": list(session["logs"])[-MAX_SSE_LOG_LINES:],
        "processes": dict(session["processes"]),
        "screenshot": session["screenshot"],
        "recent_events": recent,
        "event_count": len(session["events"]),
        "created_at": session["created_at"],
        "updated_at": session["updated_at"],
    }


# ---------------------------------------------------------------------------
# File watcher
# ---------------------------------------------------------------------------

def watcher_loop(state: LiveState, stop_event: threading.Event) -> None:
    interval = max(0.05, float(state.config.get("poll_interval_seconds", 0.5)))
    while not stop_event.wait(interval):
        with state.lock:
            ids = list(state.sessions.keys())
        for session_id in ids:
            with state.lock:
                session = state.sessions.get(session_id)
                root = Path(session["root"]) if session else None
            if session is None or root is None:
                continue
            scan = scan_root(root, state.config.get("max_tracked_files", 2000), state.config.get("ignored_dirs", []))
            with state.lock:
                if state.sessions.get(session_id) is not session:
                    continue
                previous = state.last_scan.get(session_id, {})
                changes = diff_scan(previous, scan)
                state.last_scan[session_id] = {rel: dict(meta) for rel, meta in scan.items()}
                session["files"] = scan
            if not changes:
                continue
            if len(changes) > MAX_EVENTS_PER_TICK:
                emit_event(state, session_id, "tree_changed", {"count": len(changes)})
                continue
            for rel, meta, change in changes:
                data = {"rel": rel, "kind": meta.get("kind", "file"), "size": meta.get("size", 0), "mtime": meta.get("mtime", 0)}
                emit_event(state, session_id, f"file_{change}", data)


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def tool_create_session(state: LiveState, args: dict) -> dict:
    session = new_session(
        state,
        args["root_text"],
        args.get("mode", "web"),
        args.get("label"),
        args.get("preview_url"),
    )
    LOG.info("Session %s created at %s (mode=%s)", session["session_id"], session["root"], session["mode"])
    return session_summary(session)


def tool_set_phase(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    phase = args["phase"]
    status = args.get("status", "working")
    if status not in ("working", "done", "error"):
        raise McpError(INVALID_PARAMS, "status must be 'working', 'done' or 'error'")
    message = args.get("message")
    session["phase"] = {"name": phase, "status": status, "message": message}
    emit_event(state, session["session_id"], "phase", dict(session["phase"]))
    return dict(session["phase"])


def tool_set_preview(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    url = normalize_preview_url(args.get("url"))
    session["preview_url"] = url
    emit_event(state, session["session_id"], "preview", {"url": url})
    return {"url": url}


def set_current_file_core(state: LiveState, session: dict, rel: str) -> dict:
    rel = validate_rel(rel)
    code = None
    path = Path(session["root"]) / rel
    if path.is_file():
        code = read_capped(path, state.config.get("max_file_bytes", 1000000))
    session["current_file"] = rel
    session["current_code"] = code
    emit_event(state, session["session_id"], "current_file", {"rel": rel, "code": code})
    return {"rel": rel, "code": code}


def tool_set_current_file(state: LiveState, args: dict) -> dict:
    return set_current_file_core(state, require_session(state, args), args["rel"])


def tool_refresh_current_code(state: LiveState, args: dict) -> dict:
    return set_current_file_core(state, require_session(state, args), args["rel"])


def tool_publish_screenshot(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    data_base64 = args["data_base64"]
    mime = args.get("mime", "image/png")
    if not isinstance(data_base64, str) or len(data_base64) > state.config.get("max_file_bytes", 1000000):
        raise McpError(INVALID_PARAMS, "data_base64 must be a base64 string within max_file_bytes")
    try:
        base64.b64decode(data_base64, validate=True)
    except Exception:
        raise McpError(INVALID_PARAMS, "data_base64 is not valid base64") from None
    session["screenshot"] = {"data_base64": data_base64, "mime": mime, "ts": time.time()}
    emit_event(state, session["session_id"], "screenshot", {"mime": mime, "data_base64": data_base64})
    return {"stored": True, "mime": mime, "ts": session["screenshot"]["ts"]}


def tool_publish_log(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    line = args["line"]
    if not isinstance(line, str):
        line = str(line)
    if len(line) > 10000:
        line = line[:10000] + "\u2026 [truncated]"
    process_id = coerce_process_id(args["process_id"]) if args.get("process_id") is not None else None
    entry = {"process_id": process_id, "line": line, "ts": time.time()}
    session["logs"].append(entry)
    emit_event(state, session["session_id"], "log", entry)
    return {"logged": True, "log_count": len(session["logs"])}


def tool_process_started(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    process_id = coerce_process_id(args["process_id"])
    info = {"process_id": process_id, "command": args["command"], "status": "running", "exit_code": None, "started_at": time.time()}
    session["processes"][process_id] = info
    emit_event(state, session["session_id"], "process", info)
    return info


def tool_process_update(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    process_id = coerce_process_id(args["process_id"])
    info = session["processes"].get(process_id)
    if info is None:
        raise McpError(INVALID_PARAMS, f"Unknown process: {process_id} — call process_started first")
    if args.get("status") is not None:
        info["status"] = args["status"]
    if args.get("exit_code") is not None:
        exit_code = args["exit_code"]
        if not isinstance(exit_code, int) or isinstance(exit_code, bool):
            raise McpError(INVALID_PARAMS, "exit_code must be an integer")
        info["exit_code"] = exit_code
    emit_event(state, session["session_id"], "process", dict(info))
    return dict(info)


def tool_file_changed(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    rel = validate_rel(args["rel"])
    kind = args.get("kind", "file")
    size = args.get("size", 0)
    mtime = args.get("mtime") if args.get("mtime") is not None else time.time()
    session["files"][rel] = {"kind": kind, "size": size, "mtime": mtime}
    emit_event(state, session["session_id"], "file_changed", {"rel": rel, "kind": kind, "size": size, "mtime": mtime})
    return {"rel": rel, "kind": kind, "size": size, "mtime": mtime}


def tool_get_session(state: LiveState, args: dict) -> dict:
    session = require_session(state, args)
    with state.lock:
        return build_snapshot(state, session)


def tool_list_sessions(state: LiveState, args: dict) -> dict:
    with state.lock:
        summaries = [session_summary(s) for s in state.sessions.values()]
    return {"sessions": summaries, "count": len(summaries)}


def tool_diagnostics(state: LiveState, args: dict) -> dict:
    with state.lock:
        session_count = len(state.sessions)
        current_id = state.current_id
    return {
        "server": {"name": SERVER_NAME, "version": VERSION, "python": sys.version.split()[0]},
        "config": dict(state.config),
        "dashboard": {
            "url": state.dashboard_url,
            "running": state.http_server is not None,
            "host": state.config.get("dashboard_host"),
            "port": state.config.get("dashboard_port"),
        },
        "session_count": session_count,
        "current_session_id": current_id,
        "uptime_seconds": round(time.time() - state.started_at, 2),
    }


TOOL_SPECS = [
    (
        "create_session",
        "Start a live session rooted at the given directory; the server then watches files under it.",
        {
            "type": "object",
            "properties": {
                "root_text": {"type": "string", "description": "Absolute path of the project directory to watch"},
                "mode": {"type": "string", "enum": ["web", "desktop"], "default": "web"},
                "label": {"type": "string", "description": "Display label for the dashboard"},
                "preview_url": {"type": ["string", "null"], "description": "URL the dashboard preview iframe should point at"},
            },
            "required": ["root_text"],
        },
        tool_create_session,
    ),
    (
        "set_phase",
        "Set the work phase shown in the dashboard (e.g. 'building', 'testing').",
        {
            "type": "object",
            "properties": {
                "phase": {"type": "string"},
                "status": {"type": "string", "enum": ["working", "done", "error"], "default": "working"},
                "message": {"type": ["string", "null"]},
            },
            "required": ["phase"],
        },
        tool_set_phase,
    ),
    (
        "set_preview",
        "Set the URL the dashboard preview iframe points at (e.g. the dev server of the project being built).",
        {
            "type": "object",
            "properties": {
                "url": {"type": ["string", "null"], "description": "Leave null/omit to clear the preview"},
            },
            "required": [],
        },
        tool_set_preview,
    ),
    (
        "set_current_file",
        "Highlight a file in the dashboard file tree and show its content in the code pane.",
        {"type": "object", "properties": {"rel": {"type": "string", "description": "Path relative to the session root"}}, "required": ["rel"]},
        tool_set_current_file,
    ),
    (
        "refresh_current_code",
        "Re-read a file and refresh the dashboard code pane with its current content.",
        {"type": "object", "properties": {"rel": {"type": "string", "description": "Path relative to the session root"}}, "required": ["rel"]},
        tool_refresh_current_code,
    ),
    (
        "publish_screenshot",
        "Publish a desktop capture to the dashboard (base64-encoded image).",
        {
            "type": "object",
            "properties": {
                "data_base64": {"type": "string", "description": "Base64-encoded image data"},
                "mime": {"type": "string", "default": "image/png"},
            },
            "required": ["data_base64"],
        },
        tool_publish_screenshot,
    ),
    (
        "publish_log",
        "Append a log line to the dashboard terminal pane.",
        {
            "type": "object",
            "properties": {
                "process_id": {"type": ["string", "integer", "null"], "description": "Optional owning process"},
                "line": {"type": "string"},
            },
            "required": ["line"],
        },
        tool_publish_log,
    ),
    (
        "process_started",
        "Register a child process that the agent launched.",
        {
            "type": "object",
            "properties": {
                "process_id": {"type": ["string", "integer"]},
                "command": {"type": "string"},
            },
            "required": ["process_id", "command"],
        },
        tool_process_started,
    ),
    (
        "process_update",
        "Update the status or exit code of a registered process.",
        {
            "type": "object",
            "properties": {
                "process_id": {"type": ["string", "integer"]},
                "status": {"type": ["string", "null"], "description": "e.g. running, done, error, stopped"},
                "exit_code": {"type": ["integer", "null"]},
            },
            "required": ["process_id"],
        },
        tool_process_update,
    ),
    (
        "file_changed",
        "Explicitly report a file change event (in addition to auto-watching).",
        {
            "type": "object",
            "properties": {
                "rel": {"type": "string", "description": "Path relative to the session root"},
                "kind": {"type": "string", "default": "file", "description": "file or dir"},
                "size": {"type": "integer", "default": 0},
                "mtime": {"type": ["number", "null"], "description": "Epoch seconds; defaults to now"},
            },
            "required": ["rel"],
        },
        tool_file_changed,
    ),
    (
        "get_session",
        "Return the current session snapshot (files, phase, logs, preview, processes, events).",
        {
            "type": "object",
            "properties": {"session_id": {"type": ["string", "null"], "description": "Defaults to the most recent session"}},
            "required": [],
        },
        tool_get_session,
    ),
    (
        "list_sessions",
        "List all active sessions.",
        {"type": "object", "properties": {}, "required": []},
        tool_list_sessions,
    ),
    (
        "diagnostics",
        "Health info: config, dashboard URL, whether the dashboard server is running, session count.",
        {"type": "object", "properties": {}, "required": []},
        tool_diagnostics,
    ),
]


def register_tools(mcp: McpServer, state: LiveState) -> None:
    for name, description, schema, handler in TOOL_SPECS:
        mcp.add_tool(name, description, schema, lambda args, fn=handler: fn(state, args))


# ---------------------------------------------------------------------------
# HTTP dashboard
# ---------------------------------------------------------------------------

class DashboardServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, state: LiveState):
        super().__init__(address, DashboardHandler)
        self.state = state


class DashboardHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "LiveFrontendDashboard/1.0"

    def log_message(self, fmt, *args):
        LOG.debug("http: " + fmt, *args)

    # -- plumbing ----------------------------------------------------------

    @property
    def state(self) -> LiveState:
        return self.server.state

    def _send_bytes(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()

    def _send_json(self, status: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, "application/json; charset=utf-8", body)

    def _serve_static(self, rel: str) -> None:
        target = (UI_DIR / rel.lstrip("/")).resolve()
        if not str(target).startswith(str(UI_DIR.resolve())) or not target.is_file():
            self._send_bytes(404, "text/plain; charset=utf-8", b"Not found")
            return
        content_type = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
        try:
            body = target.read_bytes()
        except OSError:
            self._send_bytes(500, "text/plain; charset=utf-8", b"Read error")
            return
        self._send_bytes(200, content_type, body)

    def _serve_preview(self, path: str) -> None:
        """Sirve archivos de la raíz de la sesión actual bajo /preview/.

        Es el "vista en vivo" local: el iframe del dashboard apunta aquí y el
        sitio se refresca solo conforme el agente crea/edita archivos. Rutas
        sin extensión que no existen caen a index.html (SPA fallback).
        """
        with self.state.lock:
            session = self.state.sessions.get(self.state.current_id)
        if session is None:
            self._send_bytes(404, "text/plain; charset=utf-8", b"No active session")
            return
        root = Path(session["root"]).resolve()
        rel = path[len("/preview"):].lstrip("/") or "index.html"
        target = (root / rel).resolve()
        root_norm = os.path.normcase(str(root))
        target_norm = os.path.normcase(str(target))
        if not target_norm.startswith(root_norm) or not target.is_file():
            if Path(rel).suffix == "" and (root / "index.html").is_file():
                target = root / "index.html"
            else:
                self._send_bytes(404, "text/plain; charset=utf-8", b"Not found")
                return
        content_type = CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
        try:
            body = target.read_bytes()
        except OSError:
            self._send_bytes(500, "text/plain; charset=utf-8", b"Read error")
            return
        self._send_bytes(200, content_type, body)

    def _serve_events(self) -> None:
        state = self.state
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        subscriber: queue.Queue = queue.Queue(maxsize=1000)
        with state.lock:
            state.subscribers.add(subscriber)

        def send(event_name: str, payload) -> None:
            data = json.dumps(payload, ensure_ascii=False)
            self.wfile.write(f"event: {event_name}\ndata: {data}\n\n".encode("utf-8"))
            self.wfile.flush()

        try:
            last_snapshot = 0.0
            while True:
                try:
                    event = subscriber.get(timeout=0.5)
                except queue.Empty:
                    event = None
                if event is not None:
                    send("update", event)
                now = time.monotonic()
                if now - last_snapshot >= SNAPSHOT_INTERVAL:
                    with state.lock:
                        session = state.sessions.get(state.current_id)
                        snapshot = build_snapshot(state, session) if session else None
                    send("snapshot", snapshot)
                    last_snapshot = now
        except (BrokenPipeError, ConnectionResetError, OSError, TimeoutError):
            pass
        finally:
            with state.lock:
                state.subscribers.discard(subscriber)

    # -- routes ------------------------------------------------------------

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/events":
            self._serve_events()
            return
        if path == "/preview" or path.startswith("/preview/"):
            self._serve_preview(path)
            return
        if path == "/api/health":
            self._send_json(200, {
                "ok": True,
                "server": SERVER_NAME,
                "version": VERSION,
                "sessions": len(self.state.sessions) if hasattr(self.state, "sessions") else 0,
                "dashboard_url": self.state.dashboard_url,
            })
            return
        if path == "/api/snapshot":
            with self.state.lock:
                session = self.state.sessions.get(self.state.current_id)
                snapshot = build_snapshot(self.state, session) if session else None
            self._send_json(200, {"session": snapshot})
            return
        if path == "/api/sessions":
            with self.state.lock:
                summaries = [session_summary(s) for s in self.state.sessions.values()]
            self._send_json(200, {"sessions": summaries})
            return
        self._serve_static(path if path != "/" else "index.html")

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid JSON body"})
            return
        if path == "/api/current_file":
            with self.state.lock:
                session = self.state.sessions.get(self.state.current_id)
            if session is None:
                self._send_json(404, {"error": "no active session"})
                return
            rel = body.get("rel")
            try:
                result = set_current_file_core(self.state, session, rel)
            except McpError as exc:
                self._send_json(400, {"error": exc.message})
                return
            self._send_json(200, result)
            return
        if path == "/api/session":
            session_id = body.get("session_id")
            with self.state.lock:
                if session_id not in self.state.sessions:
                    self._send_json(404, {"error": "unknown session"})
                    return
                self.state.current_id = session_id
                session = self.state.sessions[session_id]
            emit_event(self.state, session_id, "session_created", session_summary(session))
            self._send_json(200, {"ok": True, "session": session_summary(session)})
            return
        self._send_json(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def start_dashboard(state: LiveState) -> str | None:
    host = state.config.get("dashboard_host")
    port = int(state.config.get("dashboard_port", 8790))
    if not host:
        LOG.info("Dashboard disabled (dashboard_host is empty)")
        return None
    try:
        server = DashboardServer((host, port), state)
    except OSError as exc:
        LOG.error("Dashboard failed to bind %s:%s — %s", host, port, exc)
        return None
    state.http_server = server
    url = f"http://{host}:{port}/"
    state.dashboard_url = url
    threading.Thread(target=server.serve_forever, daemon=True, name="dashboard-http").start()
    LOG.info("Dashboard listening at %s", url)
    if state.config.get("auto_open_dashboard"):
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    return url


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="AI LIVE FRONTEND MCP server (stdio + dashboard)")
    parser.add_argument("--config", help="Path to config.json (overrides LIVE_FRONTEND_CONFIG)")
    parser.add_argument("--version", action="store_true", help="Print version and exit")
    args = parser.parse_args(argv)
    if args.version:
        print(f"{SERVER_NAME} {VERSION}")
        return 0
    if args.config:
        os.environ["LIVE_FRONTEND_CONFIG"] = args.config

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", stream=sys.stderr)
    config = load_config()
    state = LiveState(config)
    state.dashboard_url = start_dashboard(state)

    mcp = McpServer(SERVER_NAME, VERSION)
    register_tools(mcp, state)

    stop_event = threading.Event()
    watcher = threading.Thread(target=watcher_loop, args=(state, stop_event), daemon=True, name="file-watcher")
    watcher.start()

    def shutdown():
        stop_event.set()
        if state.http_server is not None:
            try:
                state.http_server.shutdown()
            except Exception:  # noqa: BLE001
                LOG.debug("http server already stopped")

    mcp.set_shutdown_hook(shutdown)
    try:
        mcp.run()
    except KeyboardInterrupt:
        pass
    shutdown()
    LOG.info("%s %s stopped", SERVER_NAME, VERSION)
    return 0


if __name__ == "__main__":
    sys.exit(main())
