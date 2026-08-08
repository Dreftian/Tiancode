import { desktopCapturer, screen, webContents, type WebContents } from "electron"
import { getPreviewGuestWebContentsId } from "./windows"

// Capturas de pantalla para el chat: el modelo principal puede no tener
// visión, así que la imagen se adjunta como media part y el agente la analiza
// con un servidor MCP de visión (p. ej. agent-vision-mcp).

export type CaptureResult = {
  buffer: Buffer
  width: number
  height: number
}

// validateMedia (backend) admite hasta 20 MB decodificados; redimensionar a
// 2400 px y recodificar PNG mantiene las capturas muy por debajo.
const MAX_WIDTH = 2400

function toPng(image: Electron.NativeImage): CaptureResult {
  const size = image.getSize()
  const resized = size.width > MAX_WIDTH ? image.resize({ width: MAX_WIDTH }) : image
  const buffer = resized.toPNG()
  const out = resized.getSize()
  return { buffer, width: out.width, height: out.height }
}

async function capturePrimary(): Promise<Electron.NativeImage> {
  const display = screen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: display.size.width, height: display.size.height },
  })
  const primary = sources.find((source) => source.display_id === "0") ?? sources[0]
  if (!primary) throw new Error("No screen found")
  return primary.thumbnail
}

// Captura la pantalla principal (la que ve el usuario al elegir un área).
export async function captureScreen(): Promise<CaptureResult> {
  return toPng(await capturePrimary())
}

// Recorta un área (en coordenadas CSS de la pantalla principal) de la captura
// completa; lo usa el selector de área del renderer.
export async function captureArea(bounds: { x: number; y: number; width: number; height: number }): Promise<CaptureResult> {
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error("Empty area")
  return toPng((await capturePrimary()).crop(bounds))
}

// Captura la ventana de la app (el contenido del renderer que envía el IPC).
export function captureWindow(sender: WebContents): Promise<CaptureResult> {
  return sender.capturePage().then(toPng)
}

// Captura el <webview> del navegador interno: el guest corre en su propio
// webContents. El id se rastrea en el main (did-attach del webview con la
// partición "persist:preview"); el renderer ya no aporta un id arbitrario.
export function capturePreview(hostWebContentsId: number): Promise<CaptureResult> {
  const guestId = getPreviewGuestWebContentsId(hostWebContentsId)
  if (guestId === null) return Promise.reject(new Error("Preview not found"))
  const contents = webContents.fromId(guestId)
  if (!contents || contents.isDestroyed()) return Promise.reject(new Error("Preview not found"))
  return contents.capturePage().then(toPng)
}
