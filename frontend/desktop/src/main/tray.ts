import { Menu, Tray, app } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))

export function createTray(options: { onShow: () => void; onQuit: () => void }) {
  // electron-builder copies runtime icons beside app.asar so native Windows
  // APIs can load a physical file instead of an archive entry. icon-tray.png
  // es la variante clara (fondo gris medio) para que el tray se distinga en
  // la barra de tareas oscura; la variante oscura es invisible a 16px.
  const icon = app.isPackaged
    ? join(process.resourcesPath, "icons", "icon-tray.png")
    : join(root, "../../resources/icons/icon-tray.png")
  const tray = new Tray(icon)
  tray.setToolTip(app.getName())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show window", click: () => options.onShow() },
      { type: "separator" },
      { label: "Quit", click: () => options.onQuit() },
    ]),
  )
  // Left-click on Windows shows the window directly; on Linux the context menu
  // is the primary interaction and click events are unreliable across DEs.
  if (process.platform === "win32") tray.on("click", () => options.onShow())
  return tray
}
