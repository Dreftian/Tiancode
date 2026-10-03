# TianCode 1.0.8 · evidencia de uso de la PC

Fecha: 3 de octubre de 2026. Plataforma de validación nativa: Windows, monitor físico 2560 × 1440. Captura entregada al modelo: 1800 × 1012. Referencia de capacidades: UI-TARS Desktop de ByteDance, Apache-2.0. La integración usa el agente y el proveedor de la conversación de TianCode.

## Validación de implementación

| Comprobación | Resultado |
| --- | --- |
| Operador, validación de argumentos y adaptador UI-TARS | 44 pruebas, 135 aserciones, sin fallos |
| Herramienta del modelo y puente de escritorio | 4 pruebas, 17 aserciones, sin fallos |
| Puente de previsualización y rutas HTTP | 21 pruebas, 82 aserciones, sin fallos |
| Conservación de perfiles y reconocimiento de datos existentes | 22 pruebas, 69 aserciones, sin fallos |
| Estado del actualizador y suscripciones | 10 pruebas, 25 aserciones, sin fallos |
| Tipos de Schema, backend/tiancode, frontend/app y frontend/desktop | Correctos; ejecutados desde sus paquetes con `bun typecheck` |
| Clientes | Generación de backend/client y SDK JavaScript mediante los scripts del repositorio |
| CLI Windows | Binario compilado ejecutado con `--version`: 1.0.8 |
| CLI macOS y Linux, x64 y arm64 | Compilación y empaquetado; no ejecutados en esos sistemas |

La prueba de contexto grande entrega 160 controles con nombres Unicode de 300 caracteres a la herramienta real. Comprueba que la salida sigue siendo JSON válido, mantiene la identidad de la captura, adjunta la imagen y comunica cuántos controles omitió para respetar su presupuesto de 32 KiB.

## Acciones reales en Windows

El script [qa-computer-use.ts](../../frontend/desktop/scripts/qa-computer-use.ts) importa el operador y el capturador de producción. Abre una aplicación de prueba propia en un perfil aislado y comprueba su estado después de enviar entrada nativa. No replica las acciones en JavaScript.

Se completaron 24 comprobaciones: enumeración y foco de ventana, captura y controles UI Automation, clic, rechazo de una captura ya consumida, escritura Unicode, atajo de teclado, doble clic mediante predicción UI-TARS, clic derecho, arrastre con liberación, desplazamiento en un punto, interrupción durante un arrastre, retirada de la luz azul y bloqueo por el interruptor principal. La interrupción y entrega del evento de liberación se observaron en 85 ms en la última ejecución; este valor es evidencia de esa ejecución, no una garantía de latencia.

El consentimiento está simulado únicamente en esta prueba y limitado al nombre de la aplicación propia. No constituye una prueba de la interacción humana con el diálogo. Las comprobaciones esperan la entrega asíncrona de los eventos de Windows antes de evaluar el estado de la aplicación.

Informe estructurado: [pc-control-1.0.8.json](pc-control-1.0.8.json). Captura real:

![Operador nativo de TianCode y bordes azules en una aplicación de prueba](../../frontend/website/img/app/computer-use-1.0.8.png)

## Interfaz y publicación

La interfaz del paquete usa un perfil de prueba separado de la instalación del usuario. Se verificaron la guía Observar / Actuar / Verificar, los permisos, la opción inicial «Monitor principal» y el texto de la versión. La web incorpora la guía, la imagen real, novedades, enlaces de descarga y traducciones de las nuevas funciones en español e inglés. La guía se comprobó a 390 × 844 y 1280 × 900, sin desbordamiento horizontal.

El instalador y portable se construyeron con `TIANCODE_CHANNEL=prod` y distribución GitHub. `verify:win-release` aprobó versión, archivos, iconos y recursos MCP. Sus nombres siguen siendo `Tiancode.exe` y `Tiancode-portable.exe`. Los archivos Windows no tienen firma de editor; SHA-256 y el SHA-512 de `latest.yml` verifican integridad.

La [release de la app 1.0.8](https://github.com/Dreftian/Tiancode/releases/tag/v1.0.8) se publicó como predeterminada y apunta al commit `eb62c6fbfa11e76489137483b6c02114c6f366e7`, disponible en `dev`. Se verificaron el tamaño y SHA-256 de los diez archivos: instalador, portátil, blockmap, `latest.yml`, cinco archivos CLI y `SHA256SUMS.txt`. El manifiesto descargado mediante la URL pública de actualización coincide exactamente con el archivo probado. El control previo al push también aprobó los 27 paquetes que tienen comprobación de tipos.

SHA-256 del instalador: `6aa72f26bf1db8358b57204bc5711b2161d64ef54ca83fbbf3ce9a770c0ccef5`.

SHA-256 del portátil: `a765cfbcb8dc6d5dfc1ed1d81afe5f33b87ca13dc001004ec305f28f302356ed`.

La web se publicó en `main` de `Dreftian/zenithai-web`, commit `e793bd13f4fb43c607911e7a659d7d4d06f6992a`. Vercel informó despliegue satisfactorio y se comprobó la [guía pública](https://tiancode.vercel.app/recursos/docs.html#pc-control), incluida la carga de la imagen real. La web también tiene su [release 1.0.8](https://github.com/Dreftian/zenithai-web/releases/tag/v1.0.8).

La instalación existente, todavía en 1.0.7, detectó 1.0.8 desde «Buscar ahora», descargó el instalador y mostró «La versión 1.0.8 está lista para instalar» con «Instalar y reiniciar». Los registros confirmaron la detección y la descarga. El proceso original conservó PID 14044 y su hora de inicio de las 11:10:52; no se instaló ni reinició la app.

Capturas locales de la interfaz final, el aviso del actualizador y la guía publicada están en `frontend/desktop/tmp/settings-1.0.8-final.jpg`, `frontend/desktop/tmp/update-1.0.8-ready.jpg` y `frontend/desktop/tmp/web-1.0.8-published.png`; el directorio de evidencias temporales está excluido de Git.

## Alcance de la evidencia

- Las acciones nativas y la luz azul se probaron en un monitor físico de Windows. Los orígenes negativos, capturas reducidas y bordes normalizados se comprueban con pruebas de las funciones de transformación; no se dispone de una segunda pantalla física para una prueba completa con escalas mixtas.
- La herramienta adjunta la imagen al contexto de la conversación. No se ejecutó una tarea con un proveedor externo de pago ni se usaron las claves de la instalación del usuario. La interpretación visual y el éxito de una tarea dependen del modelo con visión y herramientas seleccionado.
- UI Automation depende de la aplicación. Se marcan los campos de contraseña y no se leen sus valores; esto no garantiza reconocer todos los formularios sensibles de cada aplicación.
- El arrastre mantiene el proceso autorizado durante el recorrido. No se anuncia arrastre entre aplicaciones distintas, ni operadores remotos, Android o entrada nativa en macOS/Linux.
- Las pruebas de conservación usan perfiles aislados. No se ejecutó el instalador encima de la instalación del usuario y no se reinició su aplicación durante el desarrollo.
