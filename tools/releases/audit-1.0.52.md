# Auditoría de Tiancode 1.0.52

Fecha: 14 de septiembre de 2026. Base de trabajo: `cd14d6dafea9202aeebfa95c0cea7b3dbff8cbd3` (1.0.51).

## Alcance y resultados

| Área                    | Cambio y comprobación                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo de modelos     | Reconciliación reactiva del borrado y uso del catálogo servido como fuente de disponibilidad. Un inventario fallido no autoriza la limpieza masiva. Pruebas de referencias eliminadas y conservación de modelos personalizados.                                       |
| Especialistas           | 14 especialistas y cinco agentes principales/generales visibles. Un catálogo común para V1 y V2, con 13 alias ocultos para los identificadores anteriores. No se borran agentes personalizados.                                                                       |
| Permisos del chat       | Reglas reales por sesión en V1, con restauración de la configuración previa al regresar a Auto. Plan permite exploración y bloquea edición, comandos y delegación. Las negativas explícitas prevalecen.                                                               |
| Rápido                  | Opción `speed: fast` y cabecera beta del SDK de Anthropic comprobadas contra un servidor HTTP local. El esfuerzo de razonamiento no cambia. Limitado a las rutas y modelos admitidos; no se ha ejecutado una inferencia facturada para medir su velocidad.            |
| Ultracode               | Instrucciones de trabajo y variante máxima compatible. Es una función de Tiancode, no una garantía de equivalencia con el producto de Anthropic.                                                                                                                      |
| Dictado                 | Selector y pulsación mantenida, liberación por teclado/puntero, cancelación al perder el foco y protección frente al inicio asíncrono tardío. La calidad acústica y los dispositivos físicos requieren una comprobación manual.                                       |
| Optimización del prompt | Streaming existente conservado, borrador protegido, cancelar/deshacer y conservación de adjuntos/menciones.                                                                                                                                                           |
| Vista previa            | Actividad procedente de herramientas de la sesión actual, entradas reales, raíz del proyecto estable, eliminación de resultados obsoletos y registros limitados a 2.000 líneas. La prueba E2E observa el iframe de un proyecto y el cambio de estado de la actividad. |
| Uso del computador      | Acciones serializadas y comprobaciones nativas de PID/ventana antes de introducir texto, teclas, clics o desplazamiento. La cancelación invalida acciones en cola. Se verificó el rechazo de entradas en un PID incorrecto con PowerShell y user32 reales.            |
| Actualizaciones         | Descargas y metadatos fallidos dejan de producir estado instalable. Reintento comprobado. Respaldo esperado antes de `quitAndInstall`. Publicación primero como borrador y verificación SHA-256 de los cuatro archivos antes de publicarla.                           |
| Website                 | 12 documentos con recursos y anclas verificados. Idioma inglés/español comprobado al cambiarlo y recargar. Módulos i18n unificados y animación limitada a 30 FPS, pausada fuera de vista y compatible con movimiento reducido.                                        |

## Validación reproducible

Los comandos de pruebas se ejecutan desde cada paquete, nunca desde la raíz.

- `frontend/app`: `bun run test:unit` — **1.014 pass, 0 fail**, 138 archivos.
- `frontend/app`: `bun run test:browser` — **41 pass, 0 fail**, 14 archivos.
- `frontend/desktop`: `bun test src` — **161 pass, 0 fail**, 24 archivos.
- Pruebas específicas de vista previa: **124 aprobadas**. Pruebas de control nativo: **34 aprobadas**.
- Prueba E2E de vista previa: **aprobada**, actividad y proyecto visibles; transición observada de **406,3 ms** en este equipo.
- Backend V1: **66 pruebas** de agentes/selección aprobadas durante la auditoría. Backend Core: **14 pruebas** de agentes aprobadas. Selección de prompts: **8 aprobadas**. Transporte de modo rápido: **2 aprobadas**.
- `bun typecheck` aprobado en los paquetes modificados; chequeo E2E aprobado.
- Lint de la interfaz: **0 errores y 158 advertencias** en el conjunto del paquete. No se presenta como un repositorio sin advertencias.
- `bun tools/script/verify-website.ts`: **12 documentos, 0 errores** de recursos locales/anclas/IDs duplicados.

Los grupos específicos se solapan con las suites completas; no deben sumarse como pruebas únicas.

### Rendimiento de la línea de tiempo

Se registraron la referencia y la medición posterior con compilación de producción, en el mismo escenario:

| Medida                |   Antes | Después |
| --------------------- | ------: | ------: |
| Primer contenido      | 14,0 ms | 14,8 ms |
| Contenido estable     | 37,3 ms | 41,5 ms |
| Huecos detectados     |       0 |       0 |
| Contenido desconocido |       0 |       0 |

Este escenario confirma estabilidad visual. **No demuestra una aceleración general**. La lista de actividad añade información de ejecución; no se anuncia una mejora porcentual de velocidad.

## Comparación con OpenCode

La API de GitHub y la publicación oficial consultadas el 14 de septiembre identifican **v1.18.30**, publicada el 9 de septiembre, como última versión estable. No se encontró una publicación estable 2.0. Referencia: <https://github.com/anomalyco/opencode/releases/tag/v1.18.30>.

Tiancode ya contenía adaptaciones previas de los cambios de 1.18.15–1.18.30 (reintentos, clasificación de errores, proveedores y compacción), descritas en su historial. Esta auditoría añade la ruta del prompt Astra para GPT-6, selección de Meta Muse Spark/Glimmer y variantes regionales de Kimi, y pruebas de selección. Esto es una integración selectiva verificada, no una fusión completa ni certificación de paridad.

El adaptador V2 aplica agente/modelo/esfuerzo antes de admitir el prompt. Esa secuencia no es atómica frente a cambios simultáneos de otro cliente. No se ha rediseñado la admisión durable ni la coordinación del runner. Modos de permisos y aceleración nativa permanecen deshabilitados en servidores V2 sin capacidad correspondiente.

## Límites de la verificación

- No se certifica ausencia total de errores en todo el monorepositorio. La suite completa del backend no se declara aprobada; su cobertura en Windows incluye requisitos de symlinks, permisos y fixtures fuera de este alcance.
- No se certifica paridad exacta con Claude Desktop o Trae. Se implementan comportamientos concretos observables en Tiancode.
- La disponibilidad y el rendimiento de proveedores externos dependen del servicio y del acceso de la cuenta. No se han gastado créditos para comparativas de inferencia.
- Inglés y español incluyen el texto nuevo. Otros idiomas conservan sus traducciones existentes y muestran fallback inglés para las claves nuevas pendientes de traducción revisada.
- El instalador no cambia las carpetas de datos. No se ejecuta una reinstalación destructiva sobre los datos reales del usuario para verificarlo.
- La verificación visual de que la aplicación anterior ofrece la nueva versión debe registrarse separadamente de la validación del manifiesto y de los binarios. Una publicación correcta del feed no demuestra por sí sola que se haya mostrado el aviso.

## Archivos de distribución

Compilación: `TIANCODE_CHANNEL=prod`, Windows x64. Nombres estables: `Tiancode.exe`, `Tiancode-portable.exe`, `Tiancode.exe.blockmap`, `latest.yml`.

`verify-win-release.ts` comprueba versión, tamaño, SHA-512 del instalador, iconos externos y ausencia de cachés Python en MCP. `update-install-assets.ts` compara SHA-256 al copiar a `install`. `publish-github-release.ts` verifica tamaño y digest de cada activo en GitHub antes de publicar y marcar la nueva versión como predeterminada.

La versión incluida en `app.asar` y en los recursos de Windows es 1.0.52. Se comprobó la presencia de los controles nuevos dentro del renderer empaquetado. Los ejecutables de esta compilación no tienen firma Authenticode; la verificación de huellas comprueba integridad, no una identidad de editor certificada.

| Archivo | Bytes | SHA-256 |
| --- | ---: | --- |
| Tiancode.exe | 345265601 | `f1310c47fb9792e466c72f4501da6368514eef5c8f6e1b02d156f59cb5f18a6f` |
| Tiancode-portable.exe | 345038143 | `c2a85f8ad1b674e897b57e9eab71d55af1b27bba38c57211099cee52046201d5` |
| Tiancode.exe.blockmap | — | `090b0038425afa8922b9079bbdbde3ab10192a3a62692351d0180b7c9d02faf1` |
| latest.yml | — | `e3e9e5dded6ce74d135caba0fe41819241d927c87eb4ff7f10cd2d6be417199d` |
