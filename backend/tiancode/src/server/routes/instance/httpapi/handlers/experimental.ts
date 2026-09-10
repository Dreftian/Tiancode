import { Account } from "@/account/account"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MCP } from "@/mcp"
import { Project } from "@/project/project"
import { Session } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { LLMEvent } from "@tiancode-ai/llm"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ToolRegistry } from "@/tool/registry"
import { Worktree } from "@/worktree"
import { Effect, Option, Stream } from "effect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  ConsoleSwitchPayload,
  OptimizePromptPayload,
  SessionListQuery,
  ToolListQuery,
  WorktreeApiError,
} from "../groups/experimental"

const PROMPT_OPTIMIZER_AGENT: Agent.Info = {
  name: "prompt-optimizer",
  mode: "primary",
  permission: [],
  options: {},
  native: true,
  prompt: "",
}

function buildPromptOptimizerSystemPrompt(
  modelFamily: string,
  language: string,
  style: "standard" | "rigorous" | "minimal" = "standard",
) {
  const isSpanish = language.toLowerCase().startsWith("es")

  const styleInstructions = {
    standard: isSpanish
      ? "Crea un prompt estructurado, claro y directo para un asistente de código, balanceando contexto, tarea, restricciones y verificación."
      : "Create a structured, clear, and direct prompt for a coding assistant, balancing context, task, constraints, and verification.",
    rigorous: isSpanish
      ? "Enfócate en máxima rigurosidad técnica: añade requisitos de TDD (pruebas primero o pruebas obligatorias), casos borde, invariantes de tipado y validación defensiva."
      : "Focus on maximum technical rigor: enforce TDD/testing requirements, edge cases, type-safety invariants, and defensive validation.",
    minimal: isSpanish
      ? "Enfócate en alcance quirúrgico y mínimo: cambios exclusivamente en las líneas o archivos necesarios, cero refactorización no solicitada y máxima estabilidad del código existente."
      : "Focus on surgical, minimal scope: modify only necessary lines/files, zero unsolicited refactorings, and strict preservation of existing code stability.",
  }[style]

  const formatGuidance =
    modelFamily === "claude"
      ? isSpanish
        ? `Usa la convención de etiquetas XML para Anthropic Claude:
<context>
[Contexto del proyecto o archivos relevantes]
</context>

<objective>
[Objetivo principal claro e inequívoco]
</objective>

<instructions>
[Instrucciones paso a paso detalladas]
</instructions>

<constraints>
[Restricciones, reglas anti-sobreingeniería y lo que NO se debe hacer]
</constraints>

<verification>
[Comandos o criterios específicos para validar la solución]
</verification>`
        : `Use Anthropic Claude XML tags convention:
<context>
[Relevant project or files context]
</context>

<objective>
[Clear, unambiguous primary objective]
</objective>

<instructions>
[Step-by-step implementation requirements]
</instructions>

<constraints>
[Constraints, anti-overengineering rules, and what NOT to do]
</constraints>

<verification>
[Concrete commands or verification criteria to validate solution]
</verification>`
      : isSpanish
        ? `Usa una estructura Markdown limpia y jerárquica:
### Objetivo
[Meta concreta e inequívoca]

### Contexto & Requisitos
[Detalles técnicos, archivos o stack involucrado]

### Implementación
[Desglose funcional y pasos específicos]

### Restricciones & Invariantes
[Reglas anti-sobreingeniería: alcance mínimo, respetar código existente, no placeholders # TODO]

### Plan de Verificación
[Pruebas automatizadas, linters o comprobaciones manuales]`
        : `Use clean, hierarchical Markdown structure:
### Objective
[Concrete and unambiguous goal]

### Context & Requirements
[Technical details, files or tech stack]

### Implementation
[Functional breakdown and specific steps]

### Constraints & Invariants
[Anti-overengineering rules: surgical scope, respect existing patterns, zero # TODO placeholders]

### Verification Plan
[Automated tests, linters, or concrete manual checks]`

  return isSpanish
    ? `Eres el motor experto de optimización de prompts para asistentes de IA de desarrollo en Tiancode.
Tu misión es transformar el input informal o breve del desarrollador en un prompt de alta precisión para un modelo de programación.

ESTILO: ${styleInstructions}

REGLAS CRÍTICAS:
1. PRESERVA CÓDIGO Y VARIABLES: Cualquier fragmento de código, ruta de archivo, URL, nombres de variables o placeholders (\`\${var}\`, \`{{var}}\`, backticks) del input original DEBEN mantenerse intactos.
2. PRESERVA LA INTENCIÓN Y EL IDIOMA: Conserva la tecnología, stack e intención original del usuario. Responde en ESPAÑOL.
3. ANTI-SOBREINGENIERÍA: Incluye directivas de no añadir abstracciones innecesarias, no refactorizar código no relacionado y no dejar código stub o comentarios vacíos.
4. SALIDA DIRECTA: Emite ÚNICAMENTE el texto del prompt optimizado. NO incluyas introducciones como "Aquí tienes tu prompt", explicaciones, saludos ni bloques delimitadores markdown adicionales al inicio o final. Empieza directamente con el contenido del prompt.

FORMATO SUGERIDO:
${formatGuidance}`
    : `You are Tiancode's elite prompt optimization engine for AI coding assistants.
Your mission is to transform raw, vague, or brief developer instructions into high-precision, production-grade prompts.

STYLE: ${styleInstructions}

CRITICAL RULES:
1. PRESERVE CODE AND VARIABLES: Any code snippets, file paths, URLs, variable names, or placeholders (\`\${var}\`, \`{{var}}\`, backticks) from the original input MUST remain intact.
2. PRESERVE INTENT AND LANGUAGE: Maintain the user's intended stack and objective. Respond in ENGLISH.
3. ANTI-OVERENGINEERING: Include clear directives to avoid unnecessary abstractions, unsolicited refactoring, and empty stub/TODO comments.
4. DIRECT OUTPUT ONLY: Output ONLY the enhanced prompt. Do NOT include conversational filler such as "Here is your improved prompt:", introductions, explanations, or wrapping meta codeblocks. Start directly with the prompt text.

SUGGESTED FORMAT:
${formatGuidance}`
}

function mapWorktreeError<A, R>(self: Effect.Effect<A, Worktree.Error, R>) {
  return self.pipe(
    Effect.mapError((error) => new WorktreeApiError({ name: error._tag, data: { message: error.message } })),
  )
}

export const experimentalHandlers = HttpApiBuilder.group(InstanceHttpApi, "experimental", (handlers) =>
  Effect.gen(function* () {
    const account = yield* Account.Service
    const agents = yield* Agent.Service
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const project = yield* Project.Service
    const registry = yield* ToolRegistry.Service
    const worktreeSvc = yield* Worktree.Service
    const sessions = yield* Session.Service
    const background = yield* BackgroundJob.Service
    const flags = yield* RuntimeFlags.Service
    const llm = yield* LLM.Service
    const provider = yield* Provider.Service

    const capabilities = Effect.fn("ExperimentalHttpApi.capabilities")(function* () {
      return { backgroundSubagents: flags.experimentalBackgroundSubagents }
    })

    const getConsole = Effect.fn("ExperimentalHttpApi.console")(function* () {
      const [state, groups] = yield* Effect.all(
        [
          config.getConsoleState(),
          account.orgsByAccount().pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({})))),
        ],
        {
          concurrency: "unbounded",
        },
      )
      return {
        consoleManagedProviders: state.consoleManagedProviders,
        ...(state.activeOrgName ? { activeOrgName: state.activeOrgName } : {}),
        switchableOrgCount: groups.reduce((count, group) => count + group.orgs.length, 0),
      }
    })

    const listConsoleOrgs = Effect.fn("ExperimentalHttpApi.consoleOrgs")(function* () {
      const [groups, active] = yield* Effect.all(
        [
          account.orgsByAccount().pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({})))),
          account.active().pipe(Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({})))),
        ],
        {
          concurrency: "unbounded",
        },
      )
      const info = Option.getOrUndefined(active)
      return {
        orgs: groups.flatMap((group) =>
          group.orgs.map((org) => ({
            accountID: group.account.id,
            accountEmail: group.account.email,
            accountUrl: group.account.url,
            orgID: org.id,
            orgName: org.name,
            active: !!info && info.id === group.account.id && info.active_org_id === org.id,
          })),
        ),
      }
    })

    const switchConsole = Effect.fn("ExperimentalHttpApi.consoleSwitch")(function* (ctx: {
      payload: typeof ConsoleSwitchPayload.Type
    }) {
      yield* account
        .use(ctx.payload.accountID, Option.some(ctx.payload.orgID))
        .pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))))
      return true
    })

    const tool = Effect.fn("ExperimentalHttpApi.tool")(function* (ctx: { query: typeof ToolListQuery.Type }) {
      const list = yield* registry.tools({
        providerID: ctx.query.provider,
        modelID: ctx.query.model,
        agent: yield* agents.defaultInfo(),
      })
      return list.map((item) => ({
        id: item.id,
        description: item.description,
        parameters: ToolJsonSchema.fromTool(item),
      }))
    })

    const toolIDs = Effect.fn("ExperimentalHttpApi.toolIDs")(function* () {
      return yield* registry.ids()
    })

    const worktree = Effect.fn("ExperimentalHttpApi.worktree")(function* () {
      const ctx = yield* InstanceState.context
      return yield* project.sandboxes(ctx.project.id)
    })

    const worktreeCreate = Effect.fn("ExperimentalHttpApi.worktreeCreate")(function* (ctx: {
      payload: typeof Worktree.CreateInput.Type | void
    }) {
      return yield* mapWorktreeError(worktreeSvc.create(ctx.payload ?? undefined))
    })

    const worktreeRemove = Effect.fn("ExperimentalHttpApi.worktreeRemove")(function* (input: {
      payload: Worktree.RemoveInput
    }) {
      const ctx = yield* InstanceState.context
      yield* mapWorktreeError(worktreeSvc.remove(input.payload))
      yield* project.removeSandbox(ctx.project.id, input.payload.directory)
      return true
    })

    const worktreeReset = Effect.fn("ExperimentalHttpApi.worktreeReset")(function* (ctx: {
      payload: Worktree.ResetInput
    }) {
      yield* mapWorktreeError(worktreeSvc.reset(ctx.payload))
      return true
    })

    const session = Effect.fn("ExperimentalHttpApi.session")(function* (ctx: { query: typeof SessionListQuery.Type }) {
      const limit = ctx.query.limit ?? 100
      const directory = ctx.query.directory ? yield* InstanceState.directory : undefined
      const all = yield* sessions.listGlobal({
        directory,
        roots: ctx.query.roots,
        start: ctx.query.start,
        cursor: ctx.query.cursor,
        search: ctx.query.search,
        limit: limit + 1,
        archived: ctx.query.archived,
      })
      const list = all.length > limit ? all.slice(0, limit) : all
      return HttpServerResponse.jsonUnsafe(list, {
        headers:
          all.length > limit && list.length > 0
            ? { "x-next-cursor": String(list[list.length - 1].time.updated) }
            : undefined,
      })
    })

    const sessionBackground = Effect.fn("ExperimentalHttpApi.sessionBackground")(function* (ctx: {
      params: { sessionID: SessionID }
    }) {
      if (!flags.experimentalBackgroundSubagents) return false
      const jobs = (yield* background.list()).filter(
        (job) =>
          job.type === "task" &&
          job.status === "running" &&
          job.metadata?.parentSessionId === ctx.params.sessionID &&
          job.metadata.background !== true,
      )
      const promoted = yield* Effect.forEach(jobs, (job) => background.promote(job.id), { concurrency: "unbounded" })
      return promoted.some((job) => job !== undefined)
    })

    const resource = Effect.fn("ExperimentalHttpApi.resource")(function* () {
      return yield* mcp.resources()
    })

    const optimizePrompt = Effect.fn("ExperimentalHttpApi.optimizePrompt")(function* (ctx: {
      payload: typeof OptimizePromptPayload.Type
    }) {
      const rawPrompt = ctx.payload.prompt.trim()
      if (!rawPrompt) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }

      const resolveModel = Effect.gen(function* () {
        if (ctx.payload.providerID && ctx.payload.modelID) {
          const m = yield* provider
            .getModel(ctx.payload.providerID, ctx.payload.modelID)
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (m) return m
        }
        const fallback = yield* provider.defaultModel().pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!fallback) return undefined
        return (
          (yield* provider.getSmallModel(fallback.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))) ??
          (yield* provider.getModel(fallback.providerID, fallback.modelID).pipe(Effect.catch(() => Effect.succeed(undefined))))
        )
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))

      const targetModel = yield* resolveModel
      if (!targetModel) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }

      const providerStr = (targetModel.providerID ?? "").toLowerCase()
      const modelStr = (targetModel.id ?? "").toLowerCase()
      const modelFamily =
        providerStr.includes("anthropic") || modelStr.includes("claude")
          ? "claude"
          : providerStr.includes("openai") || modelStr.includes("gpt") || modelStr.includes("o1") || modelStr.includes("o3")
            ? "openai"
            : providerStr.includes("google") || modelStr.includes("gemini")
              ? "gemini"
              : providerStr.includes("deepseek") || modelStr.includes("deepseek")
                ? "deepseek"
                : "generic"

      const systemPrompt = buildPromptOptimizerSystemPrompt(
        modelFamily,
        ctx.payload.language ?? "es",
        ctx.payload.style ?? "standard",
      )

      const sessionID = SessionID.descending()
      const stream = llm
        .stream({
          agent: PROMPT_OPTIMIZER_AGENT,
          user: {
            id: MessageID.ascending(),
            sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: PROMPT_OPTIMIZER_AGENT.name,
            model: { providerID: targetModel.providerID, modelID: targetModel.id },
          },
          system: [systemPrompt],
          small: true,
          tools: {},
          model: targetModel,
          sessionID,
          retries: 1,
          messages: [
            {
              role: "user",
              content: `Optimize and expand this developer prompt into a high-precision instruction:\n\n${rawPrompt}`,
            },
          ],
        })
        .pipe(
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((event) => event.text),
          Stream.encodeText,
          // A failure here (bad credentials, rate limit, model refusal) must not break the
          // composer: the client falls back to its local optimizer when the stream is empty.
          // Log the cause first, though — swallowing it silently leaves the user with a
          // second-rate result and nothing to diagnose it from.
          Stream.catchCause((cause) =>
            Stream.unwrap(
              Effect.logError("prompt optimizer stream failed", {
                cause,
                providerID: targetModel.providerID,
                modelID: targetModel.id,
                style: ctx.payload.style ?? "standard",
              }).pipe(Effect.as(Stream.empty)),
            ),
          ),
        )

      return HttpServerResponse.stream(stream, {
        contentType: "text/plain; charset=utf-8",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      })
    })

    return handlers
      .handle("capabilities", capabilities)
      .handle("console", getConsole)
      .handle("consoleOrgs", listConsoleOrgs)
      .handle("consoleSwitch", switchConsole)
      .handle("tool", tool)
      .handle("toolIDs", toolIDs)
      .handle("worktree", worktree)
      .handle("worktreeCreate", worktreeCreate)
      .handle("worktreeRemove", worktreeRemove)
      .handle("worktreeReset", worktreeReset)
      .handle("session", session)
      .handle("sessionBackground", sessionBackground)
      .handle("resource", resource)
      .handle("optimizePrompt", optimizePrompt)
  }),
)
