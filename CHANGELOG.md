# Changelog

Todas las versiones notables de Tiancode se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

## [1.0.51] — 2026-09-13
### Los modelos locales nunca pudieron usar herramientas, y el optimizador se cancelaba solo

#### Modelos locales: había dos motores, y el chat usaba el roto
Activar un modelo GGUF y escribir «Hola» devolvía **«Cannot use tools with stream»** y tres
reintentos con espera creciente. La causa no era el modelo.

`provider.ts` cargaba una **segunda copia completa** del arranque del motor —181 líneas de búsqueda
de binario, descarga, lanzamiento y espera de salud— independiente de la que usa el botón del
Models Hub. El botón usaba la copia correcta; **escribir un mensaje usaba la otra**. Y esa otra
aceptaba el primer `llama-server.exe` que encontrara en disco sin comprobar su versión: comprobado
en la máquina real, un binario de **marzo de 2025** seguía en la caché y le ganaba al que viene
dentro del instalador. Ese binario antiguo es justamente el que rechaza herramientas y streaming a
la vez. La copia duplicada se elimina y queda un solo motor, con un test que impide que el
provider vuelva a lanzar procesos por su cuenta.

Además, ese error llega como HTTP 500 y la política de reintentos trataba **todo** 5xx como un fallo
pasajero: por eso el «reintentando en 8s · intento n.º 3» para un error de configuración que jamás
iba a resolverse solo. Ahora falla al primer intento y deja ver el mensaje real.

El motor también dejó de mentir sobre sí mismo: no vuelve a escribir «tengo la build 10679» encima
de un binario que no consiguió reemplazar (copiar sobre un `llama-server.exe` en ejecución falla en
Windows), un puerto sano cuyo proceso hijo ya murió deja de adoptarse como propio, y sólo un 503 que
de verdad dice «cargando modelo» abre la ventana larga de espera — antes, cualquier cosa escuchando
en el 58282 podía retener la petición quince minutos.

#### El botón de mejorar prompt: el arreglo anterior era correcto y aun así fallaba
1.0.50 corrigió el `InstanceRef` de verdad — en el registro de la app se ve la petición **saliendo
bien**, con el modelo correcto, y luego silencio. Lo que la mataba era un plazo fijo de **30
segundos en el cliente**. GLM-5.3 razona antes de escribir, el servidor filtra el razonamiento fuera
del cuerpo, y el navegador recibe **cero bytes** mientras el modelo piensa: a los 30 s se abortaba
un flujo perfectamente sano.

Se midió algo que nadie había comprobado: este servidor **no** vacía las cabeceras antes de llamar
al modelo, así que `fetch()` no resuelve hasta el primer byte. Por eso el plazo se sustituye por un
temporizador de inactividad que se reinicia con cada byte, y el servidor emite una señal de vida
cada 5 segundos mientras el modelo piensa. Esa señal es **opcional y se pide explícitamente**, de
modo que cualquier otro cliente recibe exactamente el mismo cuerpo de antes.

#### Borrar un modelo local y que se vaya de verdad
Borrar el `.gguf` lo dejaba en Proveedores, en Modelos y como modelo por defecto. Dos causas
independientes: el borrado limpiaba la configuración **del proyecto** mientras la activación escribe
la **global**, y aun en el archivo correcto no podía funcionar, porque la actualización de
configuración es una fusión profunda — puede añadir y sobrescribir, **nunca borrar**. Omitir la
clave era, por construcción, no hacer nada.

Ahora hay un borrado real en el servidor que quita el modelo de ambos archivos, elimina el proveedor
cuando se queda sin modelos, y **limpia el modelo por defecto** si apuntaba al que ya no existe.
También se corrige lo que lo mantenía visible en «Modelos» aunque todo lo anterior fuera bien: la
lista inyectaba los modelos locales de la configuración sin pasar por el filtro del servidor.

#### Sub-Agentes: crear uno, y ver los que ya tienes
El panel sólo mostraba una lista fija escrita a mano. **Tus nueve agentes en disco —Backend,
Dreftian, Dreitz, Frontend, Hao, King, Seguridad, Tian y Vision— no aparecían en ninguna parte.**
Ahora se listan, y se pueden **crear** (a mano, o describiendo lo que quieres y dejando que un
modelo redacte el identificador, el cuándo usarlo y el prompt, siempre para revisar antes de
guardar) y **borrar**.

Los agentes creados desde el panel ya no salen mutilados: el formulario muestra nueve permisos y el
servidor denegaba quince, así que un agente nuevo no podía listar un directorio, preguntar ni
delegar. Y la columna de herramientas decía la verdad en muy pocos casos — `plan`, que hereda todo
menos editar, mostraba «1 tools»; ahora calcula el conjunto efectivo y además concuerda en plural.

#### El «Árbol de Recursión RLM» era una maqueta
Se montaba sin datos, así que **siempre** dibujaba los mismos cuatro agentes inventados con estados
inventados («Activo», «Completado») y resultados inventados («0 vulnerabilidades detectadas») sobre
trabajo que nunca ocurrió. Se reconstruye con la jerarquía real: agentes primarios y, debajo, los
sub-agentes a los que de verdad pueden delegar según sus permisos —incluidas las denegaciones por
destino, que la primera versión del arreglo todavía se saltaba—. Sin estados, sin duraciones, sin
resultados: el panel no puede saberlos. Empieza plegado y pagina, en vez de volcar 150 filas. Se
borra también `agent-swarm-graph`, la otra maqueta del mismo tipo, que ya no se renderizaba.

#### De la carpeta Mejoras
Dos piezas, ambas MIT y con su atribución. **Certificados del sistema en Windows**: el proceso
principal ya los mezclaba, pero sin filtrar caducados y deduplicando por texto; ahora filtra por
fecha y por huella, y —esto importaba— la rama de macOS/Linux ya no puede dejar el almacén de
confianza **vacío** si la API no existe.

**Reparación de argumentos de herramientas** con comillas tipográficas y entidades HTML (un fallo
conocido de xAI/Grok). Aquí hubo que ir más lejos que el original: un fuzz diferencial encontró
**1.268 casos en los que la versión portada devolvía un resultado silenciosamente incorrecto**
donde antes fallaba de forma ruidosa —incluyendo borrar comas de dentro del contenido de un archivo
a punto de escribirse—. Tras el arreglo son **0 por la vía de las comillas**, y en una prueba de
emisión realista pasa de 0/6000 a **6000/6000** correctos.

#### Calidad
Typecheck 27/27 · Lint 0 errores · 168 tests de escritorio.

## [1.0.50] — 2026-09-12
### El botón de mejorar prompt fallaba el 100 % de las veces, y ya sabemos por qué

#### El optimizador nunca funcionó
No era tu modelo, ni la variante «Max», ni el modo 2x. **Fallaba siempre, con cualquier
configuración.** La respuesta se entrega como un flujo perezoso, y el servidor sólo tira de él
*después* de que el handler haya retornado — momento en el que ya se cerró el ámbito que le inyecta
el contexto de la instancia. Moría con «InstanceRef not provided» antes de que un solo byte saliera
hacia el proveedor, y el capturador de errores lo disfrazaba de fallo del modelo.

Lo peor es por qué no lo detectó nadie: ese contexto es una referencia **con valor por defecto**, así
que su tipo dice `never` y el comprobador de tipos no ve nada que falte. Compilaba perfecto y
fallaba siempre. Ahora el flujo lleva su propio contexto en vez de pedirlo prestado a la petición,
sigue llegando palabra a palabra, **y va con un test HTTP contra la ruta real** que reproducía el
fallo exacto (`\0unknown`, cero texto) antes del arreglo. No había ninguno.

De paso: un modelo que sólo emite razonamiento y ningún texto producía el mismo cuerpo vacío que un
fallo, y se anunciaba como «no dijo nada». Ahora es un caso propio.

#### Iconos del chat que se pisaban
Medido: el grupo izquierdo (agente, modelo, variante) ocupa **315 px rígidos a cualquier ancho** y
ninguna etiqueta se recorta **nunca**, así que a partir de 505 px invade el grupo derecho. Tres
cerrojos en serie, y el primero es exactamente el mismo bug que las filas de ajustes de esta misma
versión: **a los botones se les fijó el ancho pero no el `flex`**, y además cada control va envuelto
en un contenedor de tooltip que lo vuelve a clavar. Ahora hay una escalera por ancho del compositor
—no de la ventana, que puede ser ancha con el panel estrecho— las etiquetas se recortan con puntos
suspensivos, y el botón de enviar sobrevive a cualquier tamaño.

#### Ajustes de General que no hacían nada
Tenías razón, y el peor de todos era **«Crear respaldo»**: llamaba a un método que el preload nunca
expuso, así que la llamada se tragaba en silencio y te decía **«no hay datos que respaldar»** — una
mentira sobre tus propios datos. Ahora respalda de verdad, y el mensaje vacío sólo aparece cuando de
verdad no hay nada.

Se borran dos interruptores muertos (**Terminal** y **Navegador interno**): sus únicos lectores
viven en una rama de la interfaz vieja que ya es inalcanzable. Y dos descripciones pasan a decir la
verdad: el respaldo automático **se aplica en el próximo inicio**, y «Mostrar agente» **no oculta
nada en proyectos que definen sus propios agentes**.

#### Desbordes y la tarjeta de GitHub
El botón «Vetar» se salía de la ventana por una causa concreta: el campo de texto lleva
`flex: none` y sólo se le sobrescribe el ancho, así que el hueco se dimensiona al tamaño intrínseco
del campo y empuja fuera el espacio y el botón entero — que el panel luego recorta. Medido: 63 px
fuera en «Vetar», 78,6 en «Permitir», y **210,9 en una fila de Conexiones que nadie había
reportado**. Hay ya una clase compartida para «campo + botón», que era justo lo que faltaba.

La tarjeta de GitHub medía 757 px en un hueco de 608. Recortar márgenes no bastaba, así que se parte
en dos columnas: el formulario a la izquierda, las capacidades al lado. Sin scroll y con margen a
cualquier tamaño.

#### Borrado: hacer todo lo posible
Cuando le das permiso para borrar y Windows se niega, ahora **escala en vez de rendirse**: reintenta,
quita el atributo de sólo lectura, **identifica qué proceso retiene el archivo** mediante el Restart
Manager (sin administrador y sin herramientas externas) y te dice su nombre y PID, programa el
borrado para el próximo arranque, y sólo si se lo pides explícitamente ofrece cerrar el proceso que
lo bloquea. Un borrado parcial ya no aborta al primer archivo bloqueado: los otros nueve mil se
borran igual.

**Una corrección a la premisa:** Tiancode no bloqueaba nada. Se comprobó en tu máquina que con
permisos totales Windows sigue rechazando el borrado, porque es un bloqueo obligatorio del sistema —
y en tu caso lo sostenía la propia app que lanzaste desde `release\win-unpacked`. Por eso no hay
interruptor de «sin restricciones»: habría sido un control conectado a nada. Cuando quien bloquea es
Tiancode mismo, ahora te lo dice en vez de fingir.

#### Voces
Se buscó de nuevo, más ancho, y **midiendo**: descargué las muestras de cada voz y calculé su
frecuencia fundamental en vez de fiarme del nombre. Resultado: las seis etiquetas de sexo del
catálogo eran correctas y los rechazos anteriores también (`ald` 138,7 Hz, `carlfm` 117,9 Hz y
`davefx` 124,6 Hz son voces masculinas; `sharvard` sólo es femenina en su segundo hablante, que es el
que ya se usaba).

Piper para español está agotado — existen nueve voces y están todas evaluadas. Pero **fuera de piper
apareció una mejor**: se sustituye la más floja del catálogo (16 kHz, calidad «low», afinada desde
una voz inglesa) por **Karen Savage (es-MX)**, de 22 kHz, sexo verificado y con licencia que permite
uso comercial. Daniela (Argentina) se mantiene, como pediste.

Lo que **no** se puede: DeepSeek nunca ha publicado un modelo de voz. Qwen sí, y es Apache-2.0, pero
no tiene ninguna voz en español — sus cuatro timbres femeninos son chino, chino, japonés y coreano —
y además el motor de Tiancode no puede ejecutarlo: haría falta un segundo runtime de inferencia de
más de 600 MB para sonar peor que los modelos de 63-114 MB actuales.

Typecheck 27/27 · Lint 0 errores · 927 tests de frontend · 153 de escritorio · 83 de backend.

## [1.0.49] — 2026-09-12
### La bienvenida vuelve tras cada actualización, y «Uso de la PC» por fin controla algo

#### Asistente de bienvenida
- **Ahora vuelve a salir cuando actualizas**, no sólo en la primera instalación. Pero no te va a
  volver a preguntar todo: tras una actualización es **una sola pantalla de confirmación** con tus
  respuestas anteriores ya marcadas —leídas de los ajustes reales, no de una copia— y un único
  botón. En una instalación nueva sigue siendo el asistente completo de dos pasos.
- **El portable ya se comportaba como pedías** y no hizo falta tocarlo: guarda su estado en
  `<carpeta del .exe>\data`, así que viaja con el pendrive y sale una vez por pendrive.
- **Dos preguntas nuevas, y las dos gratis**: mascota de escritorio y leer las respuestas en voz
  alta. La de voz usa el ajuste que recurre a las voces de Windows cuando no hay modelo descargado,
  así que **no dispara ninguna descarga** — habría deshecho justo lo que quitamos en 1.0.45 y 1.0.46.
- **Cuatro ajustes que no guardaban nada.** El asistente escribía `tiancode.sound.enabled`,
  `tiancode.autoupdate.enabled`, `tiancode-lang` y `tiancode-theme`; ninguna de las cuatro claves se
  lee en ningún sitio del programa. Fuera.
- **Había DOS asistentes de bienvenida vivos**, con dos puertas distintas: este diálogo (gated por
  `localStorage`) y otro flujo completo en el proceso de escritorio (gated por otra clave). El
  segundo no se veía nunca porque el primero corre antes y marca su clave — salvo que las dos se
  desincronizaran. Se elimina, con cuidado: hacía dos cosas más en **cada** arranque que había que
  conservar, y una de ellas mantenía la pantalla de carga esperando.
- **Medido a 1025x560**, que es lo que pediste: paso 1 = 311 px de alto contra 528 disponibles, y la
  pantalla de carga deja 138 px de holgura bajo el emblema. Nada se corta ni se desplaza.

#### «Uso de la PC»: ahora todos los controles hacen algo
La versión 1.0.47 añadió la herramienta de ratón y teclado **sin ninguna interfaz**. Ya la tiene, y
el panel entero se reconstruyó bajo la misma regla de siempre: si no puede hacerlo, no se pone.

- **Permiso del navegador.** Aquí había una trampa que conviene explicar: el valor por defecto del
  sistema de permisos es `"*": "allow"`, así que **hoy el agente puede leer y manejar el navegador
  integrado en cualquier sitio sin preguntar nunca**. Una lista de «sitios permitidos» encima de eso
  habría mostrado dos entradas mientras en realidad estaban todos permitidos. Ahora hay un control
  de tres valores y elegir «preguntar en cada sitio» escribe la regla base de verdad. **Es un cambio
  de comportamiento**: a partir de ahí te preguntará donde antes no lo hacía.
- **Sitios permitidos**: listar, añadir y revocar. Con dos honestidades escritas en el propio panel:
  los «Siempre» que aceptas dentro de una sesión **no se guardan en disco**, así que no aparecen aquí
  y se pierden al cerrar; y si la regla general está en «permitir», la lista no cambia nada.
- **Dónde se abren los enlaces**, navegador integrado o el del sistema.
- **Cookies del navegador integrado**: siempre, o hasta que cierres Tiancode. **Sólo dos valores**,
  porque Electron no deja cambiar la partición de un webview una vez ha navegado. Y se limpian **al
  arrancar**, no al salir: los manejadores de salida son síncronos y el borrado es asíncrono, así que
  hacerlo al salir a veces no llegaba a ocurrir.
- **Interruptor maestro del control del ordenador**, y **guardado fuera del archivo de proyecto**:
  `tiancode.json` es un archivo del repositorio que el propio agente puede reescribir con la
  herramienta de edición, así que un interruptor que viviera ahí sería editable por aquello que
  restringe.
- **Lista de ejecutables denegados**, persistente, aplicada junto al rechazo de gestores de
  contraseñas que ya existía. Se compara por **nombre de ejecutable**: dos programas con el mismo
  nombre de archivo son indistinguibles y renombrarlo lo esquiva. El panel lo dice.

**Lo que me negué a poner, y por qué:** un interruptor único que cubriera «servidores de desarrollo +
navegación + capturas» (las herramientas integradas no pasan por el filtro de permisos, así que nada
puede impedir que el agente arranque un dev server); un selector de «navegador preferido» con Chrome
(nada aquí controla un navegador externo, y Chrome y Edge rechazan el puerto de depuración sobre el
perfil por defecto, así que sólo podría manejar uno sin tus sesiones); y «mostrar aplicaciones al
terminar» (Tiancode nunca oculta una aplicación — el proceso auxiliar no tiene ninguna función de
manipulación de ventanas, sólo entrada y lectura).

**Y se borró `browser.tsx` entero**: sus tres interruptores estaban fijados en «activado» con un
manejador que sólo mostraba un aviso de éxito. Ni leían ni escribían nada. El archivo además ya
estaba huérfano.

#### Vista de transcripción
Un ajuste **Normal / Pensando / Detallado** en Ajustes → Apariencia, con **anulación por sesión**
desde el menú de la conversación. Sustituye a los tres interruptores sueltos que había: mantenerlos
al lado habría sido peor, porque escriben lo mismo y el último que tocaras dejaría al otro mostrando
un valor falso. «Detallado» abre además las tarjetas de herramienta que antes no podía abrir ninguna
combinación de los interruptores viejos.

Typecheck 27/27 · Lint 0 errores · 927 tests de frontend · 150 de escritorio · 98 de session-ui.

## [1.0.48] — 2026-09-12
### La vista previa por fin te dice qué pasó, y el asistente de bienvenida cabe en la pantalla

#### Cuando algo falla, ahora se ve
Lo que hacía que la vista previa pareciera poco profesional no era el diseño: eran los momentos en
que algo iba mal.

- **Una compilación fallida no mostraba absolutamente nada.** El servidor marcaba el fallo y
  guardaba hasta 20 errores con archivo y línea — y la interfaz no los leía nunca. Ahora salen en un
  panel, cada uno como `src/App.tsx:12 — mensaje`, **y la ubicación es pulsable**: te lleva al
  archivo en la pestaña Código. Con botones para reintentar y para mandárselos al agente.
- **Y encima los etiquetaba mal**: un error de compilación se mostraba como «No se pudo cargar
  {url} — ¿está el servidor arrancado?», cuando el servidor estaba perfectamente.
- **«Starting…» era una palabra sola sobre un panel en blanco durante un minuto.** El log del
  servidor ya se estaba descargando y se tiraba a la basura, porque la consola sólo se dibujaba para
  proyectos de escritorio. Ahora se ve mientras arranca o compila.
  **Con censura de secretos**: ese log es el que imprime tu propio proyecto, así que se enmascaran
  valores de variables tipo `*_TOKEN` / `*_SECRET` / `*_PASSWORD`, cabeceras `Bearer`, URLs con
  contraseña y formatos conocidos (`sk-…`, `ghp_…`, JWT). Se enmascara el valor, nunca la línea, y
  antes de mostrarlo, así que lo que copias al portapapeles ya va limpio.
- **El punto de estado se ponía verde cuando no había nada corriendo**, con la etiqueta «Fit»
  (que es el control de zoom). Verde y «Fit» se leen como «tu app está funcionando».

#### Ahora se puede leer
Los avisos de error estaban en **1,24:1 de contraste** sobre el tema claro que la app usa por
defecto — el botón «Reparar con IA», el interruptor del inspector, la franja de error de ejecución.
El mínimo accesible es 4,5:1. Se midieron uno a uno los reemplazos en vez de confiar en los tokens:
de hecho el par de aviso «warning» **tampoco pasa** (2,35:1), así que no se usó. Ahora van entre
5,2:1 y 17:1.

También: los tres indicadores de estado tienen ya un hueco de ancho fijo, así que el selector de
dispositivo y el zoom dejan de deslizarse cada vez que el agente escribe un archivo; y hay guarda de
`prefers-reduced-motion`, que este archivo era el único sin ella.

#### La pestaña Código
- **El resaltador estaba hecho a mano y se equivocaba**: un simple `// don't` dejaba las cuatro
  líneas siguientes pintadas de verde (la comilla abría un literal que nunca se cerraba), ignoraba
  los comentarios `#` de Python, y regeneraba 192 KB de HTML en cada pulsación de tecla. Sus 15
  colores fijos fallaban todos el contraste sobre fondo claro.
  Se sustituye por el visor que este repo ya trae — con shiki, tema por variables CSS, virtualización
  para archivos grandes y modo diff. **Las líneas para conectarlo llevaban tiempo ahí, sin usar.**
- La edición no se pierde: pasa a un botón explícito, con un editor sin HTML inyectado, y el
  autoguardado a los 500 ms sigue igual. El botón «Guardar» era decorativo — el autoguardado limpiaba
  el estado antes de que a nadie le diera tiempo a pulsarlo — y ahora dice si está guardando.
- **«Renombrar» no renombraba.** El backend sólo sabe escribir: no hay mover ni borrar, así que
  escribía el contenido en la ruta nueva y dejaba el archivo original. Ahora se llama «Guardar en
  otra ruta», que es lo que hace.
- Fuera 125 líneas de insignias de archivo hechas a mano, con 8 emojis teñidos con clases de color
  que a un emoji no le hacen nada. Cada fila ya tenía su icono real al lado.

#### Asistente de bienvenida
Más bonito, y sobre todo **la mitad de alto**: de ~500 px a ~250 px. Importa porque la app lo abre
en una ventana de 600 px — **el primer paso no cabía y salía con barra de desplazamiento**.

- **De 3 pasos a 2.** El paso del proveedor preguntaba un sí/no cuyo «no» cuesta una tecla y cuyo
  «sí» es la única respuesta útil en una instalación nueva, que no tiene ningún proveedor. Ahora se
  abre siempre, y el asistente lo dice en vez de hacerlo por sorpresa.
- **Un fallo real que llevaba ahí desde siempre**: para decidir si pintar en claro u oscuro
  comparaba el ajuste `"system"` con `"dark"`, y eso nunca es cierto. En un equipo con tema oscuro,
  **la primerísima pantalla que ve alguien se pintaba entera en claro sobre un fondo negro.** El
  fondo que la rodea tenía exactamente el mismo error al revés. Los dos usan ya el token del tema.
- Otro: escribía el modo de color en `data-theme`, que guarda el **identificador del tema**, no el
  modo. Eso desactivaba las reglas de color de sintaxis hasta el siguiente repintado.
- Controles a mano sustituidos por los del sistema de diseño, todo con tokens, progreso legible de
  un vistazo, y adaptable por consulta de contenedor en vez de por ancho de ventana.

#### GitHub
La tarjeta se salía por arriba del panel. Al crecer con la sección de capacidades, un contenedor
centrado que desborda **recorta por igual arriba y abajo**, así que el logo y el título quedaban
fuera de la zona visible y no había forma de subir hasta ellos. Ahora se centra sólo cuando cabe, y
tiene margen garantizado a cualquier tamaño de ventana.

Typecheck 27/27 · Lint 0 errores · 927 tests de frontend (+21) · 144 de escritorio · 54 del puente.

## [1.0.47] — 2026-09-12
### Seguridad: el agente ya no puede leer una página que tú no ves. Y sí puede usar tu PC

#### Lo primero: cuatro agujeros en el puente de la vista previa
Una auditoría de la pregunta «¿puede cualquier modelo usar el Sandbox con seguridad?» encontró que
la respuesta era **no**, y por qué. Esto venía publicado desde antes; va corregido aquí.

- **El agente podía leer y pulsar una página que tú no estabas viendo.** La única comprobación para
  decidir sobre qué frame actuar era «¿es http o https?». No se comparaba el origen. Y la Vista en
  vivo es un navegador completo: tiene barra de direcciones y cookies persistentes. Al arrancar un
  dev server local, la vista nativa se **ocultaba sin cambiar de página**. Secuencia real: navegas a
  un sitio donde tienes sesión → arrancas tu proyecto → el modelo llama a `preview_inspect` → y
  recibe la URL, el título, 4.000 caracteres de texto visible y todos los elementos interactivos de
  **la página oculta con tu sesión iniciada**. `preview_interact` la pulsaba. Sin pedir permiso.
  Ahora el origen esperado manda: si no coincide, no hay superficie. Y una vista oculta se manda a
  `about:blank` en vez de quedarse aparcada en tu sitio.
- **Ninguna de las dos tools de vista previa pedía permiso.** Leer y pulsar una página viva estaba
  menos vigilado que `glob`. Ahora piden permiso nombrando el **origen concreto**, así que un «sí»
  para este proyecto no es un «sí» para la siguiente página que se abra.
- **Aceptar una captura inofensiva concedía la pantalla completa para siempre.** La tool de captura
  pasaba `always: ["*"]`, y el sistema de permisos apunta una regla por patrón: aprobar una captura
  de *ventana* escribía una regla que también valía para *pantalla*.
- **Un clic del modelo podía abrir tu navegador real en cualquier URL.** `navigate` sí estaba
  bloqueado al origen, pero un clic sobre un enlace no: un `target="_blank"` terminaba en
  `shell.openExternal`. Ahora se deniega mientras hay una acción del agente en curso.

#### «Uso del navegador»
El navegador integrado ya era alcanzable por el agente — **por accidente**, como último candidato
del árbol de frames, sin permiso. Eso se acabó, y en su lugar hay algo deliberado: las tools aceptan
`surface: "browser"`, preguntan al navegador **qué página tiene abierta** y piden permiso citando
ese sitio antes de tocarlo. Sesión tuya, permiso por sitio.

*Sobre el navegador externo, la respuesta honesta es que no se puede como tú esperarías:* comprobé
Chrome 153 y Edge 153 en esta máquina y **ambos rechazan `--remote-debugging-port` sobre el perfil
por defecto**. Sólo se puede automatizar un perfil desechable sin tus sesiones, que es justo lo que
quita el sentido. Por eso el objetivo es el navegador integrado.

#### «Uso del computador» — nuevo, y real
Una tool `computer` que mueve el ratón y escribe de verdad en Windows: `move`, `click`, `type`,
`key`, `scroll`, más leer la posición del cursor y la ventana en primer plano. Sin dependencias
nuevas y sin addon nativo: un proceso PowerShell **persistente** con user32 — 0,05 ms por acción
frente a 310 ms si se lanzara uno por acción.

Las protecciones son la función, no un extra, y se aplican en el proceso principal:
- **Rechaza ventanas elevadas.** Windows descarta la entrada sintética hacia un proceso con más
  privilegios *devolviendo éxito*, así que el agente creería haber hecho clic. Se comprueba antes.
- **Rechaza su propia ventana**, para que no pueda pulsar los botones de su propio diálogo de
  permiso.
- **Lista de apps permitidas**, vacía al empezar. La primera acción abre un diálogo nativo que
  nombra la app; y como ese diálogo roba el foco, se **vuelve a leer** la ventana activa después: si
  cambió, no se ejecuta.
- **Indicador siempre visible y botón de parada**, más un atajo global. Al parar se sueltan los
  modificadores, se mata el proceso y se olvida la lista. Caduca sola a los 2 minutos de inactividad.
- El permiso usa `patterns: [acción]`, así que aprobar `scroll` para siempre nunca se convierte en
  aprobar `type` para siempre.

Es **sólo Windows** en esta v1, y lo dice explícitamente en macOS y Linux en vez de fallar raro.

#### Ajustes de transcripción, al estilo Claude Code
**Tamaño del texto** (pequeño / medio / grande) y **ancho de la transcripción** (estrecho / medio /
ancho), en Ajustes → Apariencia. Dos honestidades en la letra pequeña: el ancho sólo aplica en
ventanas de 768 px o más, y lo dice; y para que «grande» no fuera un ajuste roto se escalaron los
30 tamaños de fuente fijos de los mensajes. «Medio» reproduce exactamente lo de hoy, así que quien
no toque nada no ve ningún cambio. De paso se recupera un ajuste `fontSize` que existía sin que
nadie lo leyera, en vez de dejar dos controles de tamaño.

Typecheck 27/27 · Lint 0 errores · 906 tests de frontend · 144 de escritorio · 54 del puente.

## [1.0.46] — 2026-09-12
### El botón de optimizar usa tu modelo, el micrófono deja de descargar a tus espaldas

#### El botón de mejorar el prompt ahora sí usa el modelo que tienes puesto
En 1.0.45 quitamos el falso optimizador local, así que ya sólo responde el modelo. Faltaba lo demás:

- **Tu nivel de razonamiento se descartaba en tres sitios a la vez.** El payload no tenía campo para
  la variante, el botón no la enviaba, y el handler pasaba `small: true`, que además de descartar la
  variante sustituye las opciones del proveedor por las de menor esfuerzo del modelo. Elegir «Max»
  en la barra del prompt no cambiaba nada aquí. Ahora la variante viaja, y `small` sólo se aplica
  cuando el servidor eligió el modelo por su cuenta: si lo elegiste tú, se respeta tu esfuerzo.
- **Un modelo que no resolvía te daba texto de otro modelo sin avisar.** El `getModel` inicial estaba
  envuelto en un catch que se tragaba el error y caía al modelo pequeño de otro proveedor. Ahora, si
  nombraste un modelo y no está disponible aquí, se te dice, con un atajo para elegir otro.
- **«Tu clave fue rechazada» y «el modelo no dijo nada» eran el mismo mensaje.** Las cabeceras 200 se
  envían antes de llamar al modelo, así que un fallo a mitad de stream sólo podía cerrar el cuerpo.
  El backend añade ahora un centinela con el motivo y el cliente lo lee: credenciales, límite de
  peticiones, saldo agotado y «no produjo nada» son cuatro mensajes distintos.

#### El micrófono: ya transcribía, pero se portaba mal
Conviene decirlo claro: **el botón no era un adorno**. Transcribe en local, sin conexión y en
español, con Whisper vía sherpa-onnx. Lo que estaba mal era todo lo de alrededor.

- **Descargaba 146 MB sin preguntar.** Abrir una sesión disparaba `ensure()` en el montaje: sin
  consentimiento, sin barra de progreso y sin ajuste que lo impidiera. Justo después de que 1.0.45
  quitara 644 MB de descargas de voces no pedidas. Ahora se pide en el primer clic, diciendo el
  tamaño, y el progreso se ve en el botón — usando un canal IPC que ya existía y nadie escuchaba.
- **El tamaño declarado estaba mal**: el código decía 100 MB y un comentario 150; en disco son 146.
  Ahora se calcula a partir de los bytes reales, así que la cifra que aceptas no puede desviarse.
- **Dictar borraba lo que habías escrito.** Reemplazaba el compositor entero. Ahora se añade al
  final, y de paso deja de tirar las imágenes adjuntas.
- **Congelaba la app 1–2 segundos en cada dictado**, porque decodificaba de forma síncrona en el
  proceso principal. Se movió a un proceso aparte, con el mismo patrón que ya usaban las voces; si
  ese proceso muere, el micrófono se suelta en vez de quedarse escuchando para siempre.
- **Cortaba en silencio a los 64 segundos.** Ahora se detiene a la vista y te lo dice.
- **Sólo entendía español e inglés** aunque el modelo cubre 99 idiomas: japonés, coreano, ruso y
  chino se decodificaban como inglés.
- **El campo del diccionario de dictado era ilegible** en el tema claro — texto gris sobre gris, con
  un contraste de 1,1:1. Es el propio campo de la función.
- **Dos ajustes de atajo no hacían nada**: nadie leía lo que guardaban y el atajo real estaba fijado
  en el código. Borrados.
- **Un texto de privacidad que no era cierto**: decía que «tus últimas 20 grabaciones se guardan en
  este dispositivo». No se guarda ningún audio, sólo el texto. Corregido en los siete idiomas.

#### La cabecera «Vista previa / Código»
Los saltos que había se disparaban a la vez y contra una caja que no crecía: al llegar a cierto
ancho aparecían los atajos, se ensanchaba el chip de carpeta y salía la etiqueta «Sandbox», los tres
a la vez. Y la pestaña no se encogía: el contenedor central tenía base 0, así que nunca entraba en
el reparto de espacio y la pastilla se **cortaba a media palabra**, sin puntos suspensivos y sin
poder pulsar el trozo cortado. Ahora hay una escalera real de cinco pasos, las pestañas se reducen a
icono en los anchos pequeños conservando su nombre accesible, y la tira de cuatro emojis de
dispositivo pasa a ser un menú: recupera ~100 px, y gana el estado seleccionado que antes se
señalaba con un color aplicado a un emoji, que no hace nada.

#### GitHub
- **Centrado de verdad.** La tarjeta se quedaba arriba de un panel alto porque nada la centraba en
  vertical, y medía 1040 px envolviendo una columna de 480. 
- **Era invisible en el tema claro**: el logo y el título estaban fijados a `#ffffff` sobre un panel
  blanco. Todo el panel pasa a tokens.
- **Ahora explica qué te da conectar**, con seis capacidades verificadas contra el código —
  empezando por la más útil, clonar un repositorio privado y abrirlo como proyecto. No se menciona
  nada de issues, pull requests, forks ni Actions, porque ese token no los usa.
- **La insignia de permisos era una mentira**: mostraba `repo · read:user` fijo, con el título
  «permisos activos del token», mientras nadie leía los permisos reales. Ahora lee la cabecera
  `x-oauth-scopes`, y cuando no llega (tokens de grano fino) lo dice en vez de inventarse un juego.
- **Los contadores eran de los primeros 30 repos presentados como totales.** Ahora se pagina de
  verdad, y si se alcanza el tope se muestra «N+» en lugar de un total falso.
- **Una fuga de credenciales real.** Ante un fallo de arranque de git (git ausente, timeout), la
  línea de comandos completa acababa pintada en el aviso de error — y ahí viaja el token en base64,
  que es codificación, no cifrado. Se redacta ahora en el único punto por el que pasan todas.

Typecheck 27/27 · Lint 0 errores · 906 tests de frontend · 113 de escritorio.

## [1.0.45] — 2026-09-12
### Las imágenes llegan al modelo, los paneles dejan de mentir y seis voces en español

Nueve áreas investigadas contra el código real y después implementadas. El hilo común: donde había
un control que prometía algo que el código no hacía, o se ha cableado de verdad o se ha borrado.

#### Imágenes en el chat — tres causas distintas, las tres corregidas
- **El renderer enviaba una URL que no era un data URL.** `blobDataUrl` tenía dos respaldos rotos:
  uno abría IndexedDB buscando un almacén que en el escritorio no existe (ahí el borrador va por
  IPC), y el último devolvía la `blob:` URL tal cual, o un `data:image/png;base64,` vacío. El
  backend recibía eso y fallaba con "Image URL must be a base64 data URL". Ahora el Blob se guarda
  en memoria mientras vive el borrador y se lee de ahí primero; si de verdad no se puede recuperar,
  falla con un aviso legible en vez de enviar basura.
- **Un error de imagen tumbaba el prompt entero.** Sólo se capturaba `ResizerUnavailableError`; los
  demás escapaban al canal de error y mataban el mensaje completo. Ahora cada adjunto falla por su
  cuenta y se sustituye por una nota, así el resto del prompt sí se envía.
- **El redimensionador estaba muerto en las builds empaquetadas.** El parche de photon lee
  `__OPENCODE_PHOTON_WASM_PATH` y el código escribía `__TIANCODE_PHOTON_WASM_PATH`, así que el
  módulo caía a un `__dirname` que apunta al `node_modules` de la máquina de compilación. Resultado:
  ninguna imagen se redimensionaba nunca y una captura 4K salía al proveedor a tamaño completo, que
  respondía con un 400 imposible de rastrear. Corregido en los dos resizers, con la ruta resuelta en
  tiempo de ejecución.
- **Modelos que sí leen imágenes y decían que no.** El filtro de capacidades ignoraba la bandera
  `attachment` del catálogo: 175 modelos la traen sin declarar la modalidad `image`. Ahora se
  consulta, y de paso la ruta local del archivo deja de viajar al proveedor dentro del nombre.

#### El error al actualizar con un proyecto abierto
- **"UnsupportedContentType" era literalmente el nombre del enum.** `ClientError` usa el motivo como
  mensaje y el formateador lo dejaba pasar tal cual. Ahora se traduce a prosa en los siete idiomas.
- **`retry()` no podía reintentar precisamente esos errores**, porque comparaba el mensaje contra una
  lista de textos y nunca miraba `.cause`. Ni siquiera `ClientError("Transport")` coincidía, y su
  causa real es el `TypeError: Failed to fetch` que sí está en la lista.
- **Nada reconectaba la parte REST.** El flujo SSE se recupera solo desde siempre; el bootstrap se
  rendía al primer intento y sacaba el aviso. Ahora la app sabe cuándo vuelve el servidor y recarga
  sola, y el aviso sólo aparece si el fallo persiste de verdad.
- **El instalador mataba el servidor antes de instalar.** Si `quitAndInstall` fallaba —y el propio
  código contempla que falle— quedaba una ventana viva apuntando a un puerto muerto para siempre.

#### "Inteligencia": de 14 controles, 4 funcionaban
Ahora hay 9 y todos llegan al agente. Se han cableado de verdad el destilador de salida de `bash`,
la reparación de tool-calls, el cortacircuitos de bucles infinitos, la extracción web limpia y la
creación de skills. Se han borrado cuatro: el visor de diffs Monaco (Monaco no es una dependencia de
este repo), la búsqueda de sesiones FTS5 (no hay tabla, ni ruta, ni interfaz), el presupuesto de
razonamiento (duplicaba el selector que ya funciona en la barra del prompt) y **el selector de
sandbox host/docker/e2b**, que decía que los comandos podían correr aislados en un contenedor o una
micro-VM mientras `bash` siempre los ejecuta en la máquina con los permisos del usuario. También se
corrige una sincronización de un solo sentido que pisaba con los valores por defecto lo que hubiera
en el servidor, y el texto de los guardarraíles, que prometía enmascarar contraseñas y tokens antes
de enviarlos a proveedores externos: lo que hace es analizar comandos de shell y avisar.

#### "Uso de la PC": 11 de 15 controles eran decorado
Lo primero que se va es "Zona Segura", que venía activada y decía bloquear clics en gestores de
contraseñas, banca online y ventanas elevadas de Administrador. No hay nada en este repo capaz de
hacer clic en ningún sitio, así que no bloqueaba nada — y eso es peor que no tener la opción. Con
ella se van el OCR, el auto-foco de ventanas ajenas (Electron no tiene API para eso), la cadencia
del ratón y el resto de conmutadores que sólo escribían en `localStorage`. A cambio el panel gana
dos capacidades reales: una herramienta `screenshot` y otra de portapapeles, ambas por el mismo
puente que ya usa la Vista en vivo, cada una con su permiso y la del portapapeles preguntando
siempre, porque ahí suele haber contraseñas.

#### El botón de mejorar el prompt
- **Borraba las imágenes adjuntas.** Reemplazaba el array del prompt entero con un único fragmento
  de texto, y como se llamaba en cada trozo del stream, morían en el primero.
- **Mentía sobre qué motor había respondido.** Ante cualquier fallo caía a un "optimizador local" de
  1.017 líneas —425 de ellas un diccionario de erratas en español que cambiaba el vocabulario del
  usuario ("fichero" por "archivo", "branch" por "rama")— y lo presentaba con un tecleo falso hecho
  con `setTimeout`. Borrado entero: si el modelo no responde, tu texto se queda como lo escribiste y
  te lo decimos.
- Ahora se puede cancelar mientras trabaja, el deshacer sobrevive a que sigas escribiendo, y los
  textos están en los siete idiomas en vez de sólo español e inglés.

#### Voces, Mascotas y Modelos Locales
- **Voces: de 27 tarjetas a 6**, todas femeninas y en español. Fuera las 10 inglesas de Kokoro y las
  6 de Fish, que sin clave de API no podían hablar. De las 10 de Piper quedan 5: se retiran una voz
  masculina publicada bajo un nombre femenino inventado, otra masculina cuya licencia real es **no
  comercial** pese a declararse CC BY 4.0, una voz de personaje sin cadena de licencia, y dos cuyo
  género no pudimos verificar contra su dataset. Ahorro de descarga: unos 644 MB por usuario, más un
  barrido que borra los modelos ya descargados que salen del catálogo.
- **Mascotas**: las 13 en una sola cuadrícula en vez de paginadas de 10 en 10, con la descripción y
  el rasgo completos (antes se cortaban a una línea a mitad de frase), especie y rasgo traducidos a
  los siete idiomas en vez de sólo español, y una tira que muestra el estado real de la mascota del
  escritorio leyendo un IPC que ya existía y que nadie llamaba.
- **Modelos Locales — el botón «Benchmark» no medía nada.** Esperaba 1.200 ms y mostraba
  `38,5 + Math.random() * 22` tok/s, un TTFT y un consumo de VRAM igual de inventados, con un aviso
  que decía «probado con éxito en tu GPU local». Borrado entero: una medición falsa presentada como
  real es peor que no ofrecer la medición. Con él se van dos invenciones más del mismo panel: los
  contadores de descargas y «me gusta» que se fabricaban (1.000 y 50) para cualquier modelo local y
  se pintaban como estadísticas de Hugging Face, y los valores de hardware por defecto (16 GB de RAM,
  8 GB de VRAM, 6 libres) que hacían que el panel afirmara con seguridad que un modelo cabe en una
  GPU que nunca llegó a leer. Ahora, sin lectura real del sistema, la insignia de compatibilidad se
  queda en su respuesta neutra y la tarjeta lo dice en vez de inventarse la máquina.
- **Modelos Locales**: deja de ser una tarjeta dentro de otra tarjeta y adopta la cabecera estándar.
  Pasa de 4 referencias a tokens de tema frente a 99 literales hexadecimales, a 101 frente a 25: el
  panel ya no se ve oscuro sobre un tema claro. Su único punto de ruptura por ancho de ventana pasa
  a ser por ancho del panel. Fuera una insignia de "modelo verificado" que no verificaba nada y una
  etiqueta de arquitectura que se inventaba "qwen2.5" a partir del nombre del modelo.

#### Skills
- **El panel no cargaba nada**: llamaba a un método del SDK que no existe, el error se tragaba en
  silencio y caía a un catálogo de relleno escrito a mano. Ahora usa el endpoint real, con un test
  que lo respalda.
- **Se incorpora `i-have-adhd`** (MIT, © 2026 Ayoub Ghriss) como skill opcional, invocable con
  `/i-have-adhd`. No es predeterminada ni se autoselecciona: es una preferencia de accesibilidad y
  debe dispararse cuando el usuario la pide, nunca por conjetura del modelo. Para que eso sea cierto
  se implementa `disable-model-invocation`, que el cargador ignoraba por completo.

#### Estructura y limpieza
Todo lo de frontend pasa a `frontend/` (la web del producto y los iconos de marca) y los documentos
de auditoría a `tools/docs/`. Se borran 11 módulos sin ninguna referencia, dos sondas de
configuración de lint, un panel de MCP de 1.661 líneas inalcanzable desde la interfaz —portando
antes su soporte de OAuth al panel que sí se usa, para no perder la función— y los artefactos de
compilación que estaban versionados. Neto: **−3.400 líneas**.

## [1.0.44] — 2026-09-12
### Un bloqueo real de la base de datos, un lint que vuelve a servir y un Sandbox que se ve

Las ocho mejoras que quedaron apuntadas al cerrar la 1.0.43, planificadas contra el código real y
después revisadas de forma adversarial: los 20 hallazgos confirmados de esa revisión van corregidos
en esta misma versión.

- **La base de datos congelaba la app 5 segundos y nadie lo sabía.** `bun:sqlite` es síncrono, así
  que dos inicializaciones del mismo archivo competían por `BEGIN IMMEDIATE` y bloqueaban el bucle
  de eventos entero durante `PRAGMA busy_timeout` (5 s) antes de fallar. Medido en este repo: 5,8 s
  con dos compilaciones concurrentes, 52 ms con el cerrojo por ruta que se añade ahora. Era un
  defecto de producción que un test llevaba meses señalando; de paso quita 28 timeouts de cinco
  segundos de la suite del backend, que pasa de no terminar en 40 minutos a terminar en 12,6.
- **Los otros tres tests que fallaban desde siempre estaban obsoletos, no rotos**: `DESIGN.md` es un
  literal del código, la lista de agentes integrados creció en 18 entradas, y el coordinador de
  sesiones conserva a propósito el "wake" pendiente al interrumpir. Cada test afirma ahora lo que
  hace producción, y el coordinador gana el test hermano que la reescritura habría perdido.
- **La vista previa dejaba de compilar el proyecto entero en cada tecla.** La condición era "¿hay
  script de build?"; ahora es "¿Tiancode sirve esto desde una carpeta de salida?". Una vista JSX
  transpila por petición y un dev server recarga solo: compilar ahí eran segundos de trabajo que
  nadie consumía. Un proyecto Electron servido desde `dist/` sí sigue compilando — ese caso tiene
  script `dev` y se habría perdido con la condición obvia.
- **El vigilante de archivos usa el watcher nativo** cuando su binding está disponible: poda
  `node_modules` y la salida de compilación en el sistema operativo en vez de filtrar después, y
  vuelve a `fs.watch` si no. Y el `catch {}` mudo ahora escribe en el log: un ENOSPC de inotify en
  Linux mataba la recarga en vivo para el resto de la sesión sin dejar rastro.
- **Una carpeta sin git ya no dice que su raíz es `/`.** En Windows eso era la raíz del disco, así
  que la resolución de `@menciones`, la línea "Workspace root folder" del prompt y el destino
  `.tiancode/agents` del CLI apuntaban ahí. Las listas de sesión se acotan por carpeta para la fila
  de proyecto "global" compartida, y el escritorio deja de resolver cada sesión sin git a la última
  carpeta que escribió esa fila.
- **Skills pierde su segundo catálogo**: ~340 líneas de resúmenes en español escritos a mano que
  tapaban el SKILL.md real del servidor, más diez avisos de conflicto que se mostraban en español a
  todos los idiomas. Un esqueleto cubre la carga y "no hay skills" sólo se dice cuando de verdad se
  agotaron los reintentos.
- **`bun run lint` pasa de 5.145 avisos / 0 errores a 882 / 0**, con cinco reglas en nivel *error*
  que rompen el gate ante cualquier caso nuevo. Las 15 reglas desactivadas llevan justificación y un
  sitio real de ejemplo; el intercambio se dice claro: con `no-unsafe-type-assertion` apagada, el
  typecheck es el único guardián de los `as`. `no-dupe-keys` cazó una línea genuinamente muerta.
- **El puente del agente distingue "alguien pregunta" de "alguien puede actuar"**: la presencia es
  ahora `surface`/`opening`/`incapable`/`none`, un endpoint de sólo lectura permite que el vigía
  abra la Vista en vivo cuando el agente la está esperando, una acción reclamada por un panel que se
  cierra se reencola en vez de perderse, y cada estado le dice al agente si merece la pena insistir.
- **Y el Sandbox por fin enseña la app de escritorio en vez de describirla**: un espejo de su
  ventana real de Windows, emparejada recorriendo el árbol de procesos hasta su *handle*, con un
  selector cuando la evidencia es débil. Es un espejo, no un embebido — Electron no puede reparentar
  ni escribir en una ventana ajena — así que `preview_inspect` y `preview_interact` lo dicen para una
  app lanzada como proceso en vez de fallar de forma opaca. Siguen funcionando para un proyecto
  Electron servido como página.

De la revisión adversarial: el espejo se pausa en vez de autodestruirse cuando se oculta la ventana
(antes no podía volver), nunca se arma para un sidecar de WSL (un pid de Linux comparado contra la
tabla de procesos de Windows podía reflejar una ventana ajena y mandarla al modelo), se apoya en
`supported()` para no tocar macOS ni Linux, comprueba que la ventana fijada siga existiendo,
sobrevive a una recarga del renderer, y encauza una ventana elegida a mano por el mismo ciclo de
vida. `preview_inspect` ya no informa del valor de un campo de contraseña.

47 tests nuevos. Frontend 916 tests, 0 fallos; typecheck 27/27; lint 0 errores.

## [1.0.43] — 2026-09-11
### El agente puede usar el Sandbox, el modo 2x deja de pensar menos y `.tiancode` deja de aparecer en `C:\`

- **El agente ya puede manejar la app del Sandbox, no sólo compilarla**: hasta ahora sus únicas
  herramientas de vista previa eran arrancar el servidor y leer logs, así que terminaba diciendo
  "no pude abrir la ventana, así que sólo validé que compila". Dos tools nuevas, `preview_inspect`
  (URL y título reales, texto visible, todos los elementos con los que se puede interactuar con una
  referencia `e12`, y los errores de la consola) y `preview_interact` (`click`, `fill`, `select`,
  `press`, `scroll`, `navigate`), recorren la pantalla como lo haría el usuario y devuelven el
  estado después de cada acción. El servidor no puede tocar el DOM de la vista previa — es de origen
  cruzado respecto al renderer — así que la acción viaja por un puente con long-poll y el proceso
  principal la ejecuta en el frame real con `WebFrameMain.executeJavaScript`: funciona igual en el
  iframe del Sandbox y en el WebContentsView nativo. Si la Vista en vivo está cerrada, la tool lo
  dice en vez de quedarse colgada.
- **"Compilando dist…" que no paraba nunca**: el vigilante de archivos descartaba `dist/`, pero
  Windows anuncia el cambio del directorio como `dist` a secas, sin barra, así que cada compilación
  se re-armaba con su propia salida y el panel vivía en bucle recompilando el proyecto entero cada
  par de segundos. Los descartes se comparan ahora **por segmento** de ruta (`dist`, `build`, `out`,
  `release`, `target`, `node_modules`, `.next`, `.turbo`, `coverage`, cualquier carpeta oculta…) a
  cualquier profundidad, y la etiqueta muestra el nombre del archivo en vez de una ruta cortada a
  media palabra.
- **`.tiancode` aparecía en `C:\`**: una carpeta sin repositorio resolvía su proyecto a la **raíz del
  disco**, así que `MEMORY.md`, la instalación de plugins (con su `node_modules` y su
  `package-lock.json`) y las skills de proyecto acababan en lo alto de `C:`. Una carpeta sin git es
  ahora su propio proyecto, y ninguna ruta de la app puede escribir en una raíz de sistema:
  `isFilesystemRoot` cubre `/`, `C:\` y los recursos UNC, donde antes sólo se comparaba con `"/"`.
- **Tras actualizar, los modelos y proveedores no aparecían hasta cerrar y volver a abrir**: el
  cliente de consultas tiene `refetchOnMount`/`refetchOnWindowFocus` desactivados, así que si el
  servidor aún se estaba levantando al arrancar, el catálogo vacío se quedaba cacheado para siempre.
  Ahora, mientras el catálogo esté vacío y el arranque haya terminado, se vuelve a pedir a los 0,8 s,
  2 s y 5 s, y se para en cuanto llega algo. El panel de Skills hace lo mismo, que es por lo que la
  ficha grande mostraba el resumen incrustado en vez del SKILL.md completo, y además se refresca al
  volver a la pestaña.
- **Conectar y desconectar un proveedor es inmediato**: conectar esperaba a reescribir la config,
  desechar el runtime y recargar el catálogo antes de cerrar el diálogo. Ahora el diálogo se cierra
  y la notificación sale en el mismo instante, con el proveedor marcado como conectado; lo demás
  ocurre detrás. Al desconectar, la fila y **todos los modelos de ese proveedor** desaparecen en el
  mismo fotograma, porque el estado optimista vive en `useProviders` y lo leen tanto Ajustes como el
  selector de modelo.
- **El modo ⚡ 2x ya no baja el nivel de razonamiento**: bajaba el modelo a su variante más barata,
  así que elegir "Max" y activar 2x te daba en silencio un modelo más superficial del que habías
  pedido. El esfuerzo de razonamiento es del usuario; 2x sólo quita preámbulo y relleno vía la
  directiva del prompt, que ahora dice explícitamente que mantenga la profundidad de análisis.
- **Ollama y LM Studio salen de Proveedores**: conectarlos allí sólo apuntaba a un endpoint HTTP
  local que había que levantar aparte; el camino real para modelos locales es el motor integrado
  (Tiancode Native / GGUF) en Modelos Locales.
- **Responsivo de verdad**: los paneles de Ajustes (GitHub, MCP, Modelos Locales, Voces, filas de
  proveedores y ajustes, Skills) media-consultaban el **ancho de la ventana** aunque viven dentro del
  diálogo, así que una ventana ancha con un panel estrecho mantenía la maqueta de escritorio metida
  a presión. Todas pasan a `@container settings-panel`. La cabecera de la vista previa deja de
  recortar sus chips, la tarjeta del Sandbox envuelve en vez de empujar el comando fuera del panel, y
  una tabla ancha de un SKILL.md se desplaza dentro de su columna.
- **Menos ruido de fondo**: el sondeo del estado de la vista previa va con lo que ocurre (0,9 s
  arrancando o compilando, 2 s en marcha, 6 s parado) y los logs sólo se piden cuando la consola del
  Sandbox está a la vista o hay una compilación en curso, en lugar de traerse 500 líneas cada 2 s
  para nada.
- 34 tests nuevos (`agent-bridge`, `watch-filter`, `preview-agent-script`, `catalog-recovery`,
  `use-providers`, `preview-poll`, `path`). Frontend 899 tests, 0 fallos; typecheck 27/27.

## [1.0.42] — 2026-09-11
### Vista previa en vivo: zoom real, recarga sin parpadeo y cabecera del Sandbox

- **El zoom de la vista previa no podía pasar del ajuste automático**: con un preset grande (p. ej.
  Escritorio FHD 1920×1080) el panel mostraba ~54 % y los botones "+"/"−" no hacían nada, porque el
  zoom manual era solo un *techo* sobre la escala de ajuste y `zoom = 1` significaba "auto", así que un
  100 % real era inalcanzable. Ahora el modo es explícito (`zoomMode: auto | manual`): "+"/"−"
  recorren una escalera de escalones (25 %–400 %) desde la escala en pantalla, el porcentaje es un
  botón que fija el 100 % y "Ajustar" vuelve al ajuste automático; a escalas mayores que el panel la
  vista se desplaza en vez de recortarse. En modo fluido el zoom manual actúa como zoom de página.
- **El botón "Fluido" de la cabecera del Sandbox no respondía** cuando la preferencia guardada era un
  preset de escritorio: la cabecera arrancaba en "fluido" mientras la vista previa seguía en FHD, y
  pulsar "fluido" no cambiaba nada porque "ya lo era". Las pulsaciones llevan ahora un contador y la
  cabecera refleja siempre el preset persistido, también tras hidratar la preferencia.
- **Recarga sin parpadeo mientras el agente escribe**: cada cambio (partes de herramientas, diffs de
  sesión, vigilante de archivos, sondeo de compilación, botón de recarga) pasa por un planificador que
  agrupa ráfagas en 250 ms y nunca reinicia un documento a medio cargar; el documento nuevo se carga en
  un segundo iframe oculto y se intercambia al terminar (con la posición de scroll conservada), así que
  la página en construcción ya no se pone en blanco entre dos escrituras ni muestra la capa
  "Iniciando…". El cliente de recarga inyectado en las vistas estáticas/JSX delega sus recargas al
  Sandbox cuando este lo hospeda: una sola recarga por cambio en lugar de tres.
- **Cabecera del Sandbox**: se maqueta con container queries del propio panel (no de la ventana):
  los atajos y los botones de dispositivo se ocultan en paneles estrechos, "Sandbox" y el nombre de la
  carpeta ceden espacio y las pestañas "Vista previa / Código" nunca se recortan ni se superponen al
  selector de carpeta.
- 8 claves de traducción nuevas en los 7 idiomas; 12 tests nuevos (`preview-viewport`,
  `live-preview-reload`). Frontend 879 tests, 0 fallos; typecheck 27/27.

## [1.0.41] — 2026-09-11
### Ajustes fluidos, Conexiones reales, base de datos protegida y rediseño de Skills, Sub-agentes y MCP

- **"No se pudo conectar con Servidor local" tras actualizar**: la copia de seguridad diaria copiaba
  `tiancode.db` (5,5 GB) con `copyFile` mientras el servidor escribía; dejaba una copia rota de 5,56 GB
  y un bloqueo que ponía SQLite en modo solo lectura (`SQLITE_READONLY`). La copia se hace ahora con
  `VACUUM INTO` (instantánea consistente y ya compactada), nunca se copian los archivos `-wal`/`-shm`
  y la restauración tampoco los toca. Al arrancar, el servidor comprueba que puede escribir (reintenta
  40 × 750 ms antes de fallar con `DatabaseLockedError`) y compacta la base automáticamente cuando más
  de la mitad son páginas libres (`backend/core/src/database/maintenance.ts`, 5 tests).
- **Lag al cambiar de pestaña en Ajustes**: el contenedor del diálogo y cada panel forzaban capas de
  GPU (`transform: translateZ(0)`, `backface-visibility: hidden`), varias tablas y tarjetas usaban
  `backdrop-filter: blur()` y había `animate-pulse` permanentes; con 12 paneles montados a la vez cada
  cambio recomponía todo. *General* era el único panel sin esos efectos y por eso el único fluido. Se
  retiran las capas forzadas, los desenfoques de tablas/tarjetas y los pulsos estáticos.
- **Conexiones (Telegram, Discord, Slack, Webhook) reales**: el panel guardaba todo en `localStorage`,
  "probaba" con un `setTimeout` y el emparejamiento de WhatsApp era `Math.random()`. Nuevo servicio
  `Connections` en el servidor con API `/global/connections` (listar, configurar, eliminar, probar):
  los secretos viven en el almacén de credenciales y nunca vuelven al renderer, cada sesión que
  termina o falla envía un resumen (con deduplicación de 3 s), los webhooks van firmados con HMAC
  `sha256=` en `x-tiancode-signature`, y un poller de Telegram crea sesiones y responde desde el chat.
  WhatsApp se retira hasta contar con una integración real. 17 tests nuevos.
- **Ecosistema IA**: 9 de las 16 tarjetas describían integraciones inexistentes y ningún interruptor
  lo leía nadie; la pestaña se elimina junto con su estado.
- **GitHub**: la rama se leía de un endpoint que no la devuelve (siempre "main"); ahora sale de
  `GET /vcs`. "Sincronizar" mostraba éxito antes de que terminara una sola petición; espera a todas y
  reporta el fallo. Commit, push y pull muestran la salida real de git en vez de un toast genérico y
  refrescan el estado del repositorio. `tiancode github install` avisa de que la GitHub App aún no está
  publicada en vez de escribir un workflow que no podía ejecutarse.
- **Voces**: catálogo completo con las descargadas primero, sin doble descarga ni velocidad 120 %,
  la clave de Fish Audio deja de ir incluida en el binario, velocidad 1.0 por defecto en Kokoro y
  Piper, botón de eliminar restaurado, tono solo con Web Speech (los motores locales lo ignoran), el
  probador de micrófono libera el micro al ocultar la pestaña, el "barge-in" vuelve a escuchar tras
  reiniciar y la vista previa de cada voz usa su propio motor sea cual sea el modo global.
- **Inteligencia**: el puente `experimental.intelligence` de la 1.0.40 nunca llegaba al disco por HTTP
  porque el esquema V1 de `PATCH /global/config` lo descartaba; corregido y cubierto por test, igual que
  `experimental.connections`.
- **Skills, Sub-agentes y MCP/Plugins rediseñados**: barra de acciones y filtros sin emojis y con
  recuentos, descripciones a dos líneas en la lista, selector de alcance como control segmentado,
  pestañas MCP que ya no recortan su etiqueta, ruta de los plugins locales una sola vez, explicación de
  MCP y catálogo con cabeceras compactas, paleta fija `slate` sustituida por los tokens del tema y todos
  los textos por i18n (105 claves nuevas en los 7 idiomas).
- **CORS**: `serve --cors http://localhost:3000` no se aplicaba a orígenes localhost sin contraseña.
- **Calidad**: typecheck 27/27, frontend **868 tests, 0 fallos**, desktop 75/0, conexiones 17/17.

## [1.0.40] — 2026-09-10
### Auditoría de funcionamiento: correcciones verificadas en composer, voces, vista previa e Intelligence

- **Modo ⚡ 2x ahora acelera el modelo de verdad**: antes sólo inyectaba una directiva de texto en el
  system prompt. Se conecta al sistema de `variants` de `Model.Info`, bajando el modelo activo a su
  nivel de razonamiento más barato **sólo para esa petición** (la variante guardada del usuario no se
  toca y vuelve al desactivar). Además se corrige `resolveFastVariant`, cuyo respaldo devolvía
  `variants[0]`: en una lista descendente como `["high","medium","low"]` elegía la **más lenta**.
- **Asistente de Bienvenida**: anunciaba "Paso 1 de 3" pero sólo existía un paso. Se implementan los
  pasos de proveedor y espacio de trabajo (que por fin pasa un valor real a
  `finishFirstLaunchOnboarding`, antes fijo en `false`), con Atrás/Omitir, activación por teclado, los
  7 idiomas y desplazamiento interno para no recortarse en ventanas bajas.
- **Vista previa "Building" en vivo**: el gestor ya recompilaba al cambiar archivos, pero `isBuilding`
  vivía en un campo privado que nunca se publicaba. `PreviewState` expone ahora un bloque `build` y la
  interfaz muestra "Compilando src/App.tsx…" con la duración de la última compilación, recargando el
  iframe cuando termina con éxito. La decisión se basa en un contador monótono `sequence`, no en
  `running`: el estado se consulta cada 2 s y una compilación que empiece y acabe dentro de ese
  intervalo nunca se observaría en curso.
- **Voces**: "Paloma" y "Tania" apuntaban a repositorios de HuggingFace que **no existen** (HTTP 401),
  así que su descarga siempre fallaba. Se sustituyen por `es_ES-miro-high` y `es_ES-glados-medium`,
  verificadas. Se añade `verify-piper-voices.ts` al pipeline de release, que comprueba las 10 voces.
  (Nota posterior: en 1.0.45 estas dos se retiran del catálogo. `miro` es una voz masculina y su
  licencia real es no comercial pese a declararse CC BY 4.0; `glados` es una voz de personaje sin
  cadena de licencia verificable. Que el repositorio respondiera 200 sólo probaba que existía.)
- **Intelligence conectado al agente**: los ajustes del renderer se guardaban sólo en `localStorage` y
  nunca llegaban al servidor, así que ninguno podía influir en el agente. Los interruptores de memoria
  de usuario/proyecto y de guardrails viajan ahora por `experimental.intelligence` en la configuración
  del servidor y gobiernan de verdad el system prompt y `AgentShield`.
- **Traducciones**: 53 claves usadas por el código faltaban en los 7 diccionarios (toda la pestaña
  *Intelligence* caía a texto en español fijo para usuarios en inglés, chino, japonés, coreano y ruso),
  más 9 descripciones de sub-agentes y 3 divergencias `en`/`en-150`. Las dos pruebas de paridad que
  fallaban vuelven a pasar.
- **Responsividad**: las tablas de sub-agentes y de MCP/plugins declaraban rejillas con suelos de 690,
  840 y 880 px sin **ninguna** media query, forzando desplazamiento horizontal. Reescritas mobile-first
  con `@container settings-panel`, verificadas en navegador entre 360 y 1300 px.
- **Catálogo de skills**: se retiran 16 skills muertas o duplicadas — `grill-me` y `grill-with-docs`
  invocaban un comando `/grilling` inexistente, y 13 stubs `claude-*` de 15–17 líneas repetían skills
  hermanas mucho más completas. Como la descripción de cada skill se inyecta en **cada** petición, esto
  ahorra unos 910 tokens por mensaje.
- **Modelos locales**: la estimación de encaje en memoria estaba duplicada entre servidor e interfaz;
  ambas usan ahora `@tiancode-ai/core/model-fit`. Las insignias mezclaban inglés y español teniendo ya
  las traducciones disponibles sin usar.
- **Catálogo de skills unificado**: estaba transcrito a mano en dos registros que habían divergido en 41
  skills, así que el conjunto disponible dependía de qué ruta de carga se usara. Ahora se genera desde
  el directorio `skills/` y un test falla si vuelve a divergir. El proceso destapó una skill huérfana
  (`vibe-coding-workflow`) que no cargaba nunca y seis sin frontmatter, que se registraban sin nombre ni
  descripción — justo lo que el modelo usa para decidir si cargarlas.
- **Skills fantasma**: la pestaña listaba ~60 skills inexistentes (un clúster bioinformático completo,
  `docx`/`pdf`/`pptx`/`xlsx`, `hermes-*`, `openclaw-*`) porque añadía toda entrada codificada que el
  servidor no devolvía. Eran navegables y activables, pero jamás podían cargarse. La lista del servidor
  es ahora la autoridad.
- **Herramienta `codegraph`**: `CodeGraph` eran 166 líneas de servicio registrado que nadie invocaba.
  Se expone al agente (localizar un símbolo, listar dependientes o dependencias de un archivo, esquema
  de un archivo) y con ello el interruptor de grafo de código pasa a gobernar algo real.
- **Vista previa**: además del estado de compilación, la barra muestra el archivo que el agente está
  escribiendo, tomado de las herramientas `write`/`edit`/`apply_patch` que ya se rastreaban pero nunca
  se mostraban.
- **Sub-agentes**: los 23 nativos tenían prompts de dos frases sin método, política de herramientas,
  contrato de salida ni condición de parada. Comparten ahora un contrato operativo.
- **Optimizador de prompts**: dejaba de emitir en silencio ante cualquier fallo del LLM; ahora se
  registra la causa antes de recurrir al motor local.
- **Estructura de `components/`**: la carpeta tenía 97 archivos sueltos en la raíz — todos los diálogos,
  la barra de título, el compositor, el árbol de archivos y las mascotas mezclados. Se agrupan 77 en ocho
  carpetas por funcionalidad y quedan 19 realmente transversales. El reescritor de imports recalcula cada
  especificador desde la nueva ubicación del importador (114 en 57 archivos), preservando el estilo con
  alias o relativo. Se elimina `diagram-renderer.tsx`, 103 líneas que nadie importaba.
- **`session.tsx`**: se extraen el límite de errores de la ruta y los marcos de presentación a módulos
  hermanos.
- **Sincronización con opencode upstream (1.18.15 → 1.18.30)**: los paquetes core de Tiancode estaban
  fijados en opencode 1.18.14. Se comparó contra el tag v1.18.30 normalizando el renombrado del fork y se
  portaron las correcciones de fiabilidad, **sin tocar el diseño v2 ni la configuración**:
  - *Proveedores*: un error de API con un `code` no reconocido salía del `switch` devolviendo `undefined`,
    así que nunca se clasificaba como reintentable y la petición fallaba en seco. `textVerbosity` se enviaba
    a todo proveedor compatible con OpenAI salvo Azure, en vez de sólo a los que lo implementan. El
    *thinking block binding* de Anthropic se activaba ante IDs no reconocidos, que despliegues antiguos
    rechazan. Más el mapeo de MERGE Gateway, el muestreo de DeepSeek V4 Flash y el guardado de razonamiento
    replicable para cualquier proveedor que lo firme, no sólo Bedrock.
  - *Reintentos*: eran **ilimitados** (un proveedor caído reintentaba para siempre) y sin jitter, así que
    todas las sesiones volvían en el mismo instante tras una caída. Ahora hay tope de 5 y dispersión del 25%.
    Se reconocen además `network-error`/`network_error` y la redacción de capacidad que devuelve xAI.
  - *Sub-agentes*: un sub-agente que fallaba devolvía **cadena vacía**, indistinguible de uno que no produjo
    texto; el agente padre seguía como si el trabajo estuviera hecho. Ahora el fallo se expone con el
    `task_id` para poder reanudarlo.
  - *Compactación*: el presupuesto de contexto reciente sube de 8k a 15k tokens y los turnos se estiman bajo
    demanda en vez de todos por adelantado.
  - *Azure*: el plugin era un stub de 24 líneas con sólo clave de API. Ahora ofrece además **inicio de
    sesión con Microsoft Entra ID** vía Azure CLI: toma el token de `az account get-access-token`, lo cachea
    por ámbito y lo renueva antes de expirar. El método se oculta si `az` no está instalado, en vez de
    ofrecer un login que no puede completarse.
  - *Cerebras*: plugin nuevo que limpia `maxOutputTokens` cuando ya viaja `max_completion_tokens`. Cerebras
    expresa su límite con el segundo, así que enviar ambos aplicaba un tope extra y truncaba las respuestas.
  - *Sub-agentes en `run`*: el bucle de eventos sólo atendía peticiones de permiso cuya `sessionID`
    coincidía con la sesión raíz, así que cuando un sub-agente pedía permiso nadie contestaba y la
    ejecución se quedaba colgada hasta el timeout. Ahora se sigue el árbol de sesiones hijas.
  - *Configuración*: `Config.update()` fusionaba sobre la configuración **ya cargada**, no sobre el
    archivo. Cargar resuelve `{env:...}` y `{file:...}` y descarta toda clave que el esquema no conozca,
    así que cada guardado desde Ajustes reescribía el archivo del usuario con sus secretos **en claro** y
    sin las claves que no reconocía (las de otra herramienta, o las de una versión más nueva). Se fusiona
    ahora contra el texto tal cual está escrito en disco.
  - *Bedrock*: los IDs de modelo recibían prefijo de región indiscriminadamente, rompiendo los ARN
    completos, y el prefijo `"deepseek"` capturaba cualquier modelo DeepSeek en vez de sólo R1.
  - *GitHub Copilot*: se declaraba soporte de PDF fijo por familia de modelo en vez de leer lo que
    anuncia el propio modelo, y faltaba la cabecera `X-Interaction-Id` que Copilot usa para correlacionar
    la conversación.
  - *Codex*: el filtro de modelos comparaba la versión con `parseFloat`, y `parseFloat("5.10")` es 5.1;
    un futuro `gpt-5.10` habría quedado fuera de la lista por parecer anterior al corte de 5.4. Se comparan
    mayor y menor como enteros. **No** se portó la unificación de límites de `gpt-5.5`/`gpt-5.6` del mismo
    hunk: Tiancode declara 500k/372k para `gpt-5.6` a propósito.
  - *Codex, residencia de cómputo*: la cabecera no se enviaba **nunca**, por tres motivos a la vez — se
    leía el claim `workspace_compute_residency` (OpenAI lo llama `chatgpt_compute_residency`), el valor se
    devolvía en un campo que el esquema de `Auth` no declara y por tanto se perdía antes de llegar a
    `auth.json`, y el nombre de la cabecera no era el que lee el backend de Codex. Ahora se lee del token
    de acceso vivo en cada petición, así que no hace falta persistirla y sigue siendo correcta tras cada
    renovación. `no_constraint` cuenta como "sin restricción" en vez de reenviarse como si lo fuera.
  - *WebSocket de OpenAI*: un cierre 1009 significa que el cuerpo no cabe en una trama, así que reintentar
    por el socket no puede funcionar. El pool sólo reconocía ese caso cuando el error se lanzaba, no cuando
    llegaba por `onConnectionInvalid` — que es por donde llega un código de cierre —, de modo que una
    petición grande gastaba todo el presupuesto de reintentos reenviando un cuerpo que nunca iba a caber y
    devolvía el fallo al llamante en lugar de la respuesta HTTP que sí habría funcionado.
  - *Cloudflare AI Gateway*: el token de la pasarela autentica **ante Cloudflare** y viaja en
    `cf-aig-authorization`. Se estaba pasando además como `apiKey` de los SDK de modelo, lo que lo coloca en
    `Authorization`, y `ai-gateway-provider` reenvía `Authorization` tal cual al proveedor de destino: cada
    petición entregaba un token de cuenta de Cloudflare a OpenAI, Anthropic o Google. La librería sustituye
    un centinela y elimina la cabecera cuando no se le da clave, que es lo que hace su propio ejemplo de
    BYOK; la pasarela aplica entonces la clave guardada del lado de Cloudflare.
  - *GitHub, intercambio de token*: la rama de error llamaba a `response.json()` sobre el cuerpo fallido.
    Un HTML de proxy, un error de pasarela en texto plano o un cuerpo vacío hacen que eso lance, y el
    `SyntaxError` sustituía al estado HTTP que sí decía qué había pasado.
  - *Cabeceras de atribución*: once tests seguían esperando `https://opencode.ai/`, que el código dejó de
    enviar al renombrarse. `backend/core/test/plugin` pasa de 210/12 a 222/0.
  Los tests upstream de ambos plugins se portan sin cambios y pasan: Azure 9/9, Cerebras 3/3.
  No se portó `config/v2-compat.ts` (449 líneas que traducen campos de config V2 a forma V1) por la misma
  razón que los defaults de compactación: cambia cómo se interpretan los archivos de configuración.

  Estos comportamientos ya tenían tests heredados del fork que llevaban tiempo fallando: `provider.test.ts`
  pasa de 74 aciertos / 26 fallos a 87 / 13 (los 13 restantes son timeouts de red contra APIs reales).

- **Suite de tests del frontend en verde**: arrancaba con 14 fallos en un checkout intacto, todos por
  el mismo patrón — un cambio de comportamiento deliberado cuyo test nunca se actualizó, dejando además
  un parámetro que ya no hacía nada. `submit.test.ts` (8) ni siquiera cargaba: su mock de toast omitía
  `toaster`. Debajo apareció un fallo real mío: el doble de `ModelSelection` no proveía `variant.list()`,
  que el modo 2x necesita. Los 4 de permisos precedían al interruptor global de auto-aceptación (añadido
  el 2026-08-28); conviene decirlo claro porque asusta: **es el valor por defecto deliberado del producto,
  no un bypass de permisos**. Los otros 5 de ese archivo pasaban de forma vacua por la misma razón. Ahora
  862 tests, 0 fallos, y se cubren el gate global y el modo 2x, que no tenían ninguna prueba.
- **`layout.tsx`**: se separan en hooks propios los tres grupos de estado reactivo que sí eran
  independientes — el reloj de ordenación por minuto, la escucha de deep links y el comportamiento de
  hover/peek de la barra lateral. Cada uno se invoca desde el cuerpo del componente, así que hereda la
  propiedad reactiva de SolidJS y su limpieza sigue registrada igual que antes. El archivo baja de 2523 a
  2400 líneas y los campos de hover salen del store compartido, con lo que pasar el ratón deja de
  notificar a todo lo demás que observaba ese store.

## [1.0.33] — 2026-09-06
### Optimización de Prompts con IA en Streaming en Vivo, Endpoint Backend y Modos de Ejecución

- **Reescritura de Prompts con IA en Streaming en Tiempo Real**:
  - **Endpoint Backend Dedicado (`POST /experimental/prompt/optimize`)**: Conexión directa y asíncrona con el servicio central `LLM.Service`, utilizando el proveedor y modelo activo del usuario o el modelo predeterminado configurado en el servidor.
  - **Meta-Prompts de Alta Precisión**: Arquitectura de reescritura derivada de las mejores técnicas de `claude-opus-4.6-prompt-optimizer` y `prompt-refine-skill`, con preservación estricta de variables (`${var}`, `{{var}}`), rutas y fragmentos de código, cláusula anti-sobreingeniería y directiva de verificación.
  - **Streaming Token por Token en Frontend**: El compositor de texto se actualiza en vivo conforme llegan los deltas de texto del LLM, permitiendo al usuario observar el proceso de razonamiento y expansión del prompt en tiempo real.
  - **Selector Rápido de Modos (Clic Derecho)**:
    - `✨ Estándar`: Balance ideal entre contexto, tarea, restricciones y verificación.
    - `🔬 Riguroso (TDD)`: Enfoque estricto en pruebas previas, casos borde, tipado defensivo y validaciones.
    - `🎯 Quirúrgico (Mínimo)`: Alcance microscópico centrado en el mínimo número de cambios, sin tocar código circundante ni refactorizar.
  - **Fallback Local Infalible y Resiliente**: Si el usuario no tiene proveedores de IA configurados, está fuera de línea o la llamada a la API expira, el botón conmuta de manera 100% transparente al motor cliente determinista v2 con animación de máquina de escribir.

## [1.0.32] — 2026-09-06
### Motor de Optimización de Prompts v2 con Adaptación por Modelo, Tokens Aislados y Deshacer

- **Motor Avanzado de Optimización de Prompts ("Mejorar Input") v2**:
  - **Estrategias Adaptativas por Modelo**: El formateo de optimización se adapta dinámicamente al modelo activo en la sesión (etiquetas XML semánticas para Claude 3.5/3.7/Opus, enfoque *outcome-first* y criterios de aceptación para OpenAI, encabezados directos y concisos para Gemini, y especificaciones técnicas rigurosas para DeepSeek).
  - **Aislamiento y Protección de Código (Token Isolation)**: Los bloques de código, fragmentos entre backticks, URLs, rutas de archivo complejas y variables (`{{var}}`, `${var}`) se protegen antes del análisis sintáctico para garantizar su preservación intacta.
  - **Diccionario Técnico Expandido**: Más de 420 términos técnicos, nombres de frameworks (`Solid.js`, `React`, `Vue`, `Docker`, `Kubernetes`, `PostgreSQL`, `SQLite`, etc.), acrónimos (`MCP`, `RPC`, `SDK`, `CI/CD`) y correcciones ortográficas en español e inglés.
  - **Clasificador de Intención Multinivel**: Detección inteligente de 6 categorías de intención (`debugging`, `scaffolding`, `refactoring`, `conceptual`, `scripting`, `review`).
  - **Cláusula Anti-Sobreingeniería e Invariantes**: Incorporación sistemática de directivas de alcance mínimo, no refactorización no solicitada y respeto estricto a las convenciones y estilo del proyecto.
  - **Plan de Verificación Integrado**: Requerimiento de comandos de comprobación, pruebas unitarias o compilación antes de dar la tarea por completada.
  - **Función de Deshacer (Undo / Revertir)**: El botón ahora permite alternar y revertir instantáneamente al texto original si el usuario desea descartar la optimización.

## [1.0.31] — 2026-09-06
### Modernización del Ecosistema de Skills, TTS en Worker y Reparación con IA en Vista Previa

- **Ecosistema de Habilidades y Superpoderes de Agentes**:
  - Corrección del mapeo en `backend/tiancode/src/skill/builtin/skills.ts` donde `"to-spec"` apuntaba erróneamente a `spec_driven_development` en lugar de `to_spec`.
  - Registro canónico de la especificación de diseño `design-system-spec.md` con tokens de Rico UI DESIGN.md.
  - Nuevas habilidades de calidad y arquitectura de agentes: `subagent-driven-development`, `systematic-debugging`, `constraint-driven-development` y `receiving-code-review`.
  - Habilidades oficiales de proveedores y mejores prácticas: `supabase-postgres-best-practices`, `cloudflare-workers-best-practices`, `stripe-payments-integration`, `better-auth-patterns` y `sentry-observability-and-fixes`.
  - Creadores de artefactos y documentos en código abierto limpio: `mcp-builder`, `web-artifacts-builder`, `docx-document-creation` (docx-js) y `xlsx-spreadsheet-builder` (exceljs).
- **Rendimiento de Voz: Offloading de Kokoro TTS a UtilityProcess**:
  - Migración completa de la síntesis de voz neural Kokoro ONNX desde el hilo principal de Electron hacia un proceso secundario dedicado (`utilityProcess` / `voice-worker.ts`).
  - Eliminación total de congelamientos de 1-3 segundos en la interfaz y el bucle de eventos durante la generación de audio.
- **Terminación Limpia de Procesos PTY en Windows**:
  - Implementación de `terminateWindowsProcessTree` con `taskkill.exe /PID <pid> /T /F` para terminar de forma limpia e instantánea subprocesos zombies de terminal en Windows.
- **Mejoras en el Sistema de Vista Previa (Live Preview)**:
  - **Reparación con IA en 1 Clic (`✨ Reparar con IA`)**: botón integrado en el banner de error de carga, en la vista de fallo de compilación del Dev Server y en la consola de sandbox de escritorio. Envía el contexto del error automáticamente al agente.
  - **Corrección de pantalla blanca en Iframe (`nudgePreviewIframeGeometry`)**: elimina glitches de rasterización en Chromium al cargar iframes sandboxed escalados.
  - **Bus de inserción reactiva de prompts (`tiancode:insert-prompt`)**: comunicación fluida entre vistas secundarias y el compositor del chat.

## [1.0.30] — 2026-09-06
### Motor de Actualización en Tiempo Real del Sandbox y Auto-Rebuild Incremental

- **Motor de Reconstrucción Incremental Automática en DevServerManager**:
  - Detección reactiva de scripts de compilación (`build`, `build:web`) en el `package.json` del proyecto.
  - File watcher recursivo a nivel de workspace (`managed.directory`) con exclusión de carpetas intermedias (`node_modules`, `.git`, `.opencode`, `dist`, `build`, etc.).
  - Reconstrucción automática en segundo plano debouncada (150ms) en cuanto un modelo de IA o el usuario modifica código fuente (`src/`, templates, assets).
  - Captura y reporte estructurado de errores de compilación hacia el estado del agente y la interfaz.
- **File Watcher y Servidor Estático de Alto Rendimiento**:
  - El servidor estático (`bare-jsx-preview.ts`) vigila la raíz completa del workspace, asegurando visibilidad total sobre carpetas de origen (`src/`) y salida (`dist/`).
  - Cabeceras anti-caché estrictas (`Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, `Expires: 0`) para prevenir vistas congeladas o lecturas obsoletas en Chromium.
  - Auto-reconexión del stream SSE de recarga y soporte para recepción de mensajes entre ventanas.
- **Despacho Incondicional de Recarga en Live View Panel**:
  - Eliminación de la limitación que bloqueaba el evento `tiancode:preview-reload` cuando un modelo editaba consecutivamente el mismo archivo (`rel !== activeEditFile()`).
  - Cada operación de edición (`write`, `edit`, `apply_patch`) de cualquier modelo refresca la vista previa instantáneamente.
- **Emulación Multipágina y Host Desktop Sandbox para Aplicaciones como Khaos**:
  - Inyección de contenedor web dinámico para shells Electron con `#chrome`, montando y sincronizando la vista activa de pestañas (`start.html`).
  - Traducción fluida de esquemas personalizados como `khaos-ui://app/` hacia rutas relativas del servidor.
- **Recarga Confiable del Iframe y Preservación de Resoluciones**:
  - Despacho de recarga con timestamp anti-caché (`_t=Date.now()`) y postMessage hacia el iframe.
  - Preservación perfecta de los presets de resolución seleccionados (FHD 1920x1080, tablet, mobile, tv, etc.) y nivel de zoom sin parpadeos.

## [1.0.29] — 2026-09-06
### Opciones de Micrófono, Prueba VU en Vivo y Dictado Estilo Codex Desktop

- **Selector Global de Micrófono (Sección General en Voz)**:
  - Selector de micrófono con detección reactiva de todos los dispositivos de audio conectados a la PC (`getAudioInputDevices()`).
  - Sincronización global con el botón de dictado del chat y funciones de voz/interrupción (barge-in).
  - Botón de actualización de dispositivos para escanear nuevos micrófonos al instante.
- **Prueba de Funcionamiento del Micrófono en Tiempo Real**:
  - Medidor VU de nivel de entrada (0% a 100%) con indicador de pico y lectura de decibelios (dB).
  - Diagnóstico dinámico (*🟢 Señal óptima / 🟡 Esperando voz / 🔴 Error*).
  - Visualizador de espectro senoidal en tiempo real sobre canvas.
  - Modo retorno de audio (*loopback*) para escuchar la propia voz en auriculares.
- **Sección de Dictado Avanzada**:
  - Atajo rápido `Ctrl+Shift+M` para alternar dictado en cualquier ventana.
  - Atajo push-to-talk para dictado continuo.
  - Diccionario de dictado interactivo con soporte de términos personalizados guardados localmente.
  - Historial de las últimas 20 grabaciones con duración y marcas de tiempo.

## [1.0.28] — 2026-09-05
### Seguridad, Sub-Agentes de Élite y Compatibilidad

- **AgentShield Security Engine & Presets de Sub-Agentes de Élite (Arquitectura ECC)**:
  - Creación de `AgentShield` (`backend/core/src/security/agent-shield.ts`), escudo de protección proactiva contra ejecuciones destructivas del sistema (`rm -rf /`, formateo de volúmenes, manipulación del registro), filtrado y bloqueo de fugas de secretos (`.env`, claves privadas SSH `id_rsa`, tokens de AWS/GCP/GitHub) y prevención de ejecuciones remotas inseguras sin verificación previa (`curl | sh`, `iwr | iex`).
  - Integración nativa de advertencias de seguridad de AgentShield en la herramienta `bash` (`backend/core/src/tool/bash.ts`), guiando al agente a reconsiderar comandos de alto riesgo sin romper el flujo de trabajo.
  - Nuevos Sub-Agentes de Élite integrados inspirados en ECC (Agent Harness Operating System):
    - 🧪 **TDD Specialist** (Arquitecto Test-First): ciclo Red-Green-Refactor estricto, pruebas antes de producción.
    - 🔍 **Code Reviewer** (Revisor de Código en Contexto Fresco): auditoría de calidad, legibilidad, seguridad y estándares.
    - 🛡️ **AgentShield Sentinel** (Centinela de Ciberseguridad): auditoría estricta de OWASP Top 10, permisos y contención de dependencias.
    - 🔧 **Build Repair Specialist** (Especialista en CI/CD y Compilación): resolución quirúrgica de fallos de compilación, linters y tipos TypeScript sin modificar lógica de negocio.
- **Soporte para Modelos GPT de Versión Entera y GPT-6 Astra (Paridad OpenCode v1.18.29)**:
  - Compatibilidad completa en el filtrado de modelos OAuth de OpenAI/Codex (`backend/tiancode/src/plugin/openai/codex.ts`) para reconocer versiones enteras de GPT (`gpt-6`, `gpt-6-astra`, `gpt-7`) además de decimales (`gpt-5.5`).
  - Corrección de la omisión de `gpt-6-astra` para usuarios con suscripciones activas de OpenAI Plus/Pro.
  - Actualización de opciones predeterminadas de OpenAI en `backend/llm/src/providers/openai-options.ts` para aplicar el modo de razonamiento cifrado a familias GPT-5 y GPT-6.

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
