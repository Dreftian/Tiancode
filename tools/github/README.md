# GitHub tooling

Workflows, acciones y plantillas de GitHub (antes `.github/`).

> **Importante:** GitHub solo ejecuta los workflows ubicados en
> `.github/workflows/` **de la raíz del repositorio**. Esta carpeta se mantiene
> aquí para conservar el historial y el contenido, pero el CI queda **inactivo**
> mientras no se copie a la raíz. El repo local de la app no se publica en
> GitHub (el repo remoto Dreftian/Tiancode contiene solo la website), por lo
> que estos workflows no corren en ningún lado hoy.

## Cómo reactivar el CI (si el repo se publica)

```bash
mkdir -p .github
cp -r tools/github/workflows .github/workflows
cp -r tools/github/actions .github/actions
cp tools/github/CODEOWNERS .github/CODEOWNERS
```

## Contenido

- `workflows/` — pipelines de build, test, publish, stats y docs
- `actions/` — acciones reutilizables (setup-bun, setup-git-committer)
- `ISSUE_TEMPLATE/`, `pull_request_template.md` — plantillas de contribución
- `CODEOWNERS`, `TEAM_MEMBERS` — owners y miembros del equipo
