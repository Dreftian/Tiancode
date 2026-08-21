import { BrowserWindow, Notification } from "electron"
import { resolveTrayIconPath } from "./tray"

// Notificaciones nativas del sistema con el icono oficial de Tiancode.
export function notifyUser(title: string, body: string) {
  if (!Notification.isSupported()) return
  const anyFocused = BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.isFocused())
  if (anyFocused) return
  const icon = resolveTrayIconPath()
  const notification = new Notification({ title, body, icon, silent: false })
  notification.on("click", () => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  notification.show()
}
