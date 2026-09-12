// Mirrors a spawned desktop app's real OS window into the Sandbox panel.
//
// The Sandbox could run an Electron/Tauri app but only ever showed its stdout, so "does it look
// right?" was unanswerable without alt-tabbing to the window the app opened on the real desktop.
// This captures that window on a timer and sends frames to the renderer.
//
// It is a mirror, not an embed: Electron cannot reparent a foreign HWND, and it cannot send input
// into one either. The panel shows pixels; clicking them does nothing, and the UI says so.
//
// Windows only. macOS needs a Screen Recording grant and offers no better window identity, and
// Wayland exposes no window list at all — elsewhere every handler resolves to null and the panel
// keeps today's console.

import { BrowserWindow, desktopCapturer, ipcMain, nativeImage, type WebContents } from "electron"
import { bestWindow, listDescendantPids, parseWindowSourceId, rankSources, windowsForPids } from "./window-match"
import { write as writeLog } from "./logging"

const supported = process.platform === "win32"

/** 2 fps focused. getSources captures EVERY window on the desktop per tick; this is not free. */
const FRAME_INTERVAL_MIN_MS = 500
/** A tick that takes longer than this means the desktop is busy; back off rather than pile up. */
const SLOW_TICK_MS = 400
/** Three misses in a row is a closed window, not a hiccup. */
const MISSES_BEFORE_GONE = 3
const JPEG_QUALITY = 70

type MirrorEntry = {
  win: BrowserWindow
  sourceId: string
  width: number
  intervalMs: number
  timer: ReturnType<typeof setInterval> | null
  inFlight: boolean
  misses: number
  seq: number
  slowTicks: number
}

const mirrors = new Map<number, MirrorEntry>()
/** Host windows whose teardown listeners are already installed. */
const teardownHooked = new Set<number>()

function hostWindow(sender: WebContents) {
  return BrowserWindow.fromWebContents(sender)
}

function send(entry: MirrorEntry, event: unknown) {
  if (entry.win.isDestroyed()) return
  entry.win.webContents.send("window-mirror-event", event)
}

function destroyMirror(hostId: number) {
  const entry = mirrors.get(hostId)
  if (!entry) return
  if (entry.timer) clearInterval(entry.timer)
  mirrors.delete(hostId)
}

/**
 * Stop capturing but keep the entry, so the renderer can resume without knowing the source id.
 *
 * Destroying on "window hidden" made the mirror unrecoverable: setInterval no-ops against a
 * missing entry and nothing else calls start again, so the panel sat on a frozen frame.
 */
function pauseMirror(hostId: number) {
  const entry = mirrors.get(hostId)
  if (!entry) return false
  if (entry.timer) clearInterval(entry.timer)
  entry.timer = null
  return true
}

async function captureSources(width: number, height: number, icons = false) {
  // Electron: "Set width or height to 0 when you do not need the thumbnails. This will save the
  // processing time required for capturing the content of each window and screen." 1x1 is legal
  // but still grabs every window's pixels and downscales them.
  return desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width, height },
    fetchWindowIcons: icons,
  })
}

/** Ids and names only — no pixels. Used by matching and by the "appeared after Run" snapshot. */
async function listWindowIds() {
  return captureSources(0, 0)
}

async function tick(hostId: number) {
  const entry = mirrors.get(hostId)
  if (!entry || entry.inFlight) return
  // A capture started before a source swap must not paint the old window over the new one, nor
  // apply its own backoff to the new entry.
  const current = () => mirrors.get(hostId) === entry
  if (entry.win.isDestroyed()) {
    destroyMirror(hostId)
    return
  }
  entry.inFlight = true
  const startedAt = Date.now()
  try {
    const height = Math.round((entry.width * 9) / 16)
    const sources = await captureSources(entry.width, height)
    if (!current()) return
    const source = sources.find((item) => item.id === entry.sourceId)
    if (!source) {
      entry.misses += 1
      if (entry.misses >= MISSES_BEFORE_GONE) {
        send(entry, { type: "gone" })
        destroyMirror(hostId)
      }
      return
    }
    entry.misses = 0
    const image = source.thumbnail
    if (image.isEmpty()) {
      // Minimised, or a GPU-composited window on the legacy capture path. Saying so beats
      // showing a black rectangle the user reads as "my app crashed".
      send(entry, { type: "blank" })
      return
    }
    const size = image.getSize()
    entry.seq += 1
    send(entry, {
      type: "frame",
      dataUrl: `data:image/jpeg;base64,${image.toJPEG(JPEG_QUALITY).toString("base64")}`,
      width: size.width,
      height: size.height,
      seq: entry.seq,
      title: source.name,
    })
  } catch (error) {
    writeLog("window-mirror", "capture failed", { error: String(error) }, "warn")
  } finally {
    entry.inFlight = false
    const elapsed = Date.now() - startedAt
    if (!current()) return
    if (elapsed > SLOW_TICK_MS) {
      entry.slowTicks += 1
      // Sustained slow ticks mean we are competing with the user's own desktop. Halve the rate
      // rather than keep a busy machine busier.
      if (entry.slowTicks >= 3 && entry.intervalMs < 4_000) {
        entry.slowTicks = 0
        applyInterval(hostId, entry.intervalMs * 2)
      }
    } else {
      entry.slowTicks = 0
    }
  }
}

function applyInterval(hostId: number, intervalMs: number) {
  const entry = mirrors.get(hostId)
  if (!entry) return
  const next = Math.max(FRAME_INTERVAL_MIN_MS, Math.round(intervalMs))
  // `entry.timer === null` means paused: fall through so the timer is created again.
  if (entry.timer && entry.intervalMs === next) return
  if (entry.timer) clearInterval(entry.timer)
  entry.intervalMs = next
  entry.timer = setInterval(() => void tick(hostId), next)
}

export function registerWindowMirrorIpc() {
  ipcMain.handle("window-mirror:supported", () => supported)

  ipcMain.handle("window-mirror:list-sources", async () => {
    if (!supported) return []
    const sources = await captureSources(200, 120, true)
    return sources
      .filter((source) => {
        const parsed = parseWindowSourceId(source.id)
        return !!parsed && !parsed.ownProcess && source.name.trim().length > 0
      })
      .map((source) => ({
        id: source.id,
        name: source.name,
        icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
        thumb: source.thumbnail.isEmpty() ? "" : source.thumbnail.toDataURL(),
      }))
  })

  ipcMain.handle(
    "window-mirror:match",
    async (_event, input: { pid: number | null; hints: string[]; before?: string[] }) => {
      if (!supported) return null
      const sources = await listWindowIds()
      const pids = input.pid ? await listDescendantPids(input.pid) : []
      const windows = pids.length > 0 ? await windowsForPids(pids) : []
      const appearedAfter = Array.isArray(input.before)
        ? sources.map((source) => source.id).filter((id) => !input.before!.includes(id))
        : []
      const ranked = rankSources({
        sources: sources.map((source) => ({ id: source.id, name: source.name })),
        handles: windows.map((item) => item.handle),
        titles: windows.map((item) => item.title),
        appearedAfter,
        hints: Array.isArray(input.hints) ? input.hints : [],
      })
      const best = bestWindow(ranked)
      // Window titles are the user's private desktop; log only how we decided, never what we saw.
      writeLog("window-mirror", "match", { candidates: ranked.length, reason: best?.reason ?? "none" })
      return best ? best.id : null
    },
  )

  /** The window list before the app launches, so "appeared after Run" is a usable signal. */
  ipcMain.handle("window-mirror:snapshot", async () => {
    if (!supported) return []
    const sources = await listWindowIds()
    return sources.map((source) => source.id)
  })

  ipcMain.handle(
    "window-mirror:start",
    (event, input: { sourceId: string; intervalMs?: number; width?: number }) => {
      if (!supported) return false
      const win = hostWindow(event.sender)
      if (!win) return false
      destroyMirror(win.webContents.id)
      const hostId = win.webContents.id
      mirrors.set(hostId, {
        win,
        sourceId: input.sourceId,
        width: Math.max(320, Math.round(input.width ?? 1280)),
        intervalMs: FRAME_INTERVAL_MIN_MS,
        timer: null,
        inFlight: false,
        misses: 0,
        seq: 0,
        slowTicks: 0,
      })
      // Registered once per host window, not per start(): repeated picks from the window picker
      // used to stack a listener pair each time.
      if (!teardownHooked.has(hostId)) {
        teardownHooked.add(hostId)
        const drop = () => {
          destroyMirror(hostId)
          teardownHooked.delete(hostId)
        }
        win.once("closed", drop)
        win.webContents.once("destroyed", drop)
        // Ctrl+R keeps the same webContents and fires neither of the above, so without this the
        // capture ran for the rest of the session against a page that had gone.
        win.webContents.on("did-start-navigation", (details) => {
          if (details.isMainFrame && !details.isSameDocument) destroyMirror(hostId)
        })
      }
      applyInterval(hostId, input.intervalMs ?? FRAME_INTERVAL_MIN_MS)
      void tick(hostId)
      return true
    },
  )

  ipcMain.handle("window-mirror:set-interval", (event, intervalMs: number) => {
    const win = hostWindow(event.sender)
    if (!win) return
    applyInterval(win.webContents.id, intervalMs)
  })

  /** Stop capturing without forgetting which window: the renderer resumes with set-interval. */
  ipcMain.handle("window-mirror:pause", (event) => {
    const win = hostWindow(event.sender)
    if (!win) return false
    return pauseMirror(win.webContents.id)
  })

  ipcMain.handle("window-mirror:stop", (event) => {
    const win = hostWindow(event.sender)
    if (!win) return
    destroyMirror(win.webContents.id)
  })
}
