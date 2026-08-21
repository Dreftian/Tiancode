# Sources

Provenance of the protocols, formats and API conventions used by this suite, and the assumptions made where the original documentation was incomplete.

## Model Context Protocol (shared runtime)

- MCP specification: modelcontextprotocol.io / the `modelcontextprotocol/specification` repository — stdio transport (one JSON-RPC 2.0 message per line), `initialize` handshake (echo `protocolVersion`, `capabilities.tools.listChanged`, `serverInfo`), `notifications/initialized`, `tools/list` (name/description/inputSchema), `tools/call` (`content` array with `text` items, `isError` flag for recoverable failures).
- JSON-RPC 2.0 specification (jsonrpc.org): request/response/notification shapes, error codes `-32700`, `-32600`, `-32601`, `-32602`, `-32603`.

## Per-server APIs

| Server | Source of the automation interface |
| --- | --- |
| Photoshop / InDesign | Adobe scripting documentation (ExtendScript/JSX; `.jsx`, `.jsxbin`, `.idjs`), Adobe UXP bridge conventions. Assumption: the UXP bridge accepts `POST {uxp_bridge_url}/run` with a JSON body and executes scripts inside the app — the community `uxp-bridge` projects use this convention; adjust `uxp_bridge_url` in config if your bridge differs. |
| Illustrator | Adobe ExtendScript docs (`.jsx`); Illustrator accepts a script file as a startup argument — no documented remote-run CLI, so `run_script` is a best-effort launch. |
| CorelDRAW | CorelDRAW COM automation: ProgID `CorelDRAW.Application` (registered by CorelDRAW VBA support), `Application.ExecuteMacro(macroName)` and `Application.OpenDocument(fileName)` from CorelDRAW's VBA object model; requires `pywin32` on Windows. |
| OperaGX | Chrome DevTools Protocol (chromedevtools.github.io/devtools-protocol): HTTP endpoints `/json`, `/json/version`, `/json/activate/{targetId}`, `/json/new?url`; `Page.navigate` and `Runtime.evaluate` over the per-target `webSocketDebuggerUrl`. WebSocket framing follows RFC 6455 (masked client frames, ping/pong, close, 16/64-bit lengths) — implemented from the RFC because Python 3.10 has no stdlib websocket client. |
| Unreal Engine | Epic's Build Automation docs: `UnrealEditor.exe <project>`, `UnrealEditor-Cmd.exe <project> -run=<Commandlet>`, `RunUAT.bat BuildCookRun ...` (UAT = Unreal Automation Tool). |
| Unity | Unity Command Line Arguments docs: `-projectPath`, `-executeMethod <MethodName>`, `-batchmode`, `-quit`; project detection via `Assets` + `ProjectSettings` layout. |
| Godot | Godot command line tutorial: `-e` (editor), `--headless`, `--path <dir>`, `-s <script>`, `--export-release <preset>`; project detection via `project.godot`. |
| AndroidStudio | Android tooling docs: `adb devices`, `emulator -list-avds` / `emulator -avd <name>`, `avdmanager list avd`, Gradle wrapper (`gradlew[.bat]`), Android Studio launcher `studio64.exe`. |

## Conventions applied across the suite

- Config always comes from the `MCP_CONFIG` env var (JSON), falling back to `config.json`; `%VAR%` tokens expand against the environment at load time.
- All subprocess calls use argument arrays (`subprocess` with `shell=False` semantics); batch files are run through `cmd.exe /c` because CreateProcess cannot execute `.bat`/`.cmd` directly.
- File/config failures surface as typed errors (`file_not_found`, `config_error`, `com_unavailable`, `cdp_unreachable`, ...) carried as MCP `isError` content — servers never crash and always start on stdio even when the target application is absent.
- Default paths target Windows installations (Adobe 2024 generation, UE 5.4, Unity 6, Godot 4.3, Android Studio with `%LOCALAPPDATA%` SDK).
