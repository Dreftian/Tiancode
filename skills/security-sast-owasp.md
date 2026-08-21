# Static Application Security Testing (SAST) & OWASP Hardening

Provides rigorous checklists for auditing codebases against common vulnerabilities, hardcoded secrets, injection vectors, and broken access controls.

## Audit Checklist
1. **Secrets & Credentials**:
   - Verify no private keys, JWT secrets, database connection strings, or API keys are committed.
   - Enforce environment variable injection at runtime.
2. **Injection Defense**:
   - Always use parameterized queries for SQL.
   - Sanitize HTML inputs with DOMPurify before rendering in UI.
   - Avoid `eval()`, `child_process.exec` with unescaped user strings.
3. **Cross-Origin & Headers**:
   - Configure strict Content Security Policy (CSP), CORS, and HTTP security headers (HSTS, X-Frame-Options).
