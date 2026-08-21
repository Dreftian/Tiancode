import { Menu, Tray, app, nativeImage } from "electron"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))

export function resolveTrayIconPath(): string {
  const candidates = [
    app.isPackaged ? join(process.resourcesPath, "icons", "icon-tray.png") : join(root, "../../resources/icons/icon-tray.png"),
    app.isPackaged ? join(process.resourcesPath, "icons", "icon.ico") : join(root, "../../resources/icons/icon.ico"),
    app.isPackaged ? join(process.resourcesPath, "icons", "icon.png") : join(root, "../../resources/icons/icon.png"),
    app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(root, "../../icons/prod/icon.ico"),
    app.isPackaged ? join(process.resourcesPath, "icon.png") : join(root, "../../icons/prod/icon.png"),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}

export function createTray(options: { onShow: () => void; onQuit: () => void }) {
  const iconPath = resolveTrayIconPath()
  const image = nativeImage.createFromPath(iconPath)
  const tray = new Tray(image.isEmpty() ? iconPath : image)
  tray.setToolTip(app.getName())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show window", click: () => options.onShow() },
      { type: "separator" },
      { label: "Quit", click: () => options.onQuit() },
    ]),
  )
  if (process.platform === "win32") tray.on("click", () => options.onShow())
  return tray
}
