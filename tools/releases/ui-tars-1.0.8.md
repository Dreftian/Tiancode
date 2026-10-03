# Integración de uso de la PC en Tiancode 1.0.8

Se revisaron el operador, los prompts, la conversión de coordenadas, la captura de escritorio y las interfaces de operador local/remoto de UI-TARS Desktop. La implementación usa el puente y la conversación existentes de Tiancode. El backend no importa Electron y el cliente no depende de Core ni Server.

| Capacidad | Implementación en Tiancode |
| --- | --- |
| Observar el escritorio | Imagen adjunta al resultado del modelo, monitor físico, ventana y contexto de UI Automation. |
| Actuar y comprobar | Una acción por observación; el agente vuelve a observar y verifica el resultado. |
| Clics y teclado | Clic izquierdo, derecho, central y doble, escritura Unicode, atajos y desplazamiento en un punto. |
| Arrastrar | Trayectoria nativa dentro de la aplicación autorizada; suelta en `finally`, incluida la interrupción. |
| Ventanas y monitores | Enumeración y activación por identidad reciente; selector de monitor y coordenadas físicas por pantalla. |
| Predicciones UI-TARS | Parser estricto del vocabulario local, cajas 0..1000 y tokens de caja; sin evaluación de código. |
| Esperar o pedir ayuda | `wait`, `finished` y `call_user`, integrados en la herramienta de la conversación. |
| Aviso de control | Luz azul transparente en todos los monitores y botón de parada con atajo global. |
| Proveedor del modelo | Proveedor y modelo seleccionados en la conversación; requiere visión y herramientas para el flujo visual. |

La autorización se vincula al PID y la ruta del ejecutable. Antes de cada entrada, el host nativo comprueba el proceso destino; una ventana elevada que Tiancode no puede controlar, el propio Tiancode, los procesos de credenciales y los ejecutables vetados se rechazan. Los nombres de controles no exponen valores de campos; UI Automation depende de lo que publique cada aplicación.

No se incorporan servicios de escritorio remoto, sus credenciales, operadores Android ni un segundo bucle de sesiones. Tampoco se garantiza que todos los programas expongan un árbol accesible, ni que cualquier modelo interprete imágenes o produzca llamadas a herramientas. Arrastrar entre procesos distintos exige autorización y una política adicional; esta versión limita el arrastre al proceso autorizado.

El instalador y las rutas de datos mantienen el comportamiento anterior. El único ajuste nuevo persistente es el monitor elegido; su ausencia usa el principal. Los contratos de la herramienta y el puente comparten `backend/schema/src/computer.ts`; el SDK se regenera con los scripts del repositorio.
