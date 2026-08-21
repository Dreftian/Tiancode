"""Unity MCP server.

Project discovery, editor launch (-projectPath), and static method execution
(-executeMethod) automation for Unity.
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
    "unity_exe": "C:/Program Files/Unity/Hub/Editor/6000.0.32f1/Editor/Unity.exe",
    "project_path": "%USERPROFILE%/Documents/Unity Projects",
}
MAX_SCAN_DEPTH = 4

server = Server("unity", "1.0.0")
CONFIG = load_config(DEFAULTS)


def find_unity_projects(root):
    results = []
    if not os.path.isdir(root):
        return results
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if depth >= MAX_SCAN_DEPTH:
            dirnames[:] = []
        if "Assets" in dirnames and "ProjectSettings" in dirnames:
            results.append(os.path.abspath(dirpath))
            dirnames[:] = []  # do not descend inside a project
    return results


def resolve_project(project):
    if project:
        if not os.path.isdir(project):
            raise ToolError("project_not_found", f"project dir not found: {project}")
        return project
    projects = find_unity_projects(CONFIG["project_path"])
    if not projects:
        raise ToolError("project_not_found", f"no Unity project found under {CONFIG['project_path']}")
    return projects[0]


@server.tool(
    "open_editor",
    "Launch Unity in batch mode with a project (-projectPath). Drop -batchmode for the interactive editor.",
    {
        "type": "object",
        "properties": {
            "project": {"type": "string", "description": "Optional Unity project directory"},
            "batchmode": {
                "type": "boolean",
                "description": "Run with -batchmode (default true; set false to open the interactive editor UI)",
            },
        },
    },
)
def open_editor(arguments):
    project = resolve_project(arguments.get("project") or "")
    exe = CONFIG["unity_exe"]
    if not os.path.isfile(exe):
        raise ToolError("unity_not_found", f"Unity executable not found: {exe}; set unity_exe")
    command = [exe, "-projectPath", project]
    batchmode = arguments.get("batchmode", True)
    if batchmode:
        command.append("-batchmode")
    pid = spawn_detached(command)
    mode = "batchmode" if batchmode else "interactive"
    return f"Started Unity ({mode}, pid {pid}) with project: {project}"


@server.tool(
    "run_method",
    "Run a static editor method via -executeMethod (batch mode, quits when finished).",
    {
        "type": "object",
        "properties": {
            "method": {"type": "string", "description": "Fully qualified static method, e.g. My.Editor.Build.BuildAll"},
            "args": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Extra command line arguments passed to Unity",
            },
            "project": {"type": "string", "description": "Optional Unity project directory"},
            "timeout": {"type": "integer", "description": "Seconds before aborting (default 1800)"},
        },
        "required": ["method"],
    },
)
def run_method(arguments):
    method = arguments["method"]
    args = arguments.get("args") or []
    project = resolve_project(arguments.get("project") or "")
    exe = CONFIG["unity_exe"]
    if not os.path.isfile(exe):
        raise ToolError("unity_not_found", f"Unity executable not found: {exe}; set unity_exe")
    command = [exe, "-projectPath", project, "-executeMethod", method, "-batchmode", "-quit"] + args
    result = run_capture(command, cwd=project, timeout=arguments.get("timeout") or 1800)
    result["command"] = command
    return json.dumps(result, indent=2)


@server.tool(
    "locate_projects",
    "Scan the configured project path (4 levels deep) for Unity projects (Assets + ProjectSettings).",
    {"type": "object", "properties": {}},
)
def locate_projects(arguments):
    projects = find_unity_projects(CONFIG["project_path"])
    if not projects:
        return f"No Unity projects found under {CONFIG['project_path']}"
    return json.dumps(projects, indent=2)


@server.tool(
    "diagnostics",
    "Report config summary, Unity availability, project count, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    exe = CONFIG.get("unity_exe") or ""
    project_path = CONFIG.get("project_path") or ""
    projects = find_unity_projects(project_path) if os.path.isdir(project_path) else []
    lines = [
        f"server: unity v{server.version}",
        f"platform: {sys.platform}",
        f"unity_exe: {exe} ({'FOUND' if os.path.isfile(exe) else 'not found'})",
        f"project_path: {project_path} ({'exists' if os.path.isdir(project_path) else 'not found'})",
        f"projects found: {len(projects)}",
    ]
    hints = []
    if not os.path.isfile(exe):
        hints.append("install Unity Hub / an editor version or set unity_exe in config.json / MCP_CONFIG")
    if not projects:
        hints.append(f"no Unity projects found; set project_path or pass a project argument")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - Unity and projects found"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
