import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import type { Part as MessagePart, TextPart } from "@tiancode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { petKinds, useSettings } from "@/context/settings"
import { PetGlyph } from "@/components/pet/pet-glyph"
import type { MascotMood } from "@tiancode-ai/ui/mascot"
import { compactPetText, resolvePetCompanionStatus, type PetCompanionStatus } from "./pet-companion-state"
import { speakAutomaticallyWithVoices } from "@/utils/voices"
import "./pet-companion.css"

// Texto de la burbuja por estado. El estado "ready" (sesión inactiva o sin
// sesión abierta) muestra un mensaje de reposo; "running" muestra la acción
// en curso cuando hay anuncio, con la etiqueta genérica como respaldo.
const statusLabels = {
  ready: "pets.status.resting",
  running: "pets.status.running",
  "needs-input": "pets.status.needsInput",
  blocked: "pets.status.blocked",
} as const

const statusGlyph = {
  ready: "●",
  running: "●",
  "needs-input": "!",
  blocked: "×",
} as const satisfies Record<PetCompanionStatus, string>

const emptyParts: MessagePart[] = []

// El anuncio es el primer tramo de texto del mensaje del asistente: lo que la
// IA dice que va a hacer (misma convención que auto-speak para leérselo en
// voz alta). Se colapsan los saltos de línea para que la burbuja quepa en dos
// líneas con ellipsis.
function announcementText(session: { part: Record<string, MessagePart[] | undefined> }, messageID: string) {
  const parts = session.part[messageID] ?? emptyParts
  const announcement = parts.find((part): part is TextPart => part.type === "text")
  const text = announcement?.text.trim()
  if (!text) return ""
  return compactPetText(text)
}

export function PetCompanion() {
  const language = useLanguage()
  const settings = useSettings()
  const sync = useServerSync()
  const params = useParams<{ id?: string }>()
  const status = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return "ready" as const
    const session = sync().session.data
    return resolvePetCompanionStatus({
      sessionStatus: session.session_status[sessionID],
      pendingPermissions: session.permission[sessionID],
    })
  })
  // Acción actual de la IA: el anuncio del último mensaje del asistente en
  // curso. El store global de sesión lo actualiza en vivo con cada delta del
  // stream (evento message.part.delta), sin polling ni estado extra.
  const actionText = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return ""
    const session = sync().session.data
    const messages = session.message[sessionID]
    const last = messages?.at(-1)
    if (last?.role !== "assistant") return ""
    return announcementText(session, last.id)
  })
  // Mientras trabaja se prefiere el anuncio en vivo; sin anuncio todavía
  // (p. ej. razonando) se muestra la etiqueta genérica del estado. Un dict de
  // idioma incompleto nunca debe crashear la app: si la clave falta, el
  // translator devuelve undefined y se usa el estado como texto final.
  // A greeting from Settings › Mascotas › Acariciar shows for a moment, then the live text returns.
  const [greeting, setGreeting] = createSignal("")
  const bubbleText = createMemo(() => {
    if (greeting()) return greeting()
    if (status() === "running") return actionText() || language.t(statusLabels.running) || statusLabels.running
    const key = statusLabels[status()]
    return language.t(key) ?? key
  })
  const label = createMemo(() => {
    return compactPetText(bubbleText() ?? "", 96)
  })
  const mood = createMemo<MascotMood>(() => {
    if (status() === "running") return "writing"
    if (status() === "needs-input") return "waiting"
    if (status() === "blocked") return "blocked"
    return "idle"
  })
  const [petted, setPetted] = createSignal(false)
  // Tracked so a rapid second pet restarts the animation rather than being cut short by the
  // first timer, and so nothing fires into an unmounted component.
  let pettedTimer: ReturnType<typeof setTimeout> | undefined
  const onPet = (e: MouseEvent) => {
    e.stopPropagation()
    setPetted(true)
    if (pettedTimer !== undefined) clearTimeout(pettedTimer)
    pettedTimer = setTimeout(() => {
      pettedTimer = undefined
      setPetted(false)
    }, 900)
  }
  let greetingTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    if (pettedTimer !== undefined) clearTimeout(pettedTimer)
    if (greetingTimer !== undefined) clearTimeout(greetingTimer)
  })

  onMount(() => {
    // Settings › Mascotas › Acariciar: both pets react, and the desktop one gets the greeting.
    const onPet = (event: Event) => {
      setPetted(true)
      if (pettedTimer !== undefined) clearTimeout(pettedTimer)
      pettedTimer = setTimeout(() => {
        pettedTimer = undefined
        setPetted(false)
      }, 900)
      setGreeting((event as CustomEvent<{ text?: string }>).detail?.text ?? "")
      if (greetingTimer !== undefined) clearTimeout(greetingTimer)
      greetingTimer = setTimeout(() => {
        greetingTimer = undefined
        setGreeting("")
      }, 2500)
    }
    // The "pet.toggle" command.
    const onToggle = () => settings.general.setPetEnabled(!settings.general.petEnabled())
    window.addEventListener("tiancode:pet-pet", onPet)
    window.addEventListener("tiancode:pet-toggle", onToggle)
    // The desktop pet's own × hides it; the setting follows, or the next update would show it again.
    const api = (window as unknown as { api?: { pet?: { onHidden?: (cb: () => void) => () => void } } }).api
    const stopHidden = api?.pet?.onHidden?.(() => {
      if (settings.general.petDisplay() === "both") settings.general.setPetDisplay("app")
      else if (settings.general.petDisplay() === "desktop") settings.general.setPetEnabled(false)
    })
    onCleanup(() => {
      window.removeEventListener("tiancode:pet-pet", onPet)
      window.removeEventListener("tiancode:pet-toggle", onToggle)
      stopHidden?.()
    })
  })

  // Sincronización continua con la Mascota Flotante de Escritorio en Windows
  createEffect(() => {
    const api = (window as unknown as { api?: { pet?: { update: (state: unknown) => Promise<unknown> } } })?.api
    if (api?.pet) {
      void api.pet.update({
        kind: settings.general.petKind(),
        status: status(),
        text: bubbleText(),
        petted: petted(),
        visible: settings.general.petEnabled() && settings.general.petDisplay() !== "app",
      })
    }
  })

  // The text part is streamed one delta at a time. Debounce the announcement so a long
  // response does not produce one voice request per delta, and keep only the final compact
  // sentence that the mascot shows.
  let lastSpoken = ""
  let speakTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    // The pet only talks when automatic speech is on, like every other narration.
    const isPetActive = settings.general.petEnabled() && settings.general.autoSpeak()
    const currentAction = actionText().trim()
    if (speakTimer !== undefined) clearTimeout(speakTimer)
    speakTimer = undefined
    if (!isPetActive || !currentAction || currentAction === lastSpoken || currentAction.length <= 5 || status() !== "running") return
    speakTimer = setTimeout(() => {
      speakTimer = undefined
      if (status() !== "running" || actionText().trim() !== currentAction || currentAction === lastSpoken) return
      lastSpoken = currentAction
      // An "auto:" key: the finished reply replaces this clip instead of being dropped as manual
      // speech, and muting automatic speech stops it.
      void speakAutomaticallyWithVoices(`auto:pet:${params.id}:${currentAction.slice(0, 30)}`, currentAction)
    }, 450)
  })
  onCleanup(() => {
    if (speakTimer !== undefined) clearTimeout(speakTimer)
  })

  const cycleNextPet = (e: MouseEvent) => {
    e.stopPropagation()
    const currentIndex = petKinds.indexOf(settings.general.petKind())
    const nextKind = petKinds[(currentIndex + 1) % petKinds.length]
    settings.general.setPetKind(nextKind)
  }

  return (
    <Show when={settings.general.petEnabled() && settings.general.petDisplay() !== "desktop"}>
      <div
        class={`pet-companion pet-companion--${settings.general.petPosition()}`}
        data-pet-companion
        data-status={status()}
        data-petted={petted() ? "" : undefined}
        role="status"
        aria-live="polite"
        aria-label={label()}
        onClick={onPet}
        onDblClick={cycleNextPet}
        title={language.t("pet.companion.title")}
      >
        <span class="pet-companion-glyph" aria-hidden="true">
          <PetGlyph kind={settings.general.petKind()} size={40} mood={mood()} />
        </span>
        <span class="pet-companion-status" aria-hidden="true">
          {statusGlyph[status()]}
        </span>
        <span class="pet-companion-bubble" aria-hidden="true">
          {bubbleText()}
        </span>
      </div>
    </Show>
  )
}
