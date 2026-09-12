import { createEffect, onCleanup } from "solid-js"
import { setPreviewPanelOpen } from "@/components/preview/preview-panel"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useSessionLayout } from "@/pages/session/session-layout"
import { previewAgentDemandUrl, previewStatusUrl } from "@/pages/session/live-preview/live-preview-url"
import { LIVE_VIEW_URL, serverTargetOf, setLiveViewManagedTarget } from "@/pages/session/live-view-panel"
import { authTokenFromCredentials } from "@/utils/server"

// Intervalos del vigía: el poll corre solo mientras el sandbox está cerrado
// (cuando está abierto, el propio panel consulta el snapshot y navega).
const LIVE_VIEW_POLL_MS = 5_000
const LIVE_VIEW_CHECK_MS = 3_000

type ManagedPreviewState = {
  status?: unknown
  url?: unknown
  startedAt?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function embeddedUrl(value: unknown) {
  if (typeof value !== "string") return
  try {
    const url = new URL(value)
    if (url.protocol === "http:" || url.protocol === "https:") return url.href
  } catch {
    // Una respuesta inválida no debe abrir ni sustituir la vista actual.
  }
}

// El estado administrado es la señal canónica después de preview_start. No se
// infieren URLs de Start-Process, shells ni herramientas de navegador: esas
// tools pueden abrir software externo y no representan un preview embebido.
/**
 * A stable key for "the agent is waiting for a page", or undefined when it is not.
 *
 * Keyed on the pending command id so each agent action opens the panel at most once: a user who
 * closes it again during that same action is not fought, and the next action gets a fresh key.
 */
export function liveViewDemandKey(value: unknown) {
  if (!isRecord(value)) return
  const pending = value.pending
  const id = value.id
  if (typeof pending !== "number" || pending < 1) return
  if (typeof id !== "string" || !id) return
  return `agent:${id}`
}

export function managedPreviewTargetOf(value: unknown) {
  if (!isRecord(value)) return
  const state = value as ManagedPreviewState
  if (state.status !== "ready") return
  const url = embeddedUrl(state.url)
  if (!url) return
  const stamp = typeof state.startedAt === "number" ? state.startedAt : url
  return { url, key: `managed:${url}:${stamp}` }
}

// La app construida por el agente aparece siempre en el panel de código +
// preview: se cierra el navegador flotante (no compite), se fuerza la pestaña
// App (no Dev tools) y se abre el sandbox.
function showLiveView(view: ReturnType<typeof useSessionLayout>["view"]) {
  setPreviewPanelOpen(false)
  view().liveView.setTab("preview")
  view().liveView.open()
}

// Abre el sandbox cuando hay un preview publicado por el Live Frontend MCP o
// cuando preview_start confirma que un servidor administrado ya responde.
// Nunca usa una navegación genérica del chat como señal, por lo que pedir una
// vista previa no provoca que Tiancode trate Chrome/Start-Process como ruta de
// visualización.
export function useLiveViewAutoOpen(input: { enabled: () => boolean }) {
  const { view } = useSessionLayout()
  const sdk = useSDK()
  const server = useServer()
  const platform = usePlatform()
  const capable = !!platform.previewAgent
  let lastAutoOpenedKey: string | undefined

  createEffect(() => {
    if (!input.enabled() || view().liveView.opened()) return

    const directory = sdk().directory
    const http = server.current?.http
    const headers = http?.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username ?? "tiancode", password: http.password })}` }
      : undefined
    let dashboardRequest: AbortController | undefined
    let managedRequest: AbortController | undefined
    let demandRequest: AbortController | undefined
    let polling = false

    const clearManagedTarget = () => {
      if (!directory || directory === "main") return
      setLiveViewManagedTarget((current) => (current?.directory === directory ? undefined : current))
    }

    const open = (key: string, managedUrl?: string) => {
      if (key === lastAutoOpenedKey) return
      lastAutoOpenedKey = key
      if (managedUrl && directory && directory !== "main") setLiveViewManagedTarget({ directory, url: managedUrl })
      if (!managedUrl) clearManagedTarget()
      showLiveView(view)
    }

    const poll = async () => {
      if (polling) return
      polling = true
      try {
        if (directory && directory !== "main" && http?.url) {
          managedRequest?.abort()
          managedRequest = new AbortController()
          const managedTimer = window.setTimeout(() => managedRequest?.abort(), LIVE_VIEW_CHECK_MS)
          const payload = await fetch(previewStatusUrl(http.url, directory), { headers, signal: managedRequest.signal })
            .then((res) => (res.ok ? res.json() : undefined))
            .catch(() => undefined)
          window.clearTimeout(managedTimer)
          const target = managedPreviewTargetOf(payload)

          // Checked even when a managed target already exists: the `return` below plus the
          // lastAutoOpenedKey dedupe is exactly why a panel the user closed never reopened, and
          // an agent action that cannot reach a page is a dead end mid-run.
          demandRequest?.abort()
          demandRequest = new AbortController()
          const demandTimer = window.setTimeout(() => demandRequest?.abort(), LIVE_VIEW_CHECK_MS)
          const demand = await fetch(previewAgentDemandUrl(http.url, directory, { capable }), {
            headers,
            signal: demandRequest.signal,
          })
            .then((res) => (res.ok ? res.json() : undefined))
            .catch(() => undefined)
          window.clearTimeout(demandTimer)
          const demandKey = liveViewDemandKey(demand)
          if (demandKey) {
            open(demandKey, target?.url)
            return
          }

          if (target) {
            open(target.key, target.url)
            return
          }
          clearManagedTarget()
        }

        dashboardRequest?.abort()
        dashboardRequest = new AbortController()
        const dashboardTimer = window.setTimeout(() => dashboardRequest?.abort(), LIVE_VIEW_CHECK_MS)
        const payload = await fetch(`${LIVE_VIEW_URL}api/snapshot`, { signal: dashboardRequest.signal })
          .then((res) => (res.ok ? res.json() : undefined))
          .catch(() => undefined)
        window.clearTimeout(dashboardTimer)
        const target = serverTargetOf(payload?.session)
        if (target) open(`live:${target}`)
      } finally {
        polling = false
      }
    }

    void poll()
    const interval = window.setInterval(() => void poll(), LIVE_VIEW_POLL_MS)
    onCleanup(() => {
      window.clearInterval(interval)
      dashboardRequest?.abort()
      managedRequest?.abort()
      demandRequest?.abort()
    })
  })
}
