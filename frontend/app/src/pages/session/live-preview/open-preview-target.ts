import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import { iframePreviewUrl } from "./live-preview-transport"
import { previewActionUrl, previewStatusUrl } from "./live-preview-url"

/** What the server knows about the project's managed preview (GET /preview). */
export type PreviewTarget = {
  status: "idle" | "starting" | "ready" | "stopped" | "error"
  url?: string
  isDesktop: boolean
  command?: string
  errorMessage?: string
}

export type PreviewRequest = {
  http: ServerConnection.HttpBase
  directory: string
  fetch?: typeof globalThis.fetch
}

// Same budget the backend's preview_start waits for a dev server (tool/preview.ts).
const READY_TIMEOUT_MS = 45_000
const READY_POLL_MS = 900

export function parsePreviewTarget(value: unknown): PreviewTarget | undefined {
  if (!value || typeof value !== "object") return
  const state = value as Record<string, unknown>
  const status = state.status
  if (status !== "idle" && status !== "starting" && status !== "ready" && status !== "stopped" && status !== "error")
    return
  return {
    status,
    url: typeof state.url === "string" && state.url ? state.url : undefined,
    isDesktop: state.isDesktop === true,
    command: typeof state.command === "string" && state.command ? state.command : undefined,
    errorMessage: typeof state.errorMessage === "string" && state.errorMessage ? state.errorMessage : undefined,
  }
}

/** The address a browser outside Tiancode should open: bind-all and IPv6 literals become loopback names. */
export function desktopPreviewUrl(url: string) {
  return iframePreviewUrl(url) ?? url
}

/** A project the server can run: either it already answers, or it has a start command. */
export function canStartPreview(target: PreviewTarget | undefined) {
  if (!target) return false
  return target.status === "ready" || target.status === "starting" || !!target.command
}

export async function readPreviewTarget(request: PreviewRequest, signal?: AbortSignal) {
  const response = await (request.fetch ?? fetch)(previewStatusUrl(request.http.url, request.directory), {
    headers: authHeaders(request.http),
    signal,
  }).catch(() => undefined)
  if (!response?.ok) return
  return parsePreviewTarget(await response.json().catch(() => undefined))
}

/** Starts the managed dev server (or the native window of a desktop project) and waits for it. */
export async function startPreviewTarget(request: PreviewRequest, signal?: AbortSignal) {
  const response = await (request.fetch ?? fetch)(previewActionUrl(request.http.url, "start", request.directory), {
    method: "POST",
    headers: authHeaders(request.http),
    signal,
  }).catch(() => undefined)
  if (!response?.ok) return
  const started = parsePreviewTarget(await response.json().catch(() => undefined))
  if (!started || started.status === "ready" || started.status === "error" || started.isDesktop) return started
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline && !signal?.aborted) {
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
    const current = await readPreviewTarget(request, signal)
    if (!current) continue
    if (current.status === "ready" || current.status === "error" || current.status === "stopped") return current
  }
  return readPreviewTarget(request, signal)
}

function authHeaders(http: ServerConnection.HttpBase): Record<string, string> | undefined {
  if (!http.password) return
  return { Authorization: `Basic ${authTokenFromCredentials({ username: http.username, password: http.password })}` }
}
