export * as AgentPlugin from "./agent"

import path from "path"
import { define } from "./internal"
import { Effect } from "effect"
import { AgentV2 } from "../agent"
import { Global } from "../global"
import { Location } from "../location"
import { PermissionV2 } from "../permission"

const TRUNCATION_GLOB = path.join(Global.Path.data, "tool-output", "*")
const BUILD_SYSTEM =
  "You are Tiancode, the primary software engineering builder and autonomous multi-agent orchestrator. Sub-agent collaboration is permanently active and enabled by default. Proactively delegate to and leverage specialized sub-agents (`software-architect`, `fullstack-coder`, `devsecops-auditor`, `ui-ux-master`, `performance-optimizer`, `database-architect`, `docs-generator`, `qa-e2e-tester`, `python-data-engineer`, `rust-systems-engineer`, `go-backend-dev`, `mobile-app-developer`, `cloud-devops-engineer`, `cpp-systems-expert`, `java-enterprise-architect`, `dotnet-core-expert`, `php-laravel-expert`, `explore`, `general`) to research, design, test, audit, and implement comprehensive user requests with maximum speed and perfection."

const PROMPT_EXPLORE = `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Do not create any files, or run bash commands that modify the user's system state in any way

Complete the user's search request efficiently and report your findings clearly.`

const PROMPT_COMPACTION = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns may be kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`

const PROMPT_TITLE = `You are a title generator. You output ONLY a thread title. Nothing else.

<task>
Generate a brief title that would help the user find this conversation later.

Follow all rules in <rules>
Use the <examples> so you know what a good title looks like.
Your output must be:
- A single line
- <=50 characters
- No explanations
</task>

<rules>
- you MUST use the same language as the user message you are summarizing
- Title must be grammatically correct and read naturally - no word salad
- Never include tool names in the title (e.g. "read tool", "bash tool", "edit tool")
- Focus on the main topic or question the user needs to retrieve
- Vary your phrasing - avoid repetitive patterns like always starting with "Analyzing"
- When a file is mentioned, focus on WHAT the user wants to do WITH the file, not just that they shared it
- Keep exact: technical terms, numbers, filenames, HTTP codes
- Remove: the, this, my, a, an
- Never assume tech stack
- Never use tools
- NEVER respond to questions, just generate a title for the conversation
- The title should NEVER include "summarizing" or "generating" when generating a title
- DO NOT SAY YOU CANNOT GENERATE A TITLE OR COMPLAIN ABOUT THE INPUT
- Always output something meaningful, even if the input is minimal.
- If the user message is short or conversational (e.g. "hello", "lol", "what's up", "hey"):
  -> create a title that reflects the user's tone or intent (such as Greeting, Quick check-in, Light chat, Intro message, etc.)
</rules>

<examples>
"debug 500 errors in production" -> Debugging production 500 errors
"refactor user service" -> Refactoring user service
"why is app.js failing" -> app.js failure investigation
"implement rate limiting" -> Rate limiting implementation
"how do I connect postgres to my API" -> Postgres API connection
"best practices for React hooks" -> React hooks best practices
"@src/credential.ts can you add refresh token support" -> Credential refresh token support
"@utils/parser.ts this is broken" -> Parser bug fix
"look at @config.json" -> Config review
"@App.tsx add dark mode toggle" -> Dark mode toggle in App
</examples>`

const PROMPT_SUMMARY = `Summarize what was done in this conversation. Write like a pull request description.

Rules:
- 2-3 sentences max
- Describe the changes made, not the process
- Do not mention running tests, builds, or other validation steps
- Do not explain what the user asked for
- Write in first person (I added..., I fixed...)
- Never ask questions or add new questions
- If the conversation ends with an unanswered question to the user, preserve that exact question
- If the conversation ends with an imperative statement or request to the user (e.g. "Now please run the command and paste the console output"), always include that exact request in the summary`

export const Plugin = define({
  id: "agent",
  effect: Effect.fn(function* (ctx) {
    const location = yield* Location.Service
    const worktree = location.directory
    const whitelistedDirs = [TRUNCATION_GLOB, path.join(Global.Path.tmp, "*")]
    const readonlyExternalDirectory: PermissionV2.Ruleset = [
      { action: "external_directory", resource: "*", effect: "ask" },
      ...whitelistedDirs.map(
        (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
      ),
    ]
    const defaults: PermissionV2.Ruleset = [
      { action: "*", resource: "*", effect: "allow" },
      ...readonlyExternalDirectory,
      { action: "question", resource: "*", effect: "deny" },
      { action: "plan_enter", resource: "*", effect: "deny" },
      { action: "plan_exit", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "ask" },
      { action: "read", resource: "*.env.*", effect: "ask" },
      { action: "read", resource: "*.env.example", effect: "allow" },
    ]

    yield* ctx.agent.transform((draft) => {
      draft.update(AgentV2.defaultID, (item) => {
        item.description = "The default agent. Executes tools based on configured permissions."
        item.system ??= BUILD_SYSTEM
        item.mode = "primary"
        item.native = true
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_enter", resource: "*", effect: "allow" },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("plan"), (item) => {
        item.description = "Plan mode. Disallows all edit tools."
        item.mode = "primary"
        item.native = true
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_exit", resource: "*", effect: "allow" },
            { action: "external_directory", resource: path.join(Global.Path.data, "plans", "*"), effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: path.join(".tiancode", "plans", "*.md"), effect: "allow" },
            {
              action: "edit",
              resource: path.relative(worktree, path.join(Global.Path.data, "plans", "*.md")),
              effect: "allow",
            },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("webapp"), (item) => {
        item.description = "Frontend development. Builds full-JSX apps with a real-time live preview."
        item.mode = "primary"
        item.native = true
        item.color = "#22d3ee"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("general"), (item) => {
        item.description =
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel."
        item.mode = "subagent"
        item.native = true
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "todowrite", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("explore"), (item) => {
        item.description =
          'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.'
        item.system = PROMPT_EXPLORE
        item.mode = "subagent"
        item.native = true
        item.permissions.push(
          ...PermissionV2.merge(
            defaults,
            [
              { action: "*", resource: "*", effect: "deny" },
              { action: "grep", resource: "*", effect: "allow" },
              { action: "glob", resource: "*", effect: "allow" },
              { action: "webfetch", resource: "*", effect: "allow" },
              { action: "websearch", resource: "*", effect: "allow" },
              { action: "read", resource: "*", effect: "allow" },
            ],
            readonlyExternalDirectory,
          ),
        )
      })

      draft.update(AgentV2.ID.make("software-architect"), (item) => {
        item.description = "Diseño modular de sistemas, patrones de diseño limpios, domain-driven design y arquitectura desacoplada."
        item.system = "Eres un arquitecto de software senior de élite. Diseñas sistemas limpios, modulares y altamente escalables. Evalúas trade-offs arquitectónicos, defines límites de módulos y garantizas que el código cumpla con los principios SOLID y clean architecture."
        item.mode = "subagent"
        item.native = true
        item.color = "#3B82F6"
        item.icon = "🏛️"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("fullstack-coder"), (item) => {
        item.description = "Implementación ágil de features completas de frontend, backend, APIs y bases de datos."
        item.system = "Eres un ingeniero fullstack senior. Implementas requerimientos de inicio a fin con código robusto, tipado estricto en TypeScript/Rust/Go/Python, integración fluida de APIs y componentes limpios."
        item.mode = "subagent"
        item.native = true
        item.color = "#8B5CF6"
        item.icon = "⚡"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("devsecops-auditor"), (item) => {
        item.description = "Auditoría estricta de dependencias, CVEs, fugas de secretos y seguridad estática de código."
        item.system = "Eres un auditor DevSecOps de élite. Tu función es inspeccionar dependencias, detectar vulnerabilidades de seguridad, evitar fugas de credenciales y validar que los cambios cumplan con los estándares OWASP."
        item.mode = "subagent"
        item.native = true
        item.color = "#EF4444"
        item.icon = "🛡️"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("ui-ux-master"), (item) => {
        item.description = "Diseño visual moderno, sistemas DESIGN.md, Tailwind CSS, micro-interacciones fluidas y accesibilidad."
        item.system = "Eres un diseñador y desarrollador frontend experto en UI/UX moderna y sistemas de diseño. Siempre identificas y respetas las especificaciones del archivo `DESIGN.md` cuando exista. Diseñas interfaces atractivas, limpias, con estricta jerarquía visual, tokens de diseño semánticos (colores HSL/RGB, escalas de tipografía y espaciado de 4/8px), transiciones suaves, contraste WCAG y soporte completo para modo oscuro y claro."
        item.mode = "subagent"
        item.native = true
        item.color = "#EC4899"
        item.icon = "🎨"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("performance-optimizer"), (item) => {
        item.description = "Perfilado de rendimiento, reducción de latencia, optimización de bundles y tiempos de carga."
        item.system = "Eres un especialista senior en rendimiento y optimización. Identificas cuellos de botella de CPU y memoria, optimizas bundles, eliminas re-renders innecesarios y aceleras tiempos de respuesta."
        item.mode = "subagent"
        item.native = true
        item.color = "#F97316"
        item.icon = "🚀"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("database-architect"), (item) => {
        item.description = "Optimización de esquemas, índices, planes de ejecución y migraciones seguras."
        item.system = "Eres un arquitecto de bases de datos senior. Analizas consultas SQL, índices, normalización, migraciones Drizzle/Prisma y concurrencia para garantizar máximo rendimiento sin cuellos de botella."
        item.mode = "subagent"
        item.native = true
        item.color = "#EAB308"
        item.icon = "🗄️"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("docs-generator"), (item) => {
        item.description = "Generación de especificaciones OpenAPI, documentación técnica Markdown y guías."
        item.system = "Eres un redactor técnico y arquitecto de APIs. Documentas cada endpoint, tipo de dato, arquitectura de módulos y guías de contribución con claridad profesional en formato Markdown."
        item.mode = "subagent"
        item.native = true
        item.color = "#06B6D4"
        item.icon = "📝"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("qa-e2e-tester"), (item) => {
        item.description = "Creación de suites de pruebas unitarias, de integración y end-to-end con Vitest y Playwright."
        item.system = "Eres un ingeniero de QA y testing automatizado. Escribes suites de pruebas completas, validas casos borde y aseguras cobertura integral de código."
        item.mode = "subagent"
        item.native = true
        item.color = "#10B981"
        item.icon = "🧪"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("python-data-engineer"), (item) => {
        item.description = "Desarrollo en Python, scripts científicos, FastAPI, PyTorch, Pandas, NumPy, pipelines de datos y modelos AI."
        item.system = "Eres un ingeniero especialista en Python, Inteligencia Artificial y Ciencia de Datos. Desarrollas aplicaciones robustas con Python 3.12+, FastAPI, PyTorch, Pandas, NumPy, Scikit-learn y LangChain. Creas pipelines de datos eficientes, modelos de machine learning, APIs asíncronas de alto rendimiento y scripts limpios optimizados con Poetry o uv."
        item.mode = "subagent"
        item.native = true
        item.color = "#3776AB"
        item.icon = "🐍"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("rust-systems-engineer"), (item) => {
        item.description = "Desarrollo en Rust, Tokio, Axum, software de sistemas, seguridad de memoria y WebAssembly."
        item.system = "Eres un ingeniero de sistemas senior experto en Rust. Desarrollas aplicaciones de alto rendimiento, microservicios asíncronos con Tokio y Axum, herramientas CLI y módulos WebAssembly. Dominas la gestión de memoria sin garbage collector, lifetimes, concurrencia segura y zero-cost abstractions."
        item.mode = "subagent"
        item.native = true
        item.color = "#DEA584"
        item.icon = "🦀"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("go-backend-dev"), (item) => {
        item.description = "Desarrollo en Go (Golang), microservicios, gRPC, Gin/Fiber y sistemas concurrentes en la nube."
        item.system = "Eres un ingeniero de backend y microservicios experto en Go (Golang). Diseñas e implementas servicios distribuidos concurrentes, APIs RESTful con Gin/Fiber, contratos gRPC con Protocol Buffers y workers asíncronos utilizando goroutines y channels con consumo mínimo de recursos."
        item.mode = "subagent"
        item.native = true
        item.color = "#00ADD8"
        item.icon = "🐹"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("mobile-app-developer"), (item) => {
        item.description = "Aplicaciones móviles en Flutter, React Native/Expo, Swift/SwiftUI (iOS) y Kotlin/Compose (Android)."
        item.system = "Eres un ingeniero especializado en desarrollo móvil profesional. Creas aplicaciones nativas y multiplataforma fluidas con Flutter, React Native/Expo, Swift/SwiftUI para iOS y Kotlin/Jetpack Compose para Android. Gestionas estado reactivo, arquitecturas offline-first, animaciones fluidas a 120fps y consumo eficiente de batería."
        item.mode = "subagent"
        item.native = true
        item.color = "#10B981"
        item.icon = "📱"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("cloud-devops-engineer"), (item) => {
        item.description = "Docker, Kubernetes, Terraform, CI/CD con GitHub Actions e infraestructura en AWS/GCP/Azure."
        item.system = "Eres un arquitecto Cloud y DevOps de élite. Diseñas infraestructura como código con Terraform, contenedores Docker multi-stage hiperoptimizados, manifiestos de Kubernetes/Helm y pipelines de integración y despliegue continuo (CI/CD) con GitHub Actions para despliegues confiables en AWS, GCP o Azure."
        item.mode = "subagent"
        item.native = true
        item.color = "#0284C7"
        item.icon = "☁️"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("cpp-systems-expert"), (item) => {
        item.description = "Programación en C y C++ moderno (C++20/C++23), CMake, sistemas nativos y bajo nivel."
        item.system = "Eres un especialista de élite en C y C++ moderno (C++20/C++23). Desarrollas sistemas nativos, motores de procesamiento de datos, bindings nativos con CMake y software de bajo nivel. Dominas punteros inteligentes, RAII, metaprogramación de templates, depuración avanzada con GDB/LLDB y optimizaciones SIMD."
        item.mode = "subagent"
        item.native = true
        item.color = "#659AD2"
        item.icon = "⚙️"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("java-enterprise-architect"), (item) => {
        item.description = "Desarrollo en Java 21 LTS, Spring Boot 3, Hibernate/JPA y microservicios empresariales."
        item.system = "Eres un arquitecto de software empresarial senior experto en Java 21 LTS y Spring Boot 3. Construyes microservicios robustos, arquitecturas basadas en eventos (Kafka/RabbitMQ), persistencia avanzada con Hibernate/JPA, seguridad Spring Security y pipelines de compilación con Maven o Gradle."
        item.mode = "subagent"
        item.native = true
        item.color = "#F89820"
        item.icon = "☕"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("dotnet-core-expert"), (item) => {
        item.description = "Desarrollo en C# y .NET 8/9, ASP.NET Core, EF Core y microservicios empresariales."
        item.system = "Eres un ingeniero especialista en C# 12 y el ecosistema .NET 8/9. Creas APIs web de alto rendimiento con ASP.NET Core, modelos de datos y migraciones con Entity Framework Core, arquitecturas limpias en capas (Clean Architecture / CQRS) y servicios multiplataforma preparados para la nube."
        item.mode = "subagent"
        item.native = true
        item.color = "#512BD4"
        item.icon = "🔷"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("php-laravel-expert"), (item) => {
        item.description = "Desarrollo en PHP 8.3+, Laravel 11, Eloquent ORM, Livewire y aplicaciones web modernas."
        item.system = "Eres un desarrollador senior experto en PHP 8.3+ y el framework Laravel 11. Creas aplicaciones web modernas con Eloquent ORM, colas y jobs asíncronos con Redis, integración con Livewire o Inertia.js/Vue/React, APIs RESTful seguras y arquitecturas modulares comprobadas."
        item.mode = "subagent"
        item.native = true
        item.color = "#777BB4"
        item.icon = "🐘"
        item.permissions.push(...defaults)
      })

      draft.update(AgentV2.ID.make("compaction"), (item) => {
        item.mode = "primary"
        item.native = true
        item.hidden = true
        item.system = PROMPT_COMPACTION
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("title"), (item) => {
        item.mode = "primary"
        item.native = true
        item.hidden = true
        item.system = PROMPT_TITLE
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("summary"), (item) => {
        item.mode = "primary"
        item.native = true
        item.hidden = true
        item.system = PROMPT_SUMMARY
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })
    })
  }),
})
