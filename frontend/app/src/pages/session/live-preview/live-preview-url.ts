export type PreviewAction = "start" | "stop" | "restart"

export function previewStatusUrl(serverUrl: string, directory: string) {
  return previewUrl(serverUrl, "preview", directory)
}

export function previewActionUrl(serverUrl: string, action: PreviewAction, directory: string) {
  return previewUrl(serverUrl, `preview/${action}`, directory)
}

export function previewLogsUrl(serverUrl: string, directory: string) {
  return previewUrl(serverUrl, "preview/logs", directory)
}

/** Long-poll de las acciones que el agente quiere ejecutar sobre la página. */
export function previewAgentPendingUrl(serverUrl: string, directory: string, waitMs: number) {
  return `${previewUrl(serverUrl, "preview/agent/pending", directory)}&wait=${Math.max(0, Math.round(waitMs))}`
}

export function previewAgentResultUrl(serverUrl: string, directory: string) {
  return previewUrl(serverUrl, "preview/agent/result", directory)
}

function previewUrl(serverUrl: string, path: string, directory: string) {
  return `${serverUrl.replace(/\/+$/, "")}/${path}?directory=${encodeURIComponent(directory)}`
}
