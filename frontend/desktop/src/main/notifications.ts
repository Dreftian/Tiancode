import { BrowserWindow, Notification } from "electron"

// Notificaciones nativas del sistema. Solo se muestran cuando ninguna ventana
// de la app está enfocada, para no interrumpir al usuario mientras trabaja en
// Tiancode; al hacer clic la ventana principal vuelve al frente.

export function notifyUser(title: string, body: string) {
  if (!Notification.isSupported()) return
  const anyFocused = BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.isFocused())
  if (anyFocused) return
  const notification = new Notification({ title, body, silent: false })
  notification.on("click", () => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  notification.show()
}
