# Website (Tiancode)

Landing estática en español de Tiancode, desplegada en
[tiancode.vercel.app](https://tiancode.vercel.app). Antes vivía en `Website/`.

## Desarrollo local

```bash
cd tools/website
bunx serve .
```

## Despliegue

La página se despliega desde el repositorio de GitHub
[Dreftian/Tiancode](https://github.com/Dreftian/Tiancode) (Vercel apunta a la
carpeta `website` de ese repo, que contiene SOLO esta carpeta). Para publicar
cambios hechos aquí, sincroniza el contenido de `tools/website/` con la carpeta
`website/` de ese repositorio.

## Estructura

- `index.html` — landing con SEO completo (OG, Twitter, JSON-LD, favicon)
- `css/`, `js/` — estilos y scripts (router hash, animaciones, gráficas)
- `recursos/` — páginas de descargas (enlazan los binarios de GitHub Releases)
- `legal/`, `productos/` — páginas legales y de producto
- `robots.txt`, `sitemap.xml`, `site.webmanifest`, `vercel.json` — SEO y deploy
