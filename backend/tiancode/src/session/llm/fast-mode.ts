/** Anthropic's native acceleration is a separate API option, independent of reasoning effort. */
export function nativeFastOptions(input: { providerID: string; apiID: string; npm: string; system?: string }) {
  if (!input.system?.includes("[TIANCODE_NATIVE_FAST]")) return {}
  if (input.providerID !== "anthropic" || input.npm !== "@ai-sdk/anthropic") return {}
  if (!/^claude-opus-(?:5|4[.-]8)(?:-\d{8})?$/.test(input.apiID)) return {}
  // @ai-sdk/anthropic adds anthropic-beta: fast-mode-2026-02-01 when speed is fast.
  return { speed: "fast" }
}
