import { createEffect, createMemo, createSignal, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import type { Part as MessagePart, TextPart } from "@tiancode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { petKinds, useSettings } from "@/context/settings"
import { Pet3DIcon } from "@/components/pet-3d-icons"
import { resolvePetCompanionStatus, type PetCompanionStatus } from "./pet-companion-state"
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
  // (p. ej. razonando) se muestra la etiqueta genérica del estado. Un dict de
  // idioma incompleto nunca debe crashear la app: si la clave falta, el
  // translator devuelve undefined y se usa el estado como texto final.
  const bubbleText = createMemo(() => {
    if (status() === "running") return actionText() || language.t(statusLabels.running) || statusLabels.running
    const key = statusLabels[status()]
    return language.t(key) ?? key
  })
  const label = createMemo(() => {
    const text = bubbleText() ?? ""
    return text.length > 240 ? text.slice(0, 240) : text
  })
  const [petted, setPetted] = createSignal(false)
  const onPet = (e: MouseEvent) => {
    e.stopPropagation()
    setPetted(true)
    setTimeout(() => setPetted(false), 900)
  }

  // Sincronización continua con la Mascota Flotante de Escritorio en Windows
  createEffect(() => {
    const api = (window as unknown as { api?: { pet?: { update: (state: unknown) => Promise<unknown> } } })?.api
    if (api?.pet) {
      void api.pet.update({
        kind: settings.general.petKind(),
        status: status(),
        text: bubbleText(),
        petted: petted(),
        visible: settings.general.petEnabled() && (settings.general.petDesktop() !== false),
      })
    }
  })

  // Cuando la IA planifica o da contexto de lo que va a hacer, la mascota lo narra con voz femenina
  let lastSpoken = ""
  createEffect(() => {
    const isPetActive = settings.general.petEnabled()
    const currentAction = actionText().trim()
    if (
      isPetActive &&
      currentAction &&
      currentAction !== lastSpoken &&
      currentAction.length > 5 &&
      status() === "running"
    ) {
      lastSpoken = currentAction
      void speakAutomaticallyWithVoices(`pet:${params.id}:${currentAction.slice(0, 30)}`, currentAction)
    }
  })

  const cycleNextPet = (e: MouseEvent) => {
    e.stopPropagation()
    const currentIndex = petKinds.indexOf(settings.general.petKind())
    const nextKind = petKinds[(currentIndex + 1) % petKinds.length]
    settings.general.setPetKind(nextKind)
  }

  // La mascota se muestra exclusivamente en el escritorio de Windows (Mascota Flotante Externa),
  // manteniendo el interior de la ventana de Tiancode 100% limpio y despejado.
  // La sincronización en vivo de estados, pensamientos y acariciar continúa operando hacia el escritorio.
  return null
}
