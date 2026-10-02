# Validación de Tiancode 1.0.1

Fecha: 23 de septiembre de 2026. Windows x64; compilación `TIANCODE_CHANNEL=prod`.

## Pruebas ejecutadas

| Área | Resultado |
| --- | --- |
| Backend: configuración JSON/JSONC, ciclo de vida MCP, motor local, transformaciones de proveedores, reintentos, contexto de sistema y mensajes | 634 correctas, 0 fallidas; 1.147 aserciones |
| App: estado y anuncios de la mascota, catálogo, comandos y configuración MCP, origen de plugins | 9 correctas, 0 fallidas; 29 aserciones |
| Desktop: registro de ventanas y autorización de permisos | 2 correctas, 0 fallidas; 10 aserciones |
| Tipos | `bun typecheck` correcto en `backend/tiancode`, `frontend/app` y `frontend/desktop`; el control previo al push también completó las 27 tareas de tipos del monorepo |
| Windows | Instalador y portátil 1.0.1, blockmap, `latest.yml`, iconos y recursos comprobados por `verify:win-release` |

Los tests de configuración comprueban que una definición MCP completa sustituye el transporte anterior, que una modificación de `enabled` conserva comando y variables, y que eliminar un MCP conserva el modelo y los demás servidores. Los tests de permisos cubren varias ventanas simultáneas y rechazan renderers y orígenes no registrados.

## Reproducción del error local

Se utilizó el archivo real `Llama-3.2-3B-Instruct-Q4_K_M.gguf` con llama.cpp b10679 en un puerto de prueba separado. La petición con herramientas y la plantilla predeterminada reproducía el error `The model produced output that does not match the expected peg-native format` al saludar.

Con `chat_template_kwargs.tools_in_user_message = false`, se comprobaron streaming y llamadas mediante `streamText`, `@ai-sdk/openai-compatible` y las funciones reales de `ProviderTransform`:

- «Hola, ¿qué modelo eres? Responde en una frase.» → «Soy Llama-3.2-3B-Instruct-Q4_K_M.»; terminación `stop`.
- «Lee el archivo README.md usando read.» → llamada `read` con `{ "filePath": "README.md" }`; terminación `tool-calls`.

Esta prueba comprueba la generación y el parseo de la llamada. No afirma que esa llamada de prueba haya ejecutado una lectura ni una edición real de archivos.

## Interfaz y configuración

- Asistente inicial: idioma, selección de carpeta propia y modo de apertura; transición de carga al inicio/chat.
- Recorrido de General, Inteligencia, Uso de la PC, Atajos, Servidores, Proveedores, Modelos, Modelos Locales, GitHub, Voces, Skills, Sub-Agentes, MCP y Plugins, Conexiones y Mascotas. Se inspeccionó la carga y presentación; no se cambiaron credenciales ni se enviaron mensajes a servicios externos.
- Navegación inicio/chat/ajustes; creación de una conexión a un servidor aislado. La primera conexión de desarrollo carecía del origen CORS autorizado; se comprobó el servidor de prueba con su origen explícitamente permitido.
- Perfil global de prueba: cero MCP y cero plugins. El repositorio de desarrollo tiene cinco plugins propios, que se muestran como locales; son configuración del proyecto y no instalación predeterminada del producto.
- MCP de prueba guardado con `enabled: false`; cambio de remoto a local con un argumento que contiene espacios y una variable de entorno; verificación de la configuración persistida y ausencia de la URL antigua.
- Catálogo de 206 entradas, búsqueda y filtros. Skill I Have ADHD visible como instalada en el perfil de prueba.
- Descarga real con el importador: Diagram Design (236 archivos), Security Audit (20), I Have ADHD (3) y Frontend Design del catálogo Cline (1). Se conserva `SKILL.md`; los recursos de texto admitidos viajan con la skill. El importador actual no transporta recursos binarios.
- A 390 px se reprodujo el recorte del contenido y se corrigieron navegación, buscador y filtros. Después, el panel midió 348 px de ancho y 348 px de contenido, sin desbordamiento horizontal. Las secciones recorridas a 800 px tampoco desbordaron el panel.

## Publicación y actualización desde 1.0.0

- Publicación estable [v1.0.1](https://github.com/Dreftian/Tiancode/releases/tag/v1.0.1), marcada como la versión más reciente, desde el commit `2a7864faf09a25b45ba7a75480f47eda5be7ff30`.
- Los cuatro archivos publicados coinciden con los tamaños y SHA-256 locales: `Tiancode.exe`, `Tiancode-portable.exe`, `Tiancode.exe.blockmap` y `latest.yml`. El manifiesto público declara `version: 1.0.1`.
- Se abrió Tiancode 1.0.0 instalado y se usó **Ajustes → General → Actualizaciones → Buscar ahora**. La interfaz pasó por «Buscando...», «Descargando...» y finalmente mostró **«Instalar y reiniciar»**.
- La comprobación terminó con la actualización descargada y lista. No se ejecutó el instalador ni se reinició la aplicación durante esta validación.

## Límites de la validación

No se certifica funcionamiento exhaustivo de cada proveedor de nube, dispositivo de audio, OAuth de terceros, gateway ni plugin. El navegador de prueba informa correctamente que los controles nativos de voces y escritorio requieren la aplicación de escritorio. La corrección del permiso de micrófono tiene pruebas de política, pero la captura física después de instalar 1.0.1 queda fuera de esta comprobación.

Los 16 plugins del catálogo Cline usan otro runtime. Esta versión permite consultar su fuente, pero no contiene un adaptador universal ni promete que esos plugins se ejecuten en Tiancode. No se iniciaron auditorías de terceros ni se instalaron servicios del marketplace en el perfil habitual del usuario.
