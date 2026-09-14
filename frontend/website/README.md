# Tiancode Website

Sitio oficial de Tiancode, un escritorio para Windows con modelos locales y proveedores de IA, agentes especializados, herramientas, dictado y vista previa.

[Sitio publicado](https://tiancode.vercel.app/) · [Código de la app](https://github.com/Dreftian/Tiancode) · [Versión 1.0.52](https://github.com/Dreftian/Tiancode/releases/tag/v1.0.52)

## Descargas

- [Instalador para Windows x64](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe)
- [Portable para Windows x64](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe)
- [Notas y archivos de cada versión](https://github.com/Dreftian/Tiancode/releases)

Los archivos de la publicación incluyen huellas SHA-256. El actualizador usa `latest.yml`, que contiene el tamaño y SHA-512 del instalador. No se requiere reinstalar ni volver a introducir claves al actualizar.

## Novedades de 1.0.52

- El borrado de modelos locales elimina también las entradas antiguas del catálogo de la interfaz.
- Catálogo de especialistas enfocados en ingeniería, programación, pruebas, diseño, marketing, datos y seguridad autorizada; compatibilidad con identificadores anteriores.
- Micrófono con selector visible y opción de mantener pulsado para grabar.
- Modos de permisos por sesión en el servidor clásico de escritorio. El servidor V2 expone sólo los controles que admite.
- Rápido utiliza la aceleración nativa de los modelos Anthropic compatibles. Puede tener un precio diferente según el proveedor. Ultracode añade un flujo de planificación, implementación y verificación con esfuerzo compatible.
- Actividad del Sandbox tomada de las herramientas de la sesión activa y control de Windows con comprobación de ventana y proceso.
- Descargas y subidas de versiones verificadas; los errores no se presentan como éxito.

Las demos de la web son ilustrativas. No ejecutan una IA ni representan un benchmark. La velocidad y los resultados dependen del modelo, del proveedor y del hardware. Los modelos y voces locales requieren una descarga inicial; los proveedores cloud y las herramientas de red requieren conexión.

## Desarrollo

Este repositorio contiene HTML, CSS y JavaScript, sin proceso de compilación. Sirve la carpeta con un servidor HTTP estático y abre `index.html`.

En el monorepo de Tiancode, la fuente está en `frontend/website`. La verificación de recursos y anclas se ejecuta con `bun tools/script/verify-website.ts`. Los módulos usan la misma versión de importación para compartir el estado del idioma.

La portada incluye novedades interactivas, una demo identificada como ejemplo y enlaces de descarga. Las páginas de documentación, inicio, preguntas frecuentes, portable, novedades y legal están bajo `recursos`, `productos` y `legal`.

## Publicación

El sitio se distribuye en [Dreftian/Tiancode-web](https://github.com/Dreftian/Tiancode-web) y se despliega en Vercel. Conserva el historial de versiones al actualizar `recursos/novedades.html`.

Código distribuido bajo licencia MIT; consulta [la licencia](legal/licencia.html).
