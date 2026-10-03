import { desktopCapturer, screen } from "electron"
import type { Computer } from "@tiancode-ai/schema/computer"

/** Capture coordinates and native input use the same physical monitor bounds. */
export async function captureComputerScreen(displayId: string) {
  const display = screen.getAllDisplays().find((item) => String(item.id) === displayId)
  if (!display) throw new Error("El monitor seleccionado se desconectó. Vuelve a observar el escritorio.")
  const bounds = process.platform === "win32" ? screen.dipToScreenRect(null, display.bounds) : display.bounds
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.min(1800, bounds.width), height: Math.min(1800, bounds.height) },
  })
  const source = sources.find((item) => item.display_id === displayId)
  if (!source || source.thumbnail.isEmpty()) throw new Error("No se pudo capturar el monitor seleccionado.")
  const size = source.thumbnail.getSize()
  return {
    screenshot: `data:image/png;base64,${source.thumbnail.toPNG().toString("base64")}`,
    imageWidth: size.width,
    imageHeight: size.height,
    display: {
      id: displayId,
      label: display.label || displayId,
      bounds,
      scaleFactor: display.scaleFactor,
    } satisfies Computer.Display,
  }
}
