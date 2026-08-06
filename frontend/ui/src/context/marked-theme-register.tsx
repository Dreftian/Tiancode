import { registerCustomTheme } from "@pierre/diffs"
import { TiancodeTheme } from "./marked-theme"

let registered = false

export function registerTiancodeTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("Tiancode", () => Promise.resolve(TiancodeTheme))
}
