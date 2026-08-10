import { createEffect, onCleanup } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSessionLayout } from "@/pages/session/session-layout"
import { useServerSync } from "@/context/server-sync"
import { LIVE_VIEW_URL, setLiveViewExternalUrl, serverTargetOf } from "@/pages/session/live-view-panel"

// Intervalos del vigía: el poll corre solo mientras el sandbox está cerrado
// (cuando está abierto, el propio panel consulta el snapshot y navega).
const LIVE_VIEW_POLL_MS = 5_000
const LIVE_VIEW_CHECK_MS = 3_000

// Tools del chat que navegan a una página (el agente la abrió para probarla):
// se muestra en el sandbox aunque el live server no tenga sesión.
const NAVIGATION_TOOL_RE = /new_page|navigate|browse|preview|open_page|open_url/i
const URL_IN_TOOL_RE = /(?:https?:\/\/[^\s"')\]]+|file:\/\/\/?[^\s"')\]]+)/

function navigationUrlOf(tool: string, input: unknown): string | undefined {
  if (!NAVIGATION_TOOL_RE.test(tool)) return undefined
  let serialized = ""
  if (typeof input === "string") serialized = input
  else if (input && typeof input === "object") serialized = JSON.stringify(input)
  const match = URL_IN_TOOL_RE.exec(serialized)
  return match?.[0] ?? undefined
}

// Abre el sandbox ("Vista en vivo") cuando el agente navega: fija una URL con
// set_preview, arranca un dev server visible en los logs, o abre una página
// con una tool del chat (p. ej. chrome-devtools_new_page). La app que
// construye la IA aparece así SIEMPRE en el panel de código + preview, y el
// navegador flotante (preview-panel) queda reservado al clic explícito del
// usuario. Sin esto, una navegación a mitad de sesión no abría el sandbox (el
// panel solo existe montado) y el usuario terminaba viendo la app en el
// navegador interno o en Chrome.
export function useLiveViewAutoOpen(input: { enabled: () => boolean }) {
  const { view } = useSessionLayout()
  const serverSync = useServerSync()
  const params = useParams()
  // Última URL del agente que abrió el sandbox: una URL nueva lo reabre, pero
  // la misma URL no vuelve a abrirlo (el cierre manual del usuario manda
  // hasta que el agente navegue a otra parte).
  let lastAutoOpenedUrl: string | undefined

  createEffect(() => {
    if (!input.enabled() || view().liveView.opened()) return

    const poll = () => {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), LIVE_VIEW_CHECK_MS)
      void fetch(`${LIVE_VIEW_URL}api/snapshot`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : undefined))
        .then((payload) => {
          const target = serverTargetOf(payload?.session)
          if (!target || target === lastAutoOpenedUrl) return
          lastAutoOpenedUrl = target
          setLiveViewExternalUrl(undefined)
          view().liveView.open()
        })
        .catch(() => undefined)
        .finally(() => window.clearTimeout(timer))
    }

    poll()
    const interval = window.setInterval(poll, LIVE_VIEW_POLL_MS)
    onCleanup(() => window.clearInterval(interval))
  })

  // Tool-call del chat con URL de navegación (p. ej. la IA abrió la web con
  // chrome-devtools_new_page): el sandbox la muestra al costado aunque el live
  // server no tenga sesión, y la URL queda fijada para cuando se monte el pane.
  createEffect(() => {
    if (!input.enabled() || !params.id) return
    const messages = serverSync().session.data.message[params.id]
    if (!messages || messages.length === 0) return
    for (let i = messages.length - 1; i >= 0; i--) {
      const parts = serverSync().session.data.part[messages[i].id]
      if (!parts || parts.length === 0) continue
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j]
        if (part.type !== "tool") continue
        const url = navigationUrlOf(part.tool, part.state.input)
        if (!url) continue
        if (url === lastAutoOpenedUrl) return
        lastAutoOpenedUrl = url
        setLiveViewExternalUrl(url)
        view().liveView.open()
        return
      }
    }
  })
}
