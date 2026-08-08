# Changelog

Todas las versiones notables de Tiancode se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

## [1.0.1] — 2026-08-08

### Corregido

- **Sub-agentes**: ya se pueden crear desde Ajustes (los agentes de la config
  global se cargaban; ahora también se escanean los archivos markdown del
  directorio global y la caché se invalida al crear/editar/borrar).
- **MCP**: botón "Activar todos" en el catálogo Descubrir para activar los
  servidores desactivados de una vez.
- **Dictado por voz**: la descarga del modelo de voz reintenta 3 veces y el
  error muestra un mensaje claro si falla la conexión (traducido a los 26
  idiomas).
- **Captura de pantalla**: el navegador interno ya se puede capturar; se
  endurecieron los permisos del webview.
- **Actualizador**: los binarios de Windows arm64 ya no pisan a los de x64 en
  la release (sufijo `-arm64`), progreso de descarga en vivo y el toggle de
  búsqueda al iniciar aplica al instante.
- **Backups y arranque**: respaldo automático diario con rotación de 7 días,
  exportar conversación a Markdown, proveedor local automático al instalar
  Ollama/LM Studio e inicio con Windows.
- **Traducciones**: los 26 idiomas de la app completos (paridad 6/6).
- **Repositorio**: estructura reorganizada con la carpeta `tools/`.

## [1.0.0] — 2026-08-07

### Añadido

- **Dictado por voz local**: reconocimiento de voz con sherpa-onnx (Whisper
  multilingüe, sin nube) para la entrada por micrófono.
- **Lectura de respuestas en voz alta en tiempo real**: mientras el modelo
  genera, la respuesta se lee con la voz seleccionada (Kokoro / Piper).
- **Voces en español (Piper)**: descarga por voz, activar/desactivar y prueba.
- **Auto-selección de skills por tipo de proyecto**: el modelo carga
  automáticamente las skills que aplican al workspace (web, API, Python,
  Rust, Docker, CI, SQL, docs…), también en sub-agentes.
- **Navegador interno**: panel con webview para ver apps y sitios web en
  tiempo real junto al chat.
- **Actualizador**: búsqueda de actualizaciones en GitHub Releases
  (Dreftian/Tiancode) al iniciar y cada 10 minutos.
- **Instalación local de runtimes**: botones para instalar Ollama y LM Studio
  dentro de las carpetas de Tiancode.
- **Model Hub**: descargas con resume y verificación sha256, badges de
  compatibilidad con la GPU y detección de runtimes.
- **Ventana redondeada** (Windows 11) e icono de la marca regenerado.
- **Ayuda** que abre tiancode.vercel.app.
- Toggles nuevos en Ajustes: actualización de archivos en tiempo real,
  botón de terminal, navegación, búsqueda de actualizaciones al iniciar.

### Corregido

- Enlaces de descarga de la web con los nombres reales de los binarios.
- Permisos de sub-agentes: ahora heredan las reglas "ask" del agente padre.
- Servidor: se rechaza escuchar en una interfaz no-loopback sin contraseña y
  la comparación de contraseña es en tiempo constante.
- Template de plugins corregido al shape real (`{ id, server }`).
- Favicon y descargas de la website con marca transparente.
- Tests de skill sincronizados con el contenido real.

### Rendimiento

- Bundle del renderer dividido en chunks de vendor (effect, ui, pierre,
  solid) y mapa estático de lenguajes sin shiki en el hilo principal.
- Caché de 30s para la detección de GPU/VRAM en el Model Hub.

[1.0.0]: https://github.com/Dreftian/Tiancode/releases/tag/v1.0.0
