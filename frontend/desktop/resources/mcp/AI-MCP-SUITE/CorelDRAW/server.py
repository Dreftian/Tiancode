"""CorelDRAW MCP server.

Drives CorelDRAW through its COM automation interface (prog_id
"CorelDRAW.Application"). On systems without pywin32/COM the tools report a
clear "CorelDRAW COM not available" error and never crash.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
while not os.path.isfile(os.path.join(sys.path[0], "shared", "runtime.py")):
    parent = os.path.dirname(sys.path[0])
    if parent == sys.path[0]:
        break
    sys.path[0] = parent

from shared.runtime import Server, ToolError, load_config

DEFAULTS = {"prog_id": "CorelDRAW.Application"}

server = Server("coreldraw", "1.0.0")
CONFIG = load_config(DEFAULTS)


def com_module():
    """Return the win32com.client module when pywin32 is installed, else None."""
    try:
        import win32com.client as win32com_client
        return win32com_client
    except ImportError:
        return None


def dispatch_application():
    com = com_module()
    if com is None:
        raise ToolError(
            "com_unavailable",
            "CorelDRAW COM not available: pywin32 is not installed (install with: pip install pywin32)",
        )
    try:
        return com.Dispatch(CONFIG["prog_id"])
    except Exception as exc:
        raise ToolError("com_unavailable", f"CorelDRAW COM not available: could not dispatch {CONFIG['prog_id']}: {exc}")


@server.tool(
    "application_status",
    "Report whether CorelDRAW is reachable through COM.",
    {"type": "object", "properties": {}},
)
def application_status(arguments):
    com = com_module()
    if com is None:
        return "CorelDRAW COM not available on this Python (pywin32 not installed); install with: pip install pywin32"
    try:
        app = com.Dispatch(CONFIG["prog_id"])
        version = getattr(app, "Version", None) or getattr(app, "VersionString", None) or "unknown"
        return f"CorelDRAW is running via COM ({CONFIG['prog_id']}), version: {version}"
    except Exception as exc:
        return f"CorelDRAW COM dispatch failed ({CONFIG['prog_id']}): {exc}"


@server.tool(
    "run_macro",
    "Run a CorelDRAW macro by its full macro name (e.g. GlobalMacros.MyMacro).",
    {
        "type": "object",
        "properties": {
            "macro_name": {"type": "string", "description": "Full macro name, e.g. GlobalMacros.CreateBox"}
        },
        "required": ["macro_name"],
    },
)
def run_macro(arguments):
    macro_name = arguments["macro_name"]
    app = dispatch_application()
    try:
        execute = getattr(app, "ExecuteMacro", None)
        if execute is None:
            raise ToolError("com_api", "CorelDRAW COM object has no ExecuteMacro method")
        result = execute(macro_name)
        suffix = f", result: {result}" if result is not None else ""
        return f"Executed macro {macro_name!r}{suffix}"
    except ToolError:
        raise
    except Exception as exc:
        raise ToolError("macro_failed", f"failed to execute macro {macro_name!r}: {exc}")


@server.tool(
    "open_document",
    "Open a document in CorelDRAW via COM.",
    {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Absolute path to the document (.cdr, .eps, .pdf, ...)"}
        },
        "required": ["path"],
    },
)
def open_document(arguments):
    path = arguments["path"]
    if not os.path.isfile(path):
        raise ToolError("file_not_found", f"document not found: {path}")
    app = dispatch_application()
    try:
        open_method = getattr(app, "OpenDocument", None)
        if open_method is None:
            raise ToolError("com_api", "CorelDRAW COM object has no OpenDocument method")
        result = open_method(path)
        suffix = f" (result: {result})" if result is not None else ""
        return f"Opened document: {path}{suffix}"
    except ToolError:
        raise
    except Exception as exc:
        raise ToolError("open_failed", f"failed to open {path}: {exc}")


@server.tool(
    "diagnostics",
    "Report config summary, COM availability, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    com = com_module()
    lines = [
        f"server: coreldraw v{server.version}",
        f"platform: {sys.platform}",
        f"prog_id: {CONFIG['prog_id']}",
        "pywin32 (COM support): " + ("installed" if com is not None else "NOT installed"),
    ]
    hints = []
    if com is None:
        hints.append("install pywin32: pip install pywin32")
        lines.append("CorelDRAW dispatch: unavailable")
    else:
        try:
            app = com.Dispatch(CONFIG["prog_id"])
            version = getattr(app, "Version", None) or "unknown"
            lines.append(f"CorelDRAW dispatch: ok (version {version})")
        except Exception as exc:
            lines.append(f"CorelDRAW dispatch: failed ({exc})")
            hints.append(f"make sure CorelDRAW is installed and {CONFIG['prog_id']} is registered")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - COM available"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
