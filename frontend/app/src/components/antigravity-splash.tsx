import { type Component, createSignal, onCleanup, onMount } from "solid-js"
import tianLogo from "../../../ui/src/assets/logo/tian-white.png"

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const [fading, setFading] = createSignal(false)

  onMount(() => {
    const timer = setTimeout(() => {
      setFading(true)
      setTimeout(() => props.onComplete?.(), 100)
    }, 280)

    onCleanup(() => clearTimeout(timer))
  })

  return (
    <div
      class={`fixed inset-0 z-50 flex items-center justify-center bg-[#07080c]/85 backdrop-blur-md transition-opacity duration-200 select-none ${
        fading() ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-label="Tiancode Loading"
      role="status"
    >
      {/* Cuadro compacto 60px x 60px redondeado con logo y brillo sutil */}
      <div class="relative flex size-[60px] items-center justify-center rounded-2xl border border-cyan-400/30 bg-[#0e111a] p-2 shadow-[0_0_24px_rgba(6,182,212,0.25)]">
        <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/20 via-sky-500/10 to-indigo-600/25 blur-sm" />
        <img
          src={tianLogo}
          alt="Tiancode"
          class="relative size-8 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.7)] animate-pulse"
          draggable={false}
        />
      </div>
    </div>
  )
}

