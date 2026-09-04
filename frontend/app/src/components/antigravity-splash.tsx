import { type Component, createSignal, onCleanup, onMount } from "solid-js"
import { WordmarkV2 } from "@tiancode-ai/ui/v2/wordmark-v2"
import tianLogo from "../../../ui/src/assets/logo/tian-white.png"

interface Star {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  baseAlpha: number
  alpha: number
  pulseSpeed: number
  pulseOffset: number
}

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const [percent, setPercent] = createSignal(0)
  const [statusText, setStatusText] = createSignal("Iniciando Tiancode...")
  const [fading, setFading] = createSignal(false)

  let canvasRef: HTMLCanvasElement | undefined
  let animFrameId: number | undefined

  onMount(() => {
    // 1. Setup Astral.sh-inspired Cosmic Starfield & Constellation Canvas
    const canvas = canvasRef
    if (canvas) {
      const ctx = canvas.getContext("2d")
      if (ctx) {
        let width = (canvas.width = window.innerWidth)
        let height = (canvas.height = window.innerHeight)

        const handleResize = () => {
          if (!canvas) return
          width = canvas.width = window.innerWidth
          height = canvas.height = window.innerHeight
        }
        window.addEventListener("resize", handleResize)

        const STAR_COUNT = Math.min(110, Math.floor((width * height) / 9000))
        const stars: Star[] = []
        for (let i = 0; i < STAR_COUNT; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            radius: Math.random() * 1.6 + 0.5,
            baseAlpha: Math.random() * 0.6 + 0.25,
            alpha: 0.5,
            pulseSpeed: Math.random() * 0.02 + 0.008,
            pulseOffset: Math.random() * Math.PI * 2,
          })
        }

        let time = 0
        const MAX_CONNECT_DIST = 115

        const renderConstellations = () => {
          ctx.clearRect(0, 0, width, height)
          time += 1

          // Update & draw stars
          for (let i = 0; i < stars.length; i++) {
            const s = stars[i]
            s.x += s.vx
            s.y += s.vy

            // Wrap edges
            if (s.x < 0) s.x = width
            if (s.x > width) s.x = 0
            if (s.y < 0) s.y = height
            if (s.y > height) s.y = 0

            // Twinkle pulse
            s.alpha = s.baseAlpha + Math.sin(time * s.pulseSpeed + s.pulseOffset) * 0.25
            const alphaClamped = Math.max(0.1, Math.min(0.95, s.alpha))

            // Draw star node
            ctx.beginPath()
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(186, 230, 253, ${alphaClamped})`
            ctx.shadowColor = "rgba(56, 189, 248, 0.7)"
            ctx.shadowBlur = s.radius > 1.2 ? 6 : 2
            ctx.fill()
            ctx.shadowBlur = 0
          }

          // Draw constellation connecting lines (Astral signature effect)
          for (let i = 0; i < stars.length; i++) {
            for (let j = i + 1; j < stars.length; j++) {
              const dx = stars[i].x - stars[j].x
              const dy = stars[i].y - stars[j].y
              const dist = Math.sqrt(dx * dx + dy * dy)

              if (dist < MAX_CONNECT_DIST) {
                const lineAlpha = (1 - dist / MAX_CONNECT_DIST) * 0.28
                ctx.beginPath()
                ctx.moveTo(stars[i].x, stars[i].y)
                ctx.lineTo(stars[j].x, stars[j].y)
                ctx.strokeStyle = `rgba(125, 211, 252, ${lineAlpha})`
                ctx.lineWidth = 0.75
                ctx.stroke()
              }
            }
          }

          animFrameId = requestAnimationFrame(renderConstellations)
        }

        renderConstellations()

        onCleanup(() => {
          window.removeEventListener("resize", handleResize)
          if (animFrameId) cancelAnimationFrame(animFrameId)
        })
      }
    }

    // 2. Progress Tracker
    const startTime = Date.now()
    const totalDuration = 2200 // 2.2s for silky smooth Apple/Astral loading

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100))
      setPercent(progress)

      if (progress < 25) {
        setStatusText("Iniciando motor neuronal y cosmos...")
      } else if (progress < 55) {
        setStatusText("Cargando extensiones, MCP y agentes...")
      } else if (progress < 85) {
        setStatusText("Sincronizando entorno de trabajo...")
      } else {
        setStatusText("¡Tiancode listo!")
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
      class={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#07090e] transition-opacity duration-300 select-none overflow-hidden ${
        fading() ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ "-webkit-app-region": "drag" } as any}
      aria-label="Tiancode Loading"
      role="status"
    >
      {/* Dynamic Cosmic Starfield & Constellation Canvas (Astral.sh aesthetic) */}
      <canvas ref={canvasRef} class="absolute inset-0 w-full h-full pointer-events-none opacity-80" />

      {/* Atmospheric Nebula Glows */}
      <div class="absolute w-[500px] h-[500px] -top-24 -left-24 rounded-full bg-cyan-600/10 blur-[130px] pointer-events-none" />
      <div class="absolute w-[550px] h-[550px] -bottom-28 -right-28 rounded-full bg-indigo-600/12 blur-[140px] pointer-events-none" />
      <div class="absolute w-80 h-80 rounded-full bg-sky-400/15 blur-[90px] pointer-events-none" />

      {/* Main Celestial Card */}
      <div class="relative z-10 flex flex-col items-center justify-center gap-4 p-8 w-full h-full">
        {/* Constellation Ring & Tiancode Glowing Logo */}
        <div class="relative flex items-center justify-center">
          {/* Subtle spinning constellation orbit ring */}
          <div class="absolute size-24 rounded-full border border-cyan-400/20 animate-[spin_12s_linear_infinite]" />
          <div class="absolute size-28 rounded-full border border-dashed border-sky-400/15 animate-[spin_20s_linear_infinite_reverse]" />

          {/* Logo Centerpiece */}
          <div class="relative flex size-20 items-center justify-center rounded-2xl border border-cyan-400/40 bg-[#0c101c]/90 p-3.5 backdrop-blur-xl shadow-[0_0_35px_rgba(56,189,248,0.35)]">
            <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/25 via-sky-500/15 to-indigo-600/30 blur-sm" />
            <img
              src={tianLogo}
              alt="Tiancode"
              class="relative size-13 object-contain drop-shadow-[0_0_16px_rgba(56,189,248,0.95)]"
              draggable={false}
            />
          </div>
        </div>

        {/* Title with Official WordmarkV2 "T i a n c o d e" */}
        <div class="flex flex-col items-center gap-2 text-center mt-2 w-full max-w-[240px]">
          <WordmarkV2 class="w-full h-auto text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.45)]" />
          <span class="text-xs text-slate-300 tracking-wide font-medium drop-shadow-sm">
            {statusText()}
          </span>
        </div>

        {/* Sleek Astral Progress Bar & Percentage */}
        <div class="w-64 flex flex-col items-center gap-2 mt-2">
          <div class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden relative backdrop-blur-sm border border-white/5">
            <div
              class="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 transition-all duration-75 ease-out shadow-[0_0_12px_rgba(56,189,248,0.85)]"
              style={{ width: `${percent()}%` }}
            />
          </div>
          <span class="text-xs font-mono font-bold text-cyan-300 tabular-nums drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]">
            {percent()}%
          </span>
        </div>
      </div>
    </div>
  )
}


