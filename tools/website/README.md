<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/tian-white.png">
  <img src="img/tian-black.png" alt="Tiancode Logo" width="140">
</picture>

# Tiancode

### *El Asistente de IA Autónomo y Local-First para Programar en Windows*

[![Versión](https://img.shields.io/badge/versión-v1.0.93-00d2ff.svg?style=flat-square)](https://github.com/Dreftian/Tiancode/releases/latest)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows%2010%20%7C%2011%20(64--bit)-0078D4?style=flat-square&logo=windows)](https://github.com/Dreftian/Tiancode/releases/latest)
[![Sitio Web](https://img.shields.io/badge/sitio%20web-tiancode.vercel.app-10b981.svg?style=flat-square&logo=vercel)](https://tiancode.vercel.app/)
[![Licencia](https://img.shields.io/badge/licencia-MIT-blue.svg?style=flat-square)](LICENSE)
[![GitHub Releases](https://img.shields.io/github/downloads/Dreftian/Tiancode/total?style=flat-square&logo=github&color=6366f1)](https://github.com/Dreftian/Tiancode/releases)

<p align="center">
  <a href="https://tiancode.vercel.app/"><b>Sitio Web Oficial</b></a> •
  <a href="https://github.com/Dreftian/Tiancode/releases/latest"><b>Descargar App</b></a> •
  <a href="https://tiancode.vercel.app/recursos/docs.html"><b>Documentación</b></a> •
  <a href="https://tiancode.vercel.app/recursos/novedades.html"><b>Novedades</b></a>
</p>

</div>

---

## ⚡ ¿Qué es Tiancode?

**Tiancode** es un entorno de desarrollo asistido por agentes de inteligencia artificial diseñado con arquitectura **local-first** para **Windows**. Combina la potencia de modelos de frontera en la nube (Claude 3.7 / 3.5 Sonnet, GPT-4o, Codex, DeepSeek) con la privacidad y velocidad de **modelos locales GGUF** ejecutados directamente en tu CPU o GPU.

Cuenta con una terminal integrada ultra-rápida, previsualización en vivo (**Live Preview DOM**) con inspector visual, dictado y lectura de voz offline, memoria continua, y un ecosistema extensible de **servidores MCP** y **skills de ingeniería de software**.

---

## 🚀 Descargas Oficiales (Windows 10 y 11)

```powershell
# Instalación rápida con Windows Package Manager (winget)
winget install Dreftian.Tiancode
```

| Tipo | Archivo | Tamaño | Arquitectura | Enlace |
|---|---|---|---|---|
| 📦 **Instalador de Windows** | `Tiancode.exe` | ~234 MB | x64 (64-bit) | [**Descargar Instalador (.exe)**](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe) |
| 💼 **Versión Portable** | `Tiancode-portable.exe` | ~234 MB | x64 (64-bit) | [**Descargar Portable (.exe)**](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe) |

> [!TIP]
> También puedes explorar el **Studio Interactivo** en [**tiancode.vercel.app/#showcase**](https://tiancode.vercel.app/#showcase) o descargar versiones anteriores en [**Releases**](https://github.com/Dreftian/Tiancode/releases).

---

## ✨ Características Principales

```
 ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
 │   Agentes Autónomos     │   │   Modelos Locales GGUF  │   │     Live Preview DOM    │
 │ Multi-turn, AST Graph   │   │ LM Studio hub, VRAM     │   │ HMR instantáneo,        │
 │ y auto-reparación       │   │ offload y cuantización  │   │ inspector visual de UI  │
 └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
 ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
 │  Protocolo MCP Nativo   │   │    Voz y Dictado Local  │   │  50+ Skills de Código   │
 │ Playwright, NotebookLM, │   │ Sherpa-ONNX Whisper     │   │ Refactoring, Security,  │
 │ SQLite, GitHub, Context7│   │ y síntesis Kokoro TTS   │   │ Fullstack, Specs & TDD  │
 └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

### 🧠 1. Agente Autónomo con Sub-Agentes Especializados
* Orquesta flujos de trabajo complejos dividiéndolos en sub-agentes con contexto, memoria y permisos independientes.
* Inspección de código, navegación recursiva y edición precisa sin romper dependencias.

### 🖥️ 2. Centro de Modelos Locales (GGUF)
* Descarga y ejecuta modelos open-source directamente (Qwen 2.5, DeepSeek Coder, Llama 3.3, Gemma 2, Mistral).
* Medidor inteligente de VRAM y RAM: detecta automáticamente si el modelo cabe en la GPU o si requiere offload a RAM.

### 🔍 3. Live Preview & Inspector Visual
* Servidor de desarrollo integrado que renderiza proyectos React, Vue, HTML/CSS y componentes al instante.
* Herramienta de inspección para seleccionar elementos visualmente y solicitar ajustes directamente al agente.

### 🎙️ 4. Dictado por Voz y Lectura Offline
* Dictado continuo con reconocimiento de voz offline mediante **Sherpa-ONNX Whisper**.
* Lectura natural de respuestas con el motor **Kokoro TTS** en español e inglés sin enviar audio a servidores externos.

### 🔌 5. Catálogo MCP & Herramientas Creativas
* Integración con **Google NotebookLM MCP** para investigación profunda, síntesis de documentos y extracción de fuentes.
* Servidores MCP integrados para desarrollo (Playwright, Chrome DevTools, SQLite, PostgreSQL) y suites creativas (Photoshop, Illustrator, Unity, Godot, Unreal Engine).

---

## 🌐 Estructura del Sitio Web

Este repositorio aloja el sitio web oficial desplegado en [**https://tiancode.vercel.app/**](https://tiancode.vercel.app/):

| Página | Ruta | Descripción |
|---|---|---|
| **Inicio** | [`/`](index.html) | Portada interactiva, comparativas y características principales. |
| **Descargas** | [`/recursos/descargas.html`](recursos/descargas.html) | Enlaces directos al instalador NSIS y la versión portable. |
| **Novedades** | [`/recursos/novedades.html`](recursos/novedades.html) | Registro detallado de versiones y mejoras. |
| **Documentación** | [`/recursos/docs.html`](recursos/docs.html) | Manual de uso, atajos de teclado y configuración. |
| **Guía de Inicio** | [`/recursos/guia.html`](recursos/guia.html) | Primeros pasos para configurar modelos y proveedores. |
| **Preguntas Frecuentes** | [`/recursos/faq.html`](recursos/faq.html) | Respuestas sobre privacidad, rendimiento y compatibilidad. |
| **Legal** | [`/legal/privacidad.html`](legal/privacidad.html) | Términos de uso, política de privacidad y licencia. |

---

## 🛠️ Desarrollo Local del Sitio Web

El sitio web está construido con HTML5, CSS3 y JavaScript vanilla, optimizado para cargar en milisegundos sin procesos de compilación:

```bash
# Con Python
python -m http.server 8000

# Con Node / Bun
npx serve .
# o
bunx serve .
```

Abre [`http://localhost:8000`](http://localhost:8000) en tu navegador.

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

<div align="center">
  Hecho con ♥ por <a href="https://github.com/Dreftian"><b>Dreftian</b></a> — <a href="https://tiancode.vercel.app/"><b>Tiancode</b></a>
</div>
