# Tiancode Web

<p>
  <a href="https://github.com/Dreftian/Tiancode-web/releases/latest"><img alt="Versión" src="https://img.shields.io/github/v/release/Dreftian/Tiancode-web?style=flat-square&label=web&color=0ea5e9"></a>
  <a href="https://github.com/Dreftian/Tiancode/releases/latest"><img alt="App" src="https://img.shields.io/github/v/release/Dreftian/Tiancode?style=flat-square&label=app&color=8b5cf6"></a>
  <img alt="Estático" src="https://img.shields.io/badge/HTML%20%2B%20CSS%20%2B%20JS-sin%20build-10b981?style=flat-square">
</p>

Sitio oficial de Tiancode, el escritorio de inteligencia agéntica local-first para Windows.

[Sitio publicado](https://tiancode.vercel.app/) · [Código de la app](https://github.com/Dreftian/Tiancode) · [Tiancode 1.0.0](https://github.com/Dreftian/Tiancode/releases/tag/v1.0.0)

## Cómo está hecho

- **Portada astral:** `js/galaxy.js` dibuja el logo de partículas TIANCODE en un canvas a pantalla completa.
- **Universo:** `js/universe.js` gestiona el salto astral y los paneles (Visión general, Capacidades, La app, Novedades, Arquitectura, Skills, Descargar, FAQ) con una barra de navegación superior; `css/universe.css` los estiliza.
- **La app:** galería 3D con capturas reales en `img/app/*.webp` y puntos de interés definidos en `js/universe.js`.
- **Páginas internas:** `#/docs`, `#/guia`, `#/faq`, `#/novedades`, `#/portable`, `#/descarga`, `#/licencia`, `#/terminos` y `#/privacidad` (router en `js/router.js`), además de las páginas estáticas en `recursos/` y `legal/`.
- **Idiomas:** español e inglés (`js/i18n.js`); tema claro y oscuro (`js/theme.js`).

No hay paso de build: cualquier servidor estático sirve la carpeta tal cual. Para probar en local:

```bash
python -m http.server 4182 --directory .
```

## Descargas de la app

- [Instalador para Windows x64](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode.exe)
- [Portable para Windows x64](https://github.com/Dreftian/Tiancode/releases/latest/download/Tiancode-portable.exe)
- [Notas y archivos de cada versión](https://github.com/Dreftian/Tiancode/releases)

Los archivos de la publicación incluyen huellas SHA-256. El actualizador usa `latest.yml`, que contiene el tamaño y SHA-512 del instalador.
