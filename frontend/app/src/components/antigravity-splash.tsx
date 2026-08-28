import { type Component, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const language = useLanguage()
  const version = import.meta.env.VITE_TIANCODE_VERSION
  const [percent, setPercent] = createSignal(0)
  const [fading, setFading] = createSignal(false)

  onMount(() => {
    // 3 segundos exactos para llegar de 0% a 100% (60 pasos de ~48ms = ~2880ms + fade)
    const totalDurationMs = 2800
    const stepsCount = 60
    const stepInterval = totalDurationMs / stepsCount

    let currentStep = 0
    const interval = setInterval(() => {
      currentStep++
      const nextPercent = Math.min(100, Math.round((currentStep / stepsCount) * 100))
      setPercent(nextPercent)

      if (currentStep >= stepsCount) {
        clearInterval(interval)
        setTimeout(() => {
          setFading(true)
          setTimeout(() => props.onComplete?.(), 400)
        }, 200)
      }
    }, stepInterval)

    onCleanup(() => clearInterval(interval))
  })

  return (
    <div
      class={`fixed inset-0 z-[99999] flex items-center justify-center bg-black/65 backdrop-blur-2xl text-white transition-all duration-400 select-none overflow-hidden ${
        fading() ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
      aria-label="Tiancode"
      role="status"
    >
      {/* Cuadro de Carga Compacto Estilo Apple Glassmorphism */}
      <div class="relative flex flex-col items-center w-[260px] p-6 rounded-3xl bg-[#12141c]/90 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-3xl">
        {/* Logo de Tiancode con Micro-halo */}
        <div class="relative flex items-center justify-center w-16 h-16 mb-4">
          <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-indigo-600/20 blur-md" />
          <div class="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/25 flex items-center justify-center">
            <div class="w-full h-full bg-[#0a0d16] rounded-[14px] flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="w-7 h-7 text-cyan-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
        </div>

        {/* Nombre y Versión */}
        <div class="flex items-center gap-1.5 mb-3">
          <h1 class="text-lg font-bold tracking-tight text-white">
            Tian<span class="text-cyan-400">code</span>
          </h1>
          <Show when={version}>
            <span class="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-md bg-white/10 text-slate-300 border border-white/10">
              v{version}
            </span>
          </Show>
        </div>

        {/* Barra de Carga Fluida 0 a 100% */}
        <div class="w-full bg-white/5 rounded-full h-1.5 mb-2 overflow-hidden border border-white/10">
          <div
            class="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(56,189,248,0.8)]"
            style={{ width: `${percent()}%` }}
          />
        </div>

        {/* Porcentaje numérico */}
        <span class="text-[11px] font-mono font-semibold text-slate-400">
          {percent()}%
        </span>
      </div>
    </div>
  )
}
