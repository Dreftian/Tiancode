import { type Component, createSignal, onCleanup, onMount } from "solid-js"

export const AntigravitySplash: Component<{
  version?: string
  onComplete?: () => void
}> = (props) => {
  const [stepIndex, setStepIndex] = createSignal(0)
  const [percent, setPercent] = createSignal(15)
  const [fading, setFading] = createSignal(false)

  const steps = [
    "Iniciando Tiancode Runtime...",
    "Indexando AST CodeGraph y memoria continua...",
    "Verificando servidores MCP y herramientas...",
    "Sincronizando modelos locales y telemetría GPU...",
    "Listo para programar ✨",
  ]

  onMount(() => {
    let current = 0
    const interval = setInterval(() => {
      current++
      if (current < steps.length) {
        setStepIndex(current)
        setPercent(Math.min(100, Math.round(((current + 1) / steps.length) * 100)))
      } else {
        clearInterval(interval)
        setTimeout(() => {
          setFading(true)
          setTimeout(() => props.onComplete?.(), 450)
        }, 350)
      }
    }, 400)

    onCleanup(() => clearInterval(interval))
  })

  return (
    <div
      class={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#070b14] text-white transition-all duration-500 select-none overflow-hidden ${
        fading() ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Dynamic Ambient Background Glows */}
      <div class="absolute w-[640px] h-[640px] rounded-full bg-cyan-500/12 blur-[150px] pointer-events-none -top-28 -left-28 animate-pulse" />
      <div class="absolute w-[640px] h-[640px] rounded-full bg-indigo-600/12 blur-[150px] pointer-events-none -bottom-28 -right-28 animate-pulse" />
      <div class="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <div class="relative flex flex-col items-center max-w-sm w-full px-6 z-10">
        {/* Orbital Logo Container */}
        <div class="relative flex items-center justify-center w-28 h-28 mb-7">
          {/* Outer glowing orbital ring */}
          <div class="absolute inset-0 rounded-full border border-cyan-400/25 border-t-cyan-400 border-r-indigo-400 animate-spin [animation-duration:3.2s] shadow-[0_0_20px_rgba(56,189,248,0.2)]" />
          <div class="absolute inset-2 rounded-full border border-dashed border-indigo-400/35 animate-spin [animation-duration:6.5s] [animation-direction:reverse]" />

          {/* Central Core Emblem */}
          <div class="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-2xl shadow-cyan-500/30 flex items-center justify-center">
            <div class="w-full h-full bg-[#070c18] rounded-[14px] flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="w-9 h-9 text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
        </div>

        {/* Title and version */}
        <div class="text-center mb-6">
          <div class="flex items-center justify-center gap-2 mb-1">
            <h1 class="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Tian<span class="text-cyan-400">code</span>
            </h1>
            <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_8px_rgba(56,189,248,0.2)]">
              v{props.version ?? "1.0.87"}
            </span>
          </div>
          <p class="text-[11.5px] text-slate-400 font-medium">DeepSeek Harness Runtime · AST CodeGraph</p>
        </div>

        {/* Progress Bar Container with Percentage Badge */}
        <div class="w-full flex items-center justify-between text-[10.5px] font-mono text-slate-400 mb-1.5 px-0.5">
          <span>Iniciando entorno</span>
          <span class="text-cyan-400 font-bold">{percent()}%</span>
        </div>
        <div class="w-full bg-slate-900/90 rounded-full h-2 p-0.5 mb-3.5 border border-white/10 overflow-hidden shadow-inner backdrop-blur-md">
          <div
            class="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_14px_rgba(56,189,248,0.8)]"
            style={{ width: `${percent()}%` }}
          />
        </div>

        {/* Dynamic Step Label */}
        <div class="h-6 flex items-center justify-center">
          <span class="text-xs text-slate-300 font-mono tracking-wide flex items-center gap-2 animate-fade-in">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            {steps[stepIndex()]}
          </span>
        </div>
      </div>
    </div>
  )
}
