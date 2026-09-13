import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"

export type OptimizerStyle = "standard" | "rigorous" | "minimal"

const REQUEST_TIMEOUT = 30000

/** Debe coincidir con OPTIMIZE_ERROR_MARK en el handler: NUL nunca aparece en texto del modelo. */
const OPTIMIZE_ERROR_MARK = "\u0000"

/** Códigos que emite el backend tras el centinela, mapeados a lo que ve el usuario. */
const OPTIMIZE_FAILURE_KEYS: Record<string, string> = {
  auth: "prompt.optimize.failed.auth",
  rateLimit: "prompt.optimize.failed.rateLimit",
  quota: "prompt.optimize.failed.quota",
  // No es un error: el modelo respondió, pero sólo con razonamiento y ningún texto. El cuerpo sale
  // vacío igual que en un fallo, así que sin este código se anunciaría como «no dijo nada».
  reasoningOnly: "prompt.optimize.failed.reasoningOnly",
  unknown: "prompt.optimize.failed.unknown",
}

export function IconSparkles(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        shape-rendering="geometricPrecision"
        d="M9.8132 15.9038L9 18.75L8.1868 15.9038C7.75968 14.4089 6.59112 13.2403 5.09619 12.8132L2.25 12L5.09619 11.1868C6.59113 10.7597 7.75968 9.59112 8.1868 8.09619L9 5.25L9.8132 8.09619C10.2403 9.59113 11.4089 10.7597 12.9038 11.1868L15.75 12L12.9038 12.8132C11.4089 13.2403 10.2403 14.4089 9.8132 15.9038Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M18.2589 8.71454L18 9.75L17.7411 8.71454C17.4388 7.50533 16.4947 6.56117 15.2855 6.25887L14.25 6L15.2855 5.74113C16.4947 5.43883 17.4388 4.49467 17.7411 3.28546L18 2.25L18.2589 3.28546C18.5612 4.49467 19.5053 5.43883 20.7145 5.74113L21.75 6L20.7145 6.25887C19.5053 6.56117 18.5612 7.50533 18.2589 8.71454Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M16.8942 20.5673L16.5 21.75L16.1058 20.5673C15.8818 19.8954 15.3546 19.3682 14.6827 19.1442L13.5 18.75L14.6827 18.3558C15.3546 18.1318 15.8818 17.6046 16.1058 16.9327L16.5 15.75L16.8942 16.9327C17.1182 17.6046 17.6454 18.1318 18.3173 18.3558L19.5 18.75L18.3173 19.1442C17.6454 19.3682 17.1182 19.8954 16.8942 20.5673Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

export function IconUndo(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
    </svg>
  )
}

export function IconStop(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  )
}

export function PromptOptimizerButton(props: {
  input: () => string
  onOptimized: (text: string) => void
  model?: () => { provider?: { id: string }; name?: string; id?: string } | undefined
  /** Nivel de razonamiento activo; el mismo que el chat envía al enviar un mensaje. */
  variant?: () => string | undefined
  directory?: () => string | undefined
  class?: string
}) {
  const command = useCommand()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [optimizing, setOptimizing] = createSignal(false)
  const [abort, setAbort] = createSignal<AbortController | undefined>()
  const [undoable, setUndoable] = createSignal(false)
  const [original, setOriginal] = createSignal("")
  const [style, setStyle] = createSignal<OptimizerStyle>("standard")

  // Distingue el abort del usuario (sin aviso) del timeout o el fallo de red (con aviso).
  let stopped = false
  let disposed = false

  const hasText = () => props.input().trim().length > 0

  // El deshacer sobrevive a las ediciones posteriores, pero no a un compositor vacío:
  // al enviar o limpiar el prompt ya no hay nada a lo que volver.
  createEffect(() => {
    if (hasText()) return
    setUndoable(false)
    setOriginal("")
  })

  onCleanup(() => {
    disposed = true
    abort()?.abort()
  })

  const styleLabel = () => {
    if (style() === "rigorous") return language.t("prompt.optimize.style.rigorous")
    if (style() === "minimal") return language.t("prompt.optimize.style.minimal")
    return language.t("prompt.optimize.style.standard")
  }

  // El nombre accesible se mantiene estable: sólo la acción que dispara el clic.
  const actionLabel = () => {
    if (optimizing()) return language.t("prompt.optimize.stop")
    if (undoable()) return language.t("prompt.optimize.undo")
    return language.t("prompt.optimize.label")
  }

  const tooltipText = () => {
    if (optimizing()) return `${language.t("prompt.optimize.streaming")} · ${language.t("prompt.optimize.stop")}`
    if (undoable()) return language.t("prompt.optimize.undo")
    if (!hasText()) return language.t("prompt.optimize.needsText")
    return `${language.t("prompt.optimize.label")} · ${styleLabel()} · ${language.t("prompt.optimize.style.hint")}`
  }

  const setOptimizingFlag = (active: boolean) => {
    setOptimizing(active)
    window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active } }))
  }

  const undo = () => {
    props.onOptimized(original())
    setUndoable(false)
    setOriginal("")
    showToast({ title: language.t("prompt.optimize.reverted") })
  }

  const optimize = async () => {
    const source = props.input()
    const prompt = source.trim()
    if (!prompt || optimizing()) return

    const serverHttp = serverSdk()?.server?.http
    if (!serverHttp?.url) {
      showToast({ variant: "error", title: language.t("prompt.optimize.failed") })
      return
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (serverHttp.password) {
      headers["Authorization"] = `Basic ${authTokenFromCredentials({
        username: serverHttp.username,
        password: serverHttp.password,
      })}`
    }

    // Sin directory el enrutado de workspace resuelve al proyecto por defecto del
    // servidor, no al de la sesión: el modelo resuelto sería el equivocado.
    const directory = props.directory?.()
    const query = directory ? `?directory=${encodeURIComponent(directory)}` : ""
    const model = props.model?.()
    // El nivel de razonamiento que el usuario eligió en la barra del prompt. Sin esto el
    // optimizador corre con el mismo modelo pero a otro esfuerzo que el chat.
    const variant = props.variant?.()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    stopped = false
    setAbort(controller)
    setOptimizingFlag(true)

    // Cualquier salida que no sea una reescritura completa deja el texto tal cual lo
    // escribió el usuario: el streaming ya ha ido pisando el compositor.
    const fail = (description?: string, actions?: { label: string; onClick: () => void }[]) => {
      props.onOptimized(source)
      showToast({
        variant: "error",
        title: language.t("prompt.optimize.failed"),
        ...(description ? { description } : {}),
        ...(actions ? { actions } : {}),
      })
    }

    try {
      const response = await fetch(`${serverHttp.url.replace(/\/+$/, "")}/experimental/prompt/optimize${query}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          providerID: model?.provider?.id,
          modelID: model?.id,
          variant,
          language: language.intl(),
          style: style(),
        }),
        signal: controller.signal,
      })

      if (response.status === 400) {
        fail(language.t("prompt.optimize.noModel"), [
          { label: language.t("command.model.choose"), onClick: () => command.trigger("model.choose") },
        ])
        return
      }
      // 422: el modelo que el usuario tiene seleccionado no se pudo resolver aquí. El backend
      // prefiere decirlo antes que devolver texto de otro modelo, que parecería un éxito.
      if (response.status === 422) {
        fail(language.t("prompt.optimize.modelUnavailable", { model: model?.id ?? "" }), [
          { label: language.t("command.model.choose"), onClick: () => command.trigger("model.choose") },
        ])
        return
      }
      if (!response.ok || !response.body) {
        fail()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue
        accumulated += chunk
        props.onOptimized(accumulated)
      }

      // Las cabeceras 200 se envían antes de llamar al modelo, así que un fallo a mitad del
      // stream sólo puede cerrar el cuerpo. El backend añade NUL + un código de motivo al final
      // para que aquí se pueda distinguir "tu clave fue rechazada" de "el modelo no dijo nada".
      const [body, failureCode] = accumulated.split(OPTIMIZE_ERROR_MARK)
      const optimized = (body ?? "").trim()
      if (failureCode !== undefined) {
        props.onOptimized(source)
        const reason = OPTIMIZE_FAILURE_KEYS[failureCode.trim()] ?? "prompt.optimize.failed.unknown"
        fail(language.t(reason as Parameters<typeof language.t>[0]))
        return
      }
      if (!optimized) {
        fail(language.t("prompt.optimize.noOutput"))
        return
      }

      props.onOptimized(optimized)
      setOriginal(source)
      setUndoable(true)
      showToast({
        variant: "success",
        title: language.t("prompt.optimize.done"),
        actions: [{ label: language.t("prompt.optimize.undo"), onClick: undo }],
      })
    } catch {
      // Al desmontar el compositor el abort es nuestro: no hay texto que devolver ni a quién avisar.
      if (disposed) return
      if (stopped) props.onOptimized(source)
      else fail()
    } finally {
      clearTimeout(timeout)
      setAbort(undefined)
      setOptimizingFlag(false)
    }
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const nextOrder: Record<OptimizerStyle, OptimizerStyle> = {
      standard: "rigorous",
      rigorous: "minimal",
      minimal: "standard",
    }
    setStyle((s) => nextOrder[s])
  }

  const handleAction = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (optimizing()) {
      stopped = true
      abort()?.abort()
      return
    }
    if (undoable()) {
      undo()
      return
    }
    if (!hasText()) return
    void optimize()
  }

  return (
    <>
      <style>{`
        @keyframes trae-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .trae-optimizer-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .trae-optimizer-btn:hover:not([aria-disabled="true"]) {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(168, 85, 247, 0.15));
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }
        .trae-optimizer-btn.is-revert {
          color: #fbbf24;
        }
        .trae-optimizer-btn.is-revert:hover {
          background: rgba(251, 191, 36, 0.15);
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.25);
          color: #f59e0b;
        }
        .trae-optimizer-btn.is-optimizing {
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.2) 0%, rgba(168, 85, 247, 0.35) 50%, rgba(56, 189, 248, 0.2) 100%);
          background-size: 200% 100%;
          animation: trae-shimmer 1.2s infinite linear;
        }
      `}</style>
      <TooltipV2 value={tooltipText()} placement="top">
        <button
          type="button"
          aria-disabled={!hasText() && !optimizing()}
          onClick={handleAction}
          onContextMenu={handleContextMenu}
          aria-label={actionLabel()}
          class={`
            trae-optimizer-btn relative flex size-7 shrink-0 items-center justify-center rounded-md
            ${
              hasText()
                ? "cursor-pointer text-v2-icon-icon-muted hover:text-v2-text-text-base active:scale-95"
                : "cursor-default text-v2-icon-icon-muted opacity-40"
            }
            ${optimizing() ? "is-optimizing" : ""}
            ${undoable() ? "is-revert" : ""}
            ${props.class ?? ""}
          `}
        >
          <Show when={!optimizing()} fallback={<IconStop class="size-3.5" />}>
            <Show when={!undoable()} fallback={<IconUndo class="size-4 transition-transform duration-200" />}>
              <IconSparkles class="size-4 transition-transform duration-200" />
            </Show>
          </Show>

          {/* Indicador sutil del estilo seleccionado (cian para riguroso, violeta para quirúrgico) */}
          <Show when={style() === "rigorous"}>
            <span class="absolute top-1 right-1 size-1 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
          </Show>
          <Show when={style() === "minimal"}>
            <span class="absolute top-1 right-1 size-1 rounded-full bg-purple-400 shadow-[0_0_4px_#c084fc]" />
          </Show>
        </button>
      </TooltipV2>
    </>
  )
}
