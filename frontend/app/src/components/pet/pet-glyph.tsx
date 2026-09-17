import { Show, type Component } from "solid-js"
import { isMascotName, Mascot, type MascotMood, type MascotName } from "@tiancode-ai/ui/mascot"
import { Pet3DIcon } from "./pet-3d-icons"

// page-mascot characters replace the drawn glyph wherever one exists; the rest keep the 3D icon.
export function mascotFor(kind: string): MascotName | undefined {
  if (kind === "rabbit") return "bunny"
  return isMascotName(kind) ? kind : undefined
}

export const PetGlyph: Component<{ kind: string; size?: number; mood?: MascotMood; track?: boolean }> = (props) => (
  <Show when={mascotFor(props.kind)} fallback={<Pet3DIcon kind={props.kind} size={props.size ?? 36} />}>
    {(name) => <Mascot name={name()} size={props.size ?? 36} mood={props.mood} track={props.track} />}
  </Show>
)
