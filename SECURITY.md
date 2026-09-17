# Seguridad

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad en Tiancode (app de escritorio, CLI o sitio web), no abras un issue público. Usa el [reporte privado de vulnerabilidades de GitHub](https://github.com/Dreftian/Tiancode/security/advisories/new) y describe:

- Versión afectada (`tiancode --version` o **Ajustes › General** en la app) y sistema operativo.
- Pasos para reproducirlo y el impacto que observas.
- Si aplica, una prueba de concepto mínima.

Recibirás respuesta en la medida de lo posible en un plazo de siete días. No se aceptan reportes generados automáticamente por IA sin verificación humana.

## Modelo de amenazas

- **Sin sandbox.** El sistema de permisos avisa antes de ejecutar comandos, escribir archivos o acceder a la red, pero no aísla al agente. Para aislamiento real, ejecuta Tiancode dentro de un contenedor o una máquina virtual.
- **Servidor.** `tiancode serve` y `tiancode web` escuchan en `127.0.0.1` por defecto. Si lo expones con `--hostname`, define `TIANCODE_SERVER_PASSWORD` para exigir autenticación HTTP básica; sin ella, el servidor avisa y queda sin autenticación.
- **Claves de proveedores.** Se guardan en el perfil local (app) o en la configuración del usuario (CLI) y solo viajan hacia el proveedor correspondiente.
- **Modelos y plugins de terceros.** Un modelo GGUF, un servidor MCP o un plugin son código o datos que tú decides ejecutar; revísalos antes de instalarlos.

Fuera de alcance: acceso al servidor cuando lo expones voluntariamente, escapes del sistema de permisos (no es un sandbox) y vulnerabilidades en dependencias ya publicadas por sus autores.

El modelo de amenazas detallado heredado de OpenCode está en [backend/docs/SECURITY.md](backend/docs/SECURITY.md).

---

### English

Report vulnerabilities privately through [GitHub security advisories](https://github.com/Dreftian/Tiancode/security/advisories/new) with the affected version, your OS, reproduction steps and impact. Tiancode does not sandbox the agent: the permission system is a UX safeguard, not an isolation boundary. `tiancode serve`/`web` bind to `127.0.0.1`; set `TIANCODE_SERVER_PASSWORD` before exposing them. AI-generated reports without human verification are not accepted. Details: [backend/docs/SECURITY.md](backend/docs/SECURITY.md).
