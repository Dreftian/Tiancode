import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { resolveExternalURL } from "./external-url"

export function chromeLink(value: string) {
  const url = resolveExternalURL(value)
  return url && /^https?:/i.test(url) ? url : undefined
}

export async function openInChrome(value: string) {
  const url = chromeLink(value)
  if (!url || process.platform !== "win32") throw new Error("Chrome URL or platform unavailable")
  const candidates = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]]
    .filter((root): root is string => !!root)
    .map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe"))
  const found = await Promise.all(
    candidates.map(
      async (file) =>
        await access(file).then(
          () => file,
          () => undefined,
        ),
    ),
  )
  const executable = found.find((file) => file !== undefined)
  if (!executable) throw new Error("Chrome is not installed")
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [url], { windowsHide: true, detached: true, stdio: "ignore" })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}
