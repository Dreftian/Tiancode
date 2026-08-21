---
name: android-studio
description: Android Studio MCP server - adb devices, AVDs, project launch and Gradle tasks.
---

# Android Studio MCP Server

Automates Android development from an MCP client over stdio: adb device listing, AVD management, Android Studio launches and Gradle wrapper tasks.

## Configuration (`MCP_CONFIG` env or `config.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `android_sdk_root` | `%LOCALAPPDATA%/Android/Sdk` | SDK root; `platform-tools/adb`, `emulator/emulator`, `cmdline-tools/latest/bin/avdmanager` are resolved under it (`%LOCALAPPDATA%`/`%USERPROFILE%` expanded at load) |
| `gradle_wrapper_dir` | `%USERPROFILE%/Documents/Android Studio Projects` | Directory containing `gradlew[.bat]`; also the default project for `open_project` |
| `studio_exe` | `C:/Program Files/Android/Android Studio/bin/studio64.exe` | Android Studio launcher |
| `adb_path` | `` | Optional explicit path to `adb` (overrides SDK resolution) |

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `list_devices` | - | Runs `adb devices`; returns `[{serial, state}]` |
| `emulator_list` | - | Runs `emulator -list-avds`, falls back to `avdmanager list avd` |
| `launch_emulator` | `avd` | Spawns `emulator -avd <avd>` detached |
| `open_project` | `project` (optional) | Spawns `studio_exe` with the project (default `gradle_wrapper_dir`) |
| `gradle_task` | `task`, `args` (array, optional), `timeout` | Runs `gradlew[.bat] <task> [args...]` in `gradle_wrapper_dir` |
| `diagnostics` | - | Config summary, adb/emulator/avdmanager/Studio/wrapper availability, hints |

## Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gradle_task","arguments":{"task":"assembleDebug","args":["--stacktrace"]}}}
```

## Notes

- All subprocess launches use argument arrays; never shell strings. `gradlew.bat`/`avdmanager.bat` run via `cmd.exe /c`.
- The server starts cleanly even when the SDK is missing; affected tools report typed errors.
