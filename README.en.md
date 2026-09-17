<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/icons/tian-white.png">
    <source media="(prefers-color-scheme: light)" srcset="frontend/icons/tian-black.png">
    <img alt="Tiancode" src="frontend/icons/tian-white.png" width="132" height="132">
  </picture>
</p>

<h1 align="center">Tiancode</h1>

<p align="center">
  <strong>Local-first agentic intelligence for coding.</strong><br>
  A desktop app for Windows and a CLI for Windows, macOS and Linux. Your machine is the engine: local GGUF models or the provider you choose, fourteen specialists, live preview, voice, MCP and a pet that tells you what the agent is doing.
</p>

<p align="center">
  <a href="README.md">Español</a> · <a href="README.en.md">English</a> · <a href="https://tiancode.vercel.app/">Website</a> · <a href="https://github.com/Dreftian/Tiancode/releases/latest">Latest release</a> · <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <a href="https://github.com/Dreftian/Tiancode/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Dreftian/Tiancode?style=for-the-badge&label=Release&color=0ea5e9"></a>
  <a href="https://www.npmjs.com/package/tiancode-ai"><img alt="npm" src="https://img.shields.io/npm/v/tiancode-ai?style=for-the-badge&label=npm&logo=npm&logoColor=white&color=cb3837"></a>
  <a href="https://github.com/Dreftian/Tiancode/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/Dreftian/Tiancode/total?style=for-the-badge&label=Downloads&color=8b5cf6"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge"></a>
  <a href="https://github.com/Dreftian/Tiancode/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Dreftian/Tiancode?style=for-the-badge&color=f59e0b"></a>
</p>

<p align="center">
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-app%20%2B%20CLI-0078d4?style=flat-square&logo=windows&logoColor=white">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-CLI-000000?style=flat-square&logo=apple&logoColor=white">
  <img alt="Linux" src="https://img.shields.io/badge/Linux-CLI-fcc624?style=flat-square&logo=linux&logoColor=black">
  <img alt="Homebrew" src="https://img.shields.io/badge/Homebrew-Dreftian%2Ftap-fbb040?style=flat-square&logo=homebrew&logoColor=black">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-42-47848f?style=flat-square&logo=electron&logoColor=white">
  <img alt="SolidJS" src="https://img.shields.io/badge/SolidJS-UI-2c4f7c?style=flat-square&logo=solid&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-runtime-f9f1e1?style=flat-square&logo=bun&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local%20history-003b57?style=flat-square&logo=sqlite&logoColor=white">
  <img alt="llama.cpp" src="https://img.shields.io/badge/llama.cpp-GGUF%20engine-000000?style=flat-square">
  <a href="https://github.com/Dreftian/Tiancode/commits/dev"><img alt="Last commit" src="https://img.shields.io/github/last-commit/Dreftian/Tiancode/dev?style=flat-square&label=last%20commit"></a>
</p>

<p align="center">
  <a href="https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Tiancode.exe-0ea5e9?style=for-the-badge&logo=windows&logoColor=white"></a>
  &nbsp;
  <a href="https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe"><img alt="Download portable" src="https://img.shields.io/badge/Portable-Tiancode--portable.exe-8b5cf6?style=for-the-badge&logo=windows&logoColor=white"></a>
  &nbsp;
  <a href="#install-the-cli-windows-macos-and-linux"><img alt="Install the CLI" src="https://img.shields.io/badge/CLI-curl%20%C2%B7%20npm%20%C2%B7%20bun%20%C2%B7%20brew-09090b?style=for-the-badge&logo=gnubash&logoColor=white"></a>
</p>

<p align="center">
  <img alt="Tiancode 1.0.0: Claude Code style chat" src="frontend/website/img/app/chat.webp" width="880">
</p>

---

## Table of contents

- [What is Tiancode](#what-is-tiancode)
- [Features](#features)
- [Screenshots](#screenshots)
- [Platforms](#platforms)
- [Quick start](#quick-start)
- [Install the desktop app (Windows)](#install-the-desktop-app-windows)
- [Install the CLI (Windows, macOS and Linux)](#install-the-cli-windows-macos-and-linux)
- [Using the CLI](#using-the-cli)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security and privacy](#security-and-privacy)
- [FAQ](#faq)
- [Credits and license](#credits-and-license)

## What is Tiancode

Tiancode is a desktop fork of [OpenCode](https://github.com/sst/opencode) built by ZenithAI. The Windows app wraps the server and the interface in a native window with a system tray, a desktop pet, live preview and an updater; the CLI brings the same engine to the terminal on Windows, macOS and Linux.

Everything lives on your machine: sessions, the agent's memory and learned skills are stored in SQLite; GGUF models run through the native engine (llama.cpp), Ollama or LM Studio; and any cloud provider connects with its own key, which never leaves your computer except towards that provider.

## Features

| | |
|---|---|
| **Claude Code style chat** | Send from inside the box, permission modes (Auto, Manual, Accept edits, Plan, Skip permissions) that switch mid-task and an effort slider with a colour per level. |
| **Fourteen specialists** | Cloud, data, fullstack, research, AI security, marketing sub-agents and more, with a delegation hierarchy, scoped tools and their instructions visible in Settings. |
| **Local models** | Hugging Face explorer with real sizes per quantisation, an “On disk” tab with the GGUF files you actually have and **automatic load configuration** per model (context, GPU layers, threads, batch and KV cache computed from your VRAM and RAM), plus the same manual parameters as LM Studio. |
| **Live preview** | Detects Vite, Next, Astro, Remix, SvelteKit, SolidStart, Qwik, Expo, Eleventy, Parcel, webpack and more; opens on its own only when the agent starts a web app. |
| **Voice** | Dictation with Whisper ONNX and spoken replies with Kokoro or Piper, offline. |
| **MCP and plugins** | Local (stdio) or remote (HTTP/SSE) MCP servers, npm or local plugins and a catalogue to discover more, with real detail on transport, variables and tools. |
| **Connections** | Receive results in Telegram, Discord, Slack or a webhook and drive Tiancode from a chat. |
| **Pets** | An illustrated companion that mirrors the session state, inside the app, floating on the Windows desktop or both. |
| **CLI** | Terminal UI, headless server, web interface, sessions, export and import, token statistics and management of providers, agents, MCP and plugins. |

## Screenshots

| Home | Settings |
|---|---|
| ![Home](frontend/website/img/app/home.webp) | ![Settings](frontend/website/img/app/settings-general.webp) |
| **Local models** | **Load parameters** |
| ![Local models](frontend/website/img/app/models-hub.webp) | ![Load parameters](frontend/website/img/app/models-hub-settings.webp) |
| **Sub-agents** | **MCP and plugins** |
| ![Sub-agents](frontend/website/img/app/sub-agents.webp) | ![MCP and plugins](frontend/website/img/app/mcp-plugins.webp) |
| **Connections** | **Skills** |
| ![Connections](frontend/website/img/app/connections.webp) | ![Skills](frontend/website/img/app/skills.webp) |

## Platforms

| | Windows 10 / 11 (x64) | macOS (Apple Silicon and Intel) | Linux (x64 and arm64) |
|---|:---:|:---:|:---:|
| **Desktop app** (Electron: tray, pet, preview, updater) | ✅ installer and portable | 🔜 in preparation | 🔜 in preparation |
| **Tiancode CLI** (terminal UI, headless server and web) | ✅ | ✅ | ✅ |

`tiancode web` opens the very same interface as the desktop app in your browser, on any system.

## Quick start

**Desktop (Windows)**

```text
1. Download Tiancode.exe and open it.
2. The welcome wizard asks for language, theme, pet and voice.
3. Connect a provider in Settings › Providers or download a model in Local models.
4. Pick a folder (or chat without a project) and type your first request.
```

**Terminal (Windows, macOS and Linux)**

```bash
curl -fsSL https://tiancode.vercel.app/install | bash   # macOS and Linux
tiancode providers login                                  # store a provider key
tiancode                                                  # terminal UI in the current folder
```

## Install the desktop app (Windows)

1. Download [`Tiancode.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe) (installer) or [`Tiancode-portable.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe) (no install, ideal for USB drives).
2. Open it: the welcome wizard configures language, theme, pet and voice in a single card.
3. Connect a provider in **Settings › Providers** or download a model in **Local models**, and start chatting.

Requirements: 64-bit Windows 10 or 11. For local models, a Vulkan-capable GPU or the CPU; the native engine downloads on first use.

Every release ships `Tiancode.exe`, `Tiancode-portable.exe`, `Tiancode.exe.blockmap` and `latest.yml` with SHA-512 hashes. The built-in updater reads `latest.yml` and keeps keys, sessions and settings.

## Install the CLI (Windows, macOS and Linux)

A single binary, no Node or Bun required. The `tiancode-<os>-<arch>` archives on every release come with `SHA256SUMS.txt`.

```bash
# macOS and Linux
curl -fsSL https://tiancode.vercel.app/install | bash
```

```powershell
# Windows (PowerShell)
irm https://tiancode.vercel.app/install.ps1 | iex
```

| Manager | Command | Status |
|---|---|---|
| npm | `npm install -g tiancode-ai` | ✅ |
| bun | `bun install -g tiancode-ai` | ✅ |
| Homebrew | `brew install Dreftian/tap/tiancode` | ✅ macOS and Linux |
| Arch Linux (AUR) | `paru -S tiancode-bin` | 🔜 in preparation; use `curl` meanwhile |

Optional installer variables: `TIANCODE_VERSION` pins a version and `TIANCODE_INSTALL_DIR` changes the folder (defaults: `~/.tiancode/bin` or `%LOCALAPPDATA%\Programs\tiancode\bin`).

## Using the CLI

```bash
tiancode [folder]           # terminal UI (TUI) in the given folder or the current one
tiancode run "..."          # a one-shot request; --continue resumes the last session
tiancode web                # server + web interface in the browser
tiancode serve              # headless server for the app, the web or other clients
tiancode attach <url>       # attach the TUI to a running server
tiancode providers          # providers and credentials (alias: auth)
tiancode models [provider]  # available models
tiancode agent              # sub-agents
tiancode mcp                # MCP servers
tiancode plugin <package>   # install a plugin and update the config
tiancode session            # sessions; export / import move them between machines
tiancode stats              # token usage and cost
tiancode github             # GitHub agent;  tiancode pr <n> checks out a PR and starts the TUI
tiancode upgrade            # upgrade to the latest or a specific version
tiancode --help             # every option (--model, --agent, --port, --pure, --auto…)
```

Useful flags: `-m provider/model` picks the model, `--agent` the specialist, `--port` and `--hostname` expose the server, `--pure` starts without external plugins and `--auto` approves permissions that are not explicitly denied (use with care).

## Configuration

- **Global:** `~/.config/tiancode/tiancode.json` (or `.jsonc`) stores providers, default model, theme, agents, MCP and plugins.
- **Per project:** a `tiancode.json` or `tiancode.jsonc` at the repository root (or inside `.tiancode/`) is merged over the global config.
- **Server:** when `tiancode serve` or `tiancode web` is exposed beyond your machine, set `TIANCODE_SERVER_PASSWORD` to require HTTP basic auth.
- **Desktop app:** data lives in `%APPDATA%\ai.tiancode.desktop.release` (installer) or next to the executable (portable); backups are managed from **Settings › General**.

## Architecture

```text
frontend/
  app/          SolidJS interface: chat, settings, preview, local models
  desktop/      Electron: window, tray, desktop pet, voice, updater
  session-ui/   Session components and document viewer
  ui/           Design system, themes and illustrated pets
  website/      Website (astral cover, universe of panels and installers)
backend/
  tiancode/     Server and CLI: agents, tools, MCP, model hub, local engine, preview
  core/         Data: SQLite, sessions, configuration
  sdk/          TypeScript SDK
skills/         Built-in skills
tools/          Release scripts (app, CLI, npm, Homebrew, web) and release notes
```

The desktop app and the CLI share the same server (Bun + Effect). The web interface is embedded in the binary, so `tiancode web` needs nothing else installed.

## Development

```bash
git clone https://github.com/Dreftian/Tiancode.git
cd Tiancode
bun install

# Desktop app (Electron + SolidJS)
cd frontend/desktop && bun run dev

# Server and CLI (Bun + Effect)
cd backend/tiancode && bun dev
```

Checks: `bun typecheck` at the root; tests per package (`bun run test:unit` in `frontend/app`, `bun test src/main` in `frontend/desktop`, `bun run test` in `frontend/session-ui`, `bun test test/<folder>` in `backend/tiancode`).

Packaging: `TIANCODE_CHANNEL=prod bun run --cwd frontend/desktop package:win` builds the app; `bun tools/script/build-cli.ts --version X.Y.Z` compiles the CLI for the five platforms and packs the release archives.

## Roadmap

- [x] Windows desktop app (installer and portable)
- [x] CLI for Windows, macOS and Linux with `curl`/PowerShell, npm, bun and Homebrew installers
- [ ] macOS and Linux desktop apps
- [ ] AUR package (`tiancode-bin`)
- [ ] Code signing for the Windows and macOS executables

## Contributing

Contributions are welcome: bugs, performance, new providers, documentation and translations. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR and use the [issue templates](https://github.com/Dreftian/Tiancode/issues/new/choose).

## Security and privacy

Tiancode does not sandbox the agent: the permission system warns you before running commands or writing files, but it is not an isolation boundary. The local server listens on `127.0.0.1`, refuses requests with a foreign `Host` header (DNS rebinding protection), adds security headers and temporarily locks an address after ten failed passwords; the desktop app protects its server with a random per-session password. If you need real isolation, run it inside a container or a virtual machine. See [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

## FAQ

**Do I need an API key?** No. You can download a GGUF model in **Local models** and work offline. Cloud providers are optional.

**Does it run on macOS or Linux?** The CLI does, with `tiancode web` for the same interface in the browser. The native desktop app is in preparation.

**Does updating wipe my data?** No. The updater keeps keys, sessions, settings and backups.

**Where are my sessions?** In a SQLite database inside the app profile; move them with `tiancode session export` and `import`.

## Credits and license

Based on [OpenCode](https://github.com/sst/opencode). Illustrated pets from [page-mascot](https://github.com/nilbuild/page-mascot) (MIT © Kamran Ahmed). Local engine: [llama.cpp](https://github.com/ggml-org/llama.cpp).

MIT. See [LICENSE](LICENSE).

<p align="center">
  <a href="https://star-history.com/#Dreftian/Tiancode&Date"><img alt="Star history" src="https://api.star-history.com/svg?repos=Dreftian/Tiancode&type=Date" width="600"></a>
</p>

<p align="center">Made with ♥ by <a href="https://github.com/Dreftian">Dreftian</a> · ZenithAI</p>
