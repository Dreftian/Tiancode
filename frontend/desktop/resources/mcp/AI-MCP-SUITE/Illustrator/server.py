"""Illustrator MCP server.

Controls Adobe Illustrator: opens documents and installs .jsx scripts into
the scripts directory. run_script is a best-effort launch of Illustrator
with the script file (Illustrator has no documented remote-run CLI).
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
while not os.path.isfile(os.path.join(sys.path[0], "shared", "runtime.py")):
    parent = os.path.dirname(sys.path[0])
    if parent == sys.path[0]:
        break
    sys.path[0] = parent

from shared.runtime import Server, ToolError, load_config, spawn_detached

DEFAULTS = {
    "illustrator_exe": "C:/Program Files/Adobe/Adobe Illustrator 2024/Support Files/Contents/Windows/Illustrator.exe",
    "scripts_dir": "%USERPROFILE%/AppData/Roaming/Adobe/Adobe Illustrator 2024 Settings/en_US/Scripts",
}
ALLOWED_EXTENSIONS = (".jsx", ".js")
DEFAULT_EXTENSION = ".jsx"

server = Server("illustrator", "1.0.0")
CONFIG = load_config(DEFAULTS)


def sanitize_script_name(name):
    name = os.path.basename(name or "").strip()
    if not name:
        raise ToolError("invalid_name", "script name must not be empty")
    if os.path.splitext(name)[1].lower() not in ALLOWED_EXTENSIONS:
        name += DEFAULT_EXTENSION
    return name


@server.tool(
    "open_document",
    "Open a document in Illustrator (spawns Illustrator with the file).",
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
    exe = CONFIG.get("illustrator_exe") or ""
    if not os.path.isfile(exe):
        raise ToolError("illustrator_unavailable", f"illustrator_exe not found: {exe}; set it in config.json / MCP_CONFIG")
    pid = spawn_detached([exe, path])
    return f"Started Illustrator (pid {pid}) opening: {path}"


@server.tool(
    "install_script",
    "Install a script (.jsx/.js) into the Illustrator scripts directory.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Script file name (e.g. export_svg.jsx)"},
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
    "Run an installed script: best-effort launch of Illustrator with the script file as argument.",
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
    exe = CONFIG.get("illustrator_exe") or ""
    if not os.path.isfile(exe):
        raise ToolError("illustrator_unavailable", f"illustrator_exe not found: {exe}; set it in config.json / MCP_CONFIG")
    pid = spawn_detached([exe, script_path])
    return f"Launched Illustrator (pid {pid}) with script: {script_path}"


@server.tool(
    "list_scripts",
    "List the scripts currently installed in the Illustrator scripts directory.",
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
    "Report config summary, app availability, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    exe = CONFIG.get("illustrator_exe") or ""
    scripts_dir = CONFIG.get("scripts_dir") or ""
    lines = [
        f"server: illustrator v{server.version}",
        f"platform: {sys.platform}",
        f"illustrator_exe: {exe} ({'FOUND' if os.path.isfile(exe) else 'not found'})",
        f"scripts_dir: {scripts_dir} ({'exists' if os.path.isdir(scripts_dir) else 'missing'})",
    ]
    hints = []
    if not os.path.isfile(exe):
        hints.append("install Illustrator or set illustrator_exe in config.json / MCP_CONFIG")
    if not os.path.isdir(scripts_dir):
        hints.append(f"scripts_dir missing; install_script will create it: {scripts_dir}")
    hints.append("run_script launches Illustrator with the script file; remote execution is not available without a bridge")
    lines.append("hints: " + "; ".join(hints))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
