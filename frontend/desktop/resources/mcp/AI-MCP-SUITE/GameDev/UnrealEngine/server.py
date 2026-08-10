"""Unreal Engine MCP server.

Project discovery (.uproject scan), editor launch, commandlet execution
(UnrealEditor-Cmd.exe) and UAT (RunUAT) automation.
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

from shared.runtime import Server, ToolError, batch_prefix, load_config, run_capture, spawn_detached

DEFAULTS = {
    "engine_root": "C:/Program Files/Epic Games/UE_5.4",
    "project_path": "%USERPROFILE%/Documents/Unreal Projects",
    "uat_script": "C:/Program Files/Epic Games/UE_5.4/Engine/Build/BatchFiles/RunUAT.bat",
}
MAX_SCAN_DEPTH = 4

server = Server("unreal-engine", "1.0.0")
CONFIG = load_config(DEFAULTS)


def editor_exe():
    return os.path.join(CONFIG["engine_root"], "Engine", "Binaries", "Win64", "UnrealEditor.exe")


def commandlet_exe():
    return os.path.join(CONFIG["engine_root"], "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe")


def find_uprojects(root):
    results = []
    if os.path.isfile(root) and root.lower().endswith(".uproject"):
        return [os.path.abspath(root)]
    if not os.path.isdir(root):
        return results
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if depth >= MAX_SCAN_DEPTH:
            dirnames[:] = []
        for filename in filenames:
            if filename.lower().endswith(".uproject"):
                results.append(os.path.join(dirpath, filename))
    return results


def resolve_project(project):
    if project:
        if not (os.path.isfile(project) or os.path.isdir(project)):
            raise ToolError("project_not_found", f"project not found: {project}")
        return project
    projects = find_uprojects(CONFIG["project_path"])
    if not projects:
        raise ToolError("project_not_found", f"no .uproject found under {CONFIG['project_path']}")
    return projects[0]


@server.tool(
    "locate_projects",
    "Scan the configured project path (up to 4 levels deep) for .uproject files.",
    {"type": "object", "properties": {}},
)
def locate_projects(arguments):
    projects = find_uprojects(CONFIG["project_path"])
    if not projects:
        return f"No .uproject files found under {CONFIG['project_path']}"
    return json.dumps(projects, indent=2)


@server.tool(
    "open_editor",
    "Launch the Unreal Editor with a project (defaults to the first .uproject found).",
    {
        "type": "object",
        "properties": {
            "project": {"type": "string", "description": "Optional .uproject path or project directory"}
        },
    },
)
def open_editor(arguments):
    project = resolve_project(arguments.get("project") or "")
    editor = editor_exe()
    if not os.path.isfile(editor):
        raise ToolError("unreal_engine_not_found", f"UnrealEditor.exe not found: {editor}; set engine_root")
    pid = spawn_detached([editor, project])
    return f"Started Unreal Editor (pid {pid}) with project: {project}"


@server.tool(
    "run_commandlet",
    "Run UnrealEditor-Cmd.exe with the given commandlet arguments (e.g. -run=Cook).",
    {
        "type": "object",
        "properties": {
            "argv": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Commandlet arguments, e.g. [\"-run=Cook\", \"-targetplatform=Win64\"]",
            },
            "project": {"type": "string", "description": "Optional .uproject path or project directory"},
            "timeout": {"type": "integer", "description": "Seconds before aborting (default 600)"},
        },
        "required": ["argv"],
    },
)
def run_commandlet(arguments):
    argv = arguments["argv"]
    base = [commandlet_exe()]
    if not os.path.isfile(base[0]):
        raise ToolError("unreal_engine_not_found", f"UnrealEditor-Cmd.exe not found: {base[0]}; set engine_root")
    project = arguments.get("project") or ""
    cwd = None
    if project:
        if not (os.path.isfile(project) or os.path.isdir(project)):
            raise ToolError("project_not_found", f"project not found: {project}")
        base.append(project)
        if os.path.isdir(project):
            cwd = project
    elif os.path.isdir(CONFIG["project_path"]):
        cwd = CONFIG["project_path"]
    command = base + argv
    result = run_capture(command, cwd=cwd, timeout=arguments.get("timeout") or 600)
    result["command"] = command
    return json.dumps(result, indent=2)


@server.tool(
    "run_uat",
    "Run Unreal Automation Tool (RunUAT) with the given arguments (e.g. BuildCookRun).",
    {
        "type": "object",
        "properties": {
            "args": {
                "type": "array",
                "items": {"type": "string"},
                "description": "UAT arguments, e.g. [\"BuildCookRun\", \"-project=C:/p/Proj.uproject\", \"-platform=Win64\"]",
            },
            "timeout": {"type": "integer", "description": "Seconds before aborting (default 1200)"},
        },
        "required": ["args"],
    },
)
def run_uat(arguments):
    args = arguments["args"]
    uat = CONFIG["uat_script"]
    if not os.path.isfile(uat):
        raise ToolError("uat_not_found", f"RunUAT not found: {uat}; set uat_script")
    command = batch_prefix(uat) + args
    cwd = CONFIG["project_path"] if os.path.isdir(CONFIG["project_path"]) else None
    result = run_capture(command, cwd=cwd, timeout=arguments.get("timeout") or 1200)
    result["command"] = command
    return json.dumps(result, indent=2)


@server.tool(
    "diagnostics",
    "Report config summary, engine/tool availability, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    engine_root = CONFIG.get("engine_root") or ""
    project_path = CONFIG.get("project_path") or ""
    uat = CONFIG.get("uat_script") or ""
    editor = os.path.join(engine_root, "Engine", "Binaries", "Win64", "UnrealEditor.exe")
    cmd = os.path.join(engine_root, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe")
    projects = find_uprojects(project_path) if os.path.isdir(project_path) else []
    lines = [
        f"server: unreal-engine v{server.version}",
        f"platform: {sys.platform}",
        f"engine_root: {engine_root} ({'exists' if os.path.isdir(engine_root) else 'not found'})",
        f"UnrealEditor.exe: {editor} ({'FOUND' if os.path.isfile(editor) else 'not found'})",
        f"UnrealEditor-Cmd.exe: {cmd} ({'FOUND' if os.path.isfile(cmd) else 'not found'})",
        f"uat_script: {uat} ({'FOUND' if os.path.isfile(uat) else 'not found'})",
        f"project_path: {project_path} ({'exists' if os.path.isdir(project_path) else 'not found'})",
        f"projects found: {len(projects)}",
    ]
    hints = []
    if not os.path.isdir(engine_root):
        hints.append("install Unreal Engine or set engine_root in config.json / MCP_CONFIG")
    if not os.path.isfile(uat):
        hints.append(f"set uat_script (RunUAT.bat lives at Engine/Build/BatchFiles/RunUAT.bat)")
    if not projects:
        hints.append(f"no .uproject found; set project_path or pass a project argument")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - engine and projects found"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
