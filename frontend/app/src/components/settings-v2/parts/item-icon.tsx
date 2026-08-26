import { isIconName, Icon, type IconName } from "@tiancode-ai/ui/icon"
import { Show, type Component } from "solid-js"
import "../settings-v2.css"

// An `icon` value is free-form: an emoji, a sprite glyph name, or anything
// else. Emojis render as text; known sprite names render as glyphs; unknown
// values fall back to the provided default so arbitrary strings never break.
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component})+$/u

export const SettingsItemIconV2: Component<{
  icon?: string
  fallback?: IconName
  color?: string
}> = (props) => {
  const emoji = () => {
    const value = props.icon?.trim()
    return value && EMOJI_RE.test(value) ? value : undefined
  }
  const glyph = () => {
    const value = props.icon?.trim()
    if (!value || EMOJI_RE.test(value)) return props.fallback ?? "mcp"
    return isIconName(value) ? value : (props.fallback ?? "mcp")
  }

  return (
    <span class="settings-v2-item-icon" style={{ "--item-icon-color": props.color }}>
      <Show when={emoji()} fallback={<Icon name={glyph()} size="small" />}>
        <span class="settings-v2-item-icon-emoji">{emoji()}</span>
      </Show>
    </span>
  )
}

// Deterministic glyph pick for lists whose items carry no explicit icon:
// same name always maps to the same glyph.
const FALLBACK_POOL: IconName[] = [
  "brain",
  "code-lines",
  "checklist",
  "shield",
  "terminal",
  "folder",
  "providers",
  "models",
]

export function fallbackGlyph(seed: string): IconName {
  let hash = 0
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return FALLBACK_POOL[Math.abs(hash) % FALLBACK_POOL.length]
}

// Deterministic per-item tint so list rows are visually distinguishable even
// without an explicit color.
export function hashColor(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return `hsl(${Math.abs(hash) % 360} 58% 58%)`
}

// Only raw hex colors work inside CSS color-mix(); theme tokens fall back to
// a deterministic per-item hue.
export function itemColor(color: string | undefined, seed: string): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : hashColor(seed)
}

// Heuristic name → glyph mapping for MCP servers and similar well-known ids.
const NAME_GLYPHS: Array<[RegExp, IconName]> = [
  [/github/i, "github"],
  [/discord/i, "discord"],
  [/^(fs|filesystem|files?)/i, "folder"],
  [/(shell|terminal|cmd|bash)/i, "terminal"],
  [/git(?!hub)/i, "branch"],
  [/(db|database|sqlite|postgres|mysql|mongo)/i, "server"],
  [/(memory|knowledge|context)/i, "brain"],
  [/(search|web|fetch|browser|http)/i, "magnifying-glass"],
]

export function guessGlyph(name: string): IconName {
  for (const [pattern, glyph] of NAME_GLYPHS) {
    if (pattern.test(name)) return glyph
  }
  return "mcp"
}
