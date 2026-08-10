import { createMemo, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import type { Part as MessagePart, TextPart } from "@tiancode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { useSettings } from "@/context/settings"
import { resolvePetCompanionStatus, type PetCompanionStatus } from "./pet-companion-state"
import "./pet-companion.css"

const petGlyph = {
  cat: "🐱",
  dog: "🐶",
  rabbit: "🐰",
} as const

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
  return text.replace(/\s+/g, " ").trim()
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
  // (p. ej. razonando) se muestra la etiqueta genérica del estado.
  const bubbleText = createMemo(() => {
    if (status() === "running") return actionText() || language.t(statusLabels.running)
    return language.t(statusLabels[status()])
  })
  const label = createMemo(() => {
    const text = bubbleText()
    return text.length > 240 ? text.slice(0, 240) : text
  })

  return (
    <Show when={settings.general.petEnabled()}>
      <div
        class={`pet-companion pet-companion--${settings.general.petPosition()}`}
        data-pet-companion
        data-status={status()}
        role="status"
        aria-live="polite"
        aria-label={label()}
      >
        <span class="pet-companion-glyph" aria-hidden="true">
          {petGlyph[settings.general.petKind()]}
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
