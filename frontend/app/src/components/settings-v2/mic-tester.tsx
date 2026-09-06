import { Component, createSignal, onCleanup, Show } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { getSelectedAudioDeviceId } from "@/utils/asr"

export const MicTester: Component<{ selectedDeviceId?: string | null }> = (props) => {
  const [testing, setTesting] = createSignal(false)
  const [volumePercent, setVolumePercent] = createSignal(0)
  const [peakPercent, setPeakPercent] = createSignal(0)
  const [dbLevel, setDbLevel] = createSignal<number | null>(null)
  const [statusMessage, setStatusMessage] = createSignal<string>("Listo para probar. Haz clic en el botón para verificar.")
  const [statusVariant, setStatusVariant] = createSignal<"idle" | "listening" | "active" | "error">("idle")
  const [loopback, setLoopback] = createSignal(false)
  const [audioInfo, setAudioInfo] = createSignal<{ sampleRate: number; channelCount: number } | null>(null)

  let streamRef: MediaStream | undefined
  let audioContextRef: AudioContext | undefined
  let sourceNodeRef: MediaStreamAudioSourceNode | undefined
  let analyserRef: AnalyserNode | undefined
  let animId: number | undefined
  let canvasRef: HTMLCanvasElement | undefined
  let peakDecayTimer: number | undefined
  let lastPeak = 0

  const stopTest = () => {
    if (animId !== undefined) {
      cancelAnimationFrame(animId)
      animId = undefined
    }
    if (peakDecayTimer !== undefined) {
      clearInterval(peakDecayTimer)
      peakDecayTimer = undefined
    }
    if (sourceNodeRef) {
      try {
        sourceNodeRef.disconnect()
      } catch {}
      sourceNodeRef = undefined
    }
    if (audioContextRef) {
      void audioContextRef.close().catch(() => {})
      audioContextRef = undefined
    }
    if (streamRef) {
      streamRef.getTracks().forEach((track) => track.stop())
      streamRef = undefined
    }
    analyserRef = undefined
    lastPeak = 0
    setTesting(false)
    setVolumePercent(0)
    setPeakPercent(0)
    setDbLevel(null)
    setAudioInfo(null)
    setStatusVariant("idle")
    setStatusMessage("Prueba finalizada. Micrófono apagado y liberado.")
  }

  const startTest = async () => {
    stopTest()
    setStatusVariant("listening")
    setStatusMessage("Iniciando acceso al micrófono...")
    setTesting(true)

    const deviceId = props.selectedDeviceId ?? getSelectedAudioDeviceId() ?? undefined
    const constraints: MediaTrackConstraints = {
      echoCancellation: !loopback(), // Disable echo cancellation if loopback is desired to test raw sound
      noiseSuppression: false,
      autoGainControl: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    }

    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
      } catch {
        // Fallback without exact deviceId if specific ID failed
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      streamRef = stream

      const track = stream.getAudioTracks()[0]
      const settings = track?.getSettings()

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      audioContextRef = ctx

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.4
      analyserRef = analyser

      const source = ctx.createMediaStreamSource(stream)
      sourceNodeRef = source
      source.connect(analyser)

      if (loopback()) {
        source.connect(ctx.destination)
      }

      setAudioInfo({
        sampleRate: settings?.sampleRate || ctx.sampleRate,
        channelCount: settings?.channelCount || 1,
      })

      setStatusMessage("Escuchando... Di algo hacia tu micrófono.")

      const timeBuffer = new Uint8Array(analyser.frequencyBinCount)
      const freqBuffer = new Uint8Array(analyser.frequencyBinCount)

      // Peak decay loop
      peakDecayTimer = window.setInterval(() => {
        if (lastPeak > 0) {
          lastPeak = Math.max(0, lastPeak - 3)
          setPeakPercent(lastPeak)
        }
      }, 50)

      let silentFrames = 0

      const drawLoop = () => {
        if (!analyserRef || !audioContextRef) return

        analyserRef.getByteTimeDomainData(timeBuffer)
        analyserRef.getByteFrequencyData(freqBuffer)

        // RMS calculation
        let sum = 0
        for (let i = 0; i < timeBuffer.length; i++) {
          const norm = (timeBuffer[i] - 128) / 128
          sum += norm * norm
        }
        const rms = Math.sqrt(sum / timeBuffer.length)
        // Scaled volume for responsive UI feedback
        const percent = Math.min(100, Math.round(rms * 320))
        setVolumePercent(percent)

        if (percent > lastPeak) {
          lastPeak = percent
          setPeakPercent(lastPeak)
        }

        // dB calculation
        if (rms > 0.0001) {
          const db = Math.round(20 * Math.log10(rms))
          setDbLevel(Math.max(-60, Math.min(0, db)))
        } else {
          setDbLevel(-60)
        }

        // Status update
        if (percent >= 6) {
          silentFrames = 0
          setStatusVariant("active")
          setStatusMessage(`Micrófono funcionando correctamente — Señal detectada (${percent}%)`)
        } else {
          silentFrames++
          if (silentFrames > 30) {
            setStatusVariant("listening")
            setStatusMessage("Esperando voz... habla cerca del micrófono para comprobar.")
          }
        }

        // Mini canvas waveform visualizer
        if (canvasRef) {
          const canvasCtx = canvasRef.getContext("2d")
          if (canvasCtx) {
            const w = canvasRef.width
            const h = canvasRef.height
            canvasCtx.clearRect(0, 0, w, h)

            canvasCtx.lineWidth = 2
            canvasCtx.strokeStyle = percent >= 6 ? "#34d399" : "#64748b"
            canvasCtx.beginPath()

            const sliceWidth = w / timeBuffer.length
            let x = 0
            for (let i = 0; i < timeBuffer.length; i++) {
              const v = timeBuffer[i] / 128.0
              const y = (v * h) / 2
              if (i === 0) canvasCtx.moveTo(x, y)
              else canvasCtx.lineTo(x, y)
              x += sliceWidth
            }
            canvasCtx.lineTo(w, h / 2)
            canvasCtx.stroke()
          }
        }

        animId = requestAnimationFrame(drawLoop)
      }

      animId = requestAnimationFrame(drawLoop)
    } catch (error) {
      stopTest()
      setStatusVariant("error")
      setStatusMessage(
        error instanceof Error
          ? `No se pudo acceder al micrófono: ${error.message}`
          : "Error al intentar capturar el micrófono. Revisa los permisos de Windows.",
      )
    }
  }

  const toggleLoopback = (enabled: boolean) => {
    setLoopback(enabled)
    if (!audioContextRef || !sourceNodeRef) return
    try {
      if (enabled) {
        sourceNodeRef.connect(audioContextRef.destination)
      } else {
        sourceNodeRef.disconnect(audioContextRef.destination)
      }
    } catch {}
  }

  onCleanup(() => {
    stopTest()
  })

  return (
    <div class="settings-v2-mic-tester">
      <div class="settings-v2-mic-tester-top">
        <div class="settings-v2-mic-tester-info">
          <div class="settings-v2-mic-tester-title-row">
            <span class="settings-v2-mic-tester-heading">Prueba de funcionamiento del micrófono</span>
            <span
              class="settings-v2-mic-tester-badge"
              data-variant={statusVariant()}
            >
              <span class="settings-v2-mic-tester-dot" />
              <Show when={statusVariant() === "idle"}>Inactivo</Show>
              <Show when={statusVariant() === "listening"}>Esperando audio</Show>
              <Show when={statusVariant() === "active"}>Señal óptima</Show>
              <Show when={statusVariant() === "error"}>Error</Show>
            </span>
          </div>
          <p class="settings-v2-mic-tester-desc">{statusMessage()}</p>
        </div>

        <div class="settings-v2-mic-tester-actions">
          <Show
            when={testing()}
            fallback={
              <ButtonV2
                type="button"
                variant="contrast"
                size="small"
                onClick={() => void startTest()}
              >
                <span class="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polygon points="5 3 13 8 5 13 5 3" fill="currentColor" />
                  </svg>
                  Probar micrófono
                </span>
              </ButtonV2>
            }
          >
            <ButtonV2
              type="button"
              variant="danger"
              size="small"
              onClick={() => stopTest()}
            >
              <span class="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="4" y="4" width="8" height="8" rx="1.5" />
                </svg>
                Detener prueba
              </span>
            </ButtonV2>
          </Show>
        </div>
      </div>

      {/* VU Meter / Barra de volumen en vivo */}
      <div class="settings-v2-mic-meter-wrap">
        <div class="settings-v2-mic-meter-track">
          <div
            class="settings-v2-mic-meter-fill"
            style={{
              width: `${Math.min(100, volumePercent())}%`,
            }}
          />
          <Show when={peakPercent() > 0}>
            <div
              class="settings-v2-mic-meter-peak"
              style={{
                left: `${Math.min(99, peakPercent())}%`,
              }}
            />
          </Show>
        </div>

        <div class="settings-v2-mic-meter-labels">
          <div class="flex items-center gap-2">
            <span>Nivel de entrada: <strong class="text-text-base">{volumePercent()}%</strong></span>
            <Show when={dbLevel() !== null}>
              <span class="text-text-weaker text-[11px] font-mono">({dbLevel()} dB)</span>
            </Show>
          </div>
          <Show when={audioInfo()}>
            <div class="flex items-center gap-1.5 text-[11px] text-text-weaker font-mono">
              <span>{Math.round(audioInfo()!.sampleRate / 1000)} kHz</span>
              <span>•</span>
              <span>{audioInfo()!.channelCount === 1 ? "Mono" : "Estéreo"}</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Onda reactiva en tiempo real */}
      <Show when={testing()}>
        <div class="settings-v2-mic-waveform-wrap">
          <canvas
            ref={canvasRef}
            width={380}
            height={28}
            class="w-full h-7 rounded bg-black/40 border border-white/5"
          />
        </div>
      </Show>

      {/* Opciones de retorno de audio */}
      <div class="settings-v2-mic-options">
        <label class="flex items-center gap-2 text-[12px] text-text-weak hover:text-text-base cursor-pointer select-none">
          <Switch
            size="small"
            checked={loopback()}
            onChange={(checked) => toggleLoopback(checked)}
          />
          <span>Escuchar retorno de audio (Hear myself / Loopback en auriculares)</span>
        </label>
      </div>
    </div>
  )
}
