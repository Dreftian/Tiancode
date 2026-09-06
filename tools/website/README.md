<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/tian-white.png">
  <img src="img/tian-black.png" alt="Tiancode Logo" width="140">
</picture>

# Tiancode

### *El Asistente de IA Autónomo y Local-First para Programar en Windows*

[![Versión](https://img.shields.io/badge/versión-v1.0.37-00d2ff.svg?style=flat-square)](https://github.com/Dreftian/Tiancode/releases/latest)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows%2010%20%7C%2011%20(64--bit)-0078D4?style=flat-square&logo=windows)](https://github.com/Dreftian/Tiancode/releases/latest)
[![Sitio Web](https://img.shields.io/badge/sitio%20web-tiancode.vercel.app-10b981.svg?style=flat-square&logo=vercel)](https://tiancode.vercel.app/)
[![Licencia](https://img.shields.io/badge/licencia-MIT-blue.svg?style=flat-square)](LICENSE)
[![GitHub Releases](https://img.shields.io/github/downloads/Dreftian/Tiancode/total?style=flat-square&logo=github&color=6366f1)](https://github.com/Dreftian/Tiancode/releases)

<p align="center">
  <a href="https://tiancode.vercel.app/"><b>Sitio Web Oficial</b></a> •
  <a href="https://github.com/Dreftian/Tiancode/releases/latest"><b>Descargar App</b></a> •
  <a href="https://tiancode.vercel.app/recursos/docs.html"><b>Documentación</b></a> •
  <a href="https://tiancode.vercel.app/recursos/novedades.html"><b>Novedades v1.0.37</b></a>
</p>

</div>

---

## ⚡ ¿Qué es Tiancode?

**Tiancode** es un entorno de desarrollo asistido por agentes de inteligencia artificial diseñado con arquitectura **local-first** para **Windows**. Combina la potencia de modelos de frontera en la nube (Claude 3.7 / 3.5 Sonnet, GPT-4o, Codex, DeepSeek) con la privacidad y velocidad de **modelos locales GGUF** ejecutados directamente en tu CPU o GPU.

Cuenta con una terminal integrada ultra-rápida, previsualización en vivo (**Live Preview DOM**) con **Sandbox Keep-Alive** e inspector interactivo, pasarela de **Conexiones** (WhatsApp, Telegram Bot, Discord, Slack, Webhooks), motor de diseño anti-clichés **OpenDesign**, resiliencia **OpenClaw** con auto-reparación de herramientas, memoria e inteligencia **Hermes Agent** con búsqueda SQLite profunda, y un ecosistema extensible de **servidores MCP** y **skills de ingeniería**.

---

## 🚀 Descargas Oficiales (Windows 10 y 11)

```powershell
# Instalación rápida con Windows Package Manager (winget)
winget install Dreftian.Tiancode
```

| Tipo | Archivo | Tamaño | Arquitectura | Enlace |
|---|---|---|---|---|
| 📦 **Instalador de Windows** | `Tiancode.exe` | ~375 MB | x64 (64-bit) | [**Descargar Instalador (.exe)**](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe) |
| 💼 **Versión Portable** | `Tiancode-portable.exe` | ~375 MB | x64 (64-bit) | [**Descargar Portable (.exe)**](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe) |

> [!TIP]
> También puedes explorar el **Studio Interactivo** en [**tiancode.vercel.app/#showcase**](https://tiancode.vercel.app/#showcase) o descargar versiones anteriores en [**Releases**](https://github.com/Dreftian/Tiancode/releases).

---

## ✨ Características Principales

```
 ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
 │   Agentes & OpenClaw    │   │   Modelos Locales GGUF  │   │  Sandbox Keep-Alive DOM │
 │ JSON auto-repair, bucle │   │ LM Studio hub, VRAM     │   │ Retención 100% estado,  │
 │ breaker SHA-256, Swarms │   │ offload y cuantización  │   │ Inspector cota pixel UI │
 └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
 ┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
 │   Conexiones Gateway    │   │  Hermes Agent Memory    │   │  OpenDesign UI Engine   │
 │ WhatsApp, Telegram Bot, │   │ SQLite session_search,  │   │ 3 diales de calibración,│
 │ Discord, Slack, Webhook │   │ Head/Tail, <think> strip│   │ física Emil, anti-cliché│
 └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

### 🧠 1. Agente Autónomo, Swarms y Resiliencia OpenClaw
* Orquesta flujos de trabajo complejos dividiéndolos en sub-agentes con contexto, memoria y permisos independientes.
* **OpenClaw Resilience**: Auto-reparación sintáctica de llamadas JSON (`tool-call-repair`) que rescata JSONs truncados de modelos de frontera.
* **Detector de bucles infinitos**: Hasheo criptográfico SHA-256 de argumentos con circuit breaker a 25 repeticiones idénticas.

### 🌐 2. Conexiones (Messaging & API Gateway)
* Vincula Tiancode con tus plataformas de mensajería favoritas para interactuar con tus agentes en movilidad.
* **WhatsApp**: Emparejamiento interactivo mediante código de seguridad `TIAN-XXXX-WAPP`.
* **Telegram Bot**: Soporte para bot token, configuración automática de webhooks y ping de prueba en vivo.
* **Discord & Slack**: Automatización con webhooks entrantes y bots dedicados.
* **Webhooks Personalizados**: Reenvío de eventos con firma criptográfica HMAC-SHA256.

### 🔍 3. Inteligencia y Memoria Hermes Agent
* **Búsqueda histórica profunda (`session_search`)**: Indexación y consulta en SQLite para reutilizar soluciones previas de código y decisiones de sesiones anteriores.
* **Compactación de contexto Head/Tail**: Conserva los objetivos iniciales del usuario y el contexto reciente mientras poda agresivamente llamadas a herramientas intermedias.
* **Scrubber streaming `<think>`**: Filtro de razonamiento en tiempo real diseñado para modelos como DeepSeek R1 y Qwen QwQ.

### 🎨 4. OpenDesign & Claude Design UI Engine
* Reglas estrictas **anti-slop de IA**: elimina gradientes morados genéricos, bordes redondeados inconsistentes y sombras planas.
* **3 diales de calibración de gusto**: `DESIGN_VARIANCE` (0-100), `MOTION_INTENSITY` (0-100) y `VISUAL_DENSITY` (compact / balanced / expansive).
* **Física táctil (Emil Kowalski)**: Micro-interacciones de resorte, estados activos realistas y elevaciones táctiles.
* **4 Presets Canónicos**: Linear Dark, Claude Editorial, Vercel Precision y Stripe Modern.

### 🖥️ 5. Sandbox Keep-Alive & Inspector DOM
* **Retención de estado al 100%**: Alterna entre el editor de código y la vista previa sin recargar el iframe; conserva inputs de formularios y scroll intactos.
* **Inspector DOM interactivo (`Ctrl+Alt+I`)**: Muestra cotas exactas en píxeles y selector de etiquetas para solicitar modificaciones visuales precisas.
* **Detector de Pantalla Blanca**: Detección automática de errores en runtime de React/JS con botón 1-click **"Reparar con Tiancode"**.

### 🎙️ 6. Dictado por Voz, Lectura Offline y Protocolo MCP
* Dictado continuo con **Sherpa-ONNX Whisper** y síntesis natural **Kokoro TTS** sin enviar audio a servidores externos.
* Catálogo de 15+ servidores **Model Context Protocol (MCP)**: Playwright, Chrome DevTools, SQLite, GitHub, AWS, etc.

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
