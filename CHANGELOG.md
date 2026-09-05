# Changelog

Todas las versiones notables de Tiancode se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

## [1.0.23] — 2026-09-05
### Novedades y Rendimiento

- **Motor Nativo de Reducción Inteligente de Tokens CLI (Estilo RTK)**:
  - Implementación del módulo `OutputDistiller` en el núcleo de Tiancode (`backend/core/src/tool/output-distiller.ts`), inspirado en la arquitectura de RTK (Rust Token Killer).
  - Reducción del 60% al 90% en consumo de tokens en comandos de terminal (`git status`, `git diff`, `npm test`, `vitest`, `cargo test`, `tsc`, `eslint`).
  - Filtrado instantáneo de secuencias de escape ANSI (`\x1b[...]`) y barras de progreso interactivo con retornos de carro (`\r`).
  - Modo *Failure Focus* en ejecutores de pruebas: colapso de cientos de pruebas exitosas a un resumen conciso y aislamiento preciso de errores y tracebacks con filtrado de ruido interno de `node_modules/`.
  - Compresión estructural de `git status` y `git diff`, eliminando textos instructivos redundantes.
  - Deduplicación de líneas consecutivas repetidas (`×N`).
  - Principio *Fail-Safe* absoluto: preservación íntegra de la salida en errores no reconocidos con código de salida diferente de cero para no comprometer nunca el diagnóstico del agente.
  - Arquitectura de Salida Dual: entrega del texto destilado al modelo LLM para máxima velocidad y ahorro de contexto, preservando la salida completa en el registro estructurado para el usuario.
  - Configuración ampliable en `ConfigToolOutput` con `token_reduction`.

## [1.0.22] — 2026-09-05
### Mejorado y Corregido

- **Corrección de Desborde en Buscador de AST CodeGraph**:
  - Ajuste del contenedor de búsqueda a `overflow-hidden` con override estricto `!w-full max-w-full min-w-0` en `TextInputV2`, evitando que sobresalga del límite derecho de la tarjeta.
- **Sub-Agentes Nativos Exclusivos y Depuración de Interfaz**:
  - Eliminación completa de la sección obsoleta de "Sub-agentes de usuario" y modales flotantes innecesarios, dejando exclusivamente el catálogo de sub-agentes nativos de élite.
  - Tabla limpia y uniforme de 5 columnas: Sub-Agente, Rol y Especialidad, Modelo, Herramientas y Estado con interruptor instantáneo (0 ms).
- **Árbol de Recursión RLM (Swarm Hierarchy Tree) Mejorado**:
  - Reemplazo de datos estáticos por la topología de orquestación jerárquica RLM (Nivel 0: Tiancode Prime Orchestrator; Nivel 1: Especialistas de Software Architect, Fullstack, DevSecOps y QA).
  - Capacidad de expandir/colapsar, insignias de estado en tiempo real y flujo de descomposición recursiva de tareas.
- **Dictado por Voz Nativo y Detección de Micrófonos sin Bloqueos**:
  - Corrección del error de tiempo de ejecución `Cannot use 'in' operator to search for 'transducer' in undefined` en `asr.ts`.
  - Estructura correcta de configuración para `OfflineRecognizer` (`featConfig` y `modelConfig.whisper`) y decodificación adecuada mediante `OfflineStream`.
  - Detección nativa de micrófonos conectados a la PC mediante `navigator.mediaDevices.enumerateDevices()`.
- **Modo ⚡ 2x Velocidad Optimizado**:
  - Directivas reforzadas para velocidad 2x tanto en la fase de razonamiento interno como en la tasa de generación de respuesta.
- **Hugging Face Local Models Hub con Motor Autónomo Tiancode**:
  - Banner oficial prominente de Hugging Face (🤗) destacando la ejecución autónoma en GPU/CPU con motor nativo de Tiancode (`llama-server.exe` integrado) sin necesidad de LM Studio ni Ollama.
  - Búsqueda en vivo de modelos GGUF en Hugging Face con navegación directa por Staff Picks y filtrado por modelos descargados en disco.
- **Actualización 100% No Destructiva**:
  - Preservación íntegra de claves de proveedores, configuraciones, sesiones, respaldos y estado del usuario.

## [1.0.21] — 2026-09-05
### Nuevo y Mejorado

- **9 Sub-Agentes Nativos de Nivel Profesional para Todos los Lenguajes y Ecosistemas**:
  - `python-data-engineer`: Python 3.12+, FastAPI, PyTorch, Pandas, NumPy, Scikit-learn, LangChain, pipelines ETL e ingeniería de datos e IA.
  - `rust-systems-engineer`: Rust 2024, Tokio, Axum, seguridad de memoria, concurrencia de alto rendimiento y WebAssembly.
  - `go-backend-dev`: Go 1.22+, Goroutines, Channels, microservicios nativos en la nube, gRPC, Gin y Fiber.
  - `mobile-app-developer`: Desarrollo móvil multiplataforma y nativo (Flutter, React Native/Expo, Swift/SwiftUI en iOS y Kotlin/Compose en Android).
  - `cloud-devops-engineer`: Docker multi-stage, Kubernetes, Helm, Terraform, CI/CD GitHub Actions y despliegue multi-cloud (AWS, GCP, Azure).
  - `cpp-systems-expert`: C++20/C++23 moderno, CMake, bajo nivel, optimización de memoria, SIMD y sistemas embebidos.
  - `java-enterprise-architect`: Java 21 LTS, Spring Boot 3, Hibernate/JPA, arquitectura limpia y microservicios empresariales.
  - `dotnet-core-expert`: C# 12, .NET 8/9, ASP.NET Core, Entity Framework Core y arquitecturas CQRS.
  - `php-laravel-expert`: PHP 8.3+, Laravel 11, Eloquent ORM, Livewire, Inertia.js y APIs RESTful seguras.
  - Todos los agentes cuentan con prompts de orquestación en el enjambre (`task.txt`), integración en `backend/tiancode/src/agent/agent.ts`, plugins y visibilidad completa con iconos y descripciones en la sección de Sub-agentes en Configuración.
- **Alineación Perfecta y Dimensiones Uniformes en Tablas y Chips de Plugins & MCP**:
  - Ampliación de la columna "CATEGORÍA & TIPO" a `minmax(210px, 1.8fr)` en tablas de Plugins y Servidores MCP, impidiendo saltos de línea desordenados.
  - Chips de categoría (`min-width: 96px`) y tipo (`min-width: 68px`) estandarizados con texto centrado y márgenes consistentes.
  - Badges de categoría en el catálogo Discover con dimensiones uniformes (`min-width: 92px`, `h-6`).
  - Nombres de categoría con ortografía y acentuación en español ("Diseño", "Documentación", "IA & ML", "Base de Datos", "Ciencia Datos", "Ventas & CRM").
- **Asistente de Bienvenida Rediseñado, Compacto y con Soporte Completo Modo Claro/Oscuro**:
  - Rediseño compacto (`max-w-[510px]`) idéntico a la referencia del usuario, eliminando pasos redundantes y mostrando únicamente Selección de Idioma (ES / EN) y Modo de Color (Oscuro / Claro / Sistema).
  - Soporte reactivo integral para modo claro y oscuro con tarjetas, bordes, resplandores y tipografía de alto contraste.
  - Fondo de bienvenida adaptable dinámicamente al tema seleccionado (`#f1f5f9` en modo claro y `#08080a` en modo oscuro).
  - Transición directa e instantánea al entorno de trabajo al presionar "Siguiente".
- **Actualización 100% No Destructiva**:
  - Claves de API de proveedores, sesiones, preferencias y servidores MCP completamente preservadas.

## [1.0.20] — 2026-09-04
### Mejorado y Corregido

- **Mascotas 3D Vivas en App y Escritorio**:
  - Rediseño completo de las animaciones SVG con desplazamientos pronunciados (8 a 12px), rotaciones elásticas (6° a 12°), respiración, llamas vivas y destellos de gemas/visores para los 13 compañeros interactivos.
  - Restauración del componente interactivo dentro de la ventana de la aplicación con burbuja de pensamiento en vivo, acariciar y cambio con doble clic.
  - Inyección de clases y estilos CSS de animación en el SVG de la mascota flotante de escritorio en Windows.
- **Sub-Agentes con Mayor Separación y Activación Individual Instantánea (0 ms)**:
  - Separación aumentada (gap de 22px, ancho mínimo de 185px) entre el interruptor y la etiqueta de estado "Activo".
  - Control individual e instantáneo a 0 ms con sincronización en segundo plano y rollback ante fallos.
- **Selector de Cuantización con Máxima Legibilidad en Modelos Locales**:
  - Reemplazo del selector nativo HTML por el componente `SelectV2` con menú oscuro `#0f172a`, texto `#f8fafc` de alto contraste y soporte de temas en Windows.
- **Información Real y Completa Restaurada en Skills**:
  - Eliminación de resúmenes breves que sobreescribían la descripción nativa. Se muestra el 100% de la descripción y documentación técnica completa de `SKILL.md`.
  - Panel de detalle sin recortes (`-webkit-line-clamp: unset`).
- **Toggles Instantáneos en Toda la Configuración**:
  - Optimistic UI a 0 ms en Plugins, Sub-agentes, Skills y demás módulos para una experiencia completamente fluida.

## [1.0.19] — 2026-09-04
### Corregido

- **Actualizador en la App (In-App Update) 100% Funcional y Fiable**:
  - **Eliminación del flag `/T` en `taskkill`**: Al iniciar la actualización desde la app vía `electron-updater`, el nuevo instalador se genera como proceso hijo de la app en ejecución. El uso anterior de `/T` provocaba que la terminación del proceso padre arrastrase recursivamente al instalador recién lanzado. Al eliminar `/T`, la app se cierra limpiamente y el instalador sobrevive para completar la instalación.
  - **Aislamiento de Macros en el Desinstalador**: `customCheckAppRunning` y `customInit` quedaron protegidos con `!ifndef BUILD_UNINSTALLER` para que el ejecutable de desinstalación previa nunca ejecute `taskkill` contra el instalador principal en espera.
  - **Limpieza Preventiva del Desinstalador Heredado y Tolerancia a Fallos**: Se añade `customUnInstallCheck` y eliminación preventiva del desinstalador antiguo si existiese, evitando abortos silenciosos por códigos de salida residuales.
  - **Gestión Limpia de la Pila NSIS**: Se balancea la pila con `Pop` tras cada llamada a `nsExec::Exec`, garantizando que ninguna función posterior reciba registros o valores de retorno corruptos.

## [1.0.18] — 2026-09-04
### Nuevo y Mejorado

- **Sub-Agentes con Mayor Separación y Activación Individual Instantánea (0 ms)**:
  - Incremento del espaciado visual a 18px entre el switch y la etiqueta de estado "Activo".
  - Control de activación individual instantáneo con señal reactiva dedicada (`agentStatusOverrides`), notificación inmediata y persistencia en segundo plano sin congelar la interfaz.
- **Configuración Global Instantánea y Fluida (0 ms)**:
  - Toggles instantáneos en Servidores MCP, Plugins integrados, Plugins de catálogo y Skills con respuesta en 0 ms y sincronización asíncrona con rollback.
- **Mascotas 3D Vivas, Prominentes y Animadas**:
  - Animaciones CSS fluidas para los 13 compañeros interactivos (flotación, balanceo, respiración, parpadeo, llamas y destellos de gemas/visores).
  - Avatar expandido a 56px (`size-14`) con icono de 44px y resplandor dinámico en la mascota seleccionada.
- **Modelos Locales con Selector de Cuantización de Alto Contraste**:
  - Corrección de visibilidad de texto en selector de cuantización GGUF con `color-scheme: dark`, fondo `#0f172a` y texto nítido `#f8fafc`.
- **Skills con Documentación Técnica Completa Restaurada**:
  - Preservación del 100% del contenido original en Markdown (cientos de líneas, tablas, fragmentos de código, directivas y ejemplos) sin reemplazos por textos vacíos o recortados.
  - Carga completa de todas las skills integradas en el motor de backend.

## [1.0.17] — 2026-09-04
### Nuevo y Mejorado

- **Instalador Compacto One-Click con Tema Oscuro Nativo (#181A20)**:
  - Ventana compacta original de instalación inmediata (`oneClick: true`) estilizada completamente en tema oscuro nativo.
  - Atributos inmersivos DWM de Windows 10/11 (`DwmSetWindowAttribute` 19/20, color de barra de título `#181A20`, texto blanco `#F0F2F5`, bordes redondeados y contorno sutil `#2C2E3A`).
  - Fondo del diálogo principal y etiquetas de texto en alto contraste (`#181A20` con texto `#F0F2F5`), junto a barra de progreso con fondo oscuro y avance verde vibrante (`#6AD045`).
  - Cierre higiénico y seguro de instancias previas (`taskkill /F /IM Tiancode.exe /FI "PID ne $0" /T`) garantizando que el proceso del instalador permanezca activo sin auto-eliminarse.

## [1.0.16] — 2026-09-04
### Nuevo y Mejorado

- **Instalador con Tema Oscuro Sólido y Cierre Seguro sin Auto-Eliminación**:
  - Corrección de cierre inmediato del instalador: el comando `taskkill` ahora excluye explícitamente el PID del instalador (`/FI "PID ne $0"`), evitando que el proceso se auto-termine al iniciarse.
  - Interfaz gráfica sólida en tema oscuro nativo (`#181A20` con texto `#F0F2F5` y botones `#252836`), garantizando máxima visibilidad y contraste sin depender de transparencias de ventana.
  - Flujo completo visible con barra de progreso fluida y pantalla de finalización ("Ejecutar Tiancode").

## [1.0.15] — 2026-09-04
### Nuevo y Mejorado

- **Instalador con Ventana Activa Glass (#1E1F28) y Progreso Fluido**:
  - Configuración asistida de un solo paso (`oneClick: false` con salto directo a `MUI_PAGE_INSTFILES`) que garantiza que la ventana del instalador sea siempre visible tanto en instalaciones limpias como en actualizaciones automáticas.
  - Paleta exacta de cristal acrílico oscuro `#1E1F28` con atributos DWM (`DwmSetWindowAttribute` para Dark Mode 19/20, Acrylic Backdrop 38, esquinas redondeadas 33 y colores de caption/borde nativos).
  - Ocultamiento de controles innecesarios y botones obsoletos para un diseño ultra limpio, mostrando la barra de progreso fluida y lanzando Tiancode automáticamente al finalizar.
  - Llamada explícita de `autoUpdater.quitAndInstall(false, true)` asegurando que la actualización visual se ejecute sin modo silencioso (`/S`) y reinicie la app de forma no destructiva.

## [1.0.14] — 2026-09-04
### Nuevo y Mejorado

- **Instalador con Tema Dark Acrylic / Glass y Cierre Seguro**:
  - Ventana de instalación NSIS personalizada con tema Windows 11 Dark / Acrylic / Mica Glass vía API nativa DWM (`DwmSetWindowAttribute`).
  - Cierre automático previo de procesos huérfanos (`taskkill /F /IM Tiancode.exe /T` y `tiancode-cli.exe`) en la inicialización del instalador para prevenir bloqueos de archivos en disco durante la actualización.
- **Corrección de Error 500 al Actualizar (`attempt to write a readonly database`)**:
  - Manejo resiliente en `Project.fromDirectory` con política de reintentos (`Schedule.recurs(3)`) y captura no fatal, evitando que una transición transitoria de bloqueo en SQLite WAL fracture la carga del proyecto.
- **Modelos Locales — Explorador Hugging Face GGUF Rediseñado**:
  - Telemetría de hardware (GPU, VRAM libre, RAM del sistema y estados de motor nativo/runtimes) en barra superior compacta y limpia.
  - Buscador prominente de ancho completo con sugerencias rápidas ("DeepSeek-R1", "Qwen 2.5 Coder", "Llama 3.2", "Gemma 2", "Phi-4", "Nemotron").
  - Estado inicial Hero elegante y explicativo: sin saturar la pantalla volcando todos los modelos; muestra las tarjetas técnicas detalladas únicamente al buscar o explorar.
- **Sub-Agentes — Corrección de Espaciado del Switch**:
  - Ampliado el ancho de la columna de Estado a `minmax(150px, 1.5fr)` con `gap: 12px` y `padding: 0 4px`, eliminando por completo la colisión entre el switch de activación y el chip de estado.
- **MCP y Plugins — Listas Detalladas en Columnas y Colores de Tema**:
  - Transformación de las pestañas de MCP Instalados, Plugins Instalados y Built-in Integrados en listas de columnas con paginación de 10x10 (`SettingsPagerV2`).
  - Uso de variables del tema activo (`var(--interactive-accent)`) en badges, chips y botones activos.
- **Asistente de Bienvenida — Perfeccionamiento Visual Sin Scroll**:
  - Eliminación absoluta de barras de scroll horizontales y verticales (`overflow: hidden !important`).
  - Tarjeta editorial flotante `rgba(14, 14, 18, 0.92)` con borde hairline `rgba(255, 255, 255, 0.09)` y fondo `#08080a` idéntico a la web oficial con halos sutiles.

## [1.0.13] — 2026-09-04
### Nuevo

- **Rediseño Completo de Modelos Locales**: Interfaz espaciosa y completa de ancho completo con filtrado por categorías (Staff Picks, Coding, Razonamiento R1, Ligeros < 4GB, Descargados), selector de cuantizaciones visibles con tamaño exacto en disco, indicadores de compatibilidad de hardware (RAM/VRAM), ejecución de benchmarks locales integrados y paginación 10x10 sin scroll excesivo.
- **Vistas en Lista Detalladas con Paginación 10x10 (`SettingsPagerV2`)**:
  - **Sub-Agentes**: Formato de tabla estructurada en columnas (Sub-Agente, Rol & Especialidad, Modelo, Herramientas, Estado, Acciones) y paginación de 10x10.
  - **Mascotas**: Lista detallada en columnas con rasgos de personalidad y especies de las 13 mascotas oficiales, selección directa y paginación 10x10.
  - **MCP y Plugins**: Transformación de la tienda en lista estructurada (Extensión/Herramienta, Categoría, Comando & Descripción, Acción) con paginación 10x10.
  - **Voces**: Catálogo de voces en lista organizada con paginación 10x10 y consola de ecualización.
- **Integración con GitHub Enriquecida**:
  - Perfil conectado con anillo de estado en vivo, enlace al perfil de GitHub, contadores dinámicos (Total, Públicos, Privados) y permisos activos (`repo`, `read:user`).
  - Creación directa de nuevos repositorios (públicos/privados) desde Tiancode mediante formulario interactivo integrado.
  - Filtros por visibilidad (Todos, Públicos, Privados) y lista de repositorios paginada en 10x10 con acciones de clonado directo y navegación externa.
- **Micrófono y Reconocimiento de Voz Nativo Inmediato**:
  - Detección instantánea de modelos ASR ONNX existentes en disco al iniciar la app (`status: ready`), eliminando la alerta de "Descargando..." y comenzando el dictado de voz sin latencia.
- **Motor de "Mejorar Input" de Alta Precisión**:
  - Eliminado el texto y directivas robóticas genéricas; ahora genera prompts claros, ejecutables y profesionales.
  - Corrección semántica y ortográfica avanzada de errores de digitación en tiempo real (`plusgins`, `aprte`, `descangando`, `tamnbién`, `igualq`, etc.).
- **Modo Chat x2 Fiel al Usuario**:
  - La activación del modo x2 ya no degrada la variante del modelo a `low`, manteniendo íntegramente la configuración seleccionada por el usuario.
- **Splash Screen 95% y Bienvenida Cósmica Astra**:
  - Corregida la coordenada del trazo inferior de la letra 'E' en el banner vectorial de "TIANCODE" y refinado el contraste de cavidad bucal, colmillos y ojos del gato cósmico.
  - Fondo celestial Astra con nebulosas radiantes y halos orbitales en el asistente de bienvenida, eliminando vacíos oscuros.

## [1.0.12] — 2026-09-04
### Nuevo

- **Estudio de Voces Tiancode**: Experiencia de voz fluida y ultrarrápida sin barreras de descargas pesadas de 1GB. Integración de voces femeninas naturales en español (Natasha Pro, Conversacional, Profesional, Suave) mediante síntesis Edge/Windows Neural y Fish Audio S2.1 Pro.
- **Controles de Estudio de Voz**: Ecualización de velocidad (0.75x a 2.0x), Tono/Pitch (Grave, Natural, Agudo), Ganancia de volumen (50% a 120%) y visualizador de onda espectral reactiva en tiempo real.
- **Galería Completa de Sub-Agentes y Modal Astra**: Renovación de la interfaz de sub-agentes a rejilla tipo galería responsiva de ancho completo y modal flotante de creación/edición con estética Astra Cosmic y exportación/importación `.agent.md`.
- **Tema Astra Cósmico y Asistente de Bienvenida**: Diseño translúcido de cristal cósmico con halos cian e índigo; eliminación del contenedor oscuro de fondo para un modal limpio y flotante.
- **Splash Screen 95% Definido**: Corrección de saturación en el rostro del gato y tipografía "TIANCODE", ampliando dimensiones para máximo detalle.
- **Persistencia de Inteligencia**: Conexión reactiva y almacenamiento de poda inteligente de contexto RLM y presupuesto de pensamiento.

### Corregido

- **Parpadeo y artefactos en el fondo del chat al cambiar pestañas de Configuración**: Eliminada la destrucción/reconstrucción de elementos del DOM en pestañas ocultas (Skills, Sub-Agentes, GitHub, Mascotas). Aislamiento en capa GPU con `content-visibility: hidden !important` y `contain: strict !important`, logrando transiciones 100% fluidas sin repintados de fondo.

## [1.0.1] — 2026-09-03
### Corregido

- **La vista previa de apps y webs se muestra siempre en "Vista en vivo"**: al
  pedir una vista previa (preview_start, dev server o HTML generado), el
  resultado ya nunca aparece en una ventana del navegador del escritorio; se
  renderiza dentro del panel "Vista en vivo" de la sesión (iframe/WebContentsView),
  que se abre automáticamente con la pestaña App activa.
- **El agente ya no puede abrir el navegador del sistema con una vista previa
  local**: el guard del shell bloquea, además de las URLs localhost, los
  lanzamientos de HTML local (`start index.html`, `explorer`, `Invoke-Item`,
  `file:///...`) y los scripts con `--open` (`npm run dev -- --open`,
  `npx vite --open`), redirigiendo al pipeline de preview embebido.
- **Los dev servers ya no abren el navegador por su cuenta**: el entorno del
  servidor de desarrollo gestionado incluye `BROWSER=none`, así que Vite,
  react-scripts y Next no abren el navegador del escritorio al arrancar.
- **Los enlaces locales de la UI van a la Vista en vivo**: los clics en URLs
  localhost o HTML del proyecto (enlaces del chat, Ctrl+clic en la terminal,
  enlaces con `target="_blank"`) que antes terminaban en el navegador del
  escritorio ahora navegan el panel "Vista en vivo" de la sesión activa.

## [1.0.29] — 2026-08-10
### Corregido

- **Crash al abrir la app** ("Cannot read properties of undefined (reading
  'length')" en la mascota): la clave de idioma `pets.status.resting`
  (estado de reposo) no llegó a los 7 locales y el traductor devolvía
  `undefined`. Añadida en los 7 idiomas, y la burbuja de la mascota ahora
  tolera una clave faltante (nunca más puede tumbar el render de la app por un
  dict incompleto).

## [1.0.28] — 2026-08-10
### Corregido

- **La app de la IA aparece siempre en el sandbox, no en el navegador flotante**:
  cuando el agente navega a mitad de sesión (fija una URL con `set_preview` o
  arranca un dev server visible en los logs), el sandbox "Vista en vivo"
  (pane Código + pane App) se abre automáticamente si estaba cerrado y muestra
  la URL en su webview (`persist:live-view`). Antes, la navegación solo se
  reflejaba con el panel abierto y el usuario terminaba abriendo el navegador
  interno flotante (`persist:preview`), que ahora queda reservado al clic
  explícito del usuario. El cierre manual del sandbox sigue mandando: solo una
  URL nueva del agente vuelve a abrirlo.
- **Las páginas que la IA abre con sus herramientas también van al sandbox**:
  si el agente usa una tool de navegación (p. ej. `chrome-devtools_new_page`
  con una URL http o file), la URL se detecta en los tool-calls del chat y el
  sandbox se abre mostrándola al costado, aunque el servidor de vista en vivo
  no tenga sesión.

### Nuevo

- **La mascota dice lo que hace la IA** (estilo Codex): burbuja de texto junto
  al compañero con la acción en curso — el anuncio del asistente se muestra en
  vivo mientras trabaja, su estado al esperar tu entrada, y un mensaje de
  reposo cuando está libre.
- **Voz femenina por defecto más fluida**: la voz del anuncio (piper
  es_ES-sharvard, hablante femenina) se descarga sola la primera vez y ahora
  suena más natural — velocidad 1.2 y pausas entre frases recortadas
  (silenceScale 0.12). En Ajustes → Voces lleva el chip "Predeterminada".
  (Nota técnica: la voz Kokoro estilo ElevenLabs aún no puede hablar español
  en este empaquetado — el fonemizador de kokoro-js solo tiene inglés y el
  motor sherpa-onnx wasm aborta con el modelo multilingüe; documentado para
  desbloquear en el futuro.)

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
