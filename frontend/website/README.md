# ZenithAI · sitio web de Tiancode

<p>
  <a href="https://github.com/Dreftian/Tiancode-web/releases/latest"><img alt="Versión" src="https://img.shields.io/github/v/release/Dreftian/Tiancode-web?style=flat-square&label=web&color=0ea5e9"></a>
  <a href="https://github.com/Dreftian/Tiancode/releases/latest"><img alt="App" src="https://img.shields.io/github/v/release/Dreftian/Tiancode?style=flat-square&label=app&color=8b5cf6"></a>
  <img alt="Estático" src="https://img.shields.io/badge/HTML%20%2B%20CSS%20%2B%20JS-sin%20build-10b981?style=flat-square">
</p>

Sitio oficial de ZenithAI para Tiancode: la app de escritorio para Windows y el CLI para Windows, macOS y Linux. La cabecera del sitio lleva la marca ZenithAI; el producto es Tiancode.

[Sitio publicado](https://tiancode.vercel.app/) · [Código de la app](https://github.com/Dreftian/Tiancode) · [Tiancode 1.0.0](https://github.com/Dreftian/Tiancode/releases/tag/v1.0.0)

## Cómo está hecho

- **Portada astral:** `js/galaxy.js` dibuja el logo de partículas TIANCODE en un canvas a pantalla completa.
- **Cabecera única:** marca ZenithAI, píldora de secciones centrada (con iconos, solo texto o solo iconos según el ancho) y el botón **Descargar v1.0.0** con su menú de instalación (Tiancode.exe, portable y los comandos `curl`, PowerShell, npm, bun y Homebrew con copia en un clic).
- **Universo:** `js/universe.js` gestiona el salto astral y los paneles (Visión general, Capacidades, La app, Novedades, Arquitectura, Skills, Descargar, FAQ); la misma píldora de la cabecera marca el panel activo. `css/universe.css` los estiliza.
- **Instaladores:** `install` (bash, macOS y Linux) e `install.ps1` (PowerShell) descargan el binario del CLI desde la release de GitHub; `vercel.json` los sirve como texto plano.
- **La app:** galería 3D con capturas reales en `img/app/*.webp` y puntos de interés definidos en `js/universe.js`.
- **Páginas internas:** `#/docs`, `#/guia`, `#/faq`, `#/novedades`, `#/portable`, `#/descarga`, `#/licencia`, `#/terminos` y `#/privacidad` (router en `js/router.js`), además de las páginas estáticas en `recursos/` y `legal/`.
- **Idiomas:** español e inglés (`js/i18n.js`); tema claro y oscuro (`js/theme.js`).

No hay paso de build: cualquier servidor estático sirve la carpeta tal cual. Para probar en local:

```bash
python -m http.server 4182 --directory .
```

## Caché

Los archivos CSS y JS se enlazan con `?v=1.0.0-r7`; al publicar cambios hay que subir ese sufijo para que los navegadores dejen de usar la copia en caché (Vercel los cachea una hora).

## Descargas de la app

- [Instalador para Windows x64](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe)
- [Portable para Windows x64](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe)
- [Notas y archivos de cada versión](https://github.com/Dreftian/Tiancode/releases)

Los archivos de la publicación incluyen huellas SHA-256. El actualizador usa `latest.yml`, que contiene el tamaño y SHA-512 del instalador.
