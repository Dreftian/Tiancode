# Installation

## 1. Prerequisites

- **Python 3.10+** on PATH (`python --version`). The suite uses only the standard library.
- **Windows 10/11** recommended — all target applications are Windows software.
- The target applications you want to drive (each server also runs without its target; the affected tools then report the app as unavailable).

## 2. Install the suite

Option A — run in place (no copying):

```bash
cd frontend/desktop/resources/mcp/AI-MCP-SUITE
python scripts/validate_package.py
```

Option B — copy to a user location (PowerShell):

```powershell
.\scripts\install.ps1
```

Option C — copy to a user location (bash):

```bash
./scripts/install.sh
```

Both installers copy the suite to `~/.mcp-servers/AI-MCP-SUITE`, validate it, and generate `opencode.json`.

## 3. Per-application setup

### Photoshop (`Photoshop/server.py`)
- Install Photoshop (2021 or newer).
- `open_document` spawns `photoshop_exe` with the file. `install_script` writes `.jsx`/`.jsxbin` files into `scripts_dir`.
- `run_script` requires a UXP bridge: run a bridge implementation (e.g. the community `uxp-bridge`) that listens on `uxp_bridge_url` (default `http://127.0.0.1:24000`) and accepts `POST /run` with `{"script": "<name>"}`. Adjust `uxp_bridge_url` if your bridge uses another port.

### InDesign (`InDesign/server.py`)
- Same model as Photoshop; scripts are `.idjs` and the bridge default port is `24001`.
- Adjust `scripts_dir` to your InDesign version folder (`Version 19.0` is InDesign 2024).

### Illustrator (`Illustrator/server.py`)
- No remote bridge in this suite. `install_script` writes `.jsx` files into `scripts_dir`; `run_script` launches Illustrator with the script file as a startup argument.
- For headless execution, run scripts from inside Illustrator (File > Scripts) or add a UXP bridge.

### CorelDRAW (`CorelDRAW/server.py`)
- Install CorelDRAW (any version with COM/VBA automation).
- Install `pywin32` in the Python that runs the server: `pip install pywin32`
- Tools dispatch `CorelDRAW.Application` via COM. Without pywin32 they report "CorelDRAW COM not available" — they never crash.

### OperaGX (`OperaGX/server.py`)
- Start Opera GX with remote debugging:
  ```
  "C:/Program Files/Opera GX/opera.exe" --remote-debugging-port=9222
  ```
- The server uses CDP HTTP endpoints (`/json`, `/json/version`, `/json/activate`, `/json/new`) plus a minimal RFC 6455 websocket client (stdlib only) for `navigate` (`Page.navigate`) and `execute_js` (`Runtime.evaluate`).
- If you use another browser (Chrome/Edge), point `browser_exe` and `cdp_port` at it — the protocol is the same.

### Unreal Engine (`GameDev/UnrealEngine/server.py`)
- Install Unreal Engine via the Epic Games Launcher (e.g. UE 5.4 at `C:/Program Files/Epic Games/UE_5.4`).
- Set `engine_root`, `project_path`, and `uat_script` (default `{engine_root}/Engine/Build/BatchFiles/RunUAT.bat`).
- `run_commandlet` uses `UnrealEditor-Cmd.exe`; `run_uat` runs `RunUAT.bat` via `cmd /c`.

### Unity (`GameDev/Unity/server.py`)
- Install Unity Hub and an editor version (e.g. `6000.0.32f1`); set `unity_exe` to the editor executable.
- `run_method` executes static editor methods with `-executeMethod` in `-batchmode -quit` (the method must be `[MenuItem]`-style or reachable as a public static method).
- `open_editor` launches with `-projectPath` and `-batchmode` by default; pass `"batchmode": false` for the interactive editor.

### Godot (`GameDev/Godot/server.py`)
- Install the Godot editor executable (e.g. `Godot_v4.3-stable_win64.exe`); set `godot_exe`.
- `export_release` requires an `export_presets.cfg` in the project with a preset matching the given name.
- `run_headless` runs `res://` scripts with `--headless -s`.

### Android Studio (`AndroidStudio/server.py`)
- Install Android Studio and the SDK. Defaults assume `%LOCALAPPDATA%/Android/Sdk` with `platform-tools`, `emulator`, and `cmdline-tools/latest` packages.
- `gradle_task` runs the Gradle wrapper (`gradlew.bat`) in `gradle_wrapper_dir`; point it at a project that includes the wrapper.
- AVD listing uses `emulator -list-avds` and falls back to `avdmanager list avd`.

## 4. Validate

```bash
python scripts/validate_package.py
```

Expected output ends with:

```
Validated 9 MCP servers
```

and exits with code 0. The validator boots every `server.py`, performs the `initialize` + `tools/list` handshake over stdio, verifies the exact tool list, and calls each server's `diagnostics` tool.

## 5. Register with an MCP client

Generate the OpenCode config:

```bash
python scripts/make_opencode_config.py --python C:/path/to/python.exe
```

Then launch a server manually for debugging:

```powershell
$env:MCP_CONFIG = Get-Content -Raw .\Photoshop\config.json
python .\Photoshop\server.py
```

```bash
export MCP_CONFIG="$(cat Photoshop/config.json)"
python Photoshop/server.py
```

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MCP_CONFIG` invalid JSON warning on startup | Set `MCP_CONFIG` to the exact contents of a `config.json` |
| Tool returns `..._not_found` | Adjust the corresponding path in `config.json` / `MCP_CONFIG` |
| `run_script` returns `bridge_not_configured` | Start a UXP bridge on `uxp_bridge_url` |
| OperaGX tools return `cdp_unreachable` | Start Opera GX with `--remote-debugging-port=9222` |
| CorelDRAW tools return `com_unavailable` | `pip install pywin32` in the Python running the server |
| `gradle_wrapper_not_found` | Point `gradle_wrapper_dir` at a project that ships the Gradle wrapper |
