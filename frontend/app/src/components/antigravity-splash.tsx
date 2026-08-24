import { type Component, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"

const STEP_KEYS = [
  "splash.step.server",
  "splash.step.config",
  "splash.step.models",
  "splash.step.tools",
  "splash.step.ready",
] as const

// Fallbacks en español para el instante inicial: el diccionario de i18n carga
// de forma diferida y el splash es lo primero que se pinta.
const STEP_FALLBACK = [
  "Conectando con el servidor local",
  "Cargando configuración y credenciales",
  "Sincronizando modelos y proveedores",
  "Verificando servidores MCP y herramientas",
  "Listo para programar",
] as const

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const language = useLanguage()
  const version = import.meta.env.VITE_TIANCODE_VERSION
  const [stepIndex, setStepIndex] = createSignal(0)
  const [percent, setPercent] = createSignal(4)
  const [fading, setFading] = createSignal(false)

  const steps = () =>
    STEP_KEYS.map((key, index) => language.t(key) ?? STEP_FALLBACK[index])

  onMount(() => {
    let current = 0
    const interval = setInterval(() => {
      current++
      if (current < STEP_KEYS.length) {
        setStepIndex(current)
        setPercent(Math.min(100, Math.round(((current + 1) / STEP_KEYS.length) * 100)))
      } else {
        clearInterval(interval)
        setPercent(100)
        setTimeout(() => {
          setFading(true)
          setTimeout(() => props.onComplete?.(), 450)
        }, 350)
      }
    }, 420)

    onCleanup(() => clearInterval(interval))
  })

  return (
    <div
      class={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#070b14] text-white transition-all duration-500 select-none overflow-hidden ${
        fading() ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
      aria-label="Tiancode"
      role="status"
    >
      {/* Dynamic Ambient Background Glows */}
      <div class="absolute w-[640px] h-[640px] rounded-full bg-cyan-500/12 blur-[150px] pointer-events-none -top-28 -left-28 animate-pulse" />
      <div class="absolute w-[640px] h-[640px] rounded-full bg-indigo-600/12 blur-[150px] pointer-events-none -bottom-28 -right-28 animate-pulse" />
      <div class="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <div class="relative flex flex-col items-center max-w-sm w-full px-6 z-10">
        {/* Orbital Logo Container */}
        <div class="relative flex items-center justify-center w-24 h-24 mb-6">
          <div class="absolute inset-0 rounded-full border border-cyan-400/25 border-t-cyan-400 border-r-indigo-400 animate-spin [animation-duration:3.2s] shadow-[0_0_20px_rgba(56,189,248,0.2)]" />
          <div class="absolute inset-2 rounded-full border border-dashed border-indigo-400/35 animate-spin [animation-duration:6.5s] [animation-direction:reverse]" />

          {/* Central Core Emblem */}
          <div class="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-2xl shadow-cyan-500/30 flex items-center justify-center">
            <div class="w-full h-full bg-[#070c18] rounded-[14px] flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="w-8 h-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
        </div>

        {/* Title and version */}
        <div class="text-center mb-5">
          <div class="flex items-center justify-center gap-2 mb-1">
            <h1 class="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Tian<span class="text-cyan-400">code</span>
            </h1>
            <Show when={version}>
              <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_8px_rgba(56,189,248,0.2)]">
                v{version}
              </span>
            </Show>
          </div>
          <p class="text-[11.5px] text-slate-400 font-medium">
            {language.t("splash.subtitle") ?? "Tu agente de código, local y privado"}
          </p>
        </div>

        {/* Progress Bar with percentage */}
        <div class="w-full flex items-center justify-between text-[10.5px] font-mono text-slate-400 mb-1.5 px-0.5">
          <span>{language.t("splash.progress") ?? "Iniciando entorno"}</span>
          <span class="text-cyan-400 font-bold">{percent()}%</span>
        </div>
        <div class="w-full bg-slate-900/90 rounded-full h-2 p-0.5 mb-4 border border-white/10 overflow-hidden shadow-inner backdrop-blur-md">
          <div
            class="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_14px_rgba(56,189,248,0.8)]"
            style={{ width: `${percent()}%` }}
          />
        </div>

        {/* Startup checklist: phases of the real boot (server, config, models, tools) */}
        <ul class="w-full flex flex-col gap-1.5" aria-live="polite">
          <For each={steps()}>
            {(label, index) => (
              <li
                class={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-mono transition-all duration-300 ${
                  index() < stepIndex()
                    ? "text-slate-500"
                    : index() === stepIndex()
                      ? "bg-cyan-400/10 text-slate-100 border border-cyan-400/20"
                      : "text-slate-600 border border-transparent"
                }`}
              >
                <span
                  class={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
                    index() < stepIndex()
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300"
                      : index() === stepIndex()
                        ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                        : "border-slate-700 text-slate-700"
                  }`}
                >
                  {index() < stepIndex() ? "✓" : index() === stepIndex() ? "•" : "·"}
                </span>
                <span class="truncate">{label}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  )
}
