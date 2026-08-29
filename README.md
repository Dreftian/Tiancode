<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/icons/tian-white.png">
    <source media="(prefers-color-scheme: light)" srcset="frontend/icons/tian-black.png">
    <img alt="Tiancode Logo" src="frontend/icons/tian-white.png" width="160" height="160">
  </picture>
</p>

<h1 align="center">Tiancode</h1>

<p align="center">
  <strong>Agente de Inteligencia Artificial Local-First para Windows</strong><br>
  Chat avanzado, ejecución de código, herramientas autónomas, Model Hub GGUF y voces neuronales en una sola experiencia fluida.
</p>

<p align="center">
  <a href="https://github.com/Dreftian/Tiancode/releases"><img src="https://img.shields.io/github/v/release/Dreftian/Tiancode?style=for-the-badge&color=0ea5e9&label=RELEASE" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge" alt="License"></a>
  <a href="https://github.com/Dreftian/Tiancode"><img src="https://img.shields.io/badge/Platform-Windows%20x64-6366f1?style=for-the-badge" alt="Platform"></a>
  <a href="https://github.com/Dreftian/Tiancode"><img src="https://img.shields.io/badge/Status-Stable-success?style=for-the-badge" alt="Status"></a>
</p>

<p align="center">
  <a href="https://github.com/Dreftian/Tiancode/releases/download/v1.0.0/Tiancode.exe">
    <img src="https://img.shields.io/badge/Descargar%20Instalador-Tiancode.exe-0ea5e9?style=for-the-badge&logo=windows&logoColor=white" alt="Descargar Instalador">
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/Dreftian/Tiancode/releases/download/v1.0.0/Tiancode-portable.exe">
    <img src="https://img.shields.io/badge/Descargar%20Portable-Tiancode--portable.exe-8b5cf6?style=for-the-badge&logo=windows&logoColor=white" alt="Descargar Portable">
  </a>
</p>

---

## ✨ Características

| Área | Qué incluye |
|---|---|
| 🤖 **Agente Autónomo** | Chat interactivo con sesiones, ejecución de comandos bash, edición de archivos, navegación web, subagentes y control granular de permisos. |
| 🔌 **MCP Servers** | Catálogo Discover integrado con presets (Playwright, Chrome DevTools, Context7, Canva, AWS...) y estado de conexión en vivo. |
| 🧩 **Plugins** | Ecosistema de extensiones npm y plugins locales configurables (Biome, Octokit, Slack, Env-Guard, Commit-Helper...). |
| 🤝 **GitHub Integrado** | Conexión directa mediante token personal: busca, clona, crea repositorios, haz commits y push sin salir del editor. |
| 🎤 **Voces TTS Neuronales** | Motor Kokoro y modelos Piper en español con dictado por voz y lectura de respuestas en tiempo real. |
| 🧠 **Model Hub** | Explorador y gestor de modelos GGUF de HuggingFace con soporte de GPU local y runtimes (Ollama / LM Studio). |
| ⚡ **52+ Skills** | Habilidades especializadas integradas (diseño frontend, arquitectura, planes técnicos, optimización...). |
| 🖥️ **Desktop Nativo** | Interfaz Apple Cupertino con bandeja del sistema, asistente de bienvenida, modo compacto y actualizador automático. |

---

## 📦 Descargas Rápidas

| Binario | Formato | Uso Recomendado | Enlace Directo |
|---|---|---|---|
| **Instalador Oficial** | `.exe` (NSIS) | Instalación estándar con acceso directo y auto-actualizador | [**Descargar Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/v1.0.0/Tiancode.exe) |
| **Versión Portable** | `.exe` (Portable) | Ejecución directa sin instalación ni permisos de administrador | [**Descargar Tiancode-portable.exe**](https://github.com/Dreftian/Tiancode/releases/download/v1.0.0/Tiancode-portable.exe) |

---

## 🚀 Inicio Rápido

1. Descarga [`Tiancode.exe`](https://github.com/Dreftian/Tiancode/releases/download/v1.0.0/Tiancode.exe) o [`Tiancode-portable.exe`](https://github.com/Dreftian/Tiancode/releases/download/v1.0.0/Tiancode-portable.exe).
2. Abre la aplicación y configura tus preferencias de idioma, tema y proveedores en el asistente inicial.
3. ¡Comienza a chatear y desarrollar con tu agente de IA local!

---

## 🛠️ Desarrollo Local

```bash
# Clonar repositorio
git clone https://github.com/Dreftian/Tiancode.git
cd Tiancode

# Instalar dependencias con Bun
bun install

# Ejecutar aplicación de escritorio en modo desarrollo
cd frontend/desktop && bun run dev

# Ejecutar servidor backend
cd backend/tiancode && bun dev
```

---

## 📁 Arquitectura del Monorepo

```
skills/         # 52+ skills especializados integrados
install/        # Binarios empaquetados y metadatos de versión
frontend/       # Aplicación de escritorio y diseño
  app/          # Interfaz de usuario SolidJS (chat, settings v2, visualizadores)
  desktop/      # Shell Electron nativo (main process, tray, TTS, actualizador)
  ui/           # Sistema de diseño y componentes
  session-ui/   # Componentes de sesión y visor de documentos
backend/        # Servidor y lógica del agente
  tiancode/     # Servidor principal (MCP, agentes, model hub, herramientas)
  core/         # Núcleo de datos (SQLite, sesiones, configuración atómica)
  sdk/          # SDK TypeScript cliente
tools/          # Herramientas de soporte y automatización
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT** — consulta el archivo [LICENSE](LICENSE) para más detalles.

<p align="center">
  Hecho con ♥ por <a href="https://github.com/Dreftian">Dreftian</a>
</p>
