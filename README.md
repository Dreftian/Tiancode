<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/icons/tian-white.png">
    <source media="(prefers-color-scheme: light)" srcset="frontend/icons/tian-black.png">
    <img alt="Tiancode" src="frontend/icons/tian-white.png" width="140" height="140">
  </picture>
</p>

<h1 align="center">Tiancode</h1>

<p align="center">
  <strong>Inteligencia agéntica local-first para Windows.</strong><br>
  Un escritorio para Windows y un CLI para Windows, macOS y Linux donde el agente programa contigo: modelos locales GGUF o el proveedor que elijas, catorce especialistas, vista previa en vivo, voz, MCP y una mascota que te cuenta qué está haciendo.
</p>

<p align="center">
  <a href="https://github.com/Dreftian/Tiancode/releases/latest"><img alt="Versión" src="https://img.shields.io/github/v/release/Dreftian/Tiancode?style=for-the-badge&label=Versi%C3%B3n&color=0ea5e9"></a>
  <a href="https://github.com/Dreftian/Tiancode/releases"><img alt="Descargas" src="https://img.shields.io/github/downloads/Dreftian/Tiancode/total?style=for-the-badge&label=Descargas&color=8b5cf6"></a>
  <a href="LICENSE"><img alt="Licencia MIT" src="https://img.shields.io/badge/Licencia-MIT-10b981?style=for-the-badge"></a>
  <a href="https://github.com/Dreftian/Tiancode/stargazers"><img alt="Estrellas" src="https://img.shields.io/github/stars/Dreftian/Tiancode?style=for-the-badge&color=f59e0b"></a>
</p>

<p align="center">
  <img alt="Windows 10 y 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011%20x64-0078d4?style=flat-square&logo=windows&logoColor=white">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-CLI-000000?style=flat-square&logo=apple&logoColor=white">
  <img alt="Linux" src="https://img.shields.io/badge/Linux-CLI-fcc624?style=flat-square&logo=linux&logoColor=black">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-42-47848f?style=flat-square&logo=electron&logoColor=white">
  <img alt="SolidJS" src="https://img.shields.io/badge/SolidJS-UI-2c4f7c?style=flat-square&logo=solid&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-runtime-f9f1e1?style=flat-square&logo=bun&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-historial%20local-003b57?style=flat-square&logo=sqlite&logoColor=white">
  <img alt="llama.cpp" src="https://img.shields.io/badge/llama.cpp-motor%20GGUF-000000?style=flat-square">
  <a href="https://github.com/Dreftian/Tiancode/commits/dev"><img alt="Último commit" src="https://img.shields.io/github/last-commit/Dreftian/Tiancode/dev?style=flat-square&label=%C3%BAltimo%20commit"></a>
</p>

<p align="center">
  <a href="https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe"><img alt="Descargar instalador" src="https://img.shields.io/badge/Descargar-Tiancode.exe-0ea5e9?style=for-the-badge&logo=windows&logoColor=white"></a>
  &nbsp;
  <a href="https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe"><img alt="Descargar portable" src="https://img.shields.io/badge/Descargar-Tiancode--portable.exe-8b5cf6?style=for-the-badge&logo=windows&logoColor=white"></a>
  &nbsp;
  <a href="https://tiancode.vercel.app/"><img alt="Sitio web" src="https://img.shields.io/badge/Sitio-tiancode.vercel.app-09090b?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="Tiancode 1.0.0: chat al estilo Claude Code" src="frontend/website/img/app/chat.webp" width="880">
</p>

---

## Qué es Tiancode

Tiancode es un fork de escritorio de OpenCode pensado para Windows. Tu máquina es el motor: los modelos GGUF se ejecutan con el motor nativo (llama.cpp) o con Ollama y LM Studio, y cualquier proveedor en la nube se conecta con su clave. Las sesiones, la memoria del agente y las skills aprendidas viven en tu equipo, en SQLite.

| | |
|---|---|
| **Chat al estilo Claude Code** | Enviar dentro del cuadro, modos de permiso (Auto, Manual, Aceptar ediciones, Plan, Omitir permisos) que cambian en plena tarea y un control deslizante de esfuerzo con color por nivel. |
| **Catorce especialistas** | Sub-agentes de nube, datos, fullstack, investigación, seguridad de IA, marketing y más, con jerarquía de delegación y herramientas acotadas. |
| **Modelos locales** | Explorador de Hugging Face con logotipos originales, cuantizaciones comparadas contra tu VRAM y los mismos parámetros de carga que LM Studio. |
| **Vista previa en vivo** | Detecta Vite, Next, Astro, Remix, SvelteKit, SolidStart, Qwik, Expo, Eleventy, Parcel, webpack y más; se abre sola cuando el agente arranca una app web. |
| **Voz** | Dictado con Whisper ONNX y lectura con Kokoro o Piper en español, sin conexión. |
| **MCP y plugins** | Servidores MCP, plugins npm o locales y un catálogo para descubrir más, con los logotipos oficiales de cada servicio. |
| **Conexiones** | Recibe los resultados en Telegram, Discord, Slack o un webhook y dirige Tiancode desde un chat. |
| **Mascotas** | Un compañero ilustrado que refleja el estado de la sesión, dentro de la app, flotando en el escritorio de Windows o en ambos. |

## Capturas

| Inicio | Ajustes |
|---|---|
| ![Inicio](frontend/website/img/app/home.webp) | ![Ajustes](frontend/website/img/app/settings-general.webp) |
| **Modelos locales** | **Parámetros de carga** |
| ![Modelos locales](frontend/website/img/app/models-hub.webp) | ![Parámetros de carga](frontend/website/img/app/models-hub-settings.webp) |
| **Sub-agentes** | **MCP y plugins** |
| ![Sub-agentes](frontend/website/img/app/sub-agents.webp) | ![MCP y plugins](frontend/website/img/app/mcp-plugins.webp) |
| **Conexiones** | **Skills** |
| ![Conexiones](frontend/website/img/app/connections.webp) | ![Skills](frontend/website/img/app/skills.webp) |

## Plataformas

| | Windows 10 / 11 | macOS (Apple Silicon e Intel) | Linux (x64 y arm64) |
|---|:---:|:---:|:---:|
| **App de escritorio** (Electron: bandeja, mascota, vista previa, actualizador) | ✅ instalador y portable | 🔜 en preparación | 🔜 en preparación |
| **Tiancode CLI** (interfaz de terminal, servidor headless y web) | ✅ | ✅ | ✅ |

`tiancode web` abre en el navegador la misma interfaz de la app de escritorio, en cualquier sistema.

## Instalar la app de escritorio (Windows)

1. Descarga [`Tiancode.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe) (instalador) o [`Tiancode-portable.exe`](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe) (sin instalación).
2. Ábrelo: el asistente de bienvenida pide idioma, tema, mascota y voz.
3. Conecta un proveedor en **Ajustes › Proveedores** o descarga un modelo en **Modelos locales**, y empieza a chatear.

Requisitos: Windows 10 u 11 de 64 bits. Para modelos locales, una GPU con Vulkan o CPU; el motor nativo se descarga la primera vez.

Cada release incluye `Tiancode.exe`, `Tiancode-portable.exe`, `Tiancode.exe.blockmap` y `latest.yml` con sus SHA-512. El actualizador integrado usa `latest.yml` y conserva claves, sesiones y configuración.

## Instalar el CLI (Windows, macOS y Linux)

Un solo binario, sin Node ni Bun. Los archivos `tiancode-<sistema>-<arquitectura>` de cada release traen su `SHA256SUMS.txt`.

```bash
# macOS y Linux
curl -fsSL https://tiancode.vercel.app/install | bash
```

```powershell
# Windows (PowerShell)
irm https://tiancode.vercel.app/install.ps1 | iex
```

| Gestor | Comando | Estado |
|---|---|---|
| npm | `npm install -g tiancode-ai` | disponible en cuanto se publica cada versión |
| bun | `bun install -g tiancode-ai` | disponible en cuanto se publica cada versión |
| Homebrew | `brew install Dreftian/tap/tiancode` | macOS y Linux |
| Arch Linux (AUR) | `paru -S tiancode-bin` | en preparación; usa el comando `curl` mientras tanto |

Después de instalar:

```bash
tiancode              # interfaz de terminal (TUI) en la carpeta actual
tiancode web          # servidor + interfaz web en el navegador
tiancode run "..."    # una petición directa desde la terminal
tiancode serve        # servidor headless para otros clientes
tiancode --help       # todos los comandos: providers, models, mcp, agent, session, github, upgrade…
```

## Desarrollo

```bash
git clone https://github.com/Dreftian/Tiancode.git
cd Tiancode
bun install

# App de escritorio (Electron + SolidJS)
cd frontend/desktop && bun run dev

# Servidor (Bun + Effect)
cd backend/tiancode && bun dev
```

Comprobaciones: `bun typecheck` en la raíz; pruebas por paquete (`bun run test:unit` en `frontend/app`, `bun test src/main` en `frontend/desktop`, `bun test test/<carpeta>` en `backend/tiancode`). Empaquetado: `TIANCODE_CHANNEL=prod bun run --cwd frontend/desktop package:win`.

## Arquitectura

```
frontend/
  app/          Interfaz SolidJS: chat, ajustes, vista previa, modelos locales
  desktop/      Electron: ventana, bandeja, mascota de escritorio, voz, actualizador
  session-ui/   Componentes de sesión y visor de documentos
  ui/           Sistema de diseño, temas y mascotas ilustradas
  website/      Sitio web (portada astral y universo de paneles)
backend/
  tiancode/     Servidor: agentes, herramientas, MCP, model hub, motor local, preview
  core/         Datos: SQLite, sesiones, configuración
  sdk/          SDK TypeScript
skills/         Skills integradas
tools/          Scripts de release y notas de versión
```

## Créditos

Basado en [OpenCode](https://github.com/sst/opencode). Mascotas ilustradas de [page-mascot](https://github.com/nilbuild/page-mascot) (MIT © Kamran Ahmed). Motor local: [llama.cpp](https://github.com/ggml-org/llama.cpp).

## Licencia

MIT. Consulta [LICENSE](LICENSE).

<p align="center">Hecho con ♥ por <a href="https://github.com/Dreftian">Dreftian</a></p>
