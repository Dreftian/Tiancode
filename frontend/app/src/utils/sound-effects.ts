// Generador de efectos de sonido táctiles elegantes y modernos mediante Web Audio API sintetizado
// No requiere archivos de audio externos y opera con latencia cero.

class SoundEffectsEngine {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume()
    }
    return this.ctx
  }

  // Sonido suave de confirmación al completar una tarea o turno
  playSuccess() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = "sine"
    osc1.frequency.setValueAtTime(587.33, now) // D5
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12) // A5

    osc2.type = "triangle"
    osc2.frequency.setValueAtTime(880.0, now + 0.05)
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18) // D6

    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now + 0.05)
    osc1.stop(now + 0.28)
    osc2.stop(now + 0.28)
  }

  // Clic táctil al aplicar un parche o editar archivo con éxito
  playSnap() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(1200, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04)

    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.05)
  }

  // Tono sutil de aviso o requerimiento de permiso
  playNotice() {
    const ctx = this.getContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.setValueAtTime(554.37, now + 0.08)

    gain.gain.setValueAtTime(0.06, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.22)
  }
}

export const SoundEffects = new SoundEffectsEngine()
