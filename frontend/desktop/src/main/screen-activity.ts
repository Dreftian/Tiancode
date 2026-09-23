import { powerSaveBlocker } from "electron"
import { getStore } from "./store"
import { KEEP_SCREEN_ACTIVE_KEY } from "./store-keys"

// One blocker for the whole app: every window shares the same "keep the display awake" choice.
let blocker: number | undefined

export function getKeepScreenActive() {
  return blocker !== undefined && powerSaveBlocker.isStarted(blocker)
}

export function setKeepScreenActive(enabled: boolean) {
  if (enabled && !getKeepScreenActive()) blocker = powerSaveBlocker.start("prevent-display-sleep")
  if (!enabled && blocker !== undefined) {
    powerSaveBlocker.stop(blocker)
    blocker = undefined
  }
  getStore().set(KEEP_SCREEN_ACTIVE_KEY, enabled)
  return getKeepScreenActive()
}

/** Re-applies the saved choice at startup; the blocker itself never survives a restart. */
export function restoreKeepScreenActive() {
  if (getStore().get(KEEP_SCREEN_ACTIVE_KEY) === true) setKeepScreenActive(true)
}
