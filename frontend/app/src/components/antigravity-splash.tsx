import { type Component, createSignal, onCleanup, onMount } from "solid-js"
import tianLogo from "../../../ui/src/assets/logo/tian-white.png"

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const version = import.meta.env.VITE_TIANCODE_VERSION || "1.0.6"
  const [percent, setPercent] = createSignal(0)
  const [fading, setFading] = createSignal(false)

  onMount(() => {
    const totalDurationMs = 450
    const stepsCount = 30
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
          setTimeout(() => props.onComplete?.(), 150)
        }, 80)
      }
    }, stepInterval)

    onCleanup(() => clearInterval(interval))
  })

  return (
    <div
      class={`w-full h-full flex flex-col items-center justify-center bg-[#0b0d14] text-white transition-all duration-300 select-none overflow-hidden p-3 ${
        fading() ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
      aria-label="Tiancode"
      role="status"
    >
      {/* Ambient background glow */}
      <div class="absolute w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Official Tiancode Logo with micro-halo */}
      <div class="relative flex items-center justify-center mb-2">
        <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-indigo-600/20 blur-md" />
        <img
          src={tianLogo}
          alt="Tiancode"
          class="relative h-10 w-auto object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.4)]"
          draggable={false}
        />
      </div>

      {/* Version badge */}
      <div class="flex items-center gap-1.5 mb-3">
        <span class="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-white/10 text-cyan-300 border border-white/10">
          v{version}
        </span>
      </div>

      {/* Barra de Carga Fluida 0 a 100% */}
      <div class="w-36 bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden border border-white/10">
        <div
          class="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(56,189,248,0.9)]"
          style={{ width: `${percent()}%` }}
        />
      </div>

      {/* Porcentaje numérico */}
      <span class="text-[11px] font-mono font-semibold text-slate-400">
        {percent()}%
      </span>
    </div>
  )
}
