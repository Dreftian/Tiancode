import { Account } from "@/account/account"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
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
import { Cause, Effect, Option, Stream } from "effect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  ConsoleSwitchPayload,
  OptimizePromptModelError,
  OptimizePromptPayload,
  SessionListQuery,
  ToolListQuery,
  WorktreeApiError,
} from "../groups/experimental"

/**
 * Terminator for the optimizer body. The status line is chosen before the model is ever called, so
 * a failure mid-stream can only close the body early — which the client cannot tell apart from a
 * model that produced nothing. Appending a NUL plus a reason code gives
 * it something to read: NUL never occurs in model text, so the split is unambiguous. The same mark
 * also carries the one non-error outcome the empty body hides — an answer that was all reasoning.
 */
const OPTIMIZE_ERROR_MARK = "\u0000"

/**
 * Liveness byte, emitted only when the request asked for it (`heartbeat: true`). Reasoning deltas
 * are filtered out of the body, so a model that thinks for a minute before answering sends the
 * client nothing at all — indistinguishable from a dead connection, and the composer used to abort
 * the request on its own deadline and report a generic failure. Emitted every few seconds until
 * real text starts flowing: the client resets its idle timer on any chunk and strips every
 * occurrence before reading the body. Deliberately NOT the NUL mark above — that one already means
 * "a failure code follows", and the two must stay tellable apart. U+0001 never occurs in model text
 * either.
 *
 * Ordering is NOT "all heartbeats, then all text". The filter below is evaluated when a tick
 * resolves, not when the merged stream hands the element on, and `Stream.merge` rendezvouses with
 * the body: a heartbeat that passed the filter just before the first text delta can be delivered
 * after it. Hence "strip every occurrence", never "strip the prefix" — on both sides.
 */
const OPTIMIZE_HEARTBEAT_MARK = "\u0001"

/** Far under any sane client idle window, far over the cost of one byte. */
const OPTIMIZE_HEARTBEAT_INTERVAL = "5 seconds"

/**
 * Reason codes that may follow the mark. All but `reasoningOnly` come from classifying a thrown
 * error; `reasoningOnly` is emitted by a body that never failed — see the tail of the stream below.
 */
type OptimizeFailure = "auth" | "rateLimit" | "quota" | "unknown" | "reasoningOnly"

function classifyOptimizeFailure(error: unknown): OptimizeFailure {
  const reason = (error as { reason?: unknown })?.reason ?? error
  const tag = (reason as { _tag?: unknown })?._tag
  if (tag === "Authentication") return "auth"
  if (tag === "RateLimit") return "rateLimit"
  if (tag === "QuotaExceeded") return "quota"

  const status = (reason as { http?: { response?: { status?: number } } })?.http?.response?.status
  if (status === 401 || status === 403) return "auth"
  if (status === 429) return "rateLimit"
  if (status === 402) return "quota"

  // Providers that bypass the typed LLM route only leak the reason as prose.
  const text = `${(error as Error)?.name ?? ""} ${(error as Error)?.message ?? ""}`.toLowerCase()
  if (/api key|credential|unauthor|authentication|forbidden/.test(text)) return "auth"
  if (/rate limit|rate_limit|too many requests/.test(text)) return "rateLimit"
  if (/quota|insufficient|billing|credit/.test(text)) return "quota"
  return "unknown"
}

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

      // The caller naming a model is a deliberate choice — the composer sends whatever the user has
      // selected for the chat. If that model does not resolve here we must say so, not quietly hand
      // the work to another provider's cheap model and return text that looks like success.
      const chosen = ctx.payload.providerID && ctx.payload.modelID ? ctx.payload : undefined
      const explicitModel = chosen
        ? yield* provider.getModel(chosen.providerID!, chosen.modelID!).pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      if (chosen && !explicitModel) {
        return yield* Effect.fail(
          new OptimizePromptModelError({
            name: "OptimizePromptModelUnavailableError",
            data: { providerID: chosen.providerID!, modelID: chosen.modelID! },
          }),
        )
      }

      const resolveFallback = Effect.gen(function* () {
        const fallback = yield* provider.defaultModel().pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!fallback) return undefined
        return (
          (yield* provider.getSmallModel(fallback.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))) ??
          (yield* provider.getModel(fallback.providerID, fallback.modelID).pipe(Effect.catch(() => Effect.succeed(undefined))))
        )
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))

      const targetModel = explicitModel ?? (yield* resolveFallback)
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

      // The body below is a lazy Stream: nothing is pulled until after this handler has returned,
      // and by then the request middleware's `Effect.provideService(InstanceRef, …)` scope (see
      // middleware/instance-context.ts) has already closed. Everything `llm.stream` reaches for
      // per directory — config, provider credentials, auth — resolves through InstanceRef, which is
      // a `Context.Reference` defaulting to `undefined`; the type checker therefore sees no missing
      // requirement and the loss only surfaces at runtime, as `InstanceState.context` dying with
      // "InstanceRef not provided". Capture both references here, while the middleware context is
      // still live, and attach them to the stream so it carries its own context instead of
      // borrowing the request's. The SSE event route (handlers/event.ts) avoids the same trap by
      // reading `InstanceState.context` eagerly and closing over plain values.
      const instance = yield* InstanceRef
      const workspace = yield* WorkspaceRef

      // Reasoning is not the answer, so it must never reach the composer — it would replace the
      // user's prompt with the model's chain of thought. But a model that emits reasoning and then
      // stops produces the same empty body as a model that emits nothing at all, and the client
      // reports both as "the model returned nothing". Tally the two kinds of delta so the tail of
      // the stream can tell them apart.
      let sawText = false
      let sawReasoning = false

      // Proof of life for the phase where the body is legitimately empty: the model is reasoning and
      // every one of those deltas is filtered out below. It stops the moment real text appears —
      // from then on the text itself is the proof — and `haltStrategy: "left"` below ties its
      // lifetime to the body's, so it can never outlive the request or keep the response open.
      //
      // The first tick of `Stream.tick` fires immediately and is kept. That byte is worth its cost
      // to the one caller that sees it: @effect/platform-node writes the head and then pulls this
      // stream without calling `flushHeaders`, so Node holds the header block until the first body
      // write — an immediate heartbeat is what makes the client's `await fetch()` resolve now
      // instead of whenever the model first speaks. It costs nothing to anyone else, because
      // nobody else gets heartbeats at all.
      const heartbeat = Stream.tick(OPTIMIZE_HEARTBEAT_INTERVAL).pipe(
        Stream.filter(() => !sawText),
        Stream.map(() => OPTIMIZE_HEARTBEAT_MARK),
        Stream.encodeText,
      )

      const sessionID = SessionID.descending()
      const body = llm
        .stream({
          agent: PROMPT_OPTIMIZER_AGENT,
          user: {
            id: MessageID.ascending(),
            sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: PROMPT_OPTIMIZER_AGENT.name,
            model: { providerID: targetModel.providerID, modelID: targetModel.id, variant: ctx.payload.variant },
          },
          system: [systemPrompt],
          // `small` discards the reasoning variant and swaps in the model's lowest-effort options
          // (session/llm/request.ts). That is right for a model we picked ourselves and wrong for
          // one the user chose: optimizing at a different effort than the chat uses is exactly the
          // mismatch this endpoint is being asked to remove.
          small: explicitModel === undefined,
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
          Stream.tap((event) =>
            Effect.sync(() => {
              if (LLMEvent.is.textDelta(event)) sawText = true
              else if (LLMEvent.is.reasoningDelta(event)) sawReasoning = true
            }),
          ),
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((event) => event.text),
          Stream.encodeText,
          // Reached only once the model has finished without failing. A reasoning-only answer is a
          // real failure to optimize, so it gets its own reason code rather than an empty body: the
          // user is told the model stopped before answering, not that it said nothing.
          Stream.concat(
            Stream.unwrap(
              Effect.suspend((): Effect.Effect<Stream.Stream<Uint8Array>> => {
                if (sawText || !sawReasoning) return Effect.succeed(Stream.empty)
                return Effect.logWarning("prompt optimizer produced reasoning only", {
                  providerID: targetModel.providerID,
                  modelID: targetModel.id,
                  variant: ctx.payload.variant,
                }).pipe(
                  Effect.as(
                    Stream.succeed(OPTIMIZE_ERROR_MARK + ("reasoningOnly" satisfies OptimizeFailure)).pipe(
                      Stream.encodeText,
                    ),
                  ),
                )
              }),
            ),
          ),
          // The 200 and the text/plain headers are flushed before the model is called, so a failure
          // here can only end the body early — which the client cannot tell apart from a model that
          // produced nothing. Append the sentinel plus a reason code so it can: NUL never occurs in
          // model output, so the split is unambiguous and the client strips it before showing text.
          Stream.catchCause((cause) =>
            Stream.unwrap(
              Effect.logError("prompt optimizer stream failed", {
                cause,
                providerID: targetModel.providerID,
                modelID: targetModel.id,
                style: ctx.payload.style ?? "standard",
              }).pipe(
                Effect.as(
                  Stream.succeed(OPTIMIZE_ERROR_MARK + classifyOptimizeFailure(Cause.squash(cause))).pipe(
                    Stream.encodeText,
                  ),
                ),
              ),
            ),
          ),
          Stream.provideService(InstanceRef, instance),
          Stream.provideService(WorkspaceRef, workspace),
        )

      // Only a caller that asked for heartbeats gets them. Everyone else — the generated SDK, an
      // older desktop build, curl — reads a body that is exactly the optimized prompt, byte for
      // byte, as the endpoint's text/plain contract has always promised.
      // Halting on the left means the body decides when the response ends: the heartbeat fiber is
      // interrupted with it, including after the failure tail above has been appended.
      const stream =
        ctx.payload.heartbeat === true ? body.pipe(Stream.merge(heartbeat, { haltStrategy: "left" })) : body

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
