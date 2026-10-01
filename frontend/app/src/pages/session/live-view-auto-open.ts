import { createEffect, createSignal, on, onCleanup } from "solid-js"
import { previewPanelOpen, setPreviewPanelOpen } from "@/components/preview/preview-panel"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useSessionLayout } from "@/pages/session/session-layout"
import { previewAgentDemandUrl, previewStatusUrl } from "@/pages/session/live-preview/live-preview-url"
import { setLiveViewManagedTarget } from "@/pages/session/live-view-panel"
import { authTokenFromCredentials } from "@/utils/server"

// The watcher only runs while the agent works (plus a short grace for its last tool call): an idle
// session sends no requests at all.
const LIVE_VIEW_POLL_MS = 4_000
const LIVE_VIEW_CHECK_MS = 3_000
const LIVE_VIEW_GRACE_MS = 10_000

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

export function managedPreviewTargetOf(value: unknown, since?: number) {
  if (!isRecord(value)) return
  const state = value as ManagedPreviewState
  if (state.status !== "ready") return
  const url = embeddedUrl(state.url)
  if (!url) return
  // A server that was already running before this session view opened (another project, an
  // earlier session) is not a reason to open the panel: only servers started since then count.
  if (since !== undefined && (typeof state.startedAt !== "number" || state.startedAt < since)) return
  const stamp = typeof state.startedAt === "number" ? state.startedAt : url
  return { url, key: `managed:${url}:${stamp}` }
}

/**
 * Opens the Sandbox while the agent needs to look at the page (preview_inspect / preview_interact
 * waiting for a surface). Finished apps are offered by the timeline's PreviewOffer card instead,
 * so this never opens the panel just because a dev server is running.
 */
export function useLiveViewAutoOpen(input: {
  enabled: () => boolean
  busy: () => boolean
  sessionID: () => string | undefined
}) {
  const { view } = useSessionLayout()
  const sdk = useSDK()
  const server = useServer()
  const platform = usePlatform()
  const capable = !!platform.previewAgent
  // Demands already answered, by opening the panel or by the user closing it while they waited.
  const handled = new Set<string>()
  const [active, setActive] = createSignal(false)

  const request = () => {
    const directory = sdk().directory
    const http = server.current?.http
    if (!directory || directory === "main" || !http?.url) return
    const headers = http.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username ?? "tiancode", password: http.password })}` }
      : undefined
    return { directory, url: http.url, headers }
  }

  const fetchJson = async (url: string, headers: Record<string, string> | undefined, signal: AbortSignal) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener("abort", abort, { once: true })
    const timer = window.setTimeout(abort, LIVE_VIEW_CHECK_MS)
    const result: unknown = await fetch(url, { headers, signal: controller.signal })
      .then((res) => (res.ok ? res.json() : undefined))
      .catch(() => undefined)
    window.clearTimeout(timer)
    signal.removeEventListener("abort", abort)
    return result
  }

  const currentDemand = async (signal: AbortSignal) => {
    const target = request()
    if (!target) return
    const demand = await fetchJson(
      previewAgentDemandUrl(target.url, target.directory, { capable }),
      target.headers,
      signal,
    )
    return liveViewDemandKey(demand)
  }

  createEffect(() => {
    if (input.busy()) {
      setActive(true)
      return
    }
    const timer = window.setTimeout(() => setActive(false), LIVE_VIEW_GRACE_MS)
    onCleanup(() => window.clearTimeout(timer))
  })

  // Closing the panel while the agent still waits means "not now": remember that demand.
  createEffect(
    on(
      () => view().liveView.opened(),
      (opened, wasOpened) => {
        if (opened || !wasOpened) return
        const controller = new AbortController()
        void currentDemand(controller.signal).then((key) => {
          if (key) handled.add(key)
        })
        onCleanup(() => controller.abort())
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    input.sessionID()
    if (!input.enabled() || !active() || view().liveView.opened()) return
    // The floating integrated browser is the user's chosen surface; never replace it with the Sandbox.
    if (previewPanelOpen()) return

    const controller = new AbortController()
    let polling = false

    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const key = await currentDemand(controller.signal)
        if (!key || handled.has(key)) return
        handled.add(key)
        const target = request()
        if (target) {
          const status = await fetchJson(previewStatusUrl(target.url, target.directory), target.headers, controller.signal)
          const managed = managedPreviewTargetOf(status)
          if (managed) setLiveViewManagedTarget({ directory: target.directory, url: managed.url })
        }
        setPreviewPanelOpen(false)
        view().liveView.setTab("preview")
        view().liveView.open()
      } finally {
        polling = false
      }
    }

    void poll()
    const interval = window.setInterval(() => void poll(), LIVE_VIEW_POLL_MS)
    onCleanup(() => {
      window.clearInterval(interval)
      controller.abort()
    })
  })
}
