/**
 * Whether a path is a filesystem root — `/`, `C:\`, `\\server\share`.
 *
 * Project-scoped state (`.tiancode/`, plugin installs, memory) must never be written to one:
 * it would drop app files into the top of the user's drive. Callers used to test
 * `worktree === "/"`, which is blind to every Windows root.
 */
export function isFilesystemRoot(input: string | undefined) {
  if (!input) return false
  const value = input.trim()
  if (!value) return false
  const normalized = value.replace(/\\/g, "/")
  if (normalized === "/") return true
  // Drive roots: "C:", "C:/", "c:\\".
  if (/^[a-zA-Z]:\/?$/.test(normalized)) return true
  // UNC share roots: "//server/share" with nothing below it.
  if (/^\/\/[^/]+\/[^/]+\/?$/.test(normalized)) return true
  return false
}

export function getFilename(path: string | undefined) {
  if (!path) return ""
  const trimmed = path.replace(/[/\\]+$/, "")
  const parts = trimmed.split(/[/\\]/)
  return parts[parts.length - 1] ?? ""
}

export function getDirectory(path: string | undefined) {
  if (!path) return ""
  const trimmed = path.replace(/[/\\]+$/, "")
  const parts = trimmed.split(/[/\\]/)
  return parts.slice(0, parts.length - 1).join("/") + "/"
}

export function getFileExtension(path: string | undefined) {
  if (!path) return ""
  const parts = path.split(".")
  return parts[parts.length - 1]
}

export function getFilenameTruncated(path: string | undefined, maxLength: number = 20) {
  const filename = getFilename(path)
  if (filename.length <= maxLength) return filename
  const lastDot = filename.lastIndexOf(".")
  const ext = lastDot <= 0 ? "" : filename.slice(lastDot)
  const available = maxLength - ext.length - 1 // -1 for ellipsis
  if (available <= 0) return filename.slice(0, maxLength - 1) + "…"
  return filename.slice(0, available) + "…" + ext
}

export function truncateMiddle(text: string, maxLength: number = 20) {
  if (text.length <= maxLength) return text
  const available = maxLength - 1 // -1 for ellipsis
  const start = Math.ceil(available / 2)
  const end = Math.floor(available / 2)
  return text.slice(0, start) + "…" + text.slice(-end)
}
