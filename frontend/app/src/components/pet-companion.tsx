import { createMemo, Show } from "solid-js"
import { useParams } from "@solidjs/router"
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

const statusLabels = {
  ready: "pets.status.ready",
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
  const label = createMemo(() => language.t(statusLabels[status()]))

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
        <span class="pet-companion-label">{label()}</span>
      </div>
    </Show>
  )
}
