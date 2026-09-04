import { type Component, createEffect, onCleanup, onMount } from "solid-js"

export const AudioWaveform: Component<{
  active?: boolean
  barsCount?: number
  class?: string
  color?: string
  height?: number
}> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined
  let animId: number | undefined
  let phase = 0

  const drawBars = (isActive: boolean) => {
    if (!canvasRef) return
    const ctx = canvasRef.getContext("2d")
    if (!ctx) return
    const count = props.barsCount ?? 28
    const w = canvasRef.width
    const h = canvasRef.height
    ctx.clearRect(0, 0, w, h)

    const barWidth = (w / count) * 0.65
    const gap = (w - barWidth * count) / (count - 1)

    for (let i = 0; i < count; i++) {
      let val = 0.1
      if (isActive) {
        const primary = Math.abs(Math.sin(phase * 1.8 + i * 0.45))
        const secondary = Math.abs(Math.cos(phase * 2.4 - i * 0.35))
        val = Math.min(1.0, 0.15 + 0.85 * (0.6 * primary + 0.4 * secondary))
      } else {
        val = 0.08 + 0.04 * Math.sin(i * 0.3)
      }
      const barH = Math.max(3, val * (h - 4))
      const x = i * (barWidth + gap)
      const y = (h - barH) / 2

      const grad = ctx.createLinearGradient(0, y, 0, y + barH)
      if (isActive) {
        grad.addColorStop(0, "#38bdf8")
        grad.addColorStop(0.5, "#60a5fa")
        grad.addColorStop(1, "#818cf8")
      } else {
        grad.addColorStop(0, "rgba(148, 163, 184, 0.3)")
        grad.addColorStop(1, "rgba(100, 116, 139, 0.2)")
      }

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barH, 2)
      ctx.fill()
    }
  }

  const startAnimation = () => {
    stopAnimation()
    const loop = () => {
      phase += 0.08
      drawBars(true)
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
  }

  const stopAnimation = () => {
    if (animId !== undefined) {
      cancelAnimationFrame(animId)
      animId = undefined
    }
  }

  onMount(() => {
    drawBars(false)
  })

  createEffect(() => {
    const isActive = props.active ?? false
    if (isActive) {
      startAnimation()
    } else {
      stopAnimation()
      drawBars(false)
    }
  })

  onCleanup(() => {
    stopAnimation()
  })

  return (
    <div class={`audio-waveform-container flex items-center justify-center ${props.class ?? ""}`}>
      <canvas
        ref={canvasRef}
        width={props.barsCount ? props.barsCount * 8 : 220}
        height={props.height ?? 32}
        style={{ width: "100%", height: `${props.height ?? 32}px` }}
      />
    </div>
  )
}
