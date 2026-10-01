import open from "open"

// Only web links reach the OS opener: a file:, javascript: or custom-scheme URL handed back by a
// server (OAuth, MCP) must never launch a local program (opencode 1.18.33).
export function openUrl(input: string) {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:"))
    return Promise.reject(new Error(`Only http and https links can be opened in the browser: ${input}`))
  return open(url.href)
}
