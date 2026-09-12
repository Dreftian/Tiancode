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

/**
 * Long-poll de las acciones que el agente quiere ejecutar sobre la página.
 *
 * `surface` dice si este cliente tiene una página cargada ahora mismo y `capable` si podría
 * ejecutarla (app de escritorio). El servidor sólo entrega trabajo a un cliente con superficie:
 * dárselo a otro lo destruiría, porque entregar vacía la cola.
 */
export function previewAgentPendingUrl(
  serverUrl: string,
  directory: string,
  waitMs: number,
  client: { surface: boolean; capable: boolean },
) {
  const wait = Math.max(0, Math.round(waitMs))
  const flags = `&surface=${client.surface ? 1 : 0}&capable=${client.capable ? 1 : 0}`
  return `${previewUrl(serverUrl, "preview/agent/pending", directory)}&wait=${wait}${flags}`
}

/** Lo que el agente está esperando, sin consumir la cola: lo consulta el vigía de la Vista en vivo. */
export function previewAgentDemandUrl(serverUrl: string, directory: string, client: { capable: boolean }) {
  return `${previewUrl(serverUrl, "preview/agent/demand", directory)}&capable=${client.capable ? 1 : 0}`
}

export function previewAgentResultUrl(serverUrl: string, directory: string) {
  return previewUrl(serverUrl, "preview/agent/result", directory)
}

function previewUrl(serverUrl: string, path: string, directory: string) {
  return `${serverUrl.replace(/\/+$/, "")}/${path}?directory=${encodeURIComponent(directory)}`
}
