/**
 * Moves the open Settings dialog to another page or section ("connections", "decisions", …),
 * the same targets `DialogSettings` accepts as its default value.
 */
export function goToSettings(target: string) {
  window.dispatchEvent(new CustomEvent("tiancode:settings-goto", { detail: target }))
}
