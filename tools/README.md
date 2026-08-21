# tools/

Carpeta de soporte del proyecto: todo lo que no es el código de la aplicación
(`frontend/`, `backend/`), la instalación (`install/`) ni las skills (`skills/`)
vive aquí para mantener la raíz del repositorio limpia y profesional.

| Carpeta | Contenido |
|---|---|
| `website/` | Landing estática en español (desplegada en Vercel: tiancode.vercel.app). Antes `Website/`. |
| `github/` | Workflows y plantillas de GitHub (antes `.github/`). **Nota:** GitHub solo ejecuta los workflows si están en `.github/workflows/` de la raíz; si el repositorio se publica, copia `tools/github/workflows/*` a `.github/workflows/`. |
| `docs/` | Documentación de diseño y especificaciones (antes `docs/`). |

## Convenciones

- **No importar desde aquí en el código de la app**: `backend/` y `frontend/`
  son autocontenidos; `tools/` es soporte (docs, CI, assets de la web).
- **La website se despliega desde el repo de GitHub** (Dreftian/Tiancode, solo
  la carpeta `website`); el repo local de la app no se empuja a GitHub.
- Los binarios instalables (`Tiancode.exe`, `Tiancode-portable.exe`) viven en
  `install/` y se publican en GitHub Releases con el mismo nombre.
