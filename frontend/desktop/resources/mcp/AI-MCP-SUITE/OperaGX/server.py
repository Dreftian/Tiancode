"""OperaGX MCP server.

Controls Opera GX through the Chrome DevTools Protocol (CDP): HTTP endpoints
(/json, /json/version, /json/activate, /json/new) for discovery and tab
management, plus a minimal RFC 6455 websocket client (stdlib-only) for
Page.navigate and Runtime.evaluate.

The browser must be started with: opera.exe --remote-debugging-port=9222
"""

import base64
import hashlib
import json
import os
import socket
import struct
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
while not os.path.isfile(os.path.join(sys.path[0], "shared", "runtime.py")):
    parent = os.path.dirname(sys.path[0])
    if parent == sys.path[0]:
        break
    sys.path[0] = parent

from shared.runtime import Server, ToolError, load_config

DEFAULTS = {
    "cdp_port": 9222,
    "browser_exe": "C:/Program Files/Opera GX/opera.exe",
}

server = Server("operagx", "1.0.0")
CONFIG = load_config(DEFAULTS)


# --- Minimal RFC 6455 websocket client -----------------------------------

class WebSocketError(Exception):
    pass


class WebSocket:
    """Minimal RFC 6455 client: masked text frames, ping/pong, close handling."""

    def __init__(self, url, timeout=10.0):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("ws", "http"):
            raise WebSocketError(f"unsupported websocket url: {url}")
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        self._socket = socket.create_connection((host, port), timeout=timeout)
        try:
            self._handshake(host, port, parsed.path or "/", parsed.query)
        except Exception:
            self._socket.close()
            raise

    def _handshake(self, host, port, path, query):
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        if query:
            path += "?" + query
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self._socket.sendall(request.encode("ascii"))
        response = self._read_until(b"\r\n\r\n")
        status_line = response.split(b"\r\n", 1)[0].decode("latin-1", "replace")
        if " 101 " not in status_line:
            raise WebSocketError(f"websocket handshake failed: {status_line}")
        accept = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()
        ).decode("ascii")
        if f"sec-websocket-accept: {accept.lower()}" not in response.decode("latin-1", "replace").lower():
            raise WebSocketError("websocket handshake failed: bad Sec-WebSocket-Accept")

    def send_text(self, message):
        payload = message.encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self._socket.sendall(bytes(header) + mask + masked)

    def receive_text(self):
        opcode, payload = self._receive_frame()
        if opcode == 0x1:
            return payload.decode("utf-8", "replace")
        if opcode == 0x8:
            raise WebSocketError("websocket closed by peer")
        raise WebSocketError(f"unexpected frame opcode 0x{opcode:x}")

    def _receive_frame(self):
        first = self._recv_exact(2)
        fin = bool(first[0] & 0x80)
        opcode = first[0] & 0x0F
        masked = bool(first[1] & 0x80)
        length = first[1] & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._recv_exact(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._recv_exact(8))[0]
        mask = self._recv_exact(4) if masked else None
        payload = self._recv_exact(length)
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        if opcode == 0x9:  # ping -> pong
            self._send_frame(0xA, payload)
            return self._receive_frame()
        if opcode == 0xA:
            return self._receive_frame()
        if not fin:
            raise WebSocketError("fragmented frames are not supported")
        return opcode, payload

    def _send_frame(self, opcode, payload):
        mask = os.urandom(4)
        length = len(payload)
        header = bytearray([0x80 | opcode])
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self._socket.sendall(bytes(header) + mask + masked)

    def _recv_exact(self, count):
        data = b""
        while len(data) < count:
            chunk = self._socket.recv(count - len(data))
            if not chunk:
                raise WebSocketError("connection closed")
            data += chunk
        return data

    def _read_until(self, marker):
        data = b""
        while marker not in data:
            chunk = self._socket.recv(4096)
            if not chunk:
                raise WebSocketError("connection closed during handshake")
            data += chunk
        return data

    def close(self):
        try:
            self._socket.close()
        except OSError:
            pass


class CdpSession:
    """A CDP session over one websocket; command() blocks until the matching id responds."""

    def __init__(self, ws_url):
        self._ws = WebSocket(ws_url)
        self._next_id = 1

    def command(self, method, params=None):
        command_id = self._next_id
        self._next_id += 1
        self._ws.send_text(json.dumps({"id": command_id, "method": method, "params": params or {}}))
        try:
            while True:
                message = json.loads(self._ws.receive_text())
                if message.get("id") != command_id:
                    continue  # skip async events
                if "error" in message:
                    raise ToolError("cdp_error", f"{method}: {message['error']}")
                return message.get("result", {})
        except ToolError:
            raise
        except Exception as exc:
            raise ToolError("cdp_error", f"{method} failed: {exc}")
        finally:
            self._ws.close()


# --- CDP HTTP helpers -----------------------------------------------------

def cdp_url(path):
    return f"http://127.0.0.1:{CONFIG['cdp_port']}{path}"


def cdp_get(path, timeout=5):
    url = cdp_url(path)
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8", "replace"))
    except json.JSONDecodeError as exc:
        raise ToolError("cdp_error", f"non-JSON response from {url}: {exc}")
    except Exception as exc:
        raise ToolError("cdp_unreachable", f"CDP request to {url} failed: {exc}")


def find_target(tab_id):
    status, targets = cdp_get("/json")
    pages = [target for target in targets if target.get("type") == "page"]
    for target in pages:
        if target.get("id") == tab_id:
            return target
    if tab_id.isdigit():
        index = int(tab_id)
        if index < len(pages):
            return pages[index]
    for target in pages:
        if target.get("title") == tab_id or target.get("url") == tab_id:
            return target
    raise ToolError("tab_not_found", f"no page target found for {tab_id!r} ({len(pages)} pages open)")


def activate(target):
    try:
        urllib.request.urlopen(cdp_url("/json/activate/" + target.get("id", "")), timeout=5).read()
    except Exception:
        pass  # activation is best-effort; some targets reject it


def cdp_session(target):
    ws_url = target.get("webSocketDebuggerUrl")
    if not ws_url:
        raise ToolError("no_debugger", f"target {target.get('id')} has no webSocketDebuggerUrl")
    try:
        return CdpSession(ws_url)
    except Exception as exc:
        raise ToolError("cdp_ws_failed", f"could not connect to {ws_url}: {exc}")


def open_new_tab(url):
    try:
        request = urllib.request.Request(
            cdp_url("/json/new") + "?" + urllib.parse.urlencode({"url": url}),
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except Exception as exc:
        raise ToolError("cdp_error", f"failed to open a new tab: {exc}")


# --- Tools ----------------------------------------------------------------

@server.tool(
    "browser_status",
    "Probe the Opera GX CDP endpoint and report browser/version information.",
    {"type": "object", "properties": {}},
)
def browser_status(arguments):
    try:
        status, version = cdp_get("/json/version")
    except ToolError as exc:
        raise ToolError(
            "cdp_unreachable",
            f"Opera GX CDP not reachable: {exc}. Start Opera GX with --remote-debugging-port={CONFIG['cdp_port']}",
        )
    return json.dumps(version, indent=2)


@server.tool(
    "list_tabs",
    "List open browser tabs (pages) with their ids, titles, URLs and debugger websockets.",
    {"type": "object", "properties": {}},
)
def list_tabs(arguments):
    status, targets = cdp_get("/json")
    pages = [target for target in targets if target.get("type") == "page"]
    if not pages:
        return "No page targets open (only background/service targets exist)"
    tabs = [
        {
            "id": target.get("id"),
            "title": target.get("title"),
            "url": target.get("url"),
            "webSocketDebuggerUrl": target.get("webSocketDebuggerUrl"),
        }
        for target in pages
    ]
    return json.dumps(tabs, indent=2)


@server.tool(
    "navigate",
    "Navigate a tab to a URL (CDP Page.navigate over the tab's websocket; falls back to opening a new tab).",
    {
        "type": "object",
        "properties": {
            "tab_id": {"type": "string", "description": "Tab id, page index (0-based), or page URL/title"},
            "url": {"type": "string", "description": "Destination URL"},
        },
        "required": ["tab_id", "url"],
    },
)
def navigate(arguments):
    target = find_target(arguments["tab_id"])
    activate(target)
    session = cdp_session(target)
    try:
        result = session.command("Page.navigate", {"url": arguments["url"]})
    except ToolError:
        new_target = open_new_tab(arguments["url"])
        return json.dumps({"fallback": "new_tab", "tab": new_target}, indent=2)
    finally:
        session.close()
    return json.dumps(
        {"tab_id": target.get("id"), "url": arguments["url"], "frame_id": result.get("frameId")},
        indent=2,
    )


@server.tool(
    "execute_js",
    "Evaluate a JavaScript expression in a tab (CDP Runtime.evaluate with returnByValue).",
    {
        "type": "object",
        "properties": {
            "tab_id": {"type": "string", "description": "Tab id, page index (0-based), or page URL/title"},
            "expression": {"type": "string", "description": "JavaScript expression to evaluate"},
        },
        "required": ["tab_id", "expression"],
    },
)
def execute_js(arguments):
    target = find_target(arguments["tab_id"])
    session = cdp_session(target)
    try:
        result = session.command(
            "Runtime.evaluate",
            {"expression": arguments["expression"], "returnByValue": True, "awaitPromise": True},
        )
    finally:
        session.close()
    return json.dumps(result, indent=2, default=str)


@server.tool(
    "diagnostics",
    "Report config summary, CDP reachability, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    exe = CONFIG.get("browser_exe") or ""
    lines = [
        f"server: operagx v{server.version}",
        f"platform: {sys.platform}",
        f"cdp_port: {CONFIG['cdp_port']}",
        f"browser_exe: {exe} ({'FOUND' if os.path.isfile(exe) else 'not found'})",
    ]
    hints = []
    try:
        status, version = cdp_get("/json/version", timeout=3)
        lines.append(f"CDP /json/version: reachable ({version.get('Browser', 'unknown')})")
    except ToolError as exc:
        lines.append(f"CDP /json/version: unreachable ({exc})")
        hints.append(f"start Opera GX with --remote-debugging-port={CONFIG['cdp_port']} to enable CDP")
    if not os.path.isfile(exe):
        hints.append("browser_exe not found; set it in config.json / MCP_CONFIG")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - CDP reachable"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
