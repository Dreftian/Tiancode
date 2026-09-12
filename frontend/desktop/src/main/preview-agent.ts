// Ejecuta el script del agente dentro de la página de la Vista en vivo.
//
// El renderer no puede hacerlo por su cuenta: la vista previa se carga en `http://127.0.0.1:…`
// y el renderer vive en `oc://renderer`, así que `iframe.contentDocument` está bloqueado por
// origen cruzado. El proceso principal sí puede: `WebFrameMain.executeJavaScript` corre en el
// contexto del frame sea cual sea su origen. Esto vale igual para el iframe del Sandbox y para
// el WebContentsView nativo que se usa con URLs externas.

import { BrowserWindow, ipcMain, webContents, type WebContents, type WebFrameMain } from "electron"
import { beginAgentAction, getPreviewViewWebContents } from "./preview-view"
import { getPreviewGuestWebContentsId } from "./windows"
import { write as writeLog } from "./logging"

const EXECUTE_TIMEOUT_MS = 15_000

export type PreviewAgentExecuteResult = { ok: true; value: string } | { ok: false; error: string }

/**
 * Selector de superficie, que viaja en el mismo parámetro `frameUrl` del preload
 * (`PreviewAgentAPI.execute(code, frameUrl)`): ese contrato sólo tiene dos argumentos y el
 * preload queda fuera de este cambio, así que el token ocupa el hueco de la URL esperada.
 *
 * El renderer manda este literal cuando la acción va dirigida al navegador integrado; cualquier
 * otro valor se interpreta como la URL del frame de la vista previa. La copia del renderer está
 * en frontend/app/src/pages/session/live-preview/live-preview.tsx — los dos literales tienen que
 * coincidir (no hay import posible: `app` no puede depender de `desktop`).
 *
 * El renderer lo manda cuando la tool pide `surface: "browser"`; el esquema HTTP del puente
 * transporta esa superficie desde 1.0.47. Ver PreviewActionSurface en
 * backend/tiancode/src/preview/agent-bridge.ts.
 */
export const BROWSER_SURFACE_TOKEN = "tiancode-surface:browser"

const NO_PREVIEW_SURFACE =
  "No hay ninguna página de la vista previa cargada en la Vista en vivo, o la que hay no es la del proyecto. Arranca la vista previa y espera a que muestre la app."

const NO_BROWSER_SURFACE =
  "El navegador integrado de Tiancode no tiene ninguna página web abierta en esta ventana. Pide al usuario que la abra antes de volver a intentarlo."

/**
 * El origen de una URL de página, o null si no es una página web.
 *
 * Sólo http(s): `about:`, `data:` y `file:` dan origen opaco ("null"), y comparar opacos entre sí
 * haría que una vista descargada pareciera "el mismo sitio" que cualquier otra.
 */
function pageOrigin(value: string): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  return url.origin
}

/**
 * El frame donde vive la página de la vista previa.
 *
 * `expected` es la URL de la superficie que el renderer tiene DELANTE (el `src` del iframe, o la
 * URL de la vista nativa) y manda: un frame sólo es objetivo válido si su ORIGEN coincide con el
 * suyo. Antes bastaba con que el documento fuera http(s), y eso convertía la herramienta en una
 * mirilla: la vista nativa se queda viva al pasar al iframe del dev server, así que el agente
 * leía y pulsaba la web —con sesión iniciada— que el usuario había dejado oculta detrás.
 *
 * Sin pista, o sin ningún frame de ese origen, se devuelve null y la tool dice que no tiene
 * superficie. No hay repesca "el último candidato": ese era precisamente el fallo.
 */
function findPreviewFrame(sender: WebContents, expected?: string): WebFrameMain | null {
  const hint = expected ?? ""
  const wanted = pageOrigin(hint)
  if (!wanted) return null

  const native = getPreviewViewWebContents(sender.id)
  if (native && !native.isDestroyed() && pageOrigin(native.getURL()) === wanted) {
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
  const candidates = frames.filter((frame) => frame !== host.mainFrame && pageOrigin(frame.url) === wanted)
  if (candidates.length === 0) return null

  const exact = candidates.find((frame) => frame.url === hint)
  if (exact) return exact
  // La página pudo navegar por su cuenta desde que se cargó: se compara sin la cadena de
  // consulta, que es donde vive el parámetro anti-caché de la recarga.
  const base = hint.split("?")[0]
  const loose = candidates.find((frame) => frame.url.split("?")[0] === base)
  if (loose) return loose
  // Ya son todos del origen esperado; el desempate sigue siendo el último, porque la recarga sin
  // parpadeo mantiene DOS iframes del mismo origen vivos y el nuevo es el que se va a ver.
  return candidates[candidates.length - 1] ?? null
}

/**
 * El frame del navegador integrado (el `<webview>` de la partición "persist:preview").
 *
 * Se resuelve por el guest registrado en windows.ts, no rastreando el árbol de frames: ahí el
 * guest también aparece, y es exactamente así como el agente llegaba a él sin pedirlo. Ahora sólo
 * se alcanza cuando la tool lo pide por su nombre y con el permiso del usuario para ese sitio.
 */
function findBrowserFrame(sender: WebContents): WebFrameMain | null {
  const guestId = getPreviewGuestWebContentsId(sender.id)
  if (guestId === null) return null
  const guest = webContents.fromId(guestId)
  if (!guest || guest.isDestroyed()) return null
  if (!pageOrigin(guest.getURL())) return null
  try {
    return guest.mainFrame
  } catch {
    return null
  }
}

function resolveFrame(sender: WebContents, hint?: string): WebFrameMain | null {
  if (hint === BROWSER_SURFACE_TOKEN) return findBrowserFrame(sender)
  return findPreviewFrame(sender, hint)
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
  ipcMain.handle("preview-agent:execute", async (event, code: unknown, expected: unknown): Promise<PreviewAgentExecuteResult> => {
    if (typeof code !== "string" || code.length === 0) return { ok: false, error: "script vacío" }
    const hint = typeof expected === "string" ? expected : undefined
    const frame = resolveFrame(event.sender, hint)
    if (!frame) {
      return { ok: false, error: hint === BROWSER_SURFACE_TOKEN ? NO_BROWSER_SURFACE : NO_PREVIEW_SURFACE }
    }
    // Todo lo que la página haga a partir de aquí lo ha iniciado el modelo, no el usuario: los
    // guardias de navegación lo necesitan para distinguir un clic del agente de uno real.
    const endAgentAction = beginAgentAction()
    try {
      return { ok: true, value: await executeInFrame(frame, code) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeLog("preview-agent", "execute failed", { error: message }, "warn")
      return { ok: false, error: message === "timeout" ? "La página no respondió en 15 s." : message }
    } finally {
      endAgentAction()
    }
  })

  ipcMain.handle("preview-agent:available", (event, expected: unknown) =>
    resolveFrame(event.sender, typeof expected === "string" ? expected : undefined) !== null,
  )
}
