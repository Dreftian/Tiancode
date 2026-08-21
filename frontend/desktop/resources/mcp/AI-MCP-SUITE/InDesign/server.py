"""InDesign MCP server.

Controls Adobe InDesign: opens documents, installs and runs scripts (.idjs)
via the scripts_dir, and talks to a UXP bridge over HTTP when configured.
Degrades gracefully when InDesign or the bridge is missing.
"""

import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
while not os.path.isfile(os.path.join(sys.path[0], "shared", "runtime.py")):
    parent = os.path.dirname(sys.path[0])
    if parent == sys.path[0]:
        break
    sys.path[0] = parent

from shared.runtime import Server, ToolError, load_config, spawn_detached

DEFAULTS = {
    "indesign_exe": "C:/Program Files/Adobe/Adobe InDesign 2024/InDesign.exe",
    "scripts_dir": "%USERPROFILE%/AppData/Roaming/Adobe/InDesign/Version 19.0/en_US/Scripts/Scripts Panel",
    "uxp_bridge_url": "http://127.0.0.1:24001",
}
ALLOWED_EXTENSIONS = (".idjs", ".jsx", ".js")
DEFAULT_EXTENSION = ".idjs"

server = Server("indesign", "1.0.0")
CONFIG = load_config(DEFAULTS)


def sanitize_script_name(name):
    name = os.path.basename(name or "").strip()
    if not name:
        raise ToolError("invalid_name", "script name must not be empty")
    if os.path.splitext(name)[1].lower() not in ALLOWED_EXTENSIONS:
        name += DEFAULT_EXTENSION
    return name


def bridge_post(base_url, payload):
    url = base_url.rstrip("/") + "/run"
    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", "replace")
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                return {"status": response.status, "body": body}
    except Exception as exc:
        raise ToolError("bridge_unreachable", f"UXP bridge POST {url} failed: {exc}")


def probe_bridge(base_url):
    try:
        with urllib.request.urlopen(base_url, timeout=3) as response:
            return "reachable"
    except Exception:
        return "unreachable"


@server.tool(
    "open_document",
    "Open a document in InDesign (spawns InDesign; falls back to the UXP bridge).",
    {
        "type": "object",
        "properties": {"path": {"type": "string", "description": "Absolute path of the document to open"}},
        "required": ["path"],
    },
)
def open_document(arguments):
    path = arguments["path"]
    if not os.path.isfile(path):
        raise ToolError("file_not_found", f"document not found: {path}")
    exe = CONFIG.get("indesign_exe") or ""
    if os.path.isfile(exe):
        pid = spawn_detached([exe, path])
        return f"Started InDesign (pid {pid}) opening: {path}"
    bridge = CONFIG.get("uxp_bridge_url") or ""
    if bridge:
        response = bridge_post(bridge, {"command": "open", "path": path})
        return f"UXP bridge asked to open: {path}\n{json.dumps(response, indent=2)}"
    raise ToolError(
        "indesign_unavailable",
        "indesign_exe not found and uxp_bridge_url not configured; set either in config.json / MCP_CONFIG",
    )


@server.tool(
    "install_script",
    "Install a script (.idjs/.jsx/.js) into the InDesign scripts directory.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Script file name (e.g. export_pdf.idjs)"},
            "content": {"type": "string", "description": "Full script source code"},
        },
        "required": ["name", "content"],
    },
)
def install_script(arguments):
    name = sanitize_script_name(arguments["name"])
    scripts_dir = CONFIG["scripts_dir"]
    os.makedirs(scripts_dir, exist_ok=True)
    target = os.path.join(scripts_dir, name)
    with open(target, "w", encoding="utf-8-sig", newline="\n") as handle:
        handle.write(arguments["content"])
    return f"Installed script: {target} ({len(arguments['content'])} chars)"


@server.tool(
    "run_script",
    "Run an installed script by name through the UXP bridge (POST {bridge}/run).",
    {
        "type": "object",
        "properties": {"name": {"type": "string", "description": "Installed script file name"}},
        "required": ["name"],
    },
)
def run_script(arguments):
    name = sanitize_script_name(arguments["name"])
    script_path = os.path.join(CONFIG["scripts_dir"], name)
    if not os.path.isfile(script_path):
        raise ToolError("script_not_found", f"script not found: {script_path} (install it with install_script first)")
    bridge = CONFIG.get("uxp_bridge_url") or ""
    if not bridge:
        raise ToolError("bridge_not_configured", "uxp_bridge_url is not configured; run_script needs a running UXP bridge")
    response = bridge_post(bridge, {"script": name})
    return json.dumps(response, indent=2)


@server.tool(
    "list_scripts",
    "List the scripts currently installed in the InDesign scripts directory.",
    {"type": "object", "properties": {}},
)
def list_scripts(arguments):
    scripts_dir = CONFIG["scripts_dir"]
    if not os.path.isdir(scripts_dir):
        return f"No scripts installed (scripts_dir does not exist yet: {scripts_dir})"
    names = sorted(os.listdir(scripts_dir))
    if not names:
        return f"scripts_dir exists but is empty: {scripts_dir}"
    return json.dumps(names, indent=2)


@server.tool(
    "diagnostics",
    "Report config summary, app/bridge availability, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    exe = CONFIG.get("indesign_exe") or ""
    scripts_dir = CONFIG.get("scripts_dir") or ""
    bridge = CONFIG.get("uxp_bridge_url") or ""
    lines = [
        f"server: indesign v{server.version}",
        f"platform: {sys.platform}",
        f"indesign_exe: {exe} ({'FOUND' if os.path.isfile(exe) else 'not found'})",
        f"scripts_dir: {scripts_dir} ({'exists' if os.path.isdir(scripts_dir) else 'missing'})",
        f"uxp_bridge_url: {bridge} ({probe_bridge(bridge) if bridge else 'not configured'})",
    ]
    hints = []
    if not os.path.isfile(exe):
        hints.append("install InDesign or set indesign_exe in config.json / MCP_CONFIG")
    if not os.path.isdir(scripts_dir):
        hints.append(f"scripts_dir missing; install_script will create it: {scripts_dir}")
    if bridge and probe_bridge(bridge) != "reachable":
        hints.append("start the UXP bridge before using run_script")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - configured targets available"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
