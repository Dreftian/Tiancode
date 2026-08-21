# API Design with OpenAPI 3.1 and REST

Protocol for designing, validating, documenting, and testing robust APIs contract-first using OpenAPI 3.1 and schema validation libraries.

## Guidelines
1. **Contract-First & Type-Safe Handlers**:
   - Define exact request and response schemas (Zod or Effect Schema).
   - Use Hono / Express / Fastify with built-in schema validators.
2. **HTTP Status Codes & Error Envelopes**:
   - Return structured JSON error bodies: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
   - Never return `200 OK` with `{ success: false }` for genuine errors.
3. **Documentation Generation**:
   - Expose interactive Swagger/Scalar documentation routes at `/docs` in development.
