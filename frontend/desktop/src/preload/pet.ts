import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("petApi", {
  sendAction: (action: string) => {
    if (typeof action === "string") {
      ipcRenderer.send("desktop-pet-action", action)
    }
  },
  onSync: (callback: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on("pet-sync", handler)
    return () => {
      ipcRenderer.removeListener("pet-sync", handler)
    }
  },
  onBurst: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("pet-burst", handler)
    return () => {
      ipcRenderer.removeListener("pet-burst", handler)
    }
  },
})
