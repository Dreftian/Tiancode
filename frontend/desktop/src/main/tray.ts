import { Menu, Tray, app, nativeImage } from "electron"
import { UPDATER_ENABLED } from "./constants"
import { nativeT } from "./native-translations"
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

type TrayOptions = {
  onShow: () => void
  onSettings: () => void
  onCheckForUpdates: () => void
  onQuit: () => void
}

// The tray is created after the sidecar loads, but the renderer may report its language before or
// after that, so the menu is rebuilt from nativeT whenever the translations change.
let current: { tray: Tray; options: TrayOptions } | undefined

export function createTray(options: TrayOptions) {
  const iconPath = resolveTrayIconPath()
  const image = nativeImage.createFromPath(iconPath)
  const tray = new Tray(image.isEmpty() ? iconPath : image)
  tray.setToolTip(app.getName())
  current = { tray, options }
  refreshTrayMenu()
  if (process.platform === "win32") tray.on("click", () => options.onShow())
  return tray
}

export function refreshTrayMenu() {
  if (!current || current.tray.isDestroyed()) return
  const options = current.options
  current.tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: nativeT("desktop.tray.show"), click: () => options.onShow() },
      { label: nativeT("desktop.menu.settings"), click: () => options.onSettings() },
      ...(UPDATER_ENABLED
        ? [{ label: nativeT("desktop.menu.checkForUpdates"), click: () => options.onCheckForUpdates() }]
        : []),
      { type: "separator" },
      { label: nativeT("desktop.tray.quit"), click: () => options.onQuit() },
    ]),
  )
}
