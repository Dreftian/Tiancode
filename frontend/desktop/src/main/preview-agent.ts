// Ejecuta el script del agente dentro de la página de la Vista en vivo.
//
// El renderer no puede hacerlo por su cuenta: la vista previa se carga en `http://127.0.0.1:…`
// y el renderer vive en `oc://renderer`, así que `iframe.contentDocument` está bloqueado por
// origen cruzado. El proceso principal sí puede: `WebFrameMain.executeJavaScript` corre en el
// contexto del frame sea cual sea su origen. Esto vale igual para el iframe del Sandbox y para
// el WebContentsView nativo que se usa con URLs externas.

import { BrowserWindow, ipcMain, type WebContents, type WebFrameMain } from "electron"
import { getPreviewViewWebContents } from "./preview-view"
import { write as writeLog } from "./logging"

const EXECUTE_TIMEOUT_MS = 15_000

export type PreviewAgentExecuteResult = { ok: true; value: string } | { ok: false; error: string }

function isPreviewFrameUrl(value: string) {
  if (!value) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  return true
}

/**
 * El frame donde vive la página del usuario.
 *
 * Se prefiere el WebContentsView nativo (URLs externas) y si no existe se busca el iframe de la
 * vista previa dentro de la ventana. Se descartan los frames de la propia app: sólo interesan
 * los documentos http(s) que el usuario está viendo.
 */
function findPreviewFrame(sender: WebContents): WebFrameMain | null {
  const native = getPreviewViewWebContents(sender.id)
  if (native && !native.isDestroyed() && isPreviewFrameUrl(native.getURL())) {
    try {
      return native.mainFrame
    } catch {
      // El view pudo destruirse entre la comprobación y el acceso.
    }
  }

  const win = BrowserWindow.fromWebContents(sender)
  const host = win?.webContents ?? sender
  if (host.isDestroyed()) return null
  let frames: WebFrameMain[] = []
  try {
    frames = host.mainFrame.framesInSubtree
  } catch {
    return null
  }
  // El último frame http(s) es el visible: al recargar sin parpadeo se crea uno nuevo detrás
  // del actual y se intercambian, así que el más reciente es el que el usuario mira.
  const candidates = frames.filter((frame) => frame !== host.mainFrame && isPreviewFrameUrl(frame.url))
  return candidates[candidates.length - 1] ?? null
}

async function executeInFrame(frame: WebFrameMain, code: string): Promise<string> {
  const value = await Promise.race([
    frame.executeJavaScript(code, true),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), EXECUTE_TIMEOUT_MS)
      timer.unref?.()
    }),
  ])
  if (typeof value === "string") return value
  return JSON.stringify(value ?? null)
}

export function registerPreviewAgentIpc() {
  ipcMain.handle("preview-agent:execute", async (event, code: unknown): Promise<PreviewAgentExecuteResult> => {
    if (typeof code !== "string" || code.length === 0) return { ok: false, error: "script vacío" }
    const frame = findPreviewFrame(event.sender)
    if (!frame) {
      return {
        ok: false,
        error:
          "No hay ninguna página cargada en la Vista en vivo. Arranca la vista previa y espera a que muestre la app.",
      }
    }
    try {
      return { ok: true, value: await executeInFrame(frame, code) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeLog("preview-agent", "execute failed", { error: message }, "warn")
      return { ok: false, error: message === "timeout" ? "La página no respondió en 15 s." : message }
    }
  })

  ipcMain.handle("preview-agent:available", (event) => findPreviewFrame(event.sender) !== null)
}
