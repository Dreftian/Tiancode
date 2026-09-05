import { type Component, createSignal, onCleanup, onMount } from "solid-js"

const PALETTE = [
  { r: 255, g: 255, b: 255 }, // Diamante puro
  { r: 224, g: 242, b: 254 }, // Hielo estelar
  { r: 186, g: 230, b: 253 }, // Cian etéreo
  { r: 125, g: 211, b: 252 }, // Azul celeste
  { r: 56, g: 189, b: 248 },  // Azul radiante Astra
  { r: 254, g: 240, b: 138 }, // Oro estelar sutil
]

// Polígonos vectoriales oficiales del gato Tiancode (ojos, sonrisa y colmillos de https://tiancode.vercel.app/)
const CAT_POLYGONS = [
  { eye: true, pts: [[-70.2, -60.1], [-70.2, -56.4], [-65.2, -40.1], [-56.4, -23.9], [-48.3, -13.3], [-46.5, -12.1], [-45.8, -30.2], [-39.6, -51.4], [-30.2, -28.9], [-19.6, -13.3], [-15.3, -9.6], [-0.3, -49.5], [14.0, -18.9], [19.6, -11.5], [28.4, -24.6], [35.2, -38.9], [39.6, -51.4], [45.8, -32.0], [47.7, -11.5], [54.6, -19.6], [59.6, -27.7], [66.4, -42.6], [70.2, -56.4], [70.2, -60.1], [57.7, -55.7], [40.2, -52.0], [21.5, -50.1], [-8.4, -49.5], [-30.9, -50.7], [-43.3, -52.6], [-59.6, -56.4]] },
  { eye: true, pts: [[106.3, -161.1], [100.7, -151.2], [93.2, -141.2], [82.6, -131.2], [60.8, -114.4], [42.1, -95.6], [28.4, -77.6], [25.9, -73.2], [26.5, -70.1], [30.2, -68.8], [47.7, -68.8], [60.2, -71.3], [77.6, -78.8], [83.9, -83.2], [92.6, -91.9], [100.1, -104.4], [105.7, -123.7], [108.2, -146.8]] },
  { eye: true, pts: [[-106.3, -161.1], [-107.6, -156.8], [-107.6, -136.8], [-105.7, -123.7], [-100.7, -106.3], [-96.3, -97.5], [-90.7, -90.0], [-77.0, -78.8], [-57.7, -70.7], [-48.3, -68.8], [-30.9, -68.8], [-25.9, -70.7], [-25.3, -72.0], [-29.0, -78.8], [-44.0, -98.1], [-57.7, -111.9], [-83.9, -132.4], [-95.7, -144.3]] },
  { eye: false, pts: [[40.2, -42.6], [39.0, -42.0], [29.0, -21.4], [20.9, -9.6], [21.5, -7.1], [27.1, 0.4], [43.3, -5.2], [45.2, -8.3], [45.2, -25.2]] },
  { eye: false, pts: [[0.3, -42.6], [-6.5, -27.1], [-11.5, -12.1], [-12.2, -5.2], [-10.9, -2.7], [-4.1, 4.1], [8.4, 4.1], [24.6, 1.0], [12.8, -17.1]] },
  { eye: false, pts: [[-39.0, -43.3], [-42.1, -37.0], [-44.0, -27.7], [-44.0, -13.3], [-41.5, -5.2], [-27.1, 0.4], [-9.0, 3.5], [-31.5, -27.1]] },
  { eye: false, pts: [[73.3, -59.5], [70.8, -48.9], [63.9, -31.4], [57.1, -19.6], [48.3, -7.7], [52.7, -9.0], [70.2, -18.3], [85.1, -28.9], [94.5, -37.7], [88.9, -45.8], [79.5, -55.1]] },
  { eye: false, pts: [[-86.4, -48.3], [-93.9, -37.0], [-83.3, -27.7], [-69.5, -18.3], [-50.8, -8.3], [-46.5, -7.1], [-56.4, -20.2], [-64.5, -33.9], [-73.3, -59.5]] },
  { eye: false, pts: [[-17.8, -64.5], [-17.8, -63.2], [-13.4, -59.5], [-2.8, -55.1], [7.8, -56.4], [14.7, -60.1], [18.4, -63.8], [15.3, -66.3], [7.8, -68.2], [-7.8, -68.2]] },
  { eye: false, pts: [[93.2, -71.3], [74.5, -62.0], [82.6, -55.7], [92.0, -45.8], [95.7, -39.5], [97.0, -39.5], [100.1, -43.3], [100.7, -52.0], [97.6, -65.7], [95.7, -70.1]] },
  { eye: false, pts: [[97.6, -72.0], [102.0, -60.7], [102.6, -45.8], [110.7, -54.5], [116.9, -65.1], [107.6, -70.1]] },
  { eye: false, pts: [[-94.5, -72.0], [-98.2, -63.8], [-100.1, -55.1], [-100.1, -43.3], [-97.0, -39.5], [-95.7, -39.5], [-89.5, -48.3], [-74.5, -62.0]] },
  { eye: false, pts: [[-97.6, -72.0], [-108.8, -69.5], [-116.9, -64.5], [-108.8, -52.6], [-102.6, -45.8], [-102.6, -56.4]] },
  { eye: false, pts: [[97.0, -74.4], [103.8, -73.2], [118.2, -67.6], [117.6, -79.4], [114.4, -88.2]] },
  { eye: false, pts: [[-118.2, -67.6], [-105.7, -72.6], [-97.0, -74.4], [-113.8, -88.8], [-116.9, -81.3]] },
  { eye: false, pts: [[125.0, -98.8], [123.2, -98.8], [116.3, -90.7], [120.0, -80.1], [120.7, -70.1], [126.9, -80.1], [131.3, -90.0]] },
  { eye: false, pts: [[-124.4, -98.8], [-128.8, -94.4], [-130.6, -91.3], [-130.6, -88.8], [-120.7, -69.5], [-120.0, -78.8], [-116.3, -91.3], [-123.2, -98.8]] },
  { eye: false, pts: [[-140.0, -116.2], [-135.6, -100.6], [-131.9, -93.2], [-130.6, -96.3], [-125.0, -100.6], [-125.0, -102.5], [-138.8, -116.2]] },
  { eye: false, pts: [[140.0, -116.2], [134.4, -111.9], [125.7, -100.6], [132.5, -93.2]] },
]

export const AntigravitySplash: Component<{
  onComplete?: () => void
}> = (props) => {
  const [percent, setPercent] = createSignal(0)
  const [statusText, setStatusText] = createSignal("Iniciando Tiancode...")
  const [fading, setFading] = createSignal(false)

  let canvasRef: HTMLCanvasElement | undefined
  let animId: number | undefined

  onMount(() => {
    const canvas = canvasRef
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Geometría de letras TIANCODE (bajo el gato)
    const word = "TIANCODE"
    const letterW = 95
    const gap = 36
    const totalW = word.length * letterW + (word.length - 1) * gap
    const startX = -totalW / 2
    const oy = 51.5
    const letterH = 110

    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    const arcs: { cx: number; cy: number; rx: number; ry: number; startAngle: number; endAngle: number }[] = []

    const addLine = (x1: number, y1: number, x2: number, y2: number) => lines.push({ x1, y1, x2, y2 })
    const addArc = (cx: number, cy: number, rx: number, ry: number, startAngle: number, endAngle: number) =>
      arcs.push({ cx, cy, rx, ry, startAngle, endAngle })

    for (let idx = 0; idx < word.length; idx++) {
      const char = word[idx]
      const ox = startX + idx * (letterW + gap)
      switch (char) {
        case "T":
          addLine(ox, oy, ox + letterW, oy)
          addLine(ox + letterW * 0.5, oy, ox + letterW * 0.5, oy + letterH)
          break
        case "I":
          addLine(ox + letterW * 0.2, oy, ox + letterW * 0.8, oy)
          addLine(ox + letterW * 0.5, oy, ox + letterW * 0.5, oy + letterH)
          addLine(ox + letterW * 0.2, oy + letterH, ox + letterW * 0.8, oy + letterH)
          break
        case "A":
          addLine(ox, oy + letterH, ox + letterW * 0.5, oy)
          addLine(ox + letterW * 0.5, oy, ox + letterW, oy + letterH)
          addLine(ox + letterW * 0.22, oy + letterH * 0.62, ox + letterW * 0.78, oy + letterH * 0.62)
          break
        case "N":
          addLine(ox, oy + letterH, ox, oy)
          addLine(ox, oy, ox + letterW, oy + letterH)
          addLine(ox + letterW, oy + letterH, ox + letterW, oy)
          break
        case "C":
          addArc(ox + letterW * 0.5, oy + letterH * 0.5, letterW * 0.48, letterH * 0.48, 0.75, Math.PI * 2 - 0.75)
          break
        case "O":
          addArc(ox + letterW * 0.5, oy + letterH * 0.5, letterW * 0.48, letterH * 0.48, 0, Math.PI * 2)
          break
        case "D":
          addLine(ox, oy, ox, oy + letterH)
          addLine(ox, oy, ox + letterW * 0.38, oy)
          addLine(ox, oy + letterH, ox + letterW * 0.38, oy + letterH)
          addArc(ox + letterW * 0.38, oy + letterH * 0.5, letterW * 0.52, letterH * 0.5, -Math.PI / 2, Math.PI / 2)
          break
        case "E":
          addLine(ox, oy, ox, oy + letterH)
          addLine(ox, oy, ox + letterW * 0.88, oy)
          addLine(ox, oy + letterH * 0.5, ox + letterW * 0.72, oy + letterH * 0.5)
          addLine(ox, oy + letterH, ox + letterW * 0.88, oy + letterH)
          break
      }
    }

    interface Particle {
      tx: number
      ty: number
      tz: number
      sx: number
      sy: number
      sz: number
      size: number
      isCore: boolean
      baseAlpha: number
      color: { r: number; g: number; b: number }
      twinkleSpeed: number
      twinklePhase: number
      driftPhase: number
      driftSpeed: number
      driftRadius: number
    }

    interface HeroSpike {
      particle: Particle
      spikeLen: number
      color: { r: number; g: number; b: number }
    }

    interface BgStar {
      x: number
      y: number
      size: number
      alpha: number
      twinkleSpeed: number
      twinklePhase: number
      color: { r: number; g: number; b: number }
    }

    interface SpiralStar {
      radius: number
      baseAngle: number
      z: number
      size: number
      alpha: number
      color: { r: number; g: number; b: number }
      twinkleSpeed: number
      twinklePhase: number
    }

    const bgStars: BgStar[] = []
    const constellationStars: Particle[] = []
    const spiralStars: SpiralStar[] = []
    const heroSpikes: HeroSpike[] = []

    let globalAngle = 0
    let assembleT = 0
    const entranceStartTime = performance.now()
    const ENTRANCE_DURATION = 1600

    function setupScene() {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)

      if (!canvas) return
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)

      // 1. Estrellas de fondo
      bgStars.length = 0
      const NUM_BG = Math.min(180, Math.floor(width * 0.2))
      for (let i = 0; i < NUM_BG; i++) {
        bgStars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.5 + 0.4,
          alpha: Math.random() * 0.6 + 0.25,
          twinkleSpeed: Math.random() * 0.025 + 0.008,
          twinklePhase: Math.random() * Math.PI * 2,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        })
      }

      // 2. Escala del emblema completo para el marco central de carga
      const maxTargetW = Math.min(width * 0.82, 420)
      const textScale = maxTargetW / totalW

      constellationStars.length = 0

      function createConstellationStar(rawX: number, rawY: number, scale: number, isCore: boolean) {
        const tx = rawX * scale
        const ty = rawY * scale
        const tz = (Math.random() - 0.5) * 26

        const scatterAngle = Math.random() * Math.PI * 2
        const scatterDist = Math.random() * Math.min(width, height) * 0.8 + 180
        const sx = Math.cos(scatterAngle) * scatterDist
        const sy = Math.sin(scatterAngle) * scatterDist
        const sz = (Math.random() - 0.5) * 360

        const size = isCore
          ? Math.random() < 0.28 ? Math.random() * 2.0 + 2.4 : Math.random() * 1.4 + 1.6
          : Math.random() * 1.2 + 0.8

        const star: Particle = {
          tx,
          ty,
          tz,
          sx,
          sy,
          sz,
          size,
          isCore,
          baseAlpha: isCore ? Math.random() * 0.25 + 0.75 : Math.random() * 0.3 + 0.45,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          twinkleSpeed: Math.random() * 0.035 + 0.015,
          twinklePhase: Math.random() * Math.PI * 2,
          driftPhase: Math.random() * Math.PI * 2,
          driftSpeed: Math.random() * 0.02 + 0.01,
          driftRadius: Math.random() * 1.6 + 0.4,
        }
        constellationStars.push(star)
        return star
      }

      // Estrellas del gato
      CAT_POLYGONS.forEach((poly) => {
        const pts = poly.pts
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i]
          const p2 = pts[(i + 1) % pts.length]
          const dx = p2[0] - p1[0]
          const dy = p2[1] - p1[1]
          const len = Math.hypot(dx, dy)
          const steps = Math.max(3, Math.floor(len / 6.0))
          const nx = -dy / (len || 1)
          const ny = dx / (len || 1)

          for (let s = 0; s < steps; s++) {
            const t = s / steps
            const px = p1[0] + dx * t
            const py = p1[1] + dy * t
            createConstellationStar(px, py, textScale, true)

            if (Math.random() < 0.65) {
              const offset = (Math.random() - 0.5) * 5.0
              createConstellationStar(px + nx * offset, py + ny * offset, textScale, false)
            }
          }
        }

        if (poly.eye) {
          let minX = 9999
          let maxX = -9999
          let minY = 9999
          let maxY = -9999
          pts.forEach((p) => {
            if (p[0] < minX) minX = p[0]
            if (p[0] > maxX) maxX = p[0]
            if (p[1] < minY) minY = p[1]
            if (p[1] > maxY) maxY = p[1]
          })
          for (let k = 0; k < 22; k++) {
            const rx = minX + Math.random() * (maxX - minX)
            const ry = minY + Math.random() * (maxY - minY)
            createConstellationStar(rx, ry, textScale, false)
          }
        }
      })

      // Estrellas de TIANCODE
      const starSpacing = 7
      lines.forEach((line) => {
        const dx = line.x2 - line.x1
        const dy = line.y2 - line.y1
        const len = Math.hypot(dx, dy)
        const steps = Math.max(7, Math.floor(len / starSpacing))
        const nx = -dy / (len || 1)
        const ny = dx / (len || 1)

        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          const px = line.x1 + dx * t
          const py = line.y1 + dy * t
          createConstellationStar(px, py, textScale, true)

          if (Math.random() < 0.75) {
            const offset = (Math.random() - 0.5) * 6.0
            createConstellationStar(px + nx * offset, py + ny * offset, textScale, false)
          }
        }
      })

      arcs.forEach((arc) => {
        const arcLen = Math.abs(arc.endAngle - arc.startAngle) * ((arc.rx + arc.ry) / 2)
        const steps = Math.max(10, Math.floor(arcLen / starSpacing))

        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          const angle = arc.startAngle + (arc.endAngle - arc.startAngle) * t
          const px = arc.cx + Math.cos(angle) * arc.rx
          const py = arc.cy + Math.sin(angle) * arc.ry
          createConstellationStar(px, py, textScale, true)

          if (Math.random() < 0.75) {
            const rJitter = (Math.random() - 0.5) * 6.0
            createConstellationStar(
              arc.cx + Math.cos(angle) * (arc.rx + rJitter),
              arc.cy + Math.sin(angle) * (arc.ry + rJitter),
              textScale,
              false,
            )
          }
        }
      })

      // Brazos espirales cósmicos
      spiralStars.length = 0
      const NUM_SPIRAL = 420
      const ARMS = 2
      const maxR = Math.min(width, height) * 0.48

      for (let i = 0; i < NUM_SPIRAL; i++) {
        const r = Math.pow(Math.random(), 1.6)
        const arm = i % ARMS
        const offset = (arm * 2 * Math.PI) / ARMS
        const theta = r * 4.2 + offset
        const spread = (Math.random() - 0.5) * 0.5 * (0.3 + r * 0.7)
        const angle = theta + spread

        spiralStars.push({
          radius: r * maxR,
          baseAngle: angle,
          z: (Math.random() - 0.5) * maxR * 0.2,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.45 + 0.25,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          twinkleSpeed: Math.random() * 0.02 + 0.01,
          twinklePhase: Math.random() * Math.PI * 2,
        })
      }

      // Destellos Hero con difracción en cruz (+)
      heroSpikes.length = 0
      const keyCatTips = [
        { x: -106.3, y: -161.1, len: 22 },
        { x: 106.3, y: -161.1, len: 22 },
        { x: -140.0, y: -116.2, len: 18 },
        { x: 140.0, y: -116.2, len: 18 },
        { x: -25.9, y: -70.7, len: 15 },
        { x: 25.9, y: -73.2, len: 15 },
      ]

      keyCatTips.forEach((tip) => {
        const s = createConstellationStar(tip.x, tip.y, textScale, true)
        heroSpikes.push({
          particle: s,
          spikeLen: tip.len,
          color: { r: 255, g: 255, b: 255 },
        })
      })

      const coreStars = constellationStars.filter((s) => s.isCore)
      const stepHero = Math.max(1, Math.floor(coreStars.length / 22))
      for (let i = 0; i < coreStars.length; i += stepHero) {
        heroSpikes.push({
          particle: coreStars[i],
          spikeLen: Math.random() * 14 + 12,
          color: { r: 255, g: 255, b: 255 },
        })
      }
    }

    setupScene()
    window.addEventListener("resize", setupScene)

    // Proyección 3D en perspectiva
    function projectPoint(
      lx: number,
      ly: number,
      lz: number,
      cx: number,
      cy: number,
      cosX: number,
      sinX: number,
      cosY: number,
      sinY: number,
    ) {
      const px3d = lx * cosY - lz * sinY
      const py3d = ly * cosX - (lx * sinY + lz * cosY) * sinX
      const pz3d = ly * sinX + (lx * sinY + lz * cosY) * cosX

      const scale = 1 / (1 + pz3d / 1000)
      return {
        x: cx + px3d * scale,
        y: cy + py3d * scale,
        scale,
      }
    }

    function render(time: number) {
      if (!ctx) return
      const elapsed = time - entranceStartTime
      const p = Math.min(1, elapsed / ENTRANCE_DURATION)
      assembleT = 1 - Math.pow(1 - p, 3)

      globalAngle += 0.0018
      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height * 0.41
      const maxTargetW = Math.min(width * 0.86, 490)
      const textScale = maxTargetW / totalW
      const formationFactor = assembleT

      // 1. Estrellas de fondo
      ctx.globalCompositeOperation = "lighter"
      for (let i = 0; i < bgStars.length; i++) {
        const s = bgStars[i]
        const twinkle = Math.sin(time * s.twinkleSpeed + s.twinklePhase) * 0.35 + 0.65
        const alpha = s.alpha * twinkle

        ctx.fillStyle = `rgba(${s.color.r},${s.color.g},${s.color.b},${alpha.toFixed(2)})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }

      const cosX = Math.cos(0.24)
      const sinX = Math.sin(0.24)
      const cosY = Math.cos(Math.sin(globalAngle * 0.5) * 0.06)
      const sinY = Math.sin(Math.sin(globalAngle * 0.5) * 0.06)

      // 2. Halo cósmico central
      if (formationFactor > 0.05) {
        const haloR = Math.min(width, height) * 0.44 * formationFactor
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR)
        glow.addColorStop(0, `rgba(255, 255, 255, ${(0.28 * formationFactor).toFixed(2)})`)
        glow.addColorStop(0.25, `rgba(165, 243, 252, ${(0.16 * formationFactor).toFixed(2)})`)
        glow.addColorStop(0.55, `rgba(56, 189, 248, ${(0.06 * formationFactor).toFixed(2)})`)
        glow.addColorStop(1, "rgba(0, 0, 0, 0)")

        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2)
        ctx.fill()
      }

      // 3. Brazos espirales cósmicos
      for (let i = 0; i < spiralStars.length; i++) {
        const sp = spiralStars[i]
        const curAngle = sp.baseAngle + globalAngle * 1.3

        const lx = Math.cos(curAngle) * sp.radius
        const ly = Math.sin(curAngle) * sp.radius
        const lz = sp.z

        const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY)
        const twinkle = Math.sin(time * sp.twinkleSpeed + sp.twinklePhase) * 0.3 + 0.7
        const alpha = sp.alpha * twinkle * Math.max(0.2, pt.scale)

        if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
          ctx.fillStyle = `rgba(${sp.color.r},${sp.color.g},${sp.color.b},${alpha.toFixed(2)})`
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, sp.size * pt.scale, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 4. Partículas de la constelación astral (Gato + TIANCODE) como halo luminoso
      ctx.globalCompositeOperation = "lighter"
      const settleFactor = formationFactor >= 0.7 ? Math.max(0, 1 - (formationFactor - 0.7) / 0.28) : 1.0

      for (let i = 0; i < constellationStars.length; i++) {
        const ptc = constellationStars[i]

        const driftX = Math.cos(time * ptc.driftSpeed + ptc.driftPhase) * ptc.driftRadius * settleFactor
        const driftY = Math.sin(time * ptc.driftSpeed + ptc.driftPhase) * ptc.driftRadius * settleFactor

        const lx = ptc.sx + (ptc.tx - ptc.sx) * formationFactor + driftX * formationFactor
        const ly = ptc.sy + (ptc.ty - ptc.sy) * formationFactor + driftY * formationFactor
        const lz = ptc.sz + (ptc.tz - ptc.sz) * formationFactor

        const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY)
        const twinkle = Math.sin(time * ptc.twinkleSpeed + ptc.twinklePhase) * 0.28 + 0.72
        // Aumentar nitidez atenuando el exceso de partículas saturas cuando el emblema está formado
        const alphaMultiplier = formationFactor >= 0.85 ? 0.35 : 1.0
        const alpha = ptc.baseAlpha * twinkle * alphaMultiplier

        if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
          ctx.fillStyle = `rgba(${ptc.color.r},${ptc.color.g},${ptc.color.b},${(alpha * 0.4).toFixed(2)})`
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, Math.max(0.8, (ptc.size + 1.2) * pt.scale), 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, alpha * 1.0).toFixed(2)})`
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, Math.max(0.5, ptc.size * pt.scale), 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 5. EMBLEMA DEL GATO Y TRAZOS VECTORIALES DE TIANCODE (Renderizado nítido frontal con source-over)
      if (formationFactor > 0.06) {
        const ribbonAlpha = Math.pow(formationFactor, 1.8)
        ctx.globalCompositeOperation = "source-over"

        CAT_POLYGONS.forEach((poly) => {
          const pts = poly.pts.map((p) =>
            projectPoint(p[0] * textScale, p[1] * textScale, 0, cx, cy, cosX, sinX, cosY, sinY),
          )
          if (pts.length < 3) return

          const isEye = poly.eye && poly.pts[0][1] < -100
          const isMouthOutline = poly.eye && poly.pts[0][1] >= -100
          const isTooth = !poly.eye

          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y)
          ctx.closePath()

          if (isMouthOutline) {
            // Fondo oscuro contrastado para la cavidad bucal del gato
            ctx.fillStyle = `rgba(6, 9, 16, ${(0.96 * ribbonAlpha).toFixed(2)})`
            ctx.fill()

            // Delineado exterior de la sonrisa en azul Astra radiante
            ctx.strokeStyle = `rgba(56, 189, 248, ${(0.92 * ribbonAlpha).toFixed(2)})`
            ctx.lineWidth = 2.6 * pts[0].scale
            ctx.stroke()
          } else if (isTooth) {
            // Colmillos y dientes nítidos blancos diamante
            ctx.fillStyle = `rgba(255, 255, 255, ${(1.0 * ribbonAlpha).toFixed(2)})`
            ctx.fill()

            ctx.strokeStyle = `rgba(186, 230, 253, ${(0.9 * ribbonAlpha).toFixed(2)})`
            ctx.lineWidth = 1.2 * pts[0].scale
            ctx.stroke()
          } else if (isEye) {
            // Ojos radiantes con núcleo puro y delineado fino
            ctx.fillStyle = `rgba(255, 255, 255, ${(1.0 * ribbonAlpha).toFixed(2)})`
            ctx.fill()

            ctx.strokeStyle = `rgba(56, 189, 248, ${(0.85 * ribbonAlpha).toFixed(2)})`
            ctx.lineWidth = 3.2 * pts[0].scale
            ctx.stroke()

            ctx.strokeStyle = `rgba(255, 255, 255, ${(0.98 * ribbonAlpha).toFixed(2)})`
            ctx.lineWidth = 1.4 * pts[0].scale
            ctx.stroke()
          }
        })

        const drawProjectedLine = (lx1: number, ly1: number, lx2: number, ly2: number) => {
          const p1 = projectPoint(lx1 * textScale, ly1 * textScale, 0, cx, cy, cosX, sinX, cosY, sinY)
          const p2 = projectPoint(lx2 * textScale, ly2 * textScale, 0, cx, cy, cosX, sinX, cosY, sinY)

          // Aura suave cian exterior
          ctx.strokeStyle = `rgba(56, 189, 248, ${(0.22 * ribbonAlpha).toFixed(2)})`
          ctx.lineWidth = 10 * p1.scale
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()

          // Delineado intermedio azul cielo
          ctx.strokeStyle = `rgba(186, 230, 253, ${(0.6 * ribbonAlpha).toFixed(2)})`
          ctx.lineWidth = 4.5 * p1.scale
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()

          // Núcleo nítido de alta definición
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.98 * ribbonAlpha).toFixed(2)})`
          ctx.lineWidth = 2.2 * p1.scale
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }

        const drawProjectedArc = (acx: number, acy: number, arx: number, ary: number, sa: number, ea: number) => {
          const steps = 28
          const pts = []
          for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const a = sa + (ea - sa) * t
            const lx = (acx + Math.cos(a) * arx) * textScale
            const ly = (acy + Math.sin(a) * ary) * textScale
            pts.push(projectPoint(lx, ly, 0, cx, cy, cosX, sinX, cosY, sinY))
          }

          ctx.strokeStyle = `rgba(56, 189, 248, ${(0.22 * ribbonAlpha).toFixed(2)})`
          ctx.lineWidth = 10 * pts[0].scale
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()

          ctx.strokeStyle = `rgba(186, 230, 253, ${(0.6 * ribbonAlpha).toFixed(2)})`
          ctx.lineWidth = 4.5 * pts[0].scale
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()

          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.98 * ribbonAlpha).toFixed(2)})`
          ctx.lineWidth = 2.2 * pts[0].scale
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()
        }

        lines.forEach((l) => drawProjectedLine(l.x1, l.y1, l.x2, l.y2))
        arcs.forEach((a) => drawProjectedArc(a.cx, a.cy, a.rx, a.ry, a.startAngle, a.endAngle))
      }

      // 6. Destellos de difracción en cruz (+) en los vértices
      if (formationFactor > 0.35) {
        for (let i = 0; i < heroSpikes.length; i++) {
          const h = heroSpikes[i]
          const p = h.particle

          const lx = p.sx + (p.tx - p.sx) * formationFactor
          const ly = p.sy + (p.ty - p.sy) * formationFactor
          const lz = p.sz + (p.tz - p.sz) * formationFactor

          const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY)
          const twinkle = Math.sin(time * 0.018 + i * 1.5) * 0.35 + 0.75
          const spikeLen = h.spikeLen * pt.scale * twinkle * formationFactor
          const alpha = (0.95 * twinkle * formationFactor).toFixed(2)

          if (pt.x >= 15 && pt.x <= width - 15 && pt.y >= 15 && pt.y <= height - 15) {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, (p.size + 1.0) * pt.scale, 0, Math.PI * 2)
            ctx.fill()

            ctx.strokeStyle = `rgba(255, 255, 255, ${(Number(alpha) * 0.85).toFixed(2)})`
            ctx.lineWidth = 1.2

            ctx.beginPath()
            ctx.moveTo(pt.x - spikeLen, pt.y)
            ctx.lineTo(pt.x + spikeLen, pt.y)
            ctx.stroke()

            ctx.beginPath()
            ctx.moveTo(pt.x, pt.y - spikeLen)
            ctx.lineTo(pt.x, pt.y + spikeLen)
            ctx.stroke()
          }
        }
      }

      ctx.globalCompositeOperation = "source-over"
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    const startTime = Date.now()
    const totalDuration = 2000

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
        }, 120)
      }
    }, 25)

    onCleanup(() => {
      window.removeEventListener("resize", setupScene)
      if (animId !== undefined) cancelAnimationFrame(animId)
      clearInterval(interval)
    })
  })

  return (
    <div
      class={`fixed inset-0 z-[99999] flex flex-col items-center justify-between bg-[#07090e] transition-opacity duration-300 select-none overflow-hidden ${
        fading() ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ "-webkit-app-region": "drag" } as any}
      aria-label="Tiancode Loading"
      role="status"
    >
      {/* Dynamic Cosmic Starfield & 3D Constellation Canvas */}
      <canvas ref={canvasRef} class="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Atmospheric Nebula Glows */}
      <div class="absolute w-[500px] h-[500px] -top-24 -left-24 rounded-full bg-cyan-600/10 blur-[130px] pointer-events-none" />
      <div class="absolute w-[550px] h-[550px] -bottom-28 -right-28 rounded-full bg-indigo-600/12 blur-[140px] pointer-events-none" />

      {/* Spacer top */}
      <div class="h-10" />

      {/* Centerpiece spacer where the 3D cat & TIANCODE letters animate */}
      <div class="w-full flex-1 pointer-events-none" />

      {/* Footer controls: Status text & Progress Bar */}
      <div class="relative z-10 flex flex-col items-center gap-3 pb-12 w-full max-w-sm px-6">
        <span class="text-xs text-slate-300 tracking-wide font-medium drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">
          {statusText()}
        </span>

        <div class="w-64 flex flex-col items-center gap-2">
          <div class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden relative backdrop-blur-sm border border-white/5">
            <div
              class="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 transition-all duration-75 ease-out shadow-[0_0_14px_rgba(56,189,248,0.9)]"
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


