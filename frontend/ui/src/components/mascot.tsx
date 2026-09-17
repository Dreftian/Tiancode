import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import bunnyDirections from "./mascots/bunny-directions.webp"
import bunnyReactions from "./mascots/bunny-reactions.webp"
import catDirections from "./mascots/cat-directions.webp"
import catReactions from "./mascots/cat-reactions.webp"
import dinoDirections from "./mascots/dino-directions.webp"
import dinoReactions from "./mascots/dino-reactions.webp"
import foxDirections from "./mascots/fox-directions.webp"
import foxReactions from "./mascots/fox-reactions.webp"
import hamsterDirections from "./mascots/hamster-directions.webp"
import hamsterReactions from "./mascots/hamster-reactions.webp"
import koalaDirections from "./mascots/koala-directions.webp"
import koalaReactions from "./mascots/koala-reactions.webp"
import otterDirections from "./mascots/otter-directions.webp"
import otterReactions from "./mascots/otter-reactions.webp"
import owlDirections from "./mascots/owl-directions.webp"
import owlReactions from "./mascots/owl-reactions.webp"
import pandaDirections from "./mascots/panda-directions.webp"
import pandaReactions from "./mascots/panda-reactions.webp"
import penguinDirections from "./mascots/penguin-directions.webp"
import penguinReactions from "./mascots/penguin-reactions.webp"
import redpandaDirections from "./mascots/redpanda-directions.webp"
import redpandaReactions from "./mascots/redpanda-reactions.webp"
import robotDirections from "./mascots/robot-directions.webp"
import robotReactions from "./mascots/robot-reactions.webp"
import "./mascot.css"

// Characters from page-mascot (MIT © Kamran Ahmed, github.com/nilbuild/page-mascot): each one is
// two 3×3 sheets, nine head directions and nine expressions, resized to 384 px for the app.
export const MASCOTS = {
  cat: [catDirections, catReactions],
  fox: [foxDirections, foxReactions],
  panda: [pandaDirections, pandaReactions],
  bunny: [bunnyDirections, bunnyReactions],
  otter: [otterDirections, otterReactions],
  owl: [owlDirections, owlReactions],
  dino: [dinoDirections, dinoReactions],
  penguin: [penguinDirections, penguinReactions],
  redpanda: [redpandaDirections, redpandaReactions],
  robot: [robotDirections, robotReactions],
  koala: [koalaDirections, koalaReactions],
  hamster: [hamsterDirections, hamsterReactions],
} as const

export type MascotName = keyof typeof MASCOTS
export const mascotNames = Object.keys(MASCOTS) as MascotName[]
export function isMascotName(value: string): value is MascotName {
  return Object.hasOwn(MASCOTS, value)
}

const DIRECTIONS = ["up-left", "up", "up-right", "left", "center", "right", "down-left", "down", "down-right"] as const
const REACTIONS = ["blink", "heart", "sparkle", "surprised", "wink", "bashful", "sleepy", "dizzy", "delighted"] as const
type Direction = (typeof DIRECTIONS)[number]
type Reaction = (typeof REACTIONS)[number]

// What the character is doing on its own: idle follows the pointer, the others play a loop.
export type MascotMood = "idle" | "thinking" | "writing" | "waiting" | "blocked" | "sleepy"

// Clockwise from the right, matching atan2 with y pointing down.
const CLOCKWISE: Direction[] = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"]
const SECTOR = (Math.PI * 2) / CLOCKWISE.length
const HYSTERESIS = 0.12
const DEAD_ZONE = 70
const PAYOFFS: Reaction[] = ["heart", "sparkle", "delighted"]
const LOOKS: Direction[] = ["up-left", "up", "up-right", "left", "right", "center"]
const WORKS: Direction[] = ["down-left", "down", "down-right", "down"]
const SQUASH: Keyframe[] = [
  { transform: "scale(1, 1)", easing: "ease-in" },
  { transform: "scale(1.10, 0.86)", offset: 0.18, easing: "ease-out" },
  { transform: "scale(0.95, 1.08)", offset: 0.45, easing: "ease-in-out" },
  { transform: "scale(1.03, 0.97)", offset: 0.72, easing: "ease-in-out" },
  { transform: "scale(1, 1)" },
]

// background-size 300% makes each cell a clean 0/50/100% step on both axes.
function cell(index: number) {
  return `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`
}

function wrap(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function Mascot(props: {
  name: MascotName
  size?: number
  mood?: MascotMood
  /** Follow the pointer while idle. Off for tiny inline uses such as the timeline. */
  track?: boolean
  label?: string
  class?: string
  onBoop?: () => void
}) {
  let button: HTMLButtonElement | undefined
  let squash: HTMLSpanElement | undefined
  const [direction, setDirection] = createSignal<Direction>("center")
  const [reaction, setReaction] = createSignal<Reaction | null>(null)
  const mood = () => props.mood ?? "idle"
  const sheets = () => MASCOTS[props.name]

  // One timer set for everything that animates; `epoch` lets a mood change or a boop cancel
  // callbacks that are already queued.
  const timers = new Set<number>()
  let epoch = 0
  const later = (ms: number, run: () => void) => {
    const mine = epoch
    const id = window.setTimeout(() => {
      timers.delete(id)
      if (mine === epoch) run()
    }, ms)
    timers.add(id)
  }
  const reset = () => {
    epoch++
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
  }
  onCleanup(reset)

  const blink = (after: () => void) => {
    setReaction("blink")
    later(150, () => {
      setReaction(null)
      after()
    })
  }

  // The loop for a mood; called on every mood change and again after a boop settles.
  const play = (current: MascotMood) => {
    reset()
    setReaction(null)
    if (current === "idle") {
      setDirection("center")
      const rest = () => later(3500 + Math.random() * 3500, () => blink(rest))
      rest()
      return
    }
    if (current === "sleepy") {
      setReaction("sleepy")
      return
    }
    if (current === "blocked") {
      setReaction("dizzy")
      return
    }
    if (current === "waiting") {
      const wonder = () => {
        setReaction("surprised")
        later(2400, () => blink(wonder))
      }
      wonder()
      return
    }
    if (current === "thinking") {
      let ticks = 0
      const look = () => {
        setDirection(pick(LOOKS))
        later(650 + Math.random() * 500, () => (++ticks % 5 === 0 ? blink(look) : look()))
      }
      look()
      return
    }
    let ticks = 0
    const work = () => {
      setDirection(pick(WORKS))
      later(450 + Math.random() * 350, () => {
        if (++ticks % 7 !== 0) return work()
        setReaction("sparkle")
        later(500, () => {
          setReaction(null)
          work()
        })
      })
    }
    work()
  }
  createEffect(on(mood, play))

  onMount(() => {
    if (props.track === false) return
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    let sector = -1
    let pointer: { x: number; y: number } | undefined
    const aim = () => {
      if (!button || !pointer || mood() !== "idle") return
      const box = button.getBoundingClientRect()
      const dx = pointer.x - (box.left + box.width / 2)
      const dy = pointer.y - (box.top + box.height / 2)
      if (Math.hypot(dx, dy) < DEAD_ZONE) {
        sector = -1
        setDirection("center")
        return
      }
      // Hold the current sector until the pointer is well past its edge.
      const angle = Math.atan2(dy, dx)
      if (sector !== -1 && Math.abs(wrap(angle - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) return
      sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length
      setDirection(CLOCKWISE[sector]!)
    }
    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      aim()
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("scroll", aim, { passive: true })
    onCleanup(() => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("scroll", aim)
    })
  })

  let boops = { count: 0, at: 0 }
  const boop = () => {
    props.onBoop?.()
    reset()
    const now = Date.now()
    boops = { count: now - boops.at < 1600 ? boops.count + 1 : 1, at: now }
    const settle = () => play(mood())
    if (boops.count >= 4) {
      boops.count = 0
      setReaction("dizzy")
      later(1100, settle)
    } else {
      setReaction("blink")
      later(120, () => setReaction(PAYOFFS[(boops.count - 1) % PAYOFFS.length]!))
      later(560, settle)
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Per-keyframe easing with the effect itself linear: an easing on the effect would
    // reinterpret every offset and front-load the whole bounce.
    squash?.animate(SQUASH, { duration: 420, easing: "linear" })
  }

  return (
    <button
      ref={button}
      type="button"
      class={`mascot ${props.class ?? ""}`}
      data-mood={mood()}
      style={{ width: `${props.size ?? 140}px`, height: `${props.size ?? 140}px` }}
      aria-label={props.label ?? "mascot"}
      onClick={(event) => {
        event.stopPropagation()
        boop()
      }}
    >
      <span ref={squash} class="mascot-squash">
        <span
          class="mascot-layer"
          style={{
            "background-image": `url(${sheets()[0]})`,
            "background-position": cell(DIRECTIONS.indexOf(direction())),
            opacity: reaction() ? 0 : 1,
          }}
        />
        {/* Always mounted so the sheet is fetched up front, never on the first click. */}
        <span
          class="mascot-layer"
          style={{
            "background-image": `url(${sheets()[1]})`,
            "background-position": cell(REACTIONS.indexOf(reaction() ?? "blink")),
            opacity: reaction() ? 1 : 0,
          }}
        />
      </span>
    </button>
  )
}
