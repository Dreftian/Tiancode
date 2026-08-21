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
| [`Tiancode.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe) | Instalador (NSIS) |
| [`Tiancode-portable.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe) | Portable (no instala) |

## 🚀 Uso rápido

```bash
# Instalador
Tiancode.exe

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
cd tools/website && bunx serve .
```

### Vista previa integrada

La tool `preview_start` publica la web dentro de **Vista en vivo**; no abre
el navegador del sistema. Detecta scripts comunes, `index.html` y JSX/TSX
sin configurar. Las webs estaticas y el fallback JSX incorporan recarga local
automatica al cambiar los archivos.

Para cualquier runtime que exponga una web local (Python, Go, .NET, PHP,
Ruby, etc.), anade un `tiancode.preview.json` en la raiz del proyecto. El
comando es un array, no una cadena de shell, y la URL debe ser local:

```json
{
  "framework": "python",
  "command": ["py", "-3", "-m", "http.server", "8000"],
  "url": "http://127.0.0.1:8000",
  "workingDirectory": "."
}
```

El adaptador solo sirve para runtimes HTTP. Una aplicacion nativa se muestra
mediante su captura o flujo de escritorio, no se hace pasar por una web.

### Estructura

```
skills/         # 52+ skills integrados (frontend-design, writing-plans, superpowers…)
install/        # Instalador y portable (Tiancode.exe / Tiancode-portable.exe)
frontend/       # App de escritorio y web
  app/          # App web (SolidJS, settings v2, chat, capturas, respaldos)
  desktop/      # Shell Electron (main process, TTS, tray, actualizador)
  ui/           # Design system (tokens, componentes v2)
  session-ui/   # Componentes de sesión v2 (composer, timeline)
  web/          # Docs (Astro/Starlight)
backend/        # Servidor y librerías (Bun/Effect)
  tiancode/     # Servidor (MCP, agentes, model hub, github, skills)
  core/         # Core (git, sesiones, config)
  sdk/          # SDK generado
tools/          # Soporte: website, GitHub workflows, docs de diseño
  website/      # Landing estática en español (deploy en Vercel)
  github/       # Workflows/plantillas de GitHub (inactivos mientras no se publiquen)
  docs/         # Especificaciones de diseño
```

### Convenciones del monorepo

- `frontend/` y `backend/` son autocontenidos; `tools/` es soporte (no se importa desde la app).
- Dependencias dirigidas: Schema → Core → Protocol → Server; el cliente nunca depende de Core/Server.
- La app es **local-first**: el repo local no se empuja a GitHub (el repo remoto Dreftian/Tiancode contiene solo la website).
- Los binarios de `install/` se publican en [GitHub Releases](https://github.com/Dreftian/Tiancode/releases) con los nombres `Tiancode.exe` / `Tiancode-portable.exe`.

## 📄 Licencia

MIT — ver [LICENSE](LICENSE).

---

Hecho con ♥ — [Website](https://github.com/Dreftian/Tiancode) · [Releases](https://github.com/Dreftian/Tiancode/releases)
