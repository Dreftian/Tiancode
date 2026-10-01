import { setPreviewPanelOpen } from "@/components/preview/preview-panel"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { requestLiveViewNavigation } from "@/pages/session/live-view-navigate"
import { useSessionLayout } from "@/pages/session/session-layout"
import { showToast } from "@/utils/toast"
import { canStartPreview, desktopPreviewUrl, readPreviewTarget, startPreviewTarget } from "./open-preview-target"

/** Opening the app the agent worked on, inside Tiancode or outside it. Shared by the card's buttons. */
export function usePreviewOpeners() {
  const { view } = useSessionLayout()
  const platform = usePlatform()
  const server = useServer()
  const sdk = useSDK()
  const language = useLanguage()

  const request = () => {
    const http = server.current?.http
    const directory = sdk().directory
    if (!http || !directory || directory === "main") return
    return { http, directory }
  }

  const sandbox = async () => {
    const target = await (async () => {
      const current = request()
      if (!current) return
      return readPreviewTarget(current)
    })()
    if (target?.status === "ready" && target.url && !target.isDesktop) {
      requestLiveViewNavigation(target.url)
      return
    }
    // No running server yet: the Sandbox's own preview detects the project and starts it.
    setPreviewPanelOpen(false)
    view().liveView.setTab("preview")
    view().liveView.open()
  }

  const openInBrowser = async (url: string) => {
    const target = desktopPreviewUrl(url)
    if (platform.openSystemBrowser) return platform.openSystemBrowser(target)
    platform.openExternal(target)
  }

  const desktop = async (entry?: string) => {
    const current = request()
    if (!current) throw new Error(language.t("session.previewOffer.failed.noRunner"))
    const target = await readPreviewTarget(current)
    if (target?.status === "ready" && target.url && !target.isDesktop) return openInBrowser(target.url)
    if (canStartPreview(target)) {
      const started = await startPreviewTarget(current)
      if (started?.isDesktop && started.status !== "error" && started.status !== "stopped") {
        showToast({ title: language.t("session.previewOffer.desktopWindow") })
        return
      }
      if (started?.status === "ready" && started.url) return openInBrowser(started.url)
      throw new Error(started?.errorMessage ?? language.t("session.previewOffer.failed.start"))
    }
    const html = entry && /\.html?$/i.test(entry) ? absolutePath(entry, current.directory) : undefined
    if (html && platform.openPath) return platform.openPath(html)
    throw new Error(language.t("session.previewOffer.failed.noRunner"))
  }

  return { sandbox, desktop, openInBrowser }
}

function absolutePath(path: string, directory: string) {
  if (/^[a-z]:[\\/]/i.test(path) || path.startsWith("/") || path.startsWith("\\\\")) return path
  const separator = directory.includes("\\") ? "\\" : "/"
  return `${directory.replace(/[\\/]+$/, "")}${separator}${path.replace(/^\.?[\\/]/, "").replace(/[\\/]/g, separator)}`
}
