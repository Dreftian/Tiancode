import { createSignal, Show, type JSX } from "solid-js"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import {
  enhancePromptText,
  resolveModelFamily,
  type PromptIntent,
  type ModelFamily,
} from "@/utils/prompt-optimizer"

export { enhancePromptText, resolveModelFamily, type PromptIntent, type ModelFamily }

export type OptimizerStyle = "standard" | "rigorous" | "minimal"

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

export function PromptOptimizerButton(props: {
  input: () => string
  onOptimized: (text: string) => void
  model?: () => { provider?: { id: string }; name?: string; id?: string } | undefined
  disabled?: boolean
  class?: string
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [optimizing, setOptimizing] = createSignal(false)
  const [justOptimized, setJustOptimized] = createSignal(false)
  const [justReverted, setJustReverted] = createSignal(false)
  const [lastOriginal, setLastOriginal] = createSignal("")
  const [lastOptimized, setLastOptimized] = createSignal("")
  const [style, setStyle] = createSignal<OptimizerStyle>("standard")

  const isSpanish = () => language.intl().toLowerCase().startsWith("es")
  const hasText = () => props.input().trim().length > 0

  // Se activa modo revertir si el contenido actual en el textarea coincide con el último optimizado
  const isRevertMode = () => {
    const cur = props.input().trim()
    return lastOptimized().length > 0 && cur === lastOptimized().trim() && lastOriginal().length > 0
  }

  const styleLabel = () => {
    if (style() === "rigorous") return isSpanish() ? "🔬 Riguroso (TDD)" : "🔬 Rigorous (TDD)"
    if (style() === "minimal") return isSpanish() ? "🎯 Quirúrgico" : "🎯 Surgical (Minimal)"
    return isSpanish() ? "✨ Estándar" : "✨ Standard"
  }

  const tooltipText = () => {
    if (justReverted()) {
      return isSpanish() ? "¡Texto original restaurado!" : "Original text restored!"
    }
    if (justOptimized()) {
      return isSpanish() ? "¡Prompt optimizado con éxito!" : "Prompt successfully enhanced!"
    }
    if (isRevertMode()) {
      return isSpanish()
        ? "Deshacer optimización (Volver al original)"
        : "Revert enhancement (Undo)"
    }
    if (!hasText()) {
      return language.t("prompt.optimize.empty")
    }
    if (optimizing()) {
      return isSpanish() ? "Reescribiendo prompt con IA en streaming..." : "Streaming AI prompt optimization..."
    }
    const modeSwitchTip = isSpanish() ? "• Clic derecho: alternar modo" : "• Right-click: switch mode"
    return `${language.t("prompt.optimize.label")} [${styleLabel()}] ${modeSwitchTip}`
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

  const handleAction = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // 1. Si está en modo revertir, restauramos el texto original
    if (isRevertMode()) {
      const orig = lastOriginal()
      props.onOptimized(orig)
      setLastOptimized("")
      setJustReverted(true)
      setTimeout(() => setJustReverted(false), 1600)
      return
    }

    const current = props.input().trim()
    if (!current || optimizing()) return

    setOptimizing(true)
    setLastOriginal(current)
    window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: true } }))

    const currentModel = props.model?.()
    const modelFamily = resolveModelFamily(
      currentModel?.provider?.id ?? currentModel?.name ?? currentModel?.id,
    )

    let streamedWithAi = false
    try {
      const sdk = serverSdk()
      const serverHttp = sdk?.server?.http
      if (serverHttp?.url) {
        const baseUrl = serverHttp.url.replace(/\/+$/, "")
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (serverHttp.password) {
          headers["Authorization"] = `Basic ${authTokenFromCredentials({
            username: serverHttp.username,
            password: serverHttp.password,
          })}`
        }

        const abortCtrl = new AbortController()
        const timeoutId = setTimeout(() => abortCtrl.abort(), 30000)

        const response = await fetch(`${baseUrl}/experimental/prompt/optimize`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: current,
            providerID: currentModel?.provider?.id,
            modelID: currentModel?.id,
            language: isSpanish() ? "es" : "en",
            style: style(),
          }),
          signal: abortCtrl.signal,
        })
        clearTimeout(timeoutId)

        if (response.ok && response.body) {
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let accumulated = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            if (chunk) {
              accumulated += chunk
              props.onOptimized(accumulated)
            }
          }

          const trimmed = accumulated.trim()
          if (trimmed.length > 0) {
            setLastOptimized(trimmed)
            props.onOptimized(trimmed)
            setJustOptimized(true)
            streamedWithAi = true
            window.dispatchEvent(
              new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false, done: true, ai: true } }),
            )
            setTimeout(() => setJustOptimized(false), 1600)
          }
        }
      }
    } catch {
      // Error de red, timeout o sin proveedor: procedemos al fallback local
    }

    if (!streamedWithAi) {
      // Fallback infalible de alta velocidad en cliente (v2)
      const optimized = enhancePromptText(current, isSpanish(), { modelFamily })
      setLastOptimized(optimized)

      // Efecto progresivo de escritura y reemplazo en el textarea (estilo Trae.ai)
      const tokens = optimized.split(/(\s+|\n)/)
      let accumulated = ""
      const stepDelay = Math.max(5, Math.min(16, Math.floor(400 / Math.max(tokens.length, 1))))

      for (let i = 0; i < tokens.length; i++) {
        accumulated += tokens[i]
        props.onOptimized(accumulated)
        if (i % 2 === 0) {
          await new Promise((r) => setTimeout(r, stepDelay))
        }
      }
      props.onOptimized(optimized)
      setJustOptimized(true)
      window.dispatchEvent(
        new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false, done: true, ai: false } }),
      )
      setTimeout(() => setJustOptimized(false), 1600)
    }

    setOptimizing(false)
    window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false } }))
  }

  return (
    <>
      <style>{`
        @keyframes trae-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes trae-spin-pulse {
          0% { transform: rotate(0deg) scale(0.9); opacity: 0.8; }
          50% { transform: rotate(180deg) scale(1.2); opacity: 1; filter: drop-shadow(0 0 6px #38bdf8); }
          100% { transform: rotate(360deg) scale(1); opacity: 0.9; }
        }
        .trae-optimizer-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .trae-optimizer-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(168, 85, 247, 0.15));
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }
        .trae-optimizer-btn.is-revert {
          color: #fbbf24;
        }
        .trae-optimizer-btn.is-revert:hover:not(:disabled) {
          background: rgba(251, 191, 36, 0.15);
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.25);
          color: #f59e0b;
        }
        .trae-optimizer-btn.is-optimizing {
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.2) 0%, rgba(168, 85, 247, 0.35) 50%, rgba(56, 189, 248, 0.2) 100%);
          background-size: 200% 100%;
          animation: trae-shimmer 1.2s infinite linear;
        }
        .trae-optimizer-btn.is-optimizing .trae-sparkles {
          animation: trae-spin-pulse 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          color: #38bdf8;
        }
      `}</style>
      <TooltipV2 value={tooltipText()} placement="top">
        <button
          type="button"
          disabled={!hasText() || optimizing() || props.disabled}
          onClick={handleAction}
          onContextMenu={handleContextMenu}
          aria-label={tooltipText()}
          class={`
            trae-optimizer-btn relative flex size-7 shrink-0 items-center justify-center rounded-md
            ${
              hasText()
                ? "cursor-pointer text-v2-icon-icon-muted hover:text-v2-text-text-base active:scale-95"
                : "cursor-not-allowed text-v2-icon-icon-muted opacity-40"
            }
            ${optimizing() ? "is-optimizing" : ""}
            ${isRevertMode() ? "is-revert" : ""}
            ${justOptimized() ? "text-emerald-400 font-bold scale-105" : ""}
            ${justReverted() ? "text-amber-400 font-bold scale-105" : ""}
            ${props.class ?? ""}
          `}
        >
          <Show
            when={!justOptimized() && !justReverted()}
            fallback={<span class="text-xs">✓</span>}
          >
            <Show
              when={!isRevertMode()}
              fallback={<IconUndo class="size-4 transition-transform duration-200" />}
            >
              <IconSparkles class="trae-sparkles size-4 transition-transform duration-200" />
            </Show>
          </Show>

          {/* Indicador sutil de estilo seleccionado (verde azulado para riguroso, violeta para quirúrgico) */}
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
