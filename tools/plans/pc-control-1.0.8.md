# TianCode 1.0.8: uso visual de la PC

## Objetivo

Dar al modelo de la conversación herramientas reales para observar Windows, elegir aplicaciones, actuar y comprobar el resultado. Referencia: UI-TARS Desktop (`bytedance/UI-TARS-desktop`), tanto la carpeta local `Desktop/UI` como su código publicado. La integración mantiene el agente, el proveedor y la sesión de TianCode.

## Plan y aceptación

1. Auditar los operadores, las acciones y las coordenadas de UI-TARS y el puente existente de TianCode. Documentar la correspondencia y los límites reales.
2. Definir un contrato compartido y ampliar el operador nativo de Windows: observar con captura y contexto de accesibilidad, enumerar y enfocar ventanas, arrastrar, desplazar en un punto, esperar, finalizar y pedir intervención. Añadir un adaptador estricto para las predicciones UI-TARS, sin evaluar código del modelo.
3. Vincular las coordenadas a una observación identificada, incluyendo origen, escala y monitor. Rechazar observaciones caducadas, cambios de ventana y objetivos bloqueados. Serializar las acciones y liberar el ratón/teclado al detener.
4. Integrar las capacidades y la selección de monitor en Ajustes > Uso de la PC. Añadir el resplandor azul en los bordes de todos los monitores mientras existe control activo, transparente a los clics y retirado al detener. Conservar los permisos globales, los vetos, el indicador, el atajo de parada y los datos existentes.
5. Regenerar los clientes desde sus scripts. Ejecutar pruebas del contrato, del puente, del operador nativo y de la interfaz, y comprobaciones de tipos desde cada paquete. Validar acciones en una aplicación de prueba aislada en Windows y registrar exactamente la evidencia.
6. Subir a 1.0.8, construir en canal prod, verificar instalador/portable/manifiesto y publicar una nueva release como predeterminada. Actualizar README, changelog y el sitio `Dreftian/zenithai-web`; comprobar los recursos publicados y que la versión instalada detecta la actualización.

## Correspondencia con UI-TARS

| Referencia | Integración en TianCode |
| --- | --- |
| Captura y coordenadas de pantalla | Observación con imagen, monitor, dimensiones físicas y mapa de coordenadas |
| Clic simple/doble/derecho/central, mover, teclear, hotkey | Operador SendInput existente ampliado y validado |
| Drag, scroll con punto, wait | Nuevas acciones nativas y espera cancelable |
| Finished y call_user | Fin explícito del control y devolución de la tarea al usuario |
| Predicción `Action: click(start_box=...)` | Adaptador de sintaxis UI-TARS con cajas normalizadas |
| Bucle captura → modelo → acción | Herramienta nativa del modelo dentro del flujo de la conversación; captura adjunta a la salida |
| Contexto del escritorio | Ventanas y controles accesibles de Windows, sin leer valores de campos de contraseña |

## Límites y conservación

La entrada nativa de esta release se valida en Windows. Los operadores remotos de UI-TARS requieren sus propios servicios y credenciales; no se anunciarán como disponibles por copiar su interfaz. El acceso remoto de TianCode conserva su emparejamiento actual. El instalador y la integración no eliminan ni reinicializan claves, sesiones, ajustes, copias o autenticación MCP. No se reinicia la aplicación del usuario durante el desarrollo.

## Evidencia

Se completará en `tools/qa/pc-control-1.0.8.md` con pruebas reales, limitaciones pendientes y comprobaciones de publicación.
