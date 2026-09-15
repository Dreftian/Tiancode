# Auditoría de Tiancode 1.0.53

Fecha: 15 de septiembre de 2026. Base: `49a4ad19` (versión publicada 1.0.52 y corrección de cabecera móvil).

## Resultado de las correcciones

| Área | Causa y resultado |
| --- | --- |
| Chat responsivo | Las reglas por posición y alturas fijas comprimían etiquetas y superponían descripciones. Se usan contenedores con ajuste de filas y menús con altura según su contenido. Verificado a 390, 520, 720 y 1.000 píxeles. |
| Selector principal | El filtro aceptaba cualquier agente principal del proyecto. La selección ahora contiene Build, Plan y Web App, en ese orden, y conserva las definiciones personalizadas. |
| Selector que se cerraba | La vista usaba un bloque `Show` con identidad de objeto para el agente. Una actualización del catálogo desmontaba el menú abierto. La vista permanece montada durante la actualización. |
| Rápido | La interfaz lo limitaba a inferencia nativa de Anthropic. Ahora todos los modelos reciben instrucciones de trabajo directo cuando se activa; la ruta nativa se añade solo donde está admitida. El esfuerzo seleccionado se conserva. |
| Subagentes vacíos | El panel consultaba la API V2 aunque el escritorio sirve V1. Ahora espera la detección de protocolo y usa `/agent` en V1 o la API de agentes V2. Una consulta fallida mantiene el último catálogo y muestra Reintentar. |
| Tema inicial | El hash de CSP se calculaba con los saltos CRLF del archivo. Se normalizan como lo hace el parser HTML del navegador. El hash coincide con el script distribuido. |
| OpenCode 1.18.31 | Se adaptan recuperación de opciones ACP, límites de bloques de pensamiento, pensamiento resumido adaptable de Copilot y errores de autenticación remota. |
| Website | Versión, novedades y descargas actualizadas; portada y navegación móviles; autor conservado al cambiar de idioma; descripción precisa de V1 y del núcleo V2 en desarrollo. |

El catálogo nativo mantiene 14 especialistas: `software-architect`, `fullstack-coder`, `ui-ux-master`, `performance-optimizer`, `database-architect`, `qa-e2e-tester`, `python-data-engineer`, `mobile-app-developer`, `cloud-devops-engineer`, `hermes-researcher`, `marketing-strategist`, `reverse-engineer`, `pentest` y `llm-redteam`. Los alias heredados y los agentes personalizados no se borran. La calidad del resultado depende del modelo que los ejecute; no se atribuye un ranking externo no medido.

## Validación

Todos los comandos de pruebas se ejecutaron desde sus paquetes.

- `frontend/app`, `bun run test:unit`: **1.016 aprobadas, 0 fallos**, 138 archivos.
- `frontend/app`, `bun run test:browser`: **41 aprobadas, 0 fallos**, 14 archivos.
- `frontend/desktop`, `bun test src`: **161 aprobadas, 0 fallos**, 24 archivos.
- `frontend/app/e2e/regression/composer-controls.spec.ts`: **6 aprobadas**, incluida interacción con menú, distribución en cuatro anchos, persistencia y envío de Rápido en modelo gratuito, y carga/reintento del catálogo V1.
- Backend: **89 aprobadas** en seis archivos de ACP, transporte de errores y Copilot. Otras **4 pruebas de subproceso ACP** pasaron al añadir el directorio real de `bun.exe` al PATH; el intento inicial fallaba por `uv_spawn bun: ENOENT`, antes de ejecutar Tiancode.
- `frontend/tui/test/app-lifecycle.test.tsx`: **3 aprobadas, 0 fallos**, incluida salida con estado de fallo tras error de autenticación y limpieza de recursos.
- Comprobación de tipos de interfaz, E2E, escritorio, backend y terminal: aprobada. El control previo al push verifica los paquetes del monorepositorio.
- Lint de interfaz: **0 errores y 158 advertencias** existentes en el conjunto del paquete.
- Website: **12 documentos, 0 errores** de enlaces locales, recursos e identificadores duplicados. Comprobación visual de navegación e idioma y ausencia de desbordamiento horizontal a 390 píxeles.

Los grupos se solapan con otras pruebas específicas; no se suman como un total de pruebas únicas de todo el repositorio. Las E2E usan respuestas deterministas de catálogo y proveedor para probar la interfaz, sin gastar créditos de inferencia. La prueba de Copilot usa un servidor HTTP local con el conversor real de modelos.

### Medición de navegación con compilación de producción

| Escenario / medida | 1.0.52 | 1.0.53 |
| --- | ---: | ---: |
| Sesión no visitada: primer contenido | 31,5 ms | 16,3 ms |
| Sesión no visitada: contenido estable | 54,2 ms | 40,7 ms |
| Sesión nueva: primer contenido | 89,0 ms | 51,9 ms |
| Sesión nueva: contenido estable | 103,8 ms | 57,3 ms |
| Huecos / contenido desconocido, ambos escenarios | 0 / 0 | 0 / 0 |

Son observaciones locales de estos dos escenarios, no una garantía de aceleración general ni una medición de la latencia del proveedor. El escenario adicional de apertura de sesión hija no produjo métricas en la referencia porque la interacción de su fixture falló; no se declara validado ni se incluye en la comparación.

## OpenCode y alcance de V2

La última publicación estable consultada es [v1.18.31](https://github.com/anomalyco/opencode/releases/tag/v1.18.31), del 14 de septiembre de 2026, commit `014614d35b397775e5d397a490fc72368c894ec2`. No se encontró una publicación estable 2.0.

Se revisó la comparación oficial con 1.18.30 y se adaptaron estas correcciones:

- [ACP, PR 48225](https://github.com/anomalyco/opencode/pull/48225): estado persistido por delante del historial, fallback ante modelos o modos obsoletos, conservación del esfuerzo por defecto y publicación de opciones actualizadas; identificadores de pensamiento por bloque.
- [Copilot, PR 48269](https://github.com/anomalyco/opencode/pull/48269): `display: summarized` en todas las variantes compatibles con pensamiento adaptable.
- [Autenticación remota, PR 49016](https://github.com/anomalyco/opencode/pull/49016): respuesta legible, clasificación de error de configuración y salida de terminal con estado de fallo.

No se trasladan la facturación Go, soporte de cuentas, analítica de infraestructura comercial ni toda la documentación comercial de OpenCode. Tiancode conserva sus adaptaciones y su cadena de dependencias. Esta integración no constituye una certificación de paridad completa. El escritorio sigue utilizando V1; V2 está en desarrollo y la continuación tras un fallo del proceso requiere una acción explícita.

## Distribución y datos existentes

Compilación Windows x64 con `TIANCODE_CHANNEL=prod`. Versión de `app.asar` y recursos de Windows: **1.0.53**. Se verifican los marcadores de Rápido, Ultracode y reintento de catálogo dentro del renderer empaquetado y la correspondencia del hash CSP con el script normalizado.

`verify-win-release.ts` comprobó versión, nombres estables, tamaño y SHA-512, iconos externos y recursos MCP limpios. `update-install-assets.ts` comparó SHA-256 al copiar los cuatro archivos a `install`. La publicación verifica las mismas huellas en GitHub antes de hacer visible la versión y marcarla como predeterminada.

| Archivo | Bytes | SHA-256 |
| --- | ---: | --- |
| Tiancode.exe | 345281580 | `ccbf6557f88b58413dd1524d98849de4d784ae59d8377a2c5dd10d2448e384d8` |
| Tiancode-portable.exe | 345054118 | `fbb37334fc8049d7b34ad5cf35bf85f1d15d2f21a5d266b155fc87e8a16c686d` |
| Tiancode.exe.blockmap | 351076 | `8267f9712ca26c927cbb9909b27afcc2b1bebc0ad59649a4e4510f79659037ee` |
| latest.yml | 322 | `d3926bb0c42c5da32404aea65986bb262867790a100193f0ccde43e6cc3bd946` |

Esta versión no cambia migraciones ni directorios de datos del usuario. Mantiene el comportamiento existente de conservación de claves, configuración, sesiones, respaldos y autenticación MCP. Los ejecutables no tienen firma Authenticode; las huellas verifican integridad, no una identidad de editor certificada.

La detección de esta actualización en la aplicación instalada requiere una comprobación posterior a su publicación. No se reinicia automáticamente la aplicación del usuario para realizarla.

## Límites

- No se certifica ausencia de todos los bugs del monorepositorio ni la suite completa del backend en Windows.
- Rápido general organiza el trabajo del modelo; no cambia la velocidad física del proveedor ni reduce el esfuerzo seleccionado. No se ha ejecutado una comparación de inferencia facturada.
- Se conservan las funciones de micrófono, mejora del prompt y actividad de vista previa auditadas en 1.0.52. Esta revisión no añade una nueva prueba acústica con el micrófono físico.
- Inglés y español incluyen las nuevas cadenas; las demás traducciones usan el fallback inglés para las claves aún no traducidas.
