import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { getSpeechRecognition, speechRecognitionLang, type SpeechRecognitionLike } from "@/utils/voices"

// Mic icon rendered inline; the icon set has no microphone.
export function MicIcon(props: { class?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" class={props.class}>
      <rect x="5.5" y="1.5" width="5" height="9" rx="2.5" stroke="currentColor" />
      <path
        d="M3.5 7.5C3.5 9.98528 5.51472 12 8 12C10.4853 12 12.5 9.98528 12.5 7.5M8 12V14.5M5.5 14.5H10.5"
        stroke="currentColor"
        stroke-linecap="square"
      />
    </svg>
  )
}

// Microphone button for the chat composer. Transcribes with the Web Speech
// API (Chromium/WebView2) and fills the prompt with the final transcript;
// it never submits automatically so the user can review before sending.
export function VoiceDictationButton(props: {
  class?: string
  listeningClass?: string
  ariaLabel: string
  listeningLabel: string
  onResult: (text: string) => void
}) {
  const language = useLanguage()
  const [listening, setListening] = createSignal(false)
  let recognition: SpeechRecognitionLike | undefined

  const stop = () => {
    recognition?.stop()
    recognition = undefined
    setListening(false)
  }

  const start = () => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      showToast({ variant: "error", title: language.t("chat.mic.error") })
      return
    }
    const rec = new Ctor()
    recognition = rec
    rec.lang = speechRecognitionLang(language.locale())
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) props.onResult(transcript.trim())
      stop()
    }
    rec.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        showToast({ variant: "error", title: language.t("chat.mic.error"), description: event.error })
      }
      stop()
    }
    rec.onend = () => {
      recognition = undefined
      setListening(false)
    }
    setListening(true)
    rec.start()
  }

  const toggle = () => {
    if (listening()) {
      stop()
      return
    }
    start()
  }

  return (
    <button
      type="button"
      aria-label={listening() ? props.listeningLabel : props.ariaLabel}
      title={listening() ? props.listeningLabel : props.ariaLabel}
      classList={{
        [props.class ?? ""]: !!props.class,
        [props.listeningClass ?? ""]: !!props.listeningClass && listening(),
      }}
      data-listening={listening() || undefined}
      onClick={toggle}
    >
      <MicIcon class="size-4" />
    </button>
  )
}
