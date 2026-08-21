// A local HTTP URL is a preview target, not a request to launch another app.
// Keep this intentionally narrow: ordinary links and non-browser shell work
// remain available, while the common Windows/macOS/Linux browser launchers
// are redirected to the embedded preview pipeline.
const LOCAL_PREVIEW_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:[/?#][^\s"']*)?/i
const BROWSER_LAUNCHER = /(?:^|[;&|]\s*|\b(?:cmd(?:\.exe)?\s+\/c|powershell(?:\.exe)?\s+-command)\s+)(?:start(?:-process)?|explorer(?:\.exe)?|chrome(?:\.exe)?|google-chrome|msedge(?:\.exe)?|firefox(?:\.exe)?|xdg-open|open)\b/i

export function opensLocalPreviewOutsideTiancode(command: string) {
  return LOCAL_PREVIEW_URL.test(command) && BROWSER_LAUNCHER.test(command)
}
