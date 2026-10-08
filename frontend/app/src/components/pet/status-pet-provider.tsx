import { Show, type ParentProps } from "solid-js"
import { StatusPetContext } from "@tiancode-ai/session-ui/context/status-pet"
import { useSettings } from "@/context/settings"
import { PetGlyph } from "./pet-glyph"

/**
 * The chat's working steps show the pet chosen in Ajustes › Mascotas, in the mood of what the
 * model is doing. Ajustes › Mascotas › "Mascota en el chat" turns it off.
 */
export function StatusPetProvider(props: ParentProps) {
  const settings = useSettings()
  return (
    <StatusPetContext.Provider
      value={(input) => (
        <Show when={settings.general.petInChat()}>
          <PetGlyph kind={settings.general.petKind()} size={input.size} mood={input.mood} track={false} />
        </Show>
      )}
    >
      {props.children}
    </StatusPetContext.Provider>
  )
}
