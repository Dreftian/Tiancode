import { type Component, createSignal, onCleanup, onMount } from "solid-js"
import { WordmarkV2 } from "@tiancode-ai/ui/v2/wordmark-v2"
import tianLogo from "../../../ui/src/assets/logo/tian-white.png"

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const [percent, setPercent] = createSignal(0)
  const [statusText, setStatusText] = createSignal("Iniciando Tiancode...")
  const [fading, setFading] = createSignal(false)

  onMount(() => {
    const startTime = Date.now()
    const totalDuration = 2200 // 2.2s for smooth, elegant Apple-like loading

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100))
      setPercent(progress)

      if (progress < 30) {
        setStatusText("Iniciando componentes...")
      } else if (progress < 65) {
        setStatusText("Cargando extensiones y MCP...")
      } else if (progress < 90) {
        setStatusText("Preparando entorno de trabajo...")
      } else {
        setStatusText("¡Listo!")
      }

      if (progress >= 100) {
        clearInterval(interval)
        setTimeout(() => {
          setFading(true)
          setTimeout(() => props.onComplete?.(), 300)
        }, 150)
      }
    }, 25)

    onCleanup(() => clearInterval(interval))
  })

  return (
    <div
      class={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#090b10] transition-opacity duration-300 select-none ${
        fading() ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ "-webkit-app-region": "drag" } as any}
      aria-label="Tiancode Loading"
      role="status"
    >
      {/* Ambient background glow */}
      <div class="absolute w-60 h-60 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

      {/* Main loading card */}
      <div class="relative flex flex-col items-center justify-center gap-4 p-8 w-full h-full">
        {/* Tiancode Logo with glowing border */}
        <div class="relative flex size-18 items-center justify-center rounded-2xl border border-cyan-400/40 bg-[#121622] p-3 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
          <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/20 via-sky-500/10 to-indigo-600/25 blur-sm" />
          <img
            src={tianLogo}
            alt="Tiancode"
            class="relative size-12 object-contain drop-shadow-[0_0_14px_rgba(56,189,248,0.9)]"
            draggable={false}
          />
        </div>

        {/* Title with Official WordmarkV2 "T i a n c o d e" */}
        <div class="flex flex-col items-center gap-2 text-center mt-1 w-full max-w-[220px]">
          <WordmarkV2 class="w-full h-auto text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
          <span class="text-xs text-slate-400 tracking-wide font-medium">
            {statusText()}
          </span>
        </div>

        {/* Progress Bar & Percentage */}
        <div class="w-56 flex flex-col items-center gap-2 mt-2">
          <div class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden relative">
            <div
              class="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 transition-all duration-75 ease-out shadow-[0_0_10px_rgba(56,189,248,0.7)]"
              style={{ width: `${percent()}%` }}
            />
          </div>
          <span class="text-xs font-mono font-bold text-cyan-400 tabular-nums">
            {percent()}%
          </span>
        </div>
      </div>
    </div>
  )
}

