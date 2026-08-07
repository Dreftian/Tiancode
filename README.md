# Tiancode

> **Agente de IA local-first para Windows** — chat, código, agentes, voces y modelos locales en una sola app.

Tiancode es un asistente de IA de escritorio (Electron + SolidJS + Bun/Effect) que combina un chat de agente completo con gestión de modelos locales, servidores MCP, sub-agentes, integración GitHub y síntesis de voz — todo local-first, con tema claro/oscuro y soporte en español e inglés.

![Tiancode](frontend/icons/tian-black.png)

## ✨ Características

| Área | Qué incluye |
|---|---|
| 🤖 **Agente** | Chat con sesiones, herramientas (bash, edición, web, tareas), agentes primary/subagente, permisos finos, inyección de AGENTS.md |
| 🔌 **MCP Servers** | Añade servidores MCP locales/remotos, **catálogo Discover** con 15 presets populares (playwright, context7, chrome-devtools, canva, aws…), estados de conexión en vivo con conteo de tools |
| 🧩 **Plugins** | Catálogo de apps npm (biome, octokit, slack…) + plugins locales funcionales (env-guard, commit-helper, permission-guard…) |
| 🤝 **GitHub** | Conecta tu cuenta con un token, busca/clona/crea repos, **commit/push/pull sin abrir el navegador** |
| 🎤 **Voces TTS** | Motor Kokoro + **4 voces femeninas en español** (Piper), descarga/activación por voz, dictado por micrófono, lectura de respuestas en voz alta |
| 🤖 **Model Hub** | Descarga modelos GGUF desde HuggingFace con **resume + verificación sha256**, badges de compatibilidad con tu GPU, detección de runtimes (Ollama / LM Studio) |
| 🧠 **Skills** | **52+ skills** integrados (frontend-design, grill-me, writing-plans, superpowers, web-quality…) con enable/disable |
| ⚙️ **Settings v2** | Pestañas: General, Shortcuts, Servers, Providers, Models, Models Hub, GitHub, Voces, Plugins, Skills, Sub-Agents, MCP |
| 🖥️ **Desktop** | Bandeja del sistema, onboarding con disclaimer + tema + idioma, actualizador, instalador NSIS + **portable** |
| 🌐 **Website** | Landing en español con docs, guía, FAQ, legal (privacidad, términos, licencia) |

## 📦 Descargas

| Binario | Uso |
|---|---|
| [`Tiancode-setup-win-x64.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-setup-win-x64.exe) | Instalador (NSIS) |
| [`Tiancode-portable-win-x64.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable-win-x64.exe) | Portable (no instala) |
| [`Tiancode-win-x64.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-win-x64.exe) | Ejecutable directo |

## 🚀 Uso rápido

```bash
# Instalador
Tiancode-setup-win-x64.exe

# Portable (sin instalación)
Tiancode-portable-win-x64.exe
```

En el primer arranque: acepta el disclaimer, elige tema (claro/oscuro) e idioma (es/en), y listo.

## 🛠️ Desarrollo

```bash
# Monorepo con Bun + Turbo
bun install

# App de escritorio (dev)
cd frontend/desktop && bun run dev

# Backend
cd backend/tiancode && bun dev

# Website estática
cd Website && bunx serve .
```

### Estructura

```
frontend/
  app/          # App web (SolidJS, settings v2, chat)
  desktop/      # Shell Electron (main process, TTS, tray, onboarding)
  ui/           # Design system (tokens, componentes v2)
  web/          # Docs (Astro/Starlight)
backend/
  tiancode/     # Servidor (Bun/Effect, MCP, agentes, model hub, github)
  core/         # Core (git, sesiones, config)
  sdk/          # SDK generado
Website/        # Landing estática en español
skills/         # 52+ skills integrados
```

## 📄 Licencia

MIT — ver [LICENSE](LICENSE).

---

Hecho con ♥ — [Website](https://github.com/Dreftian/Tiancode) · [Releases](https://github.com/Dreftian/Tiancode/releases)
