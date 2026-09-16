# Auditoría de Tiancode 1.0.54

Fecha: 15 de septiembre de 2026. Base de trabajo: versión 1.0.53 publicada, commit `99ee962f`. La aplicación instalada al comenzar esta revisión era 1.0.53. No se reinició la aplicación ni su servidor para probar los cambios.

## Correcciones verificadas

La reaparición de xKiro tenía dos causas: una lista `disabled_providers` del proyecto reemplazaba la global durante la mezcla de configuración, y la interfaz anunciaba la desconexión antes de confirmar su persistencia. El backend une las exclusiones globales y las efectivas del proyecto. La interfaz guarda primero, elimina después la autenticación solicitada y refresca el catálogo; un guardado fallido conserva las credenciales. Los lectores del catálogo también respetan la exclusión global frente a una respuesta desactualizada.

Se mantiene la definición de un proveedor desconectado porque puede proceder de un proyecto o plugin y una omisión en una actualización parcial no la elimina. La exclusión persistida impide que la definición lo reactive. Una exclusión explícita del motor local también se respeta, aunque existan modelos descargados.

Sub-Agentes muestra únicamente los especialistas integrados. Sus interruptores guardan solo la propiedad de activación del agente elegido y confirman el éxito después del guardado. No vuelcan el catálogo combinado al archivo de configuración. Se conservan la búsqueda, el alcance, el estado y el último catálogo válido cuando falla una consulta. A petición del usuario se retiraron siete entradas heredadas de su configuración local, después de guardar una copia exacta; esa copia y los datos del usuario no se publican en GitHub. La actualización no borra automáticamente agentes de otras instalaciones.

El compositor mantiene una fila con Ultracode y nombres de modelo largos. En espacios estrechos agrupa acciones secundarias en un menú. Las pruebas miden la alineación, los límites y la ausencia de superposición de los botones, además de las alturas y visibilidad del menú de permisos, a 390, 520, 720 y 1000 píxeles.

La dirección visual seleccionada se persiste y acompaña el envío real al backend. La prueba de interfaz comprueba una selección, recarga la página y confirma que llega junto con Rápido y el esfuerzo `max`. No se presenta el selector como una conexión a DesignPrompts ni como un generador independiente del proveedor.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Aplicación, pruebas unitarias | 1019 pasan, 0 fallan |
| Aplicación, pruebas de entorno de navegador | 41 pasan, 0 fallan |
| Escritorio, suite completa | 173 pasan, 0 fallan |
| Backend, módulo de proveedores | 100 pasan, 0 fallan; timeout de 30 s por caso en Windows |
| Compositor, especialistas y desconexión en Chromium | 7 pasan, 0 fallan; compilación de producción, servidor HTTP aislado y respuestas API controladas |
| Tipos de aplicación, escritorio y E2E | Sin errores |
| Análisis estático de aplicación | 0 errores, 157 advertencias |
| Análisis estático de escritorio | 0 errores, 25 advertencias |
| Website | 12 documentos HTML; sin destinos locales ni anclas rotas, revisión visual móvil y navegación a novedades |

El caso de proveedor del backend usa el cargador y la configuración reales para demostrar que una lista de proyecto vacía no reactiva un proveedor excluido globalmente. El caso de interfaz incluye rechazo de escritura y recarga con un catálogo obsoleto. Las pruebas nativas compilan el host C#/PowerShell real y comprueban que no envía entrada ni registra una ventana cuando su PID no coincide con el autorizado.

## Fluidez

Se tomó como referencia el benchmark de producción 1.0.53 registrado antes de estas modificaciones. La primera medición 1.0.54 reveló una espera de carga en la pantalla Nueva sesión. Esta pantalla pequeña comparte las dependencias pesadas del compositor; cargarla con él elimina otra descarga en el primer acceso. Se verificó la modificación con tres repeticiones por escenario.

| Escenario | 1.0.53: primer contenido / estable | 1.0.54: primer contenido / estable, mediana de 3 |
| --- | --- | --- |
| Sesión no visitada | 16,3 / 40,7 ms | 16,4 / 50,6 ms |
| Nueva sesión | 51,9 / 57,3 ms | 15,6 / 42,1 ms |

Las seis ejecuciones finales no registraron fotogramas vacíos ni indeterminados. Rangos finales: sesión no visitada 14,9–18,3 ms hasta el primer contenido y 37,3–51,8 ms hasta estabilidad; Nueva sesión 14,5–18,5 ms y 41,5–48,2 ms. Son mediciones locales de navegación y no de velocidad de inferencia. No se afirma que todos los escenarios sean más rápidos; el tiempo estable de una sesión no visitada varió aproximadamente un fotograma respecto de la referencia única.

## Navegador, PC y datos

Chrome recibe únicamente URLs HTTP/HTTPS como un argumento de proceso, sin shell ni opciones de lanzamiento proporcionadas por la URL. La opción de enlaces se conecta al proceso principal mediante IPC. Las herramientas de IA continúan en el navegador integrado y conservan las comprobaciones de permisos y destino.

La restauración de ventanas utiliza los identificadores y procesos de ventanas que se controlaron, respeta las aplicaciones denegadas actuales y se puede desactivar. La finalización de sesiones inactivas solicita la parada del control. Hasta salir limpia los datos de las particiones del navegador durante el cierre normal; conserva la limpieza al iniciar como recuperación de un cierre inesperado. No afecta a las particiones de la interfaz principal, claves ni historial de Tiancode.

La revisión y las pruebas de esta versión no incluyen una nueva grabación con micrófono físico, una tarea facturada con cada proveedor, una restauración de ventanas de todas las aplicaciones de Windows ni la suite completa del monorepositorio. Las preferencias generales de texto, ancho y vista de transcripción, el dictado, la mejora del input y la actividad de vista previa se conservan de las versiones anteriores. No se certifica paridad completa con Claude Desktop ni ausencia de todos los errores posibles.

## Referencias y compatibilidad

La [evaluación de integraciones](integrations-1.0.54.md) explica los diez repositorios revisados, las adaptaciones incluidas y los requisitos que permanecen fuera del instalador. Se mantienen las correcciones de OpenCode 1.18.31 adaptadas en 1.0.53. El escritorio utiliza V1; la presencia de componentes V2 en el monorepositorio no significa que exista paridad completa ni una versión estable 2.0 de OpenCode incorporada.

## Publicación

La versión de escritorio es 1.0.54 y se construye con `TIANCODE_CHANNEL=prod`. Los archivos se validan antes de copiarlos a `install` y publicarlos. La distribución mantiene nombres estables y conserva los directorios de datos existentes. Los ejecutables no llevan firma Authenticode; las huellas verifican integridad, no una identidad de editor certificada.

La compilación de producción terminó correctamente. Se comprobaron la versión dentro de `app.asar`, las funciones nuevas en los módulos empaquetados, el hash CSP del tema, el SHA-512 y tamaño del instalador contra `latest.yml`, los iconos y la ausencia de cachés Python en los recursos MCP. La copia de los cuatro archivos a `install` se verifica mediante SHA-256.

| Archivo | Bytes | SHA-256 |
| --- | ---: | --- |
| Tiancode.exe | 345288553 | `e1178349df4acf1153d253b7da25e2c2ce3528ffc2cff7f1c8b6a92228846506` |
| Tiancode-portable.exe | 345061102 | `52c35d9f93552806b0184119a3b87bb143394f2a1657f777154cd276c3df7864` |
| Tiancode.exe.blockmap | 350040 | `5cd1c10b2295440489ac8b8c39a10c22c301728af9dc9580e9fb47000195078e` |
| latest.yml | 322 | `32d7726e89fb4961db278f3794504dd14033a58a2f8210b6780ba218fd1623be` |
