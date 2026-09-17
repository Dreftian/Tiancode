# Contribuir a Tiancode

Gracias por querer mejorar Tiancode. Esta guía resume cómo proponer cambios en la app de escritorio, el CLI y el sitio web. *(English summary at the end.)*

## Qué contribuciones encajan

- Corrección de errores y mejoras de rendimiento.
- Compatibilidad con nuevos proveedores, formateadores o LSP.
- Mejoras de documentación, traducciones (`en`, `es`, `ja`, `ko`, `ru`, `zh`) y del sitio web.
- Detección de nuevas herramientas de vista previa, plugins y servidores MCP.

Las funciones nuevas de interfaz o de producto se conversan antes en un issue para acordar el diseño. Mira los issues con las etiquetas `help wanted` y `good first issue`.

## Preparar el entorno

Requisitos: [Bun](https://bun.sh) 1.3 o superior y Git.

```bash
git clone https://github.com/Dreftian/Tiancode.git
cd Tiancode
bun install
```

- App de escritorio: `cd frontend/desktop && bun run dev`
- Servidor y CLI: `cd backend/tiancode && bun dev`
- Sitio web: `python -m http.server 4182 --directory frontend/website`

## Antes de abrir una pull request

1. `bun typecheck` en la raíz sin errores.
2. Pruebas del paquete que tocaste: `bun run test:unit` en `frontend/app`, `bun test src/main` en `frontend/desktop`, `bun run test` en `frontend/session-ui`, `bun test test/<carpeta>` en `backend/tiancode`.
3. Si añades texto de interfaz, incluye la clave en los seis idiomas de `frontend/app/src/i18n`.
4. Si cambias el protocolo HTTP público, regenera el cliente con `bun run generate` desde `backend/client`.

## Ramas, commits y títulos

- Nombre de rama corto, de hasta tres palabras separadas por guiones: `session-recovery`, `fix-scroll-state`.
- Mensajes de commit y títulos de PR con el estilo *conventional commits*: `tipo(ámbito): resumen`. Tipos válidos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Ámbitos habituales: `app`, `desktop`, `tiancode`, `core`, `tui`, `sdk`, `plugin`, `website`.
- Una PR resuelve una cosa. Describe qué cambia, por qué y cómo lo probaste; adjunta capturas si afecta a la interfaz.

## Estilo de código

- TypeScript en todo el repositorio; evita `any` y las anotaciones innecesarias.
- Prefiere las APIs de Bun (`Bun.file()`, `Bun.$`) y los métodos funcionales de arrays.
- Mantén la lógica en una función salvo que sea reutilizable; no extraigas helpers de un solo uso.
- Las dependencias van de Schema → Core y Protocol → Server; el cliente nunca depende de Core ni de Server.

Más detalles del backend en [backend/docs/CONTRIBUTING.md](backend/docs/CONTRIBUTING.md).

## Releases

Cada cambio visible para el usuario se publica como una versión nueva de `frontend/desktop/package.json` (y de `backend/tiancode/package.json` para el CLI). Las actualizaciones nunca borran datos del usuario. El proceso completo está en `tools/script`.

---

### English summary

Bug fixes, performance work, new providers, documentation, translations and website improvements are welcome; discuss new UI or product features in an issue first. Requirements: Bun 1.3+. Run `bun typecheck` at the root and the tests of the package you touched before opening a PR. Use short hyphenated branch names and conventional commit messages (`type(scope): summary`). Backend specifics live in [backend/docs/CONTRIBUTING.md](backend/docs/CONTRIBUTING.md).
