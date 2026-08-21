# Docker Containerization & Multi-Stage Deployment

Standards for creating minimal, cache-optimized, rootless Docker images for web and backend services.

## Best Practices
1. **Multi-Stage Builds**:
   - Separate dependency installation, build artifact generation, and lean runtime stages.
2. **Layer Caching**:
   - Copy `package.json` and lockfiles first before copying source code.
3. **Security & Non-Root Execution**:
   - Always run as `USER node` or dedicated unprivileged user in the final stage.
4. **Healthchecks & Graceful Shutdown**:
   - Include `HEALTHCHECK` directive and handle `SIGTERM` in application code.
