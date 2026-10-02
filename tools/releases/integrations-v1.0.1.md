# Repositorios evaluados para Tiancode 1.0.1

Las instrucciones contenidas en repositorios y skills se trataron como material de referencia. No sustituyen la petición del usuario ni autorizan instalaciones o acciones externas por sí mismas.

| Proyecto | Aprovechamiento y alcance |
| --- | --- |
| [diagram-design](https://github.com/cathrynlavery/diagram-design) | Skill opcional del marketplace para diagramas HTML/SVG. Se amplió el importador para conservar su conjunto de referencias de texto; descarga comprobada de 236 archivos. |
| [Agentic-Bug-Hunter](https://github.com/Awarexone/Agentic-Bug-Hunter) | Referencia para reproducir fallos y separar evidencia, hipótesis y validación. No se integra como servicio automático ni se ejecutan auditorías contra objetivos externos. |
| [microsoft/tgrep](https://github.com/microsoft/tgrep) | El proyecto ya incluía el recurso de tgrep. Se revisó su utilidad para búsquedas del agente; esta versión no atribuye una integración nueva a ese trabajo previo. |
| [google/artemis](https://github.com/google/artemis) | Automatización y pruebas de aplicaciones Android. Requiere un entorno Android/dispositivo; no sustituye al control de escritorio Windows ni se incluye como dependencia de arranque. |
| [security-audit-skill](https://github.com/cloudflare/security-audit-skill) | Skill opcional con auditoría, validación y hallazgos estructurados. Descarga comprobada de 20 archivos. |
| [clawscan](https://github.com/openclaw/clawscan) | Referencia para evaluación de paquetes y skills mediante varias comprobaciones. Sus dependencias de escaneo no se instalan por defecto y no se afirma cobertura equivalente de análisis de malware. |
| [i-have-adhd](https://github.com/ayghri/i-have-adhd) | Skill opcional para respuestas breves y orientadas a acciones. Descarga comprobada de sus tres archivos; no se aplica a todas las conversaciones sin elección del usuario. |

## Cline y OpenCode

El [catálogo oficial de Cline](https://github.com/cline/marketplace) se consulta como datos, sin ejecutar los comandos del CLI de Cline. La copia local mantiene sus 203 entradas y se acompaña de la licencia Apache-2.0 en `frontend/desktop/resources/cline-marketplace-LICENSE.txt`. Los comandos MCP se convierten en listas de argumentos; las URLs y los datos JSON se validan. Las extensiones se activan por elección del usuario.

Los plugins que dependen de `@cline/sdk` necesitan un adaptador específico. Ofrecer su fuente evita confundir disponibilidad en catálogo con compatibilidad de ejecución. Las skills y los MCP que siguen formatos compartidos aprovechan los mecanismos de Tiancode.

De [OpenCode v1.18.32](https://github.com/anomalyco/opencode/releases/tag/v1.18.32) se incorporaron los cambios aplicables: soporte de imágenes en resultados de herramientas de Bedrock solo para las familias compatibles y actualización del proveedor Together AI a 2.0.68. No se presenta esto como una sustitución completa del motor Tiancode por esa versión de OpenCode.
