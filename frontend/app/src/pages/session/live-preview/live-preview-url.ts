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

function previewUrl(serverUrl: string, path: string, directory: string) {
  return `${serverUrl.replace(/\/+$/, "")}/${path}?directory=${encodeURIComponent(directory)}`
}
