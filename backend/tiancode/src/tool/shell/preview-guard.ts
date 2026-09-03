// A local HTTP URL or local HTML file is a preview target, not a request to
// launch another app. Keep this intentionally narrow: ordinary links and
// non-browser shell work remain available, while the common Windows/macOS/Linux
// browser launchers are redirected to the embedded preview pipeline.
const LOCAL_PREVIEW_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:[/?#][^\s"']*)?/i
const LOCAL_PREVIEW_FILE_URL = /file:\/\/\/[^\s"']*(?:\.html?|\.svg)(?:[?#][^\s"']*)?/i
const BROWSER_LAUNCHER =
  /(?:^|[;&|]\s*|\b(?:cmd(?:\.exe)?\s+\/c|powershell(?:\.exe)?\s+(?:-NoProfile\s+|-NonInteractive\s+|-Command\s+|-File\s+)|pwsh(?:\.exe)?\s+(?:-NoProfile\s+|-NonInteractive\s+|-Command\s+|-File\s+))*)(?:start(?:-process)?|explorer(?:\.exe)?|chrome(?:\.exe)?|google-chrome|msedge(?:\.exe)?|firefox(?:\.exe)?|xdg-open|open|invoke-item|ii)\b/i
const HTML_TARGET = /(?:^|[\s"'])[^\s"']*\.html?(?=$|[\s"'])/i
const DEV_OPEN_FLAG = /(?:npm|pnpm|yarn|bun|npx)\s+(?:run\s+)?(?:dev|start|preview)\b[^\n]*\s--open(?:=|\s|$)/i
const VITE_OPEN_FLAG = /\bvite\b[^\n]*\s--open(?:=|\s|$)/i

// Un comando abre una vista previa local fuera de Tiancode cuando combina un
// lanzador de navegador (o un flag --open de dev server) con una URL local,
// un file:// de HTML o un index.html relativo del proyecto.
export function opensLocalPreviewOutsideTiancode(command: string) {
  if (LOCAL_PREVIEW_URL.test(command) && BROWSER_LAUNCHER.test(command)) return true
  if (LOCAL_PREVIEW_FILE_URL.test(command) && BROWSER_LAUNCHER.test(command)) return true
  if (HTML_TARGET.test(command) && BROWSER_LAUNCHER.test(command)) return true
  if (DEV_OPEN_FLAG.test(command) || VITE_OPEN_FLAG.test(command)) return true
  return false
}
