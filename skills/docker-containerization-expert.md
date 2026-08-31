---
name: "docker-containerization-expert"
description: "Contenedorización avanzada con Docker: builds multi-stage optimizados, Docker Compose, seguridad non-root y healthchecks."
---

# Docker Containerization & Multi-Stage Deployment Expert

## Propósito
Diseñar contenedores Docker seguros, ultra ligeros y reproducibles para entornos de desarrollo y producción.

## Buenas Prácticas
1. **Multi-Stage Builds**:
   - Separa la etapa de construcción (`builder`) de la imagen final mínima de producción (`runner` con Alpine o Distroless).
   - Aprovecha el caché de capas copiando archivos de dependencias (`package.json`, `bun.lockb`, `Cargo.toml`) antes del código fuente.

2. **Seguridad y Permisos**:
   - Nunca ejecutes como usuario `root`. Declara siempre un usuario no privilegiado (`USER node` o `USER appuser`).
   - Evita incluir secretos, claves `.env` o tokens en capas de imagen.

3. **Docker Compose & Redes**:
   - Define servicios desacoplados con redes aisladas y healthchecks explícitos (`HEALTHCHECK --interval=10s`).
   - Configura volúmenes nombrados para persistencia de datos.
