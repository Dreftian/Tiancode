// Chromium emits these ResizeObserver diagnostics when layout settles between
// frames. They are not exceptions from application code and treating them as
// fatal floods the desktop log until Windows labels the app unresponsive.
export function isBenignRendererError(value: string) {
  return /resizeobserver loop (?:completed with undelivered notifications|limit exceeded)/i.test(value)
}
