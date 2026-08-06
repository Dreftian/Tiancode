import { Menu, Tray, app } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))

export function createTray(options: { onShow: () => void; onQuit: () => void }) {
  // electron-builder packs resources/** inside app.asar (files in
  // electron-builder.config.ts), so the packaged path goes through it; a bare
  // resourcesPath/icons path would leave the tray icon empty.
  const icon = app.isPackaged
    ? join(process.resourcesPath, "app.asar", "resources", "icons", "icon.png")
    : join(root, "../../resources/icons/icon.png")
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
