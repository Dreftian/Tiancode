"""Android Studio MCP server.

adb device listing, AVD management (emulator/avdmanager), Android Studio
project launch and Gradle wrapper task execution.
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
    "android_sdk_root": "%LOCALAPPDATA%/Android/Sdk",
    "gradle_wrapper_dir": "%USERPROFILE%/Documents/Android Studio Projects",
    "studio_exe": "C:/Program Files/Android/Android Studio/bin/studio64.exe",
    "adb_path": "",
}

server = Server("android-studio", "1.0.0")
CONFIG = load_config(DEFAULTS)


def adb_exe():
    if CONFIG.get("adb_path"):
        return CONFIG["adb_path"]
    return os.path.join(CONFIG["android_sdk_root"], "platform-tools", "adb" + (".exe" if sys.platform == "win32" else ""))


def emulator_exe():
    return os.path.join(CONFIG["android_sdk_root"], "emulator", "emulator" + (".exe" if sys.platform == "win32" else ""))


def avdmanager_command():
    path = os.path.join(
        CONFIG["android_sdk_root"],
        "cmdline-tools",
        "latest",
        "bin",
        "avdmanager" + (".bat" if sys.platform == "win32" else ""),
    )
    return batch_prefix(path)


def gradle_wrapper():
    return os.path.join(CONFIG["gradle_wrapper_dir"], "gradlew" + (".bat" if sys.platform == "win32" else ""))


@server.tool(
    "list_devices",
    "List connected Android devices via `adb devices`.",
    {"type": "object", "properties": {}},
)
def list_devices(arguments):
    adb = adb_exe()
    if not os.path.isfile(adb):
        raise ToolError("adb_not_found", f"adb not found: {adb}; set adb_path or android_sdk_root")
    result = run_capture([adb, "devices"], timeout=20)
    devices = []
    for line in (result["stdout"] or "").splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2:
            devices.append({"serial": parts[0], "state": parts[1]})
    if devices:
        return json.dumps(devices, indent=2)
    return "No devices attached"


@server.tool(
    "emulator_list",
    "List available AVDs (emulator -list-avds, falling back to avdmanager list avd).",
    {"type": "object", "properties": {}},
)
def emulator_list(arguments):
    emulator = emulator_exe()
    if os.path.isfile(emulator):
        result = run_capture([emulator, "-list-avds"], timeout=30)
        avds = [line.strip() for line in (result["stdout"] or "").splitlines() if line.strip()]
        if avds:
            return json.dumps(avds, indent=2)
        return "No AVDs configured (emulator -list-avds returned nothing)"
    avdmanager = avdmanager_command()
    if os.path.isfile(avdmanager[-1]):
        result = run_capture(avdmanager + ["list", "avd"], timeout=60)
        avds = [line.split(":", 1)[1].strip() for line in (result["stdout"] or "").splitlines() if line.strip().startswith("Name:")]
        if avds:
            return json.dumps(avds, indent=2)
    raise ToolError("emulator_not_found", f"emulator/avdmanager not found under {CONFIG['android_sdk_root']}")


@server.tool(
    "launch_emulator",
    "Launch an AVD in the Android emulator (detached).",
    {
        "type": "object",
        "properties": {"avd": {"type": "string", "description": "AVD name (see emulator_list)"}},
        "required": ["avd"],
    },
)
def launch_emulator(arguments):
    avd = arguments["avd"]
    emulator = emulator_exe()
    if not os.path.isfile(emulator):
        raise ToolError("emulator_not_found", f"emulator not found: {emulator}; set android_sdk_root")
    pid = spawn_detached([emulator, "-avd", avd])
    return f"Launching emulator for AVD {avd!r} (pid {pid})"


@server.tool(
    "open_project",
    "Open a project in Android Studio (defaults to the configured gradle_wrapper_dir).",
    {
        "type": "object",
        "properties": {
            "project": {"type": "string", "description": "Optional project directory to open"}
        },
    },
)
def open_project(arguments):
    studio = CONFIG["studio_exe"]
    if not os.path.isfile(studio):
        raise ToolError("studio_not_found", f"Android Studio executable not found: {studio}; set studio_exe")
    project = arguments.get("project") or CONFIG["gradle_wrapper_dir"]
    pid = spawn_detached([studio, project])
    return f"Opened project in Android Studio (pid {pid}): {project}"


@server.tool(
    "gradle_task",
    "Run a Gradle task with the project's wrapper (gradlew).",
    {
        "type": "object",
        "properties": {
            "task": {"type": "string", "description": "Gradle task, e.g. assembleDebug"},
            "args": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Extra Gradle arguments",
            },
            "timeout": {"type": "integer", "description": "Seconds before aborting (default 900)"},
        },
        "required": ["task"],
    },
)
def gradle_task(arguments):
    task = arguments["task"]
    args = arguments.get("args") or []
    wrapper = gradle_wrapper()
    if not os.path.isfile(wrapper):
        raise ToolError("gradle_wrapper_not_found", f"gradle wrapper not found: {wrapper}; set gradle_wrapper_dir")
    command = batch_prefix(wrapper) + [task] + args
    result = run_capture(command, cwd=CONFIG["gradle_wrapper_dir"], timeout=arguments.get("timeout") or 900)
    result["command"] = command
    return json.dumps(result, indent=2)


@server.tool(
    "diagnostics",
    "Report config summary, SDK/CLI availability, platform and health hints.",
    {"type": "object", "properties": {}},
)
def diagnostics(arguments):
    sdk_root = CONFIG.get("android_sdk_root") or ""
    wrapper_dir = CONFIG.get("gradle_wrapper_dir") or ""
    studio = CONFIG.get("studio_exe") or ""
    adb = adb_exe()
    emulator = emulator_exe()
    avdmanager = avdmanager_command()
    lines = [
        f"server: android-studio v{server.version}",
        f"platform: {sys.platform}",
        f"android_sdk_root: {sdk_root} ({'exists' if os.path.isdir(sdk_root) else 'not found'})",
        f"adb: {adb} ({'FOUND' if os.path.isfile(adb) else 'not found'})",
        f"emulator: {emulator} ({'FOUND' if os.path.isfile(emulator) else 'not found'})",
        f"avdmanager: {avdmanager[-1]} ({'FOUND' if os.path.isfile(avdmanager[-1]) else 'not found'})",
        f"studio_exe: {studio} ({'FOUND' if os.path.isfile(studio) else 'not found'})",
        f"gradle_wrapper_dir: {wrapper_dir} ({'exists' if os.path.isdir(wrapper_dir) else 'not found'})",
        f"gradlew: {gradle_wrapper()} ({'FOUND' if os.path.isfile(gradle_wrapper()) else 'not found'})",
    ]
    hints = []
    if not os.path.isdir(sdk_root):
        hints.append("install the Android SDK or set android_sdk_root in config.json / MCP_CONFIG")
    if not os.path.isfile(adb):
        hints.append("adb missing: install platform-tools via the Android SDK manager")
    if not os.path.isfile(emulator) and not os.path.isfile(avdmanager[-1]):
        hints.append("emulator/avdmanager missing: install the emulator and cmdline-tools packages")
    if not os.path.isfile(studio):
        hints.append("Android Studio not found; set studio_exe")
    if not os.path.isfile(gradle_wrapper()):
        hints.append("no gradlew in gradle_wrapper_dir; set gradle_wrapper_dir to a project with the Gradle wrapper")
    lines.append("hints: " + ("; ".join(hints) if hints else "none - SDK, Studio and wrapper found"))
    return "\n".join(lines)


if __name__ == "__main__":
    server.run()
