import { type Component, createEffect, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { getSelectedAudioDeviceId } from "@/utils/asr"

type TesterState = "idle" | "listening" | "fallback" | "silent" | "error"

/**
 * Live microphone check: a level meter with a peak marker and the level in dB. It opens the mic
 * with the same processing dictation uses (echo cancellation, noise suppression, mono), so the
 * meter shows what the transcriber hears, and says which device actually opened.
 */
export const MicTester: Component<{ selectedDeviceId?: string | null; active?: boolean }> = (props) => {
  const language = useLanguage()
  const [state, setState] = createStore({
    testing: false,
    level: 0,
    peak: 0,
    db: undefined as number | undefined,
    device: "",
    status: "idle" as TesterState,
    loopback: false,
    heard: false,
  })

  const audio = {
    stream: undefined as MediaStream | undefined,
    context: undefined as AudioContext | undefined,
    frame: undefined as number | undefined,
    silence: undefined as ReturnType<typeof setTimeout> | undefined,
  }

  const stop = () => {
    if (audio.frame !== undefined) cancelAnimationFrame(audio.frame)
    if (audio.silence !== undefined) clearTimeout(audio.silence)
    audio.stream?.getTracks().forEach((track) => track.stop())
    void audio.context?.close().catch(() => {})
    audio.frame = undefined
    audio.silence = undefined
    audio.stream = undefined
    audio.context = undefined
    setState({ testing: false, level: 0, peak: 0, db: undefined })
  }

  const start = async () => {
    stop()
    setState({ testing: true, status: "listening", heard: false, device: "" })
    const deviceId = props.selectedDeviceId ?? getSelectedAudioDeviceId() ?? undefined
    const constraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
    const opened = await navigator.mediaDevices
      .getUserMedia({ audio: deviceId ? { ...constraints, deviceId: { exact: deviceId } } : constraints })
      .then((stream) => ({ stream, fallback: false }))
      .catch(() =>
        // The chosen device may be unplugged: test the default one and say so.
        navigator.mediaDevices
          .getUserMedia({ audio: constraints })
          .then((stream) => ({ stream, fallback: Boolean(deviceId) })),
      )
      .catch(() => undefined)
    if (!opened) {
      setState({ testing: false, status: "error" })
      return
    }
    audio.stream = opened.stream
    const context = new AudioContext()
    audio.context = context
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.5
    const source = context.createMediaStreamSource(opened.stream)
    source.connect(analyser)
    if (state.loopback) source.connect(context.destination)
    setState({
      device: opened.stream.getAudioTracks()[0]?.label ?? "",
      status: opened.fallback ? "fallback" : "listening",
    })

    const samples = new Float32Array(analyser.fftSize)
    const tick = () => {
      analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      const db = rms > 0 ? 20 * Math.log10(rms) : -100
      // -60 dB (silence) → 0 %, 0 dB (full scale) → 100 %.
      const level = Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
      setState({ level, db: Math.round(db), peak: Math.max(level, state.peak - 0.8) })
      if (level > 25 && !state.heard) setState("heard", true)
      audio.frame = requestAnimationFrame(tick)
    }
    audio.frame = requestAnimationFrame(tick)
    // Eight seconds without a voice-level sound usually means a muted or wrong microphone.
    audio.silence = setTimeout(() => {
      if (!state.heard && state.testing) setState("status", "silent")
    }, 8000)
  }

  // Leaving the panel releases the microphone.
  createEffect(() => {
    if (props.active === false && state.testing) stop()
  })
  onCleanup(stop)

  const message = () => {
    if (state.status === "error") return language.t("settings.voices.tester.error")
    if (!state.testing) return language.t("settings.voices.tester.idle")
    if (state.status === "silent") return language.t("settings.voices.tester.silent")
    if (state.heard) return language.t("settings.voices.tester.ok")
    if (state.status === "fallback") return language.t("settings.voices.tester.fallback")
    return language.t("settings.voices.tester.listening")
  }

  return (
    <div class="settings-v2-voices-tester" data-state={state.testing ? (state.heard ? "ok" : state.status) : state.status}>
      <div class="settings-v2-voices-tester-row">
        <ButtonV2
          variant={state.testing ? "contrast" : "outline"}
          size="small"
          onClick={() => (state.testing ? stop() : void start())}
        >
          {language.t(state.testing ? "settings.voices.tester.stop" : "settings.voices.tester.start")}
        </ButtonV2>
        <div
          class="settings-v2-voices-meter"
          role="meter"
          aria-label={language.t("settings.voices.tester.level")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.level)}
        >
          <div class="settings-v2-voices-meter-fill" style={{ width: `${state.level}%` }} />
          <div class="settings-v2-voices-meter-peak" style={{ left: `${state.peak}%` }} />
        </div>
        <span class="settings-v2-voices-meter-db">{state.db === undefined ? "— dB" : `${state.db} dB`}</span>
        <Switch
          class="settings-v2-voices-loopback"
          checked={state.loopback}
          onChange={(checked) => {
            setState("loopback", checked)
            if (state.testing) void start()
          }}
        >
          {language.t("settings.voices.tester.loopback")}
        </Switch>
      </div>
      <p class="settings-v2-voices-tester-status">
        {message()}
        <Show when={state.testing && state.device}>
          <span class="settings-v2-voices-tester-device"> · {state.device}</span>
        </Show>
      </p>
    </div>
  )
}
