import { createContext, Show, useContext, type JSX } from "solid-js"
import { Mascot, type MascotMood } from "@tiancode-ai/ui/mascot"

/**
 * How the app draws the user's pet beside a working step of the chat (thinking, exploring,
 * editing, Shell…). The mood says what the model is doing; the app picks the character and may
 * return nothing when the user turned the pet off.
 */
export type StatusPetRender = (input: { mood: MascotMood; size: number }) => JSX.Element

export const StatusPetContext = createContext<StatusPetRender>()

/** Without an app around it (stories, shared pages) the timeline keeps its default cat. */
export function StatusPet(props: { mood: MascotMood; size?: number }) {
  const render = useContext(StatusPetContext)
  const size = () => props.size ?? 22
  return (
    <Show when={render} fallback={<Mascot name="cat" size={size()} mood={props.mood} track={false} />}>
      {(draw) => draw()({ mood: props.mood, size: size() })}
    </Show>
  )
}
