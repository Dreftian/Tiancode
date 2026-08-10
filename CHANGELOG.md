# Changelog

Todas las versiones notables de Tiancode se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

## [1.0.27] — 2026-08-10
### Corregido

- **Sandbox ("Vista en vivo" y "Código") en pantalla negra**: el `<webview>` de
  la vista en vivo se componía sobre toda la ventana cuando no tenía una caja
  válida al crearse, cubriendo el panel completo (cabecera incluida). Ahora el
  webview queda confinado a su pane (contenedor `relative overflow-hidden` +
  `absolute inset-0`), igual en el navegador interno.
- **Vista en vivo sin servidor**: cuando el agente aún no abre un servidor de
  desarrollo, el pane App muestra una página de bienvenida local en lugar de un
  about:blank/negro.
- **Aviso de servidor detectado**: el texto "Servidor de desarrollo detectado:
  {url}" se mostraba literal por las llaves simples — corregido a `{{url}}`.

## [1.0.26] — 2026-08-10
### Corregido

- **Pantalla negra en Ajustes → Plugins (causa real)**: la página también
  pedía el contexto SDK de la sesión (`useSessionLayout`) que no existe en el
  diálogo de ajustes, y el render se abortaba. Ahora es opcional: la página
  carga siempre; solo se omite "abrir en el editor" sin sesión activa.
- **Icono invisible en la barra de tareas**: los tamaños pequeños del icono
  (16-48px) usaban el fondo casi negro del diseño y quedaban como un cuadrado
  invisible sobre la taskbar oscura. El ICO pequeño y el tray usan ahora una
  variante clara (fondo gris medio con el gato blanco) que se distingue.

### Nuevo

- **Sección "Navegador" en Ajustes** (debajo de Servidores MCP): controla el
  navegador integrado (webview) — permiso de uso, destino de los enlaces
  (navegador integrado o del sistema), y botón "Borrar datos de navegación"
  que limpia el almacenamiento de las particiones del navegador y la vista en
  vivo.
- **Sección "Mascotas" en Ajustes**: las mascotas pasan de General a su propia
  página con tarjetas seleccionables (gato, perro, conejo), activación y
  posición, igual que en Codex.
- **Sección "Uso de la PC" en Ajustes**: lista las aplicaciones locales
  integradas por MCP con su estado de conexión real, y un interruptor
  "Permitir control de aplicaciones" que aprueba automáticamente las acciones
  de computer use (permiso `computer_use: allow`) cuando el modelo las soporta.

## [1.0.25] — 2026-08-10
### Corregido

- **Pantalla negra en Ajustes → Plugins**: la página pedía el contexto de
  archivo del workspace, que no existe cuando los ajustes se abren desde la
  home o sin sesión, y el render se abortaba con "File context must be used
  within a context provider". El contexto ahora es opcional: crear un plugin
  en el workspace sigue funcionando y solo se omite "abrir en el editor"
  cuando no hay editor.
- **Paginación de Sub-Agents y Servidores MCP**: el indicador de página se
  mostraba literal ("Página {current} de {total}") porque el motor de i18n
  interpola con llaves dobles (`{{param}}`). Corregidas 6 claves en los 7
  idiomas (paginación, toggles de plugins, versión, alta de plugin y confirmar
  respaldo).
- **Página de paginación al filtrar**: buscar en Sub-Agents o Servidores MCP
  ya no te deja en la página 5 de una lista filtrada — se vuelve a la
  página 1.
- **Respaldo automático antes de actualizar**: al instalar una actualización
  se crea un respaldo completo del estado (claves, configuración, sesiones,
  OAuth MCP) antes de reiniciar, reforzando la política de actualizaciones no
  destructivas.

### Interno

- Hooks `prepackage*` que copian los iconos del canal antes de empaquetar, de
  modo que un `package:win` directo nunca genere un ejecutable con el icono
  por defecto de Electron.

## [1.0.24] — 2026-08-10
### Nuevo

- **Lectura del anuncio completa y sincronizada**: la voz en vivo ya no lee el
  anuncio del asistente por fragmentos (sonaba cortado y desincronizado); ahora
  espera la pausa natural del stream y lee el anuncio entero de una vez. Al
  enviar una petición, la lectura en curso se corta y el siguiente anuncio
  arranca limpio.
- **Menú contextual en proyectos con clic derecho** (home): se abre el mismo
  menú del botón ⋯ al hacer clic derecho sobre un proyecto (port del upstream
  anomalyco/opencode v1.18.16).
- **Registro de proyectos nuevos en el servidor** (home): al añadir una carpeta
  que aún no es un proyecto, se registra en el servidor (initGit si está vacía)
  para que aparezca en el selector y en las sesiones (port upstream v1.18.16).
- **Selector de carpeta con respaldo local**: si la búsqueda del servidor no
  devuelve resultados, el picker rellena con el listado/coincidencia local en
  lugar de quedarse vacío (port upstream v1.18.16).

### Corregido

- **Config tolerante a claves desconocidas**: un `tiancode.json`/`tiancode.jsonc`
  con campos de otras herramientas o de versiones futuras ya no impide cargar la
  configuración (las claves extra se ignoran; port upstream v1.18.16).
- **Estado de carga de botones con tokens del tema**: el fondo del estado
  "loading" ya usa variables del tema (compatible con tema claro/oscuro; port
  upstream v1.18.16).
- **Chino simplificado**: "令牌" (token) reemplazado por "词元" en el desglose
  de contexto (port upstream v1.18.16).

## [1.0.11] — 2026-08-10
### Corregido

- **Terminal roto por la CSP (desde v1.0.3)**: la terminal (ghostty) carga su
  wasm desde una URL `data:` y la política `connect-src` del renderer de
  escritorio no lo permitía — la terminal no cargaba. Añadido `data:` a
  `connect-src` (la web ya lo tenía).



### Nuevo

- **Vista en vivo del trabajo de la IA**: botón junto al de terminal en la
  cabecera de la sesión — abre un panel que muestra en tiempo real (vía el
  MCP live_frontend) el árbol de archivos, fases, logs y la vista previa web
  de lo que el agente está construyendo.
- **Apertura automática**: al pedir crear una web, app, documento, hoja de
  cálculo o interfaz, el panel de vista en vivo se abre solo.
- **Terminal debajo del chat**: en el diseño nuevo el terminal ahora es un
  dock inferior a ancho completo (estilo Codex/Claude) en lugar de ocupar la
  columna lateral.

## [1.0.10] — 2026-08-09

### Nuevo

- **Catálogo Descubrir: presets AI-MCP-SUITE** — los 9 integradores de la
  suite local (Photoshop, InDesign, Illustrator, CorelDRAW, Opera GX, Unreal
  CLI, Unity, Godot, Android Studio) se activan con un clic, con comandos y
  entorno preconfigurados (rutas ajustables en Editar).

### Corregido

- **Audio TTS bloqueado por la CSP**: la política del renderer no incluía
  `data:` en `media-src` y el preview de voces (audio desde data: URIs) no
  reproducía. Añadido `data:` a `media-src`.

## [1.0.10] — 2026-08-09

### Nuevo

- **Catálogo Descubrir: presets AI-MCP-SUITE** — los 9 integradores de la
  suite local (Photoshop, InDesign, Illustrator, CorelDRAW, Opera GX, Unreal
  CLI, Unity, Godot, Android Studio) se activan con un clic, con comandos y
  entorno preconfigurados (rutas ajustables en Editar).

## [1.0.9] — 2026-08-09

### Nuevo

- **Catálogo Descubrir: preset Unreal Engine** — activa el puente MCP hacia
  Unreal (Web Remote Control) con un clic: comandos, cwd y entorno ya
  configurados (rutas ajustables en Editar). Los presets locales ahora pueden
  llevar argumentos completos (rutas con espacios), cwd y variables de entorno.

## [1.0.8] — 2026-08-09

### Nuevo

- **Exportar conversación en JSON**: botón junto al de Markdown en la cabecera
  de la sesión — guarda la transcripción completa estructurada
  (`{ info, messages: [{ info, parts }] }`) para respaldo, análisis o
  migración.
- **TUI: estilo de cursor configurable** (`cursor` en la config de TUI:
  block/underline/line/default + parpadeo).
- **TUI: copiado con `set-clipboard on` en tmux** (passthrough OSC52 sobre
  ssh/screen).

### Corregido

- **Limpieza de truncación por mtime**: los archivos de salida truncados se
  eliminan por la fecha real del archivo en vez de parsear el identificador
  (más fiable).
- **Compactación**: verificado que la compactación V2 ya conserva el
  historial de tool-calls entre resúmenes repetidos (nada que corregir).

## [1.0.7] — 2026-08-09

### Corregido

- **Plugins que no se podían agregar**: las actualizaciones de configuración
  desde la app escribían en `config.json`, pero el cargador de configuración de
  proyecto solo lee `tiancode.json`/`tiancode.jsonc` — el cambio se perdía en
  silencio. Ahora la app escribe en el archivo de proyecto correcto (y limpia
  el `config.json` huérfano), así que añadir/quitar plugins (y otras
  actualizaciones de configuración) persisten de verdad.

### Cambios

- **Sección Plugins rediseñada**: más compacta y clara — buscador en el
  catálogo, nombres legibles para los plugins locales auto-descubiertos,
  estado "Instalado" correcto y refresco automático tras añadir o quitar.

## [1.0.6] — 2026-08-09

### Corregido

- **MCP: servidores OAuth (Canva, Apollo, Appwrite, Atlan)**: la primera
  conexión colgaba 30s y quedaba en error porque el flujo OAuth esperaba la
  interacción del usuario. Ahora el alta resuelve al instante a "requiere
  autenticación" y aparece el botón **Autenticar** en cada servidor, que abre
  el navegador con la autorización OAuth del servicio (registro dinámico +
  callback local).
- **Catálogo Descubrir**: "Activar todos" y la activación individual ya no se
  quedan bloqueados (los alta son paralelos y rápidos); al activar un
  servidor OAuth se inicia su autenticación automáticamente.

## [1.0.5] — 2026-08-08

### Corregido

- **Placeholder del chat roto**: el editor mostraba `\200Bnta lo que quieras...`
  en vez de "Pregunta lo que quieras, / para comandos, @ para contexto...". El
  pseudo-elemento del cursor (un espacio de ancho cero) quedó con doble escape
  durante la reestructura del repo y Chromium lo renderizaba como texto literal
  tapando el inicio del placeholder.

### Cambios

- **Nuevo icono**: fondo oscuro con gradiente, el mismo gato en blanco y
  esquinas redondeadas con transparencia (estilo moderno). Aplicado al
  instalador, portable y todos los formatos (ICO multi-tamaño, ICNS, Linux,
  Windows Store, iOS, Android). Script reutilizable en
  `tools/script/regenerate-icons.py`.
- **Idiomas reducidos a 7**: Español, Inglés (EE. UU.), Inglés (Europa),
  Japonés, Chino, Coreano y Ruso.

## [1.0.4] — 2026-08-08

### Corregido

- **Pantalla de Modelos (Model Hub) rota en 1.0.3**: el memo del modelo GGUF
  recomendado leía la VRAM antes de que se inicializara su señal
  (`Cannot access 'vramTotal' before initialization`), rompiendo la página al
  abrirla. Los memos de VRAM/RAM ahora se declaran antes que el recomendado.
  Se verificó que no hay más casos de este patrón en la app.

## [1.0.3] — 2026-08-08

### Seguridad

- **Credenciales cifradas en reposo**: las API keys (p. ej. DeepSeek) y tokens
  OAuth ya no se guardan en texto plano en la base de datos local; se cifran
  con AES-256-GCM bajo una clave protegida por el almacén seguro del sistema
  (DPAPI/Keychain vía safeStorage). Las credenciales existentes se migran
  automáticamente al actualizar.
- **Actualizaciones**: la verificación de firma del paquete de Windows queda
  activa para los canales beta/prod cuando el build sale firmado (CI), y se
  desactiva el downgrade a versiones anteriores. El nombre de editor se deriva
  del certificado de firma real, no de una constante.
- **Model Hub**: las descargas validan el repositorio y archivo solicitados y
  no confían en el registro persistido de trabajos — se cierra una ruta de
  escritura arbitraria de archivos.
- **Navegación web del agente (webfetch)**: se bloquean las IPs privadas,
  loopback y la IP de metadatos de la nube (SSRF).
- **Servidor local**: CORS restringido a los orígenes reales y límite de
  intentos de autenticación (rate limiting) contra fuerza bruta.
- **Aplicación de escritorio**: las rutas y apps del IPC se validan (apertura
  de archivos con lista blanca, escritura solo a archivos elegidos en el
  diálogo, restauración de respaldos solo desde la carpeta de respaldos,
  captura solo del navegador interno, stores restringidos) y se añade una
  política de seguridad de contenido (CSP) al renderer en producción.
- **Modelos de voz (ASR/piper)**: los binarios descargados verifican su
  checksum SHA-256 antes de instalarse.

### Corregido

- **Sesiones V2**: al interrumpir una sesión ya no se pierde un prompt
  admitido pendiente de entregar; los resultados de herramientas en vuelo ya
  no se marcan como fallidos por la interrupción.
- **Sesiones (legacy)**: los reintentos de un turno ya no duplican partes del
  mensaje ni duplican el coste facturado; el borrado de una sesión ya no
  reporta éxito si la base de datos falla; cancelar trabajos de fondo ya no
  puede quedar en bucle infinito.
- **Dictado por voz**: un doble clic ya no deja el micrófono activo para
  siempre; al salir del chat o fallar el arranque se libera el micrófono.
- **Deep links**: los enlaces `tiancode://` ya no se re-entregan a ventanas
  creadas después; el foco de ventana recae en la más recientemente usada.
- **Terminal (PTY)**: los búferes de suscriptores inactivos están acotados.

## [1.0.2] — 2026-08-08

### Corregido

- **Pantalla negra tras la actualización**: el bundle del renderer separaba
  `solid-js` en un vendor chunk que creaba un ciclo de inicialización
  (`Cannot access '$RAW' before initialization`), rompiendo el montaje de la
  interfaz. El renderer vuelve a un bundle único (Rollup resuelve el grafo
  completo) — se mantiene el split del proceso principal, que es el que
  reduce el arranque.

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
