import { type Component, createSignal, onCleanup, onMount, Show } from "solid-js"

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const version = import.meta.env.VITE_TIANCODE_VERSION || "1.0.0"
  const [percent, setPercent] = createSignal(0)
  const [fading, setFading] = createSignal(false)

  onMount(() => {
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
      class={`w-full h-full min-h-[380px] flex flex-col items-center justify-center bg-[#0e111a] text-white transition-all duration-400 select-none overflow-hidden ${
        fading() ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
      aria-label="Tiancode"
      role="status"
    >
      {/* Ambient background glow */}
      <div class="absolute w-56 h-56 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Logo de Tiancode con Micro-halo */}
      <div class="relative flex items-center justify-center w-20 h-20 mb-5">
        <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/25 to-indigo-600/25 blur-lg" />
        <div class="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-xl shadow-cyan-500/30 flex items-center justify-center">
          <div class="w-full h-full bg-[#0a0d16] rounded-[14px] flex items-center justify-center">
            <svg viewBox="0 0 24 24" class="w-8 h-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>
      </div>

      {/* Nombre y Versión */}
      <div class="flex items-center gap-2 mb-4">
        <h1 class="text-2xl font-bold tracking-tight text-white">
          Tian<span class="text-cyan-400">code</span>
        </h1>
        <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-white/10 text-cyan-300 border border-white/10">
          v{version}
        </span>
      </div>

      {/* Barra de Carga Fluida 0 a 100% */}
      <div class="w-56 bg-white/10 rounded-full h-2 mb-2.5 overflow-hidden border border-white/10">
        <div
          class="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 rounded-full transition-all duration-75 shadow-[0_0_12px_rgba(56,189,248,0.9)]"
          style={{ width: `${percent()}%` }}
        />
      </div>

      {/* Porcentaje numérico */}
      <span class="text-xs font-mono font-semibold text-slate-400">
        {percent()}%
      </span>
    </div>
  )
}
