"""Godot MCP server.

Project discovery (project.godot), editor launch, headless script execution
and export automation for the Godot engine.
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

from shared.runtime import Server, ToolError, load_config, run_capture, spawn_detached

DEFAULTS = {
    "godot_exe": "C:/Program Files/Godot/Godot_v4.3-stable_win64.exe",
    "project_path": "%USERPROFILE%/Documents/Godot Projects",
}
MAX_SCAN_DEPTH = 4

server = Server("godot", "1.0.0")
CONFIG = load_config(DEFAULTS)


def find_godot_projects(root):
    results = []
    if not os.path.isdir(root):
        return results
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if depth >= MAX_SCAN_DEPTH:
            dirnames[:] = []
        if "project.godot" in filenames:
            results.append(os.path.abspath(dirpath))
            dirnames[:] = []  # do not descend inside a project
    return results


def resolve_project(project):
    if project:
        if not os.path.isdir(project):
            raise ToolError("project_not_found", f"project dir not found: {project}")
        return project
    projects = find_godot_projects(CONFIG["project_path"])
    if not projects:
        raise ToolError("project_not_found", f"no Godot project found under {CONFIG['project_path']}")
    return projects[0]


@server.tool(
    "open_editor",
    "Launch the Godot editor with a project.",
    {
        "type": "object",
        "properties": {
            "project": {"type": "string", "description": "Optional Godot project directory"}
        },
    },
)
def open_editor(arguments):
    project = resolve_project(arguments.get("project") or "")
    exe = CONFIG["godot_exe"]
    if not os.path.isfile(exe):
        raise ToolError("godot_not_found", f"Godot executable not found: {exe}; set godot_exe")
    pid = spawn_detached([exe, "-e", "--path", project])
    return f"Started Godot editor (pid {pid}) with project: {project}"


@server.tool(
    "run_headless",
    "Run a script headlessly: godot --headless --path <project> -s <script>.",
    {
        "type": "object",
        "properties": {
            "script": {"type": "string", "description": "Script path relative to the project (e.g. res://tools/build.gd)"},
            "project": {"type": "string", "description": "Optional Godot project directory"},
            "timeout": {"type": "integer", "description": "Seconds before aborting (default 600)"},
        },
        "required": ["script"],
    },
)
def run_headless(arguments):
    script = arguments["script"]
    project = resolve_project(arguments.get("project") or "")
    exe = CONFIG["godot_exe"]
    if not os.path.isfile(exe):
        raise ToolError("godot_not_found", f"Godot executable not found: {exe}; set godot_exe")
    command = [exe, "--headless", "--path", project, "-s", script]
    result = run_capture(command, cwd=project, timeout=arguments.get("timeout") or 600)
    result["command"] = command
    return json.dumps(result, indent=2)


@server.tool(
    "export_release",
    "Export the project with a preset: godot --headless --path <project> --export-release <preset>.",
    {
        "type": "object",
        "properties": {
            "preset": {"type": "string", "description": "Preset name from export_presets.cfg (e.g. Windows Desktop)"},
            "project": {"type": "string", "description": "Optional Godot project directory"},
            "timeout": {"type": "integer", "description": "Seconds before aborting (default 1800)"},
        },
        "required": ["preset"],
    },
)
def export_release(arguments):
    preset = arguments["preset"]
    project = resolve_project(arguments.get("project") or "")
    exe = CONFIG["godot_exe"]
    if not os.path.isfile(exe):
        raise ToolError("godot_not_found", f"Godot executable not found: {exe}; set godot_exe")
    command = [exe, "--headless", "--path", project, "--export-release", preset]
    result = run_capture(command, cwd=project, timeout=arguments.get("timeout") or 1800)
    result["command"] = command
    return json.dumps(result, indent=2)


@server.tool(
    "locate_projects",
    "Scan the configured project path (4 levels deep) for project.godot files.",
    {"type": "object", "properties": {}},
)
def locate_projects(arguments):
    projects = find_godot_projects(CONFIG["project_path"])
    if not projects:
        return f"No Godot projects found under {CONFIG['project_path']}"
    return json.dumps(projects, indent=2)


@server.tool(
    "diagnostics",
    "Report config summary, Godot availability, project count, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    exe = CONFIG.get("godot_exe") or ""
    project_path = CONFIG.get("project_path") or ""
    projects = find_godot_projects(project_path) if os.path.isdir(project_path) else []
    lines = [
        f"server: godot v{server.version}",
        f"platform: {sys.platform}",
        f"godot_exe: {exe} ({'FOUND' if os.path.isfile(exe) else 'not found'})",
        f"project_path: {project_path} ({'exists' if os.path.isdir(project_path) else 'not found'})",
        f"projects found: {len(projects)}",
    ]
    hints = []
    if not os.path.isfile(exe):
        hints.append("install Godot or set godot_exe in config.json / MCP_CONFIG")
    if not projects:
        hints.append(f"no Godot projects found; set project_path or pass a project argument")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - Godot and projects found"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
