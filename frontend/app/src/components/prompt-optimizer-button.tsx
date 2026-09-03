import { createSignal, Show, type JSX } from "solid-js"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { enhancePromptText, type PromptIntent } from "@/utils/prompt-optimizer"

export { enhancePromptText, type PromptIntent }

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

export function PromptOptimizerButton(props: {
  input: () => string
  onOptimized: (text: string) => void
  disabled?: boolean
  class?: string
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [optimizing, setOptimizing] = createSignal(false)
  const [justOptimized, setJustOptimized] = createSignal(false)

  const isSpanish = () => language.intl().toLowerCase().startsWith("es")
  const hasText = () => props.input().trim().length > 0

  const tooltipText = () => {
    if (justOptimized()) {
      return isSpanish() ? "¡Prompt optimizado!" : "Prompt enhanced!"
    }
    if (!hasText()) {
      return language.t("prompt.optimize.empty")
    }
    if (optimizing()) {
      return language.t("prompt.optimize.optimizing")
    }
    return language.t("prompt.optimize.label")
  }

  const handleOptimize = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const current = props.input().trim()
    if (!current || optimizing()) return

    setOptimizing(true)
    window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: true } }))
    try {
      await new Promise((r) => setTimeout(r, 180))
      const optimized = enhancePromptText(current, isSpanish())
      
      // Efecto progresivo de escritura y reemplazo en el textarea (estilo Trae.ai)
      const tokens = optimized.split(/(\s+|\n)/)
      let accumulated = ""
      const stepDelay = Math.max(6, Math.min(18, Math.floor(450 / Math.max(tokens.length, 1))))
      
      for (let i = 0; i < tokens.length; i++) {
        accumulated += tokens[i]
        props.onOptimized(accumulated)
        if (i % 2 === 0) {
          await new Promise((r) => setTimeout(r, stepDelay))
        }
      }
      props.onOptimized(optimized)
      setJustOptimized(true)
      window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false, done: true } }))
      setTimeout(() => setJustOptimized(false), 1600)
    } finally {
      setOptimizing(false)
      window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false } }))
    }
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
          onClick={handleOptimize}
          aria-label={tooltipText()}
          class={`
            trae-optimizer-btn relative flex size-7 shrink-0 items-center justify-center rounded-md
            ${
              hasText()
                ? "cursor-pointer text-v2-icon-icon-muted hover:text-v2-text-text-base active:scale-95"
                : "cursor-not-allowed text-v2-icon-icon-muted opacity-40"
            }
            ${optimizing() ? "is-optimizing" : ""}
            ${justOptimized() ? "text-emerald-400 font-bold scale-105" : ""}
            ${props.class ?? ""}
          `}
        >
          <Show
            when={!justOptimized()}
            fallback={<span class="text-xs">✓</span>}
          >
            <IconSparkles class="trae-sparkles size-4 transition-transform duration-200" />
          </Show>
        </button>
      </TooltipV2>
    </>
  )
}
