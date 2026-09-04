import { sampledChecksum } from "@tiancode-ai/core/util/encode"
import { FileIcon } from "@tiancode-ai/ui/file-icon"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useFile } from "@/context/file"
import { useFileComponent } from "@tiancode-ai/ui/context/file"
import { useLanguage } from "@/context/language"
import { type LiveViewTab } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { LivePreview } from "@/pages/session/live-preview/live-preview"
import { ScrollView } from "@tiancode-ai/ui/scroll-view"

export const LIVE_VIEW_URL = "http://127.0.0.1:8790/"
const LIVE_VIEW_CHECK_MS = 3000
const LIVE_VIEW_FALLBACK_POLL_MS = 5000
const LIVE_VIEW_SSE_STALE_MS = LIVE_VIEW_FALLBACK_POLL_MS + LIVE_VIEW_CHECK_MS
// URL de un servidor de desarrollo local ("Local: http://localhost:5173") en
// los logs que publica el agente; se detecta para navegar el panel solo.
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:[/?#][^\s"']*)?/i
const PREVIEW_ENTRY_RE =
  /(?:^|\/)(?:package\.json|index\.html|requirements\.txt|pyproject\.toml|Pipfile|Cargo\.toml|go\.mod|composer\.json|artisan|Gemfile|pom\.xml|build\.gradle(?:\.kts)?|deno\.jsonc?|.*\.(?:jsx|tsx|html|htm|py|rs|go|php|rb|java|kt|cs))$/i
export type LiveViewContent = "preview" | "code"

// Each mode uses the entire panel. Web-only clients keep the dashboard as a
// usable replacement for the embedded Preview tab.
export function liveViewContentForTab(tab: LiveViewTab): LiveViewContent {
  if (tab === "code") return "code"
  return "preview"
}

// Campos del snapshot del live server que este panel consume (y el vigía de
// apertura automática del sandbox, live-view-auto-open).
export type SnapshotPayload = {
  session_id?: string
  root?: string
  label?: string
  updated_at?: number
  preview_url?: string | null
  preview_default?: string | null
  current_file?: string | null
  current_code?: string | null
  phase?: { name?: string; status?: string; message?: string | null }
  files?: { rel: string; kind?: string; size?: number; mtime?: number }[]
  logs?: { line?: string }[]
}

export type LiveUpdatePayload = {
  type?: string
  session_id?: string
  data?: unknown
  ts?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function withLiveEventTimestamp(snapshot: SnapshotPayload, event: LiveUpdatePayload) {
  if (typeof event.ts !== "number") return snapshot
  return { ...snapshot, updated_at: event.ts }
}

function fileFromLiveUpdate(data: Record<string, unknown>) {
  if (typeof data.rel !== "string") return
  return {
    rel: data.rel,
    ...(typeof data.kind === "string" ? { kind: data.kind } : {}),
    ...(typeof data.size === "number" ? { size: data.size } : {}),
    ...(typeof data.mtime === "number" ? { mtime: data.mtime } : {}),
  }
}

export function mergeLiveSnapshot(current: SnapshotPayload | undefined, next: SnapshotPayload | undefined) {
  if (!next) return current
  if (!current) return next
  if (
    current.session_id === next.session_id &&
    typeof current.updated_at === "number" &&
    typeof next.updated_at === "number" &&
    next.updated_at < current.updated_at
  ) {
    return current
  }
  return next
}

export function applyLiveSnapshotUpdate(snapshot: SnapshotPayload | undefined, event: LiveUpdatePayload) {
  if (!snapshot?.session_id || snapshot.session_id !== event.session_id || !isRecord(event.data)) return snapshot
  const data = event.data
  if (event.type === "phase") {
    return withLiveEventTimestamp(
      {
        ...snapshot,
        phase: {
          ...(typeof data.name === "string" ? { name: data.name } : {}),
          ...(typeof data.status === "string" ? { status: data.status } : {}),
          ...(typeof data.message === "string" || data.message === null ? { message: data.message } : {}),
        },
      },
      event,
    )
  }
  if (event.type === "preview") {
    if (typeof data.url !== "string" && data.url !== null) return snapshot
    return withLiveEventTimestamp({ ...snapshot, preview_url: data.url }, event)
  }
  if (event.type === "current_file") {
    if (typeof data.rel !== "string") return snapshot
    return withLiveEventTimestamp(
      {
        ...snapshot,
        current_file: data.rel,
        ...(typeof data.code === "string" || data.code === null ? { current_code: data.code } : {}),
      },
      event,
    )
  }
  if (event.type === "log") {
    if (typeof data.line !== "string") return snapshot
    return withLiveEventTimestamp({ ...snapshot, logs: [...(snapshot.logs ?? []), { line: data.line }] }, event)
  }
  if (event.type === "file_added" || event.type === "file_modified" || event.type === "file_changed") {
    const file = fileFromLiveUpdate(data)
    if (!file) return snapshot
    const files = [...(snapshot.files ?? []).filter((entry) => entry.rel !== file.rel), file]
    return withLiveEventTimestamp({ ...snapshot, files }, event)
  }
  if (event.type === "file_removed") {
    if (typeof data.rel !== "string") return snapshot
    return withLiveEventTimestamp({ ...snapshot, files: (snapshot.files ?? []).filter((entry) => entry.rel !== data.rel) }, event)
  }
  return snapshot
}

function parseLiveEventPayload(value: unknown) {
  if (typeof value !== "string") return undefined
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function asSnapshotPayload(value: unknown) {
  if (!isRecord(value)) return undefined
  return value as SnapshotPayload
}

function asLiveUpdatePayload(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.session_id !== "string") return undefined
  return value as LiveUpdatePayload
}

// URL que el servidor quiere mostrar: la fijada por el agente (set_preview) o,
// si no, el preview local (/preview/) para sesiones web con index.html.
export function resolveReportedUrl(snapshot: SnapshotPayload | undefined) {
  if (!snapshot) return undefined
  if (snapshot.preview_url) return snapshot.preview_url
  if (snapshot.preview_default) return `${LIVE_VIEW_URL}${snapshot.preview_default.replace(/^\//, "")}`
  return undefined
}

// Primer servidor de desarrollo local mencionado en los logs del agente
// (p. ej. "Local: http://localhost:5173" al arrancar npm run dev).
export function findDevServerUrl(snapshot: SnapshotPayload | undefined) {
  for (const entry of snapshot?.logs ?? []) {
    const match = DEV_SERVER_URL_RE.exec(entry.line ?? "")
    if (match) return match[0].replace(/\/$/, "")
  }
  return undefined
}

// URL que el sandbox debe mostrar: la fijada por el agente (set_preview o
// preview local) o, si no, el primer dev server detectado en los logs. Es la
// misma detección que usa el panel y la que dispara la apertura automática
// del sandbox cuando el agente navega (useLiveViewAutoOpen).
export function serverTargetOf(snapshot: SnapshotPayload | undefined) {
  const reported = resolveReportedUrl(snapshot)
  if (reported) return reported
  return findDevServerUrl(snapshot)
}

export function previewAutoStartKey(snapshot: SnapshotPayload | undefined) {
  const files = snapshot?.files ?? []
  const entries = files
    .filter((file) => file.kind !== "dir" && PREVIEW_ENTRY_RE.test(file.rel))
    .map((file) => `${file.rel}:${file.mtime ?? ""}:${file.size ?? ""}`)
  const current = snapshot?.current_file
  if (current && PREVIEW_ENTRY_RE.test(current)) entries.push(`${current}:${sampledChecksum(snapshot?.current_code ?? "")}`)
  const unique = [...new Set(entries)].sort()
  return unique.length > 0 ? unique.join("|") : undefined
}

// Destino confirmado por preview_start. Tiene prioridad sobre el preview del
// dashboard, que sólo representa los archivos estáticos de la sesión y no el
// runtime gestionado (Vite, JSX, Python, etc.). Se mantiene ligado al
// directorio para que una sesión nueva nunca herede la URL de otra.
export type LiveViewManagedTarget = { directory: string; url: string }
export const [liveViewManagedTarget, setLiveViewManagedTarget] = createSignal<LiveViewManagedTarget | undefined>(undefined)

export function managedUrlForDirectory(target: LiveViewManagedTarget | undefined, directory: string | undefined) {
  return target && target.directory === directory ? target.url : undefined
}

// El dashboard `/preview/` es una representación de archivos, no el runtime
// de una aplicación. Para entradas ejecutables esperamos al preview
// administrado; una URL explícita de set_preview sigue siendo intencional.
export function embeddedPreviewTarget(
  target: LiveViewManagedTarget | undefined,
  directory: string | undefined,
  snapshot: SnapshotPayload | undefined,
) {
  const managed = managedUrlForDirectory(target, directory)
  if (managed) return managed
  if (snapshot?.preview_url) return snapshot.preview_url
  const devUrl = findDevServerUrl(snapshot)
  if (devUrl) return devUrl
  if (previewAutoStartKey(snapshot)) return
  return resolveReportedUrl(snapshot)
}

export function filterPreviewFiles(paths: readonly string[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return paths
  return paths.filter((path) => path.toLowerCase().includes(normalized))
}

export type PreviewCodeScope = "all" | "frontend" | "backend"

export type PreviewFileTreeNode = {
  name: string
  path?: string
  children: PreviewFileTreeNode[]
}

export function previewCodeScope(path: string): Exclude<PreviewCodeScope, "all"> | undefined {
  const normalized = path.replace(/\\/g, "/").toLowerCase()
  if (/(^|\/)(?:api|backend|server|routes|controllers|services|models|database|db|prisma)(?:\/|$)/.test(normalized)) return "backend"
  if (/\.(?:py|go|rs|java|kt|cs|php|rb|sql|graphql|gql)$/i.test(normalized)) return "backend"
  if (/(^|\/)(?:src|app|client|web|components|pages|views|public|assets)(?:\/|$)/.test(normalized)) return "frontend"
  if (/\.(?:html|css|scss|sass|less|jsx|tsx|vue|svelte|astro)$/i.test(normalized)) return "frontend"
  return undefined
}

export function filterPreviewFilesByScope(paths: readonly string[], scope: PreviewCodeScope) {
  if (scope === "all") return paths
  return paths.filter((path) => previewCodeScope(path) === scope)
}

export function previewFileTree(paths: readonly string[]): PreviewFileTreeNode[] {
  const root: PreviewFileTreeNode[] = []
  for (const path of [...new Set(paths)].sort((a, b) => a.localeCompare(b))) {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean)
    let children = root
    parts.forEach((name, index) => {
      const isFile = index === parts.length - 1
      const current = children.find((node) => node.name === name && Boolean(node.path) === isFile)
      if (current) {
        children = current.children
        return
      }
      const node = { name, children: [], ...(isFile ? { path } : {}) }
      children.push(node)
      children = node.children
    })
  }
  return root
}

export function preferredPreviewCodePath(paths: readonly string[]) {
  const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b))
  const preferred = [
    /(?:^|\/)index\.html$/i,
    /(?:^|\/)App\.(?:tsx|jsx|ts|js)$/i,
    /(?:^|\/)(?:main|index)\.(?:tsx|jsx|ts|js)$/i,
    /(?:^|\/)app\.(?:tsx|jsx|ts|js)$/i,
  ]
  return preferred.flatMap((pattern) => sorted.filter((path) => pattern.test(path)))[0] ?? sorted[0]
}

const WORKSPACE_FILE_LIMIT = 500
const WORKSPACE_SCAN_IGNORED_DIR = /(?:^|\/)(?:\.git|node_modules|\.next|dist|build|coverage|\.cache)(?:\/|$)/i

// The live-server snapshot is an optimization, not the source of truth. Its
// file list can be absent while the agent is creating a project, so merge it
// with the directory-scoped workspace listing before rendering Code.
export function mergePreviewWorkspaceFiles(snapshotFiles: readonly string[], workspaceFiles: readonly string[]) {
  return [...new Set([...snapshotFiles, ...workspaceFiles].filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function shouldScanPreviewWorkspaceDirectory(path: string) {
  return !WORKSPACE_SCAN_IGNORED_DIR.test(path.replace(/\\/g, "/"))
}

function getFileBadge(name: string) {
  const lower = name.toLowerCase()
  // React / JSX / TSX
  if (lower.endsWith(".tsx") || lower.endsWith(".jsx")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-cyan-500/15 font-mono text-[9px] font-bold text-cyan-400" title="React / JSX">⚛</span>
  }
  // TypeScript
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts") || lower.endsWith(".d.ts")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-blue-500/15 font-mono text-[9px] font-bold text-blue-400" title="TypeScript">TS</span>
  }
  // JavaScript
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-amber-500/15 font-mono text-[9px] font-bold text-amber-300" title="JavaScript">JS</span>
  }
  // Vue / Svelte / Astro
  if (lower.endsWith(".vue")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-emerald-500/15 font-mono text-[8px] font-bold text-emerald-400" title="Vue">VUE</span>
  }
  if (lower.endsWith(".svelte")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-orange-500/15 font-mono text-[8px] font-bold text-orange-400" title="Svelte">SV</span>
  }
  if (lower.endsWith(".astro")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-purple-500/15 font-mono text-[8px] font-bold text-purple-400" title="Astro">AST</span>
  }
  // HTML
  if (lower.endsWith(".html") || lower.endsWith(".htm") || lower.endsWith(".xhtml")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-orange-500/15 font-mono text-[8px] font-bold text-orange-400" title="HTML">&lt;&gt;</span>
  }
  // CSS / Styling
  if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".sass") || lower.endsWith(".less") || lower.endsWith(".styl")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-sky-500/15 font-mono text-[9px] font-bold text-sky-400" title="CSS">#</span>
  }
  // JSON & Packages
  if (lower === "package.json" || lower.endsWith("-lock.json") || lower.endsWith(".lock") || lower.endsWith(".lockb")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-red-500/15 font-mono text-[8px] font-bold text-red-400" title="Package Manifest">📦</span>
  }
  if (lower.endsWith(".json") || lower.endsWith(".jsonc") || lower.endsWith(".json5")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-yellow-500/15 font-mono text-[8px] font-bold text-yellow-300" title="JSON">{"{}"}</span>
  }
  // YAML
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-rose-500/15 font-mono text-[8px] font-bold text-rose-300" title="YAML">YML</span>
  }
  // Python & Notebooks
  if (lower.endsWith(".py") || lower.endsWith(".pyw")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-yellow-600/15 font-mono text-[9px] font-bold text-yellow-400" title="Python">PY</span>
  }
  if (lower.endsWith(".ipynb")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-orange-500/15 font-mono text-[8px] font-bold text-orange-300" title="Jupyter Notebook">🪐</span>
  }
  // Rust
  if (lower.endsWith(".rs") || lower === "cargo.toml" || lower === "cargo.lock") {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-orange-700/15 font-mono text-[9px] font-bold text-orange-400" title="Rust">RS</span>
  }
  // Go
  if (lower.endsWith(".go") || lower === "go.mod" || lower === "go.sum") {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-cyan-600/15 font-mono text-[9px] font-bold text-cyan-300" title="Go">GO</span>
  }
  // C / C++ / C#
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx") || lower.endsWith(".hpp") || lower.endsWith(".hxx")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-indigo-500/15 font-mono text-[8px] font-bold text-indigo-300" title="C++">C++</span>
  }
  if (lower.endsWith(".c") || lower.endsWith(".h")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-blue-600/15 font-mono text-[9px] font-bold text-blue-300" title="C">C</span>
  }
  if (lower.endsWith(".cs") || lower.endsWith(".csx")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-violet-500/15 font-mono text-[8px] font-bold text-violet-300" title="C#">C#</span>
  }
  // Java / Kotlin / Scala
  if (lower.endsWith(".java") || lower.endsWith(".jar")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-red-600/15 font-mono text-[8px] font-bold text-red-400" title="Java">☕</span>
  }
  if (lower.endsWith(".kt") || lower.endsWith(".kts")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-purple-600/15 font-mono text-[9px] font-bold text-purple-300" title="Kotlin">KT</span>
  }
  // Swift
  if (lower.endsWith(".swift")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-orange-500/15 font-mono text-[8px] font-bold text-orange-400" title="Swift">SW</span>
  }
  // PHP
  if (lower.endsWith(".php") || lower.endsWith(".phtml")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-indigo-600/15 font-mono text-[8px] font-bold text-indigo-300" title="PHP">PHP</span>
  }
  // Ruby
  if (lower.endsWith(".rb") || lower === "gemfile") {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-red-500/15 font-mono text-[9px] font-bold text-red-400" title="Ruby">RB</span>
  }
  // SQL & Databases
  if (lower.endsWith(".sql") || lower.endsWith(".sqlite") || lower.endsWith(".db") || lower.endsWith(".prisma")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-teal-500/15 font-mono text-[8px] font-bold text-teal-300" title="Database / SQL">SQL</span>
  }
  // Shell / Scripts
  if (lower.endsWith(".sh") || lower.endsWith(".bash") || lower.endsWith(".zsh") || lower.endsWith(".ps1") || lower.endsWith(".bat") || lower.endsWith(".cmd")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-lime-500/15 font-mono text-[8px] font-bold text-lime-400" title="Shell Script">$_</span>
  }
  // Docker & Containers
  if (lower.includes("dockerfile") || lower.includes("docker-compose") || lower === ".dockerignore") {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-blue-500/15 font-mono text-[9px] text-blue-400" title="Docker">🐳</span>
  }
  // Git
  if (lower.startsWith(".git")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-orange-600/15 font-mono text-[8px] font-bold text-orange-400" title="Git Config">GIT</span>
  }
  // Config & Env
  if (lower.startsWith(".env") || lower.endsWith(".toml") || lower.endsWith(".ini") || lower.endsWith(".conf") || lower.endsWith(".config")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-slate-500/15 font-mono text-[8px] text-slate-300" title="Config">⚙</span>
  }
  // Markdown & Docs
  if (lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".txt") || lower.endsWith(".doc") || lower.endsWith(".pdf")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-emerald-500/15 font-mono text-[8px] font-bold text-emerald-400" title="Markdown / Document">MD</span>
  }
  // Images
  if (lower.endsWith(".svg") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".ico") || lower.endsWith(".avif")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-pink-500/15 font-mono text-[9px] text-pink-400" title="Image">🖼</span>
  }
  // Audio & Video
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg") || lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-purple-500/15 font-mono text-[9px] text-purple-400" title="Media">🎬</span>
  }
  // Archives
  if (lower.endsWith(".zip") || lower.endsWith(".tar") || lower.endsWith(".gz") || lower.endsWith(".7z") || lower.endsWith(".rar")) {
    return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-neutral-600/20 font-mono text-[9px] text-neutral-300" title="Archive">📦</span>
  }
  return <span class="inline-flex size-4 shrink-0 items-center justify-center rounded bg-neutral-700/30 font-mono text-[9px] text-neutral-400" title="File">📄</span>
}

// Panel de código: sigue el archivo que edita el agente, permite elegir desde
// el árbol del workspace y conserva los borradores manuales por archivo.
function CodeTreeNode(props: { node: PreviewFileTreeNode; depth: number; selectedPath: string | undefined; onSelect: (path: string) => void }) {
  return (
    <div>
      <Show
        when={props.node.path}
        fallback={
          <>
            <div
              class="flex w-full min-w-fit items-center gap-1.5 truncate py-0.5 text-11-medium text-text-weak"
              style={{ "padding-left": `${props.depth * 12 + 6}px` }}
              title={props.node.name}
            >
              <span class="shrink-0 text-amber-400/90 text-[11px]">📁</span>
              <span class="truncate min-w-0 font-medium whitespace-nowrap">{props.node.name}</span>
            </div>
            <For each={props.node.children}>
              {(child) => <CodeTreeNode node={child} depth={props.depth + 1} selectedPath={props.selectedPath} onSelect={props.onSelect} />}
            </For>
          </>
        }
      >
        {(path) => (
          <button
            type="button"
            data-selected={props.selectedPath === path() || undefined}
            class="flex w-full min-w-fit items-center gap-1.5 truncate rounded-sm py-0.5 pr-2 text-left font-mono text-11-regular text-text-weak hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base data-[selected]:bg-v2-overlay-simple-overlay-active data-[selected]:text-text-base"
            style={{ "padding-left": `${props.depth * 12 + 6}px` }}
            onClick={() => props.onSelect(path())}
            title={path()}
          >
            <div class="relative shrink-0 flex items-center justify-center size-3.5">
              <FileIcon node={{ path: path(), type: "file" }} class="size-3.5" />
            </div>
            {getFileBadge(props.node.name)}
            <span class="truncate min-w-0 whitespace-nowrap">{props.node.name}</span>
          </button>
        )}
      </Show>
    </div>
  )
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function highlightSyntaxHtml(code: string, filename: string): string {
  if (!code) return "&nbsp;"
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""

  if (["html", "htm", "xml", "svg", "xhtml"].includes(ext)) {
    let escaped = escapeHtml(code)
    escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span style="color:#7f848e;font-style:italic">$1</span>')
    escaped = escaped.replace(/(&lt;!DOCTYPE[\s\S]*?&gt;)/gi, '<span style="color:#c678dd;font-weight:bold">$1</span>')
    escaped = escaped.replace(
      /(&lt;\/?)([a-zA-Z0-9_-]+)((?:\s+[^&>=/\s]+(?:=(?:"[\s\S]*?"|'[\s\S]*?'|[^\s&>]+))?)*\s*)(\/?&gt;)/g,
      (_match, p1, tagName, attrs, p4) => {
        const highlightedAttrs = attrs.replace(
          /([a-zA-Z0-9_:-]+)(=(?:"[\s\S]*?"|'[\s\S]*?'|[^\s&>]+))?/g,
          (_aMatch: string, attrName: string, attrVal: string | undefined) => {
            const nameSpan = `<span style="color:#d19a66">${attrName}</span>`
            if (!attrVal) return nameSpan
            const valMatch = attrVal.match(/^=("[\s\S]*?"|'[\s\S]*?'|.*)$/)
            if (valMatch && valMatch[1]) {
              return `${nameSpan}<span style="color:#56b6c2">=</span><span style="color:#98c379">${valMatch[1]}</span>`
            }
            return `${nameSpan}<span style="color:#56b6c2">=</span><span style="color:#98c379">${attrVal.slice(1)}</span>`
          },
        )
        return `<span style="color:#e06c75">${p1}${tagName}</span>${highlightedAttrs}<span style="color:#e06c75">${p4}</span>`
      },
    )
    return escaped
  }

  if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "py", "css", "scss"].includes(ext)) {
    let escaped = escapeHtml(code)
    escaped = escaped.replace(/("[\s\S]*?"|'[\s\S]*?'|`[\s\S]*?`)/g, '<span style="color:#98c379">$1</span>')
    escaped = escaped.replace(/(\/\/[^\n]*)/g, '<span style="color:#7f848e;font-style:italic">$1</span>')
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#7f848e;font-style:italic">$1</span>')
    escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#d19a66">$1</span>')
    const keywords = [
      "import", "export", "from", "default", "const", "let", "var", "function", "return", "if", "else",
      "switch", "case", "for", "while", "do", "try", "catch", "finally", "throw", "new", "typeof",
      "instanceof", "class", "extends", "super", "this", "async", "await", "yield", "type", "interface",
      "enum", "as", "in", "of", "def", "elif", "pass", "None", "True", "False"
    ]
    const kwRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g")
    escaped = escaped.replace(kwRegex, '<span style="color:#c678dd;font-weight:600">$1</span>')
    escaped = escaped.replace(/\b(true|false|null|undefined)\b/g, '<span style="color:#e5c07b">$1</span>')
    return escaped
  }

  return escapeHtml(code)
}

function CodeEditorHighlight(props: {
  path: string
  value: string
  onInput: (val: string) => void
  onSave: () => void
}) {
  let preRef: HTMLPreElement | undefined
  let textareaRef: HTMLTextAreaElement | undefined
  let gutterRef: HTMLDivElement | undefined
  const lines = createMemo(() => Math.max(1, props.value.split("\n").length))

  const syncScroll = () => {
    if (textareaRef) {
      if (preRef) {
        preRef.scrollTop = textareaRef.scrollTop
        preRef.scrollLeft = textareaRef.scrollLeft
      }
      if (gutterRef) {
        gutterRef.scrollTop = textareaRef.scrollTop
      }
    }
  }

  return (
    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-v2-background-bg-base font-mono text-[13px] leading-[20px]">
      <div
        ref={(el) => (gutterRef = el)}
        class="select-none overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-layer-01 py-2 px-2.5 text-right text-[11px] leading-[20px] text-text-faint min-w-[42px]"
      >
        <For each={Array.from({ length: lines() }, (_, i) => i + 1)}>
          {(num) => <div class="h-[20px] leading-[20px]">{num}</div>}
        </For>
      </div>
      <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <pre
          ref={(el) => (preRef = el)}
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-2 font-mono text-[13px] leading-[20px] tracking-normal text-text-base"
          style={{
            "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            "tab-size": "2",
          }}
          innerHTML={highlightSyntaxHtml(props.value, props.path)}
        />
        <textarea
          ref={(el) => (textareaRef = el)}
          class="relative z-10 block h-full w-full resize-none overflow-auto border-0 bg-transparent p-2 font-mono text-[13px] leading-[20px] tracking-normal text-transparent caret-text-base outline-none selection:bg-v2-overlay-simple-overlay-active"
          style={{
            "-webkit-text-fill-color": "transparent",
            "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            "tab-size": "2",
            "white-space": "pre",
            "word-wrap": "normal",
            "overflow-wrap": "normal",
          }}
          value={props.value}
          spellcheck={false}
          wrap="off"
          aria-label={props.path}
          onScroll={syncScroll}
          onInput={(event) => {
            props.onInput(event.currentTarget.value)
            syncScroll()
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault()
              const target = event.currentTarget
              const start = target.selectionStart
              const end = target.selectionEnd
              const val = target.value
              const next = val.substring(0, start) + "  " + val.substring(end)
              props.onInput(next)
              queueMicrotask(() => {
                target.selectionStart = target.selectionEnd = start + 2
                syncScroll()
              })
              return
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault()
              props.onSave()
            }
          }}
        />
      </div>
    </div>
  )
}

function CodePane(props: {
  followPath?: string
  requestedPath?: string
  currentCode?: string | null
  files?: { rel: string; kind?: string; size?: number; mtime?: number }[]
}) {
  const file = useFile()
  const fileComponent = useFileComponent()
  const language = useLanguage()
  const sdk = useSDK()
  const [selectedPath, setSelectedPath] = createSignal<string>()
  const [isRenaming, setIsRenaming] = createSignal(false)
  const [renamePath, setRenamePath] = createSignal("")
  const [fileFilter, setFileFilter] = createSignal("")
  const [fileScope, setFileScope] = createSignal<PreviewCodeScope>("all")
  const [workspaceFiles, setWorkspaceFiles] = createSignal<string[]>([])
  const [workspaceLoading, setWorkspaceLoading] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [dirty, setDirty] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [saveFailed, setSaveFailed] = createSignal(false)
  const [editMode, setEditMode] = createSignal(false)
  const cacheKey = createMemo(() => sampledChecksum(draft()))
  const drafts = new Map<string, string>()
  const state = createMemo(() => {
    const path = selectedPath()
    if (!path) return
    return file.get(path)
  })
  const hasLiveCode = () => selectedPath() === props.followPath && props.currentCode !== null && props.currentCode !== undefined
  const contents = createMemo(() => (hasLiveCode() ? props.currentCode ?? "" : state()?.content?.content ?? ""))
  const files = createMemo(() => {
    const snapshotFiles = props.files
      ?.filter((entry) => entry.kind !== "dir" && entry.rel)
      .map((entry) => entry.rel)
      .concat(selectedPath() ? [selectedPath()!] : [])
    return mergePreviewWorkspaceFiles(snapshotFiles ?? [], workspaceFiles())
  })
  const scopedFiles = createMemo(() => filterPreviewFilesByScope(files(), fileScope()))
  const filteredFiles = createMemo(() => filterPreviewFiles(scopedFiles(), fileFilter()))
  const tree = createMemo(() => previewFileTree(filteredFiles()))

  const selectFile = (path: string) => {
    setSelectedPath(path)
    setSaveFailed(false)
    void file.load(path)
  }

  let workspaceGeneration = 0
  const refreshWorkspaceFiles = () => {
    const directory = sdk().directory
    if (!directory || directory === "main") {
      setWorkspaceFiles([])
      return
    }
    const generation = ++workspaceGeneration
    const paths: string[] = []
    const directories = [""]
    setWorkspaceLoading(true)

    const scan = async () => {
      while (directories.length > 0 && paths.length < WORKSPACE_FILE_LIMIT) {
        const current = directories.shift()
        if (current === undefined || !shouldScanPreviewWorkspaceDirectory(current)) continue
        const response = await sdk().client.file.list({ path: current })
        if (workspaceGeneration !== generation || sdk().directory !== directory) return
        for (const entry of response.data ?? []) {
          if (!entry.path || !shouldScanPreviewWorkspaceDirectory(entry.path)) continue
          if (entry.type === "directory") {
            directories.push(entry.path)
            continue
          }
          if (entry.type === "file") paths.push(entry.path)
          if (paths.length >= WORKSPACE_FILE_LIMIT) break
        }
      }
      if (workspaceGeneration !== generation || sdk().directory !== directory) return
      setWorkspaceFiles([...new Set(paths)].sort((a, b) => a.localeCompare(b)))
    }

    void scan()
      .catch(() => {
        if (workspaceGeneration !== generation) return
      })
      .finally(() => {
        if (workspaceGeneration === generation) setWorkspaceLoading(false)
      })
  }

  // Re-list when the project changes and after the live server publishes an
  // update. A small debounce batches an agent's sequence of file writes.
  createEffect(() => {
    const directory = sdk().directory
    void props.files?.map((entry) => `${entry.rel}:${entry.mtime ?? ""}:${entry.size ?? ""}`).join("|")
    const timer = window.setTimeout(refreshWorkspaceFiles, 180)
    onCleanup(() => window.clearTimeout(timer))
    onCleanup(() => {
      if (sdk().directory === directory) workspaceGeneration++
    })
  })

  createEffect(() => {
    const path = selectedPath()
    const source = contents()
    if (!path) {
      setDraft("")
      setDirty(false)
      return
    }
    // Keep an edit per file while people inspect another generated file. This
    // also prevents an agent update or delayed file read from erasing a draft.
    const savedDraft = drafts.get(path)
    setDraft(savedDraft ?? source)
    setDirty(savedDraft !== undefined)
    setSaveFailed(false)
  })

  const save = async () => {
    const path = selectedPath()
    if (!path || !dirty() || saving()) return
    const content = draft()
    setSaving(true)
    setSaveFailed(false)
    try {
      await sdk().client.file.write({ path, content })
      if (drafts.get(path) === content) {
        drafts.delete(path)
        if (selectedPath() === path) setDirty(false)
      }
      void file.load(path, { force: true })
      refreshWorkspaceFiles()
      window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { path } }))
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const handleRename = async () => {
    const current = selectedPath()
    const target = renamePath().trim()
    if (!current || !target || target === current || saving()) {
      setIsRenaming(false)
      return
    }
    setSaving(true)
    try {
      await sdk().client.file.write({ path: target, content: draft() })
      drafts.delete(current)
      drafts.set(target, draft())
      setSelectedPath(target)
      setIsRenaming(false)
      void file.load(target, { force: true })
      refreshWorkspaceFiles()
      window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { path: target } }))
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  // Auto-save draft changes after typing with debounce to ensure live updates
  createEffect(() => {
    const isDirty = dirty()
    const path = selectedPath()
    const text = draft()
    if (!isDirty || !path || !text) return
    const timer = window.setTimeout(() => {
      void save()
    }, 500)
    onCleanup(() => window.clearTimeout(timer))
  })

  // A manual selection remains until the agent moves to another file. This
  // permits inspection of any generated file while retaining normal follow
  // behavior for the agent's next edit.
  let lastFollowed = ""
  createEffect(() => {
    const path = props.followPath
    if (!path || path === lastFollowed) return
    lastFollowed = path
    selectFile(path)
  })

  let lastRequested = ""
  createEffect(() => {
    const path = props.requestedPath
    if (!path || path === lastRequested) return
    lastRequested = path
    selectFile(path)
  })

  createEffect(() => {
    // El árbol llega antes que current_file en builds nuevos: enseña una entrada
    // útil sin reemplazar una selección manual ni la que publique el agente.
    if (props.followPath || (props.currentCode !== null && props.currentCode !== undefined) || selectedPath()) return
    const fallback = preferredPreviewCodePath(files())
    if (fallback) selectFile(fallback)
  })

  const [codeSidebarWidth, setCodeSidebarWidth] = createSignal<number>(
    (() => {
      try {
        const saved = localStorage.getItem("tiancode.code-sidebar-width")
        const parsed = saved ? Number.parseInt(saved, 10) : NaN
        if (Number.isFinite(parsed) && parsed >= 160 && parsed <= 700) return parsed
      } catch {}
      return 240
    })(),
  )

  const [isResizingSidebar, setIsResizingSidebar] = createSignal(false)

  const handleSidebarResizeStart = (event: MouseEvent) => {
    event.preventDefault()
    setIsResizingSidebar(true)
    const startX = event.clientX
    const startWidth = codeSidebarWidth()

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const nextWidth = Math.max(160, Math.min(650, startWidth + delta))
      setCodeSidebarWidth(nextWidth)
    }

    const onMouseUp = () => {
      setIsResizingSidebar(false)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      try {
        localStorage.setItem("tiancode.code-sidebar-width", String(codeSidebarWidth()))
      } catch {}
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  return (
    <div class="flex size-full min-h-0 flex-col">
      <div class="flex h-10 shrink-0 items-center gap-2 overflow-hidden border-b border-v2-border-border-muted px-2">
        <span class="shrink-0 text-11-medium text-text-weak">{language.t("liveView.tab.code")}</span>
        <div role="tablist" aria-label={language.t("liveView.code.workspace")} class="flex shrink-0 rounded-md bg-v2-overlay-simple-overlay-pressed p-0.5">
          <For
            each={[
              { id: "all" as const, label: language.t("liveView.code.filter.all") },
              { id: "frontend" as const, label: language.t("liveView.code.filter.frontend") },
              { id: "backend" as const, label: language.t("liveView.code.filter.backend") },
            ]}
          >
            {(scope) => (
              <button
                type="button"
                role="tab"
                aria-selected={fileScope() === scope.id}
                data-selected={fileScope() === scope.id || undefined}
                class="rounded px-1.5 py-0.5 text-11-medium text-text-weak hover:text-text-base data-[selected]:bg-v2-background-bg-base data-[selected]:text-text-base"
                onClick={() => setFileScope(scope.id)}
              >
                {scope.label}
              </button>
            )}
          </For>
        </div>
        <Show when={files().length > 0}>
          <div class="flex min-w-0 flex-1 items-center gap-1">
            <input
              type="search"
              class="h-6 min-w-0 flex-1 rounded border border-v2-border-border-muted bg-transparent px-1.5 text-11-regular text-text-base outline-none focus:border-v2-border-border-strong"
              value={fileFilter()}
              onInput={(event) => setFileFilter(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !fileFilter()) return
                event.preventDefault()
                setFileFilter("")
              }}
              placeholder={language.t("common.search.placeholder")}
              aria-label={language.t("common.search.placeholder")}
            />
            <Show when={fileFilter()}>
              <button
                type="button"
                class="shrink-0 text-text-faint hover:text-text-base"
                onClick={() => setFileFilter("")}
                aria-label={language.t("a11y.clearSearch")}
                title={language.t("a11y.clearSearch")}
              >
                <IconV2 name="xmark-small" size="small" />
              </button>
            </Show>
          </div>
        </Show>
        <Show when={selectedPath()}>
          <button
            type="button"
            class="shrink-0 rounded-md border border-v2-border-border-muted px-2 py-1 text-11-medium text-text-weak transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!dirty() || saving()}
            onClick={() => void save()}
            title="Ctrl+S"
          >
            {saving() ? language.t("common.saving") : language.t("common.save")}
          </button>
        </Show>
      </div>
      <div class="flex min-h-0 min-w-0 flex-1">
        <Show when={files().length > 0}>
          <aside
            class="group/sidebar relative flex shrink-0 flex-col border-r border-v2-border-border-muted bg-v2-background-bg-base"
            style={{ width: `${codeSidebarWidth()}px` }}
          >
            <div class="shrink-0 border-b border-v2-border-border-muted px-2 py-1 text-11-regular text-text-faint">
              {language.t("liveView.code.files", { count: filteredFiles().length })}
              <Show when={workspaceLoading()}> / {language.t("common.loading")}</Show>
            </div>
            <Show
              when={tree().length > 0}
              fallback={<div class="p-2 text-11-regular text-text-faint">{language.t("liveView.code.emptyFilter")}</div>}
            >
              <ScrollView class="min-h-0 flex-1 overflow-x-auto">
                <div class="p-1 min-w-fit w-full">
                  <For each={tree()}>
                    {(node) => <CodeTreeNode node={node} depth={0} selectedPath={selectedPath()} onSelect={selectFile} />}
                  </For>
                </div>
              </ScrollView>
            </Show>
            {/* Splitter arrastrable para redimensionar el sidebar de archivos */}
            <div
              role="separator"
              aria-orientation="vertical"
              class={`absolute top-0 -right-1 h-full w-2 cursor-col-resize z-30 transition-colors select-none ${
                isResizingSidebar() ? "bg-sky-500/80" : "hover:bg-sky-500/50"
              }`}
              onMouseDown={handleSidebarResizeStart}
              title={language.intl().toLowerCase().startsWith("es") ? "Arrastrar para redimensionar barra lateral" : "Drag to resize sidebar"}
            />
          </aside>
        </Show>
        <div class="min-h-0 min-w-0 flex-1">
          <Show
            when={selectedPath()}
            fallback={
              <div class="flex size-full items-center justify-center px-6 text-center text-13-regular text-text-weak">
                {language.t("liveView.code.empty")}
              </div>
            }
          >
            <Show
              when={state()?.loaded || hasLiveCode()}
              fallback={
                <Show
                  when={!state()?.error}
                  fallback={
                    <div role="status" class="flex size-full items-center justify-center px-6 text-center text-13-regular text-text-weak">
                      {language.t("liveView.code.unavailable")}
                    </div>
                  }
                >
                  <div role="status" class="flex size-full items-center justify-center px-6 text-13-regular text-text-weak">
                    {language.t("common.loading")}
                    {language.t("common.loading.ellipsis")}
                  </div>
                </Show>
              }
            >
              <div class="flex size-full min-h-0 flex-col">
                <div class="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-muted px-3 bg-v2-background-bg-layer-01">
                  <Show
                    when={isRenaming()}
                    fallback={
                      <div class="flex min-w-0 flex-1 items-center gap-1.5">
                        <span class="min-w-0 truncate font-mono text-11-medium text-text-base" title={selectedPath()}>
                          {selectedPath()}
                        </span>
                        <button
                          type="button"
                          class="shrink-0 rounded p-1 text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base transition-colors"
                          onClick={() => {
                            setRenamePath(selectedPath() ?? "")
                            setIsRenaming(true)
                          }}
                          title={language.intl().toLowerCase().startsWith("es") ? "Renombrar archivo" : "Rename file"}
                          aria-label={language.intl().toLowerCase().startsWith("es") ? "Renombrar archivo" : "Rename file"}
                        >
                          <IconV2 name="edit" size="small" />
                        </button>
                      </div>
                    }
                  >
                    <div class="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        type="text"
                        class="h-6 min-w-0 flex-1 rounded border border-v2-border-border-strong bg-v2-background-bg-base px-2 font-mono text-11-regular text-text-base outline-none"
                        value={renamePath()}
                        onInput={(e) => setRenamePath(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename()
                          if (e.key === "Escape") setIsRenaming(false)
                        }}
                        autofocus
                      />
                      <button
                        type="button"
                        class="shrink-0 rounded px-2 py-0.5 text-11-medium bg-v2-state-bg-success text-white hover:opacity-90"
                        onClick={() => void handleRename()}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="shrink-0 rounded px-2 py-0.5 text-11-medium text-text-faint hover:text-text-base"
                        onClick={() => setIsRenaming(false)}
                      >
                        ✕
                      </button>
                    </div>
                  </Show>
                  <Show when={dirty()}>
                    <span class="shrink-0 text-11-regular text-amber-500 font-medium">●</span>
                  </Show>
                </div>
                <CodeEditorHighlight
                  path={selectedPath() ?? ""}
                  value={draft()}
                  onInput={(value) => {
                    const path = selectedPath()
                    if (!path) return
                    setDraft(value)
                    if (value === contents()) {
                      drafts.delete(path)
                      setDirty(false)
                    } else {
                      drafts.set(path, value)
                      setDirty(true)
                    }
                    setSaveFailed(false)
                  }}
                  onSave={() => void save()}
                />
                <Show when={saveFailed()}>
                  <div role="status" class="shrink-0 border-t border-v2-border-border-muted px-3 py-1 text-11-regular text-red-500">
                    {language.t("liveView.code.unavailable")}
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}


export function LiveViewPanel(props: { onCapture?: (file: File) => void; expandable?: boolean }) {
  const language = useLanguage()
  const { view } = useSessionLayout()
  const sync = useSync()
  const sdk = useSDK()
  const [requestedCodePath, setRequestedCodePath] = createSignal<string>()
  // Último snapshot del live server (preview_url, logs, current_file…).
  const [snapshot, setSnapshot] = createSignal<SnapshotPayload | undefined>(undefined)
  // URL detectada en los logs del agente (solo informativa, la navegación la
  // hace LivePreview con targetUrl).
  const [detectedUrl, setDetectedUrl] = createSignal<string | undefined>(undefined)
  // El aviso descartado con la X no vuelve a aparecer para esa misma URL
  // (el poll lo re-derivaría en el siguiente snapshot).
  const [dismissedUrl, setDismissedUrl] = createSignal<string | undefined>(undefined)

  // La selección se guarda en el layout, así que al volver a abrir el sandbox
  // se conserva el modo completo que eligió la persona.
  const activeTab = createMemo(() => view().liveView.tab())
  const content = createMemo(() => liveViewContentForTab(activeTab()))
  const tabs = () => [
    { id: "preview" as const, label: language.t("liveView.tab.preview") },
    { id: "code" as const, label: language.t("liveView.tab.code") },
  ]

  // El proyecto actual del workspace: es lo que la vista en vivo debe reflejar.
  // sdk().directory ES el directorio de la sesión activa (el SDKProvider de la
  // página se inicializa con session.directory); sync().project?.worktree es el
  // proyecto GLOBAL (p. ej. C:\) y NO vale para la sesión.
  const worktree = createMemo(() => sdk().directory || sync().project?.worktree)

  // URL que el panel debe mostrar: la del agente (set_preview o preview local)
  // o, si no, el primer dev server detectado en los logs. La detección
  // queda suprimida mientras el usuario navegue a mano (manualNav en el
  // navegador); una URL nueva del agente la reanuda. Sólo una sesión de
  // preview explícita puede cambiar ese destino; nunca un shell o navegador
  // externo que haya usado el agente.
  const serverTarget = createMemo(() => serverTargetOf(snapshot()))
  const autoStartKey = createMemo(() => previewAutoStartKey(snapshot()))
  const browserTarget = () => embeddedPreviewTarget(liveViewManagedTarget(), sdk().directory, snapshot())

  // Aviso transitorio cuando la navegación vino de la detección de logs (no
  // de una URL fijada por el agente); se descarta con la X.
  createEffect(() => {
    const target = serverTarget()
    const reported = resolveReportedUrl(snapshot())
    const detected = target && !reported ? target : undefined
    setDetectedUrl(detected === dismissedUrl() ? undefined : detected)
  })

  let mounted = true
  let eventSource: EventSource | undefined
  let fallbackSnapshotTimer: number | undefined
  let staleEventTimer: number | undefined
  let latestEventAt = 0
  let syncingWorkspace = false
  let pendingWorkspaceSync = false
  const activeRequests = new Set<AbortController>()

  const fetchLiveView = (path: string, init?: RequestInit) => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), LIVE_VIEW_CHECK_MS)
    activeRequests.add(controller)
    return fetch(`${LIVE_VIEW_URL}${path}`, { ...init, signal: controller.signal }).finally(() => {
      window.clearTimeout(timer)
      activeRequests.delete(controller)
    })
  }

  const loadSnapshot = () =>
    fetchLiveView("api/snapshot")
      .then((res) => (res.ok ? res.json() : undefined))
      .then((payload) => {
        if (!mounted || !isRecord(payload) || !("session" in payload)) return { received: false } as const
        const next = payload.session === null ? undefined : asSnapshotPayload(payload.session)
        if (payload.session !== null && !next) return { received: false } as const
        setSnapshot((current) => mergeLiveSnapshot(current, next))
        return { received: true, session: next } as const
      })
      .catch(() => ({ received: false } as const))

  const createPanelSession = (root: string) =>
    fetchLiveView("api/create_session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root_text: root, mode: "web", label: "Vista en vivo" }),
    })
      .then((res) => {
        if (!mounted || !res.ok) return
        return loadSnapshot()
      })
      .catch(() => undefined)

  // Refleja el proyecto actual: si el servidor aún no tiene sesión, crea una
  // con la raíz del workspace; si la sesión actual del servidor es la del panel
  // (label "Vista en vivo") y apunta a otra raíz (cambio de sesión/proyecto),
  // la corrige. Nunca toca una sesión creada por el agente.
  const syncWorkspaceSession = () => {
    if (syncingWorkspace) {
      pendingWorkspaceSync = true
      return
    }
    const root = worktree()
    if (!root || root === "main") return
    syncingWorkspace = true
    void loadSnapshot()
      .then((result) => {
        if (!result.received) return
        const current = result.session
        if (!current) return createPanelSession(root)
        const sameRoot = typeof current.root === "string" && current.root.replace(/\\+$/, "") === root.replace(/\\+$/, "")
        const isPanelSession = current.label === "Vista en vivo"
        if (sameRoot || !isPanelSession) return
        return createPanelSession(root)
      })
      .finally(() => {
        syncingWorkspace = false
        if (!mounted || !pendingWorkspaceSync) return
        pendingWorkspaceSync = false
        syncWorkspaceSession()
      })
  }

  const stopFallbackPolling = () => {
    if (fallbackSnapshotTimer === undefined) return
    window.clearInterval(fallbackSnapshotTimer)
    fallbackSnapshotTimer = undefined
  }

  const startFallbackPolling = () => {
    if (fallbackSnapshotTimer !== undefined) return
    syncWorkspaceSession()
    fallbackSnapshotTimer = window.setInterval(syncWorkspaceSession, LIVE_VIEW_FALLBACK_POLL_MS)
  }

  const connectLiveEvents = () => {
    if (typeof EventSource === "undefined") {
      startFallbackPolling()
      return
    }
    const source = new EventSource(`${LIVE_VIEW_URL}events`)
    eventSource = source
    source.addEventListener("snapshot", (event) => {
      if (!mounted || eventSource !== source) return
      const payload = parseLiveEventPayload((event as MessageEvent).data)
      if (payload === undefined) return
      latestEventAt = Date.now()
      if (payload === null) {
        setSnapshot(undefined)
        stopFallbackPolling()
        return
      }
      const next = asSnapshotPayload(payload)
      if (!next) return
      setSnapshot((current) => mergeLiveSnapshot(current, next))
      stopFallbackPolling()
    })
    source.addEventListener("update", (event) => {
      if (!mounted || eventSource !== source) return
      const update = asLiveUpdatePayload(parseLiveEventPayload((event as MessageEvent).data))
      if (!update) return
      latestEventAt = Date.now()
      setSnapshot((current) => applyLiveSnapshotUpdate(current, update))
      stopFallbackPolling()
      if (update.type === "file_added" || update.type === "file_modified" || update.type === "file_changed" || update.type === "file_removed") {
        const rel = isRecord(update.data) && typeof update.data.rel === "string" ? update.data.rel : undefined
        window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { path: rel } }))
      }
      if (update.type === "session_created" || update.type === "tree_changed") void loadSnapshot()
    })
    source.onopen = () => {
      if (!mounted || eventSource !== source) return
      latestEventAt = Date.now()
      stopFallbackPolling()
    }
    source.onerror = () => {
      if (!mounted || eventSource !== source) return
      startFallbackPolling()
    }
  }

  onMount(() => {
    connectLiveEvents()
    syncWorkspaceSession()
    staleEventTimer = window.setInterval(() => {
      if (!eventSource || Date.now() - latestEventAt <= LIVE_VIEW_SSE_STALE_MS) return
      startFallbackPolling()
    }, LIVE_VIEW_FALLBACK_POLL_MS)
  })

  onCleanup(() => {
    mounted = false
    eventSource?.close()
    stopFallbackPolling()
    if (staleEventTimer !== undefined) window.clearInterval(staleEventTimer)
    activeRequests.forEach((controller) => controller.abort())
  })

  // Al cambiar de proyecto (p. ej. nueva sesión en otra carpeta), re-sincroniza
  // si el servidor no tiene sesión aún.
  createEffect(() => {
    void worktree()
    const timer = window.setTimeout(syncWorkspaceSession, 800)
    onCleanup(() => window.clearTimeout(timer))
  })

  const [viewportMode, setViewportMode] = createSignal<"fluid" | "mobile" | "tablet" | "laptop">("fluid")

  const viewportMaxWidth = () => {
    switch (viewportMode()) {
      case "mobile":
        return "393px"
      case "tablet":
        return "820px"
      case "laptop":
        return "1366px"
      default:
        return "100%"
    }
  }

  return (
    <aside
      id="live-view-panel"
      role="region"
      aria-label={language.t("liveView.sandbox")}
      class="flex size-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] ring-1 ring-white/[0.025]"
    >
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-v2-border-border-muted bg-[linear-gradient(180deg,var(--v2-background-bg-base),var(--v2-overlay-simple-overlay-pressed))] px-2.5">
        <div class="flex shrink-0 items-center gap-1.5 rounded-md bg-v2-overlay-simple-overlay-hover px-1.5 py-1 text-13-medium text-text-base select-none">
          <span class="size-1.5 rounded-full bg-[var(--v2-state-fg-success)]" aria-hidden="true" />
          {language.t("liveView.sandbox")}
        </div>
        <div class="flex min-w-0 flex-1 justify-center overflow-hidden gap-2">
          <div
            role="tablist"
            aria-label={language.t("liveView.sandbox")}
            class="flex h-8 rounded-lg border border-v2-border-border-muted bg-v2-overlay-simple-overlay-pressed p-0.5 shadow-inner"
          >
            <For each={tabs()}>
              {(tab) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab() === tab.id}
                  aria-controls="live-view-content"
                  data-selected={activeTab() === tab.id || undefined}
                  class="h-full shrink-0 rounded-md px-2.5 text-12-medium text-text-weak transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base focus-visible:outline focus-visible:outline-1 focus-visible:outline-v2-border-border-strong data-[selected]:bg-v2-background-bg-base data-[selected]:text-text-base data-[selected]:shadow-[var(--v2-elevation-raised)]"
                  onClick={() => view().liveView.setTab(tab.id)}
                >
                  {tab.label}
                </button>
              )}
            </For>
          </div>

          {/* Selector de Dispositivos Responsivos */}
          <Show when={content() === "preview"}>
            <div class="hidden sm:flex h-8 items-center rounded-lg border border-v2-border-border-muted bg-v2-overlay-simple-overlay-pressed p-0.5 shadow-inner gap-0.5">
              <button
                type="button"
                title="Móvil (390px)"
                class={`px-2 h-full rounded text-[11px] font-medium transition-all ${
                  viewportMode() === "mobile"
                    ? "bg-v2-background-bg-base text-sky-400 shadow-sm"
                    : "text-text-weak hover:text-text-base"
                }`}
                onClick={() => setViewportMode("mobile")}
              >
                📱
              </button>
              <button
                type="button"
                title="Tablet (820px)"
                class={`px-2 h-full rounded text-[11px] font-medium transition-all ${
                  viewportMode() === "tablet"
                    ? "bg-v2-background-bg-base text-sky-400 shadow-sm"
                    : "text-text-weak hover:text-text-base"
                }`}
                onClick={() => setViewportMode("tablet")}
              >
                📲
              </button>
              <button
                type="button"
                title="Laptop (1024px)"
                class={`px-2 h-full rounded text-[11px] font-medium transition-all ${
                  viewportMode() === "laptop"
                    ? "bg-v2-background-bg-base text-sky-400 shadow-sm"
                    : "text-text-weak hover:text-text-base"
                }`}
                onClick={() => setViewportMode("laptop")}
              >
                💻
              </button>
              <button
                type="button"
                title="100% Fluido"
                class={`px-2 h-full rounded text-[11px] font-medium transition-all ${
                  viewportMode() === "fluid"
                    ? "bg-v2-background-bg-base text-sky-400 shadow-sm"
                    : "text-text-weak hover:text-text-base"
                }`}
                onClick={() => setViewportMode("fluid")}
              >
                🖥️
              </button>
            </div>
          </Show>
        </div>
        <Show when={props.expandable}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="large"
            onClick={() => view().liveView.toggleExpanded()}
            aria-label={language.t(view().liveView.expanded() ? "session.todo.collapse" : "session.todo.expand")}
            title={language.t(view().liveView.expanded() ? "session.todo.collapse" : "session.todo.expand")}
            icon={<IconV2 name={view().liveView.expanded() ? "split" : "workspace"} />}
          />
        </Show>
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          onClick={() => view().liveView.close()}
          aria-label={language.t("common.close")}
          title={language.t("common.close")}
          icon={<IconV2 name="xmark-small" />}
        />
      </div>

      <div
        id="live-view-content"
        role="tabpanel"
        data-live-view-mode={content()}
        class="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <Show
          when={content() === "code"}
          fallback={
            <div class="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden bg-v2-background-bg-base p-2">
              <div
                class="size-full transition-all duration-300 flex flex-col"
              >
                <LivePreview
                  targetUrl={browserTarget}
                  autoStartKey={autoStartKey}
                  externalDevice={() => viewportMode()}
                  onDeviceChange={(mode) => setViewportMode(mode)}
                  onManagedTarget={(url) => {
                    const directory = sdk().directory
                    if (!directory || directory === "main") return
                    setLiveViewManagedTarget((current) =>
                      url ? { directory, url } : current?.directory === directory ? undefined : current,
                    );
                  }}
                  onCapture={props.onCapture}
                  onOpenSource={(path) => {
                    setRequestedCodePath(path)
                    view().liveView.setTab("code")
                  }}
                />
              </div>
            </div>
          }
        >
          <CodePane
            followPath={snapshot()?.current_file ?? undefined}
            requestedPath={requestedCodePath()}
            currentCode={snapshot()?.current_code}
            files={snapshot()?.files}
          />
        </Show>
        <Show when={content() !== "code" && detectedUrl()}>
          {(url) => (
            <div class="flex shrink-0 items-center gap-2 border-t border-v2-border-border-muted px-3 py-1.5 text-11-regular text-text-weak">
              <span class="min-w-0 flex-1 truncate">{language.t("liveView.detectNotice", { url: url() })}</span>
              <button
                type="button"
                class="shrink-0 text-text-faint hover:text-text-base"
                onClick={() => {
                  setDismissedUrl(detectedUrl())
                  setDetectedUrl(undefined)
                }}
                aria-label={language.t("common.close")}
              >
                <IconV2 name="xmark-small" size="small" />
              </button>
            </div>
          )}
        </Show>
      </div>
    </aside>
  )
}
