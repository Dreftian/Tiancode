import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { PermissionV1 } from "@tiancode-ai/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@tiancode-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import PROMPT_WEBAPP from "./prompt/webapp.txt"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@tiancode-ai/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@tiancode-ai/core/schema"
import { ProviderV2 } from "@tiancode-ai/core/provider"
import { ModelV2 } from "@tiancode-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@tiancode-ai/core/location-services"
import { Reference } from "@tiancode-ai/core/reference"
import { Location } from "@tiancode-ai/core/location"
import { PluginV2 } from "@tiancode-ai/core/plugin"

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  icon: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  /** Re-read agent definitions from disk after creating or editing agents. */
  readonly reload: () => Effect.Effect<void>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate" | "reload">

export class Service extends Context.Service<Service, Interface>()("@tiancode/Agent") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = Object.keys(cfg.references ?? cfg.reference ?? {}).length
          ? yield* Effect.gen(function* () {
              yield* (yield* PluginV2.Service).wait(PluginV2.ID.make("core/config-reference"))
              return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
            }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
          : []
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          build: {
            name: "build",
            description: "The default agent. Executes tools based on configured permissions.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          plan: {
            name: "plan",
            description: "Plan mode. Disallows all edit tools.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                task: {
                  general: "deny",
                },
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".tiancode", "plans", "*.md")]: "allow",
                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          webapp: {
            name: "webapp",
            description: "Frontend development. Builds full-JSX apps with a real-time live preview.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
              }),
              user,
            ),
            prompt: PROMPT_WEBAPP,
            mode: "primary",
            native: true,
            color: "#22d3ee",
          },
          general: {
            name: "general",
            description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                webfetch: "allow",
                websearch: "allow",
                read: "allow",
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description: `Fast agent specialized for exploring codebases. PROACTIVELY USE THIS SUBAGENT for multi-file codebase exploration, searching patterns, mapping structures, and answering architectural questions across unfamiliar projects.`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
          },
          "software-architect": {
            name: "software-architect",
            description: "PROACTIVELY USE THIS SUBAGENT. Arquitectura modular de sistemas, diseño desacoplado, DDD y principios SOLID. Despachar automáticamente para planificar y estructurar sistemas.",
            prompt: "Eres un arquitecto de software senior de élite. Diseñas sistemas limpios, modulares y altamente escalables. Evalúas trade-offs arquitectónicos, defines límites de módulos y garantizas que el código cumpla con los principios SOLID y clean architecture.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#3B82F6",
            icon: "🏛️",
            permission: defaults,
          },
          "fullstack-coder": {
            name: "fullstack-coder",
            description: "PROACTIVELY USE THIS SUBAGENT. Implementación fullstack ágil de features completas, backend, APIs, rutas de servidor, base de datos y lógica de negocio. Despachar automáticamente para construir código.",
            prompt: "Eres un ingeniero fullstack senior. Implementas requerimientos de inicio a fin con código robusto, tipado estricto en TypeScript/Rust/Go/Python, integración fluida de APIs y componentes limpios.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#8B5CF6",
            icon: "⚡",
            permission: defaults,
          },
          "devsecops-auditor": {
            name: "devsecops-auditor",
            description: "PROACTIVELY USE THIS SUBAGENT. Auditoría estricta de dependencias, CVEs, fugas de secretos y seguridad estática OWASP. Despachar automáticamente para verificar seguridad de código.",
            prompt: "Eres un auditor DevSecOps de élite. Tu función es inspeccionar dependencias, detectar vulnerabilidades de seguridad, evitar fugas de credenciales y validar que los cambios cumplan con los estándares OWASP.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#EF4444",
            icon: "🛡️",
            permission: defaults,
          },
          "ui-ux-master": {
            name: "ui-ux-master",
            description: "PROACTIVELY USE THIS SUBAGENT. Diseño visual moderno, Tailwind CSS, layouts responsivos, componentes accesibles y micro-interacciones. Despachar automáticamente ante cualquier requerimiento de UI/UX o frontend.",
            prompt: "Eres un diseñador y desarrollador frontend experto en UI/UX moderna. Diseñas interfaces atractivas, limpias, con excelente jerarquía visual, espaciados precisos, transiciones suaves y soporte completo para temas oscuro/claro.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#EC4899",
            icon: "🎨",
            permission: defaults,
          },
          "performance-optimizer": {
            name: "performance-optimizer",
            description: "PROACTIVELY USE THIS SUBAGENT. Perfilado de rendimiento, reducción de latencia, optimización de bundles y tiempos de carga. Despachar automáticamente ante problemas de rendimiento.",
            prompt: "Eres un especialista senior en rendimiento y optimización. Identificas cuellos de botella de CPU y memoria, optimizas bundles, eliminas re-renders innecesarios y aceleras tiempos de respuesta.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#F97316",
            icon: "🚀",
            permission: defaults,
          },
          "database-architect": {
            name: "database-architect",
            description: "PROACTIVELY USE THIS SUBAGENT. Optimización de esquemas, índices, planes de ejecución y migraciones Drizzle/Prisma. Despachar automáticamente para tareas de bases de datos.",
            prompt: "Eres un arquitecto de bases de datos senior. Analizas consultas SQL, índices, normalización, migraciones Drizzle/Prisma y concurrencia para garantizar máximo rendimiento sin cuellos de botella.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#EAB308",
            icon: "🗄️",
            permission: defaults,
          },
          "docs-generator": {
            name: "docs-generator",
            description: "PROACTIVELY USE THIS SUBAGENT. Generación de especificaciones OpenAPI, documentación técnica Markdown y guías de arquitectura.",
            prompt: "Eres un redactor técnico y arquitecto de APIs. Documentas cada endpoint, tipo de dato, arquitectura de módulos y guías de contribución con claridad profesional en formato Markdown.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#06B6D4",
            icon: "📝",
            permission: defaults,
          },
          "qa-e2e-tester": {
            name: "qa-e2e-tester",
            description: "PROACTIVELY USE THIS SUBAGENT. Creación de suites de pruebas unitarias, de integración y end-to-end con Vitest, Jest y Playwright. Despachar automáticamente para testing.",
            prompt: "Eres un ingeniero de QA y testing automatizado. Escribes suites de pruebas completas, validas casos borde y aseguras cobertura integral de código.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#10B981",
            icon: "🧪",
            permission: defaults,
          },
          "python-data-engineer": {
            name: "python-data-engineer",
            description: "PROACTIVELY USE THIS SUBAGENT para desarrollo en Python, scripts científicos, FastAPI, PyTorch, Pandas, NumPy, pipelines de datos y modelos AI. Despachar automáticamente ante tareas en Python o Machine Learning.",
            prompt: "Eres un ingeniero especialista en Python, Inteligencia Artificial y Ciencia de Datos. Desarrollas aplicaciones robustas con Python 3.12+, FastAPI, PyTorch, Pandas, NumPy, Scikit-learn y LangChain. Creas pipelines de datos eficientes, modelos de machine learning, APIs asíncronas de alto rendimiento y scripts limpios optimizados con Poetry o uv.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#3776AB",
            icon: "🐍",
            permission: defaults,
          },
          "rust-systems-engineer": {
            name: "rust-systems-engineer",
            description: "PROACTIVELY USE THIS SUBAGENT para desarrollo en Rust, Tokio, Axum, software de sistemas, seguridad de memoria y WebAssembly. Despachar automáticamente para código Rust de alto rendimiento.",
            prompt: "Eres un ingeniero de sistemas senior experto en Rust. Desarrollas aplicaciones de alto rendimiento, microservicios asíncronos con Tokio y Axum, herramientas CLI y módulos WebAssembly. Dominas la gestión de memoria sin garbage collector, lifetimes, concurrencia segura y zero-cost abstractions.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#DEA584",
            icon: "🦀",
            permission: defaults,
          },
          "go-backend-dev": {
            name: "go-backend-dev",
            description: "PROACTIVELY USE THIS SUBAGENT para desarrollo en Go (Golang), microservicios, gRPC, Gin/Fiber y sistemas concurrentes en la nube. Despachar automáticamente para backend en Go.",
            prompt: "Eres un ingeniero de backend y microservicios experto en Go (Golang). Diseñas e implementas servicios distribuidos concurrentes, APIs RESTful con Gin/Fiber, contratos gRPC con Protocol Buffers y workers asíncronos utilizando goroutines y channels con consumo mínimo de recursos.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#00ADD8",
            icon: "🐹",
            permission: defaults,
          },
          "mobile-app-developer": {
            name: "mobile-app-developer",
            description: "PROACTIVELY USE THIS SUBAGENT para aplicaciones móviles en Flutter, React Native/Expo, Swift/SwiftUI (iOS) y Kotlin/Compose (Android). Despachar automáticamente ante proyectos móviles.",
            prompt: "Eres un ingeniero especializado en desarrollo móvil profesional. Creas aplicaciones nativas y multiplataforma fluidas con Flutter, React Native/Expo, Swift/SwiftUI para iOS y Kotlin/Jetpack Compose para Android. Gestionas estado reactivo, arquitecturas offline-first, animaciones fluidas a 120fps y consumo eficiente de batería.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#10B981",
            icon: "📱",
            permission: defaults,
          },
          "cloud-devops-engineer": {
            name: "cloud-devops-engineer",
            description: "PROACTIVELY USE THIS SUBAGENT para Docker, Kubernetes, Terraform, CI/CD con GitHub Actions e infraestructura en AWS/GCP/Azure. Despachar automáticamente para tareas DevOps.",
            prompt: "Eres un arquitecto Cloud y DevOps de élite. Diseñas infraestructura como código con Terraform, contenedores Docker multi-stage hiperoptimizados, manifiestos de Kubernetes/Helm y pipelines de integración y despliegue continuo (CI/CD) con GitHub Actions para despliegues confiables en AWS, GCP o Azure.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#0284C7",
            icon: "☁️",
            permission: defaults,
          },
          "cpp-systems-expert": {
            name: "cpp-systems-expert",
            description: "PROACTIVELY USE THIS SUBAGENT para programación en C y C++ moderno (C++20/C++23), CMake, sistemas nativos y bajo nivel. Despachar automáticamente para código en C/C++.",
            prompt: "Eres un especialista de élite en C y C++ moderno (C++20/C++23). Desarrollas sistemas nativos, motores de procesamiento de datos, bindings nativos con CMake y software de bajo nivel. Dominas punteros inteligentes, RAII, metaprogramación de templates, depuración avanzada con GDB/LLDB y optimizaciones SIMD.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#659AD2",
            icon: "⚙️",
            permission: defaults,
          },
          "java-enterprise-architect": {
            name: "java-enterprise-architect",
            description: "PROACTIVELY USE THIS SUBAGENT para desarrollo en Java 21 LTS, Spring Boot 3, Hibernate/JPA y microservicios empresariales. Despachar automáticamente para proyectos en Java.",
            prompt: "Eres un arquitecto de software empresarial senior experto en Java 21 LTS y Spring Boot 3. Construyes microservicios robustos, arquitecturas basadas en eventos (Kafka/RabbitMQ), persistencia avanzada con Hibernate/JPA, seguridad Spring Security y pipelines de compilación con Maven o Gradle.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#F89820",
            icon: "☕",
            permission: defaults,
          },
          "dotnet-core-expert": {
            name: "dotnet-core-expert",
            description: "PROACTIVELY USE THIS SUBAGENT para desarrollo en C# y .NET 8/9, ASP.NET Core, EF Core y microservicios empresariales. Despachar automáticamente para proyectos en .NET/C#.",
            prompt: "Eres un ingeniero especialista en C# 12 y el ecosistema .NET 8/9. Creas APIs web de alto rendimiento con ASP.NET Core, modelos de datos y migraciones con Entity Framework Core, arquitecturas limpias en capas (Clean Architecture / CQRS) y servicios multiplataforma preparados para la nube.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#512BD4",
            icon: "🔷",
            permission: defaults,
          },
          "php-laravel-expert": {
            name: "php-laravel-expert",
            description: "PROACTIVELY USE THIS SUBAGENT para desarrollo en PHP 8.3+, Laravel 11, Eloquent ORM, Livewire y aplicaciones web modernas. Despachar automáticamente para proyectos en PHP o Laravel.",
            prompt: "Eres un desarrollador senior experto en PHP 8.3+ y el framework Laravel 11. Creas aplicaciones web modernas con Eloquent ORM, colas y jobs asíncronos con Redis, integración con Livewire o Inertia.js/Vue/React, APIs RESTful seguras y arquitecturas modulares comprobadas.",
            options: {},
            mode: "subagent",
            native: true,
            color: "#777BB4",
            icon: "🐘",
            permission: defaults,
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_SUMMARY,
          },
        }

        const configuredAgents: Record<string, Record<string, any>> = {
          ...((cfg as any).agents ?? {}),
          ...(cfg.agent ?? {}),
        }
        for (const [key, value] of Object.entries(configuredAgents)) {
          if (value.disable || value.disabled) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.icon = value.icon ?? item.icon
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const normalize = (name: string) => name.trim().replace(/^@/, "").toLowerCase().replace(/_/g, "-")
        const get = Effect.fnUntraced(function* (agent: string) {
          if (agents[agent]) return agents[agent]
          const target = normalize(agent)
          if (agents[target]) return agents[target]
          for (const key of Object.keys(agents)) {
            if (normalize(key) === target) return agents[key]
          }
          return agents[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            agents,
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      reload: Effect.fn("Agent.reload")(function* () {
        yield* InstanceState.invalidate(state)
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, Auth.node, Plugin.node, Skill.node, Provider.node, locationServiceMapNode],
})

export * as Agent from "./agent"
