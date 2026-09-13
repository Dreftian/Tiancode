import { sampledChecksum } from "@tiancode-ai/core/util/encode"
import { FileIcon } from "@tiancode-ai/ui/file-icon"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useFile } from "@/context/file"
import { useFileComponent } from "@tiancode-ai/ui/context/file"
import { useLanguage } from "@/context/language"
import { useLayout, type LiveViewTab } from "@/context/layout"
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

// El handler de teclado acepta ctrlKey O metaKey, así que la etiqueta del atajo
// debe mostrar el modificador real de cada plataforma y no dar Ctrl por hecho.
const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)
const TAB_SHORTCUTS: Record<LiveViewContent, string> = {
  preview: IS_MAC ? "⌘⌥1" : "Ctrl+Alt+1",
  code: IS_MAC ? "⌘⌥2" : "Ctrl+Alt+2",
}
// El icono de cada pestaña sólo se usa cuando el encabezado es demasiado
// estrecho para el texto; ambos nombres existen en el sprite de IconV2.
const TAB_ICONS: Record<LiveViewContent, "globe" | "filetree"> = {
  preview: "globe",
  code: "filetree",
}

type ViewportMode = "fluid" | "mobile" | "tablet" | "laptop"
// Orden del menú de tamaño: del más estrecho al panel completo.
const VIEWPORT_MODES = ["mobile", "tablet", "laptop", "fluid"] as const satisfies readonly ViewportMode[]
const VIEWPORT_LABEL_KEYS = {
  mobile: "liveView.device.mobile",
  tablet: "liveView.device.tablet",
  laptop: "liveView.device.laptop",
  fluid: "liveView.device.fluid",
} as const

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
    /(?:^|\/)MainWindow\.xaml$/i,
    /(?:^|\/)App\.xaml(?:\.cs)?$/i,
    /(?:^|\/)index\.html$/i,
    /(?:^|\/)App\.(?:tsx|jsx|ts|js)$/i,
    /(?:^|\/)(?:main|index|Program)\.(?:tsx|jsx|ts|js|py|rs|go|cs)$/i,
    /(?:^|\/)app\.(?:tsx|jsx|ts|js|py)$/i,
  ]
  return preferred.flatMap((pattern) => sorted.filter((path) => pattern.test(path)))[0] ?? sorted[0]
}

// Los filtros del panel de código apuntan aquí con aria-controls.
const CODE_FILE_LIST_ID = "live-view-code-files"

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
              {/* FileIcon también dibuja carpetas: el emoji anterior ignoraba
                  `text-amber-400`, porque una clase de color no tiñe un emoji
                  de color, y quedaba igual en tema claro y oscuro. */}
              <FileIcon node={{ path: props.node.name, type: "directory" }} class="size-3.5 shrink-0" />
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
            <span class="truncate min-w-0 whitespace-nowrap">{props.node.name}</span>
          </button>
        )}
      </Show>
    </div>
  )
}

// Editor de texto plano. La lectura la dibuja el visor de archivos del repo
// (shiki + tema TiancodeTheme, que sale de las mismas variables CSS que el
// resto de la app), así que aquí no hace falta ningún resaltado propio: el
// anterior regeneraba el documento entero por tecla y pintaba mal.
// La altura de línea va en `style` y no en una clase: iguala
// --diffs-line-height del visor (24px) para que el texto no salte al entrar y
// salir del modo edición, y así gana a la que trae la utilidad tipográfica.
function CodeEditor(props: {
  path: string
  value: string
  onInput: (value: string) => void
  onSave: () => void
  onExit: () => void
}) {
  let textareaRef: HTMLTextAreaElement | undefined
  let gutterRef: HTMLDivElement | undefined
  const lines = createMemo(() => Math.max(1, props.value.split("\n").length))

  const syncScroll = () => {
    if (gutterRef && textareaRef) gutterRef.scrollTop = textareaRef.scrollTop
  }

  return (
    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-v2-background-bg-base">
      <div
        ref={(el) => (gutterRef = el)}
        aria-hidden="true"
        class="min-w-[42px] shrink-0 select-none overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2.5 py-2 text-right text-11-regular text-text-faint"
      >
        <For each={Array.from({ length: lines() }, (_, i) => i + 1)}>
          {(num) => (
            <div class="h-[24px]" style={{ "line-height": "24px" }}>
              {num}
            </div>
          )}
        </For>
      </div>
      <textarea
        ref={(el) => (textareaRef = el)}
        class="min-h-0 min-w-0 flex-1 resize-none border-0 bg-transparent p-2 text-12-mono text-text-base caret-text-base outline-none selection:bg-v2-overlay-simple-overlay-active"
        style={{ "line-height": "24px", "tab-size": "2", "white-space": "pre", "overflow-wrap": "normal" }}
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
            props.onInput(val.substring(0, start) + "  " + val.substring(end))
            queueMicrotask(() => {
              target.selectionStart = target.selectionEnd = start + 2
              syncScroll()
            })
            return
          }
          // El autoguardado ya escribe a los 500 ms; Ctrl/Cmd+S sólo adelanta
          // esa escritura para quien tiene el reflejo de guardar a mano.
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault()
            props.onSave()
            return
          }
          // Tab se queda dentro del textarea, así que Escape es la salida de
          // teclado del editor: sin ella este campo sería una trampa.
          if (event.key === "Escape") {
            event.preventDefault()
            props.onExit()
          }
        }}
      />
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

  // El visor recibe el texto efectivo (borrador, código en vivo o disco). Nunca
  // lee del disco por su cuenta, así que sirve igual para una ruta que el live
  // server publica y que todavía no existe en el workspace.
  const viewerFile = createMemo(() => ({
    name: selectedPath() ?? "",
    contents: draft(),
    cacheKey: cacheKey(),
  }))

  const selectFile = (path: string) => {
    setSelectedPath(path)
    setSaveFailed(false)
    // Seguir al agente siempre aterriza en lectura: nadie espera que cambiar de
    // archivo le deje el cursor dentro de un editor abierto sobre otro archivo.
    setEditMode(false)
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

  // Auto-save draft changes after typing with debounce to ensure live updates.
  // `draft()` se lee para volver a armar el temporizador en cada tecla; vaciar
  // un archivo también es una edición, así que un borrador vacío se guarda.
  createEffect(() => {
    const isDirty = dirty()
    const path = selectedPath()
    void draft()
    if (!isDirty || !path) return
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

  onMount(() => {
    const handleReload = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>
      const modifiedPath = customEvent.detail?.path
      const current = selectedPath()
      if (!current || !modifiedPath) return
      const normCurrent = current.replace(/\\/g, "/").replace(/^\/+/, "")
      const normMod = modifiedPath.replace(/\\/g, "/").replace(/^\/+/, "")
      if (normCurrent === normMod || normCurrent.endsWith(normMod) || normMod.endsWith(normCurrent)) {
        void file.load(current, { force: true })
      }
    }
    window.addEventListener("tiancode:preview-reload", handleReload)
    onCleanup(() => {
      window.removeEventListener("tiancode:preview-reload", handleReload)
    })
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
        {/* Grupo de botones, no `role="tablist"`: estos filtros no abren
            paneles distintos y no eran navegables con flechas, así que la
            semántica de pestañas prometía algo que el teclado no cumplía.
            Como alternan una vista del mismo listado, van con aria-pressed. */}
        <div role="group" aria-label={language.t("liveView.code.filter.label")} class="flex shrink-0 rounded-md bg-v2-overlay-simple-overlay-pressed p-0.5">
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
                aria-pressed={fileScope() === scope.id}
                aria-controls={files().length > 0 ? CODE_FILE_LIST_ID : undefined}
                data-selected={fileScope() === scope.id || undefined}
                class="rounded px-1.5 py-0.5 text-11-medium text-text-weak transition-colors hover:text-text-base focus-visible:outline focus-visible:outline-1 focus-visible:outline-v2-border-border-strong data-[selected]:bg-v2-background-bg-base data-[selected]:text-text-base"
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
                class="shrink-0 rounded text-text-faint transition-colors hover:text-text-base focus-visible:outline focus-visible:outline-1 focus-visible:outline-v2-border-border-strong"
                onClick={() => setFileFilter("")}
                aria-label={language.t("a11y.clearSearch")}
                title={language.t("a11y.clearSearch")}
              >
                <IconV2 name="xmark-small" size="small" />
              </button>
            </Show>
          </div>
        </Show>
        {/* Aquí había un botón Guardar que casi nunca estaba habilitado: el
            autoguardado escribe a los 500 ms de la última tecla y limpia
            `dirty`. En su lugar se informa del estado real de esa escritura. */}
        <Show when={selectedPath() && (saving() || dirty())}>
          <span role="status" class="shrink-0 text-11-regular text-text-faint">
            {saving() ? language.t("common.saving") : language.t("liveView.code.unsaved")}
          </span>
        </Show>
      </div>
      <div class="flex min-h-0 min-w-0 flex-1">
        <Show when={files().length > 0}>
          <aside
            id={CODE_FILE_LIST_ID}
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
            {/* Splitter arrastrable para redimensionar el sidebar de archivos.
                El azul fijo de Tailwind no existe en la paleta: el tema claro
                es el que se sirve por defecto y ahí desentonaba. */}
            <div
              role="separator"
              aria-orientation="vertical"
              class={`absolute top-0 -right-1 h-full w-2 cursor-col-resize z-30 transition-colors select-none ${
                isResizingSidebar() ? "bg-v2-border-border-strong" : "hover:bg-v2-border-border-muted"
              }`}
              onMouseDown={handleSidebarResizeStart}
              title={language.t("liveView.code.resizeSidebar")}
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
                          class="shrink-0 rounded p-1 text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-v2-border-border-strong"
                          onClick={() => {
                            setRenamePath(selectedPath() ?? "")
                            setIsRenaming(true)
                          }}
                          // No es "renombrar": la API de archivos sólo expone
                          // /fs/write, así que esto escribe el texto actual en
                          // la ruta que se teclee y deja la original intacta.
                          title={language.t("liveView.code.saveAs")}
                          aria-label={language.t("liveView.code.saveAs")}
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
                        aria-label={language.t("liveView.code.saveAs")}
                        onInput={(e) => setRenamePath(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename()
                          if (e.key === "Escape") setIsRenaming(false)
                        }}
                        autofocus
                      />
                      {/* Antes eran dos glifos sin nombre accesible, y el de
                          confirmar iba en blanco sobre --v2-state-bg-success,
                          que en tema claro es un verde muy claro. */}
                      <IconButtonV2
                        type="button"
                        variant="contrast"
                        size="small"
                        class="shrink-0"
                        onClick={() => void handleRename()}
                        title={language.t("liveView.code.saveAs")}
                        icon={<IconV2 name="check" size="small" />}
                      />
                      <IconButtonV2
                        type="button"
                        variant="ghost-muted"
                        size="small"
                        class="shrink-0"
                        onClick={() => setIsRenaming(false)}
                        title={language.t("common.cancel")}
                        icon={<IconV2 name="xmark-small" size="small" />}
                      />
                    </div>
                  </Show>
                  <div class="flex shrink-0 items-center gap-1">
                    <Show when={dirty()}>
                      <span class="text-11-regular font-medium text-v2-state-fg-warning" title={language.t("liveView.code.unsaved")}>
                        <span class="sr-only">{language.t("liveView.code.unsaved")}</span>
                        <span aria-hidden="true">●</span>
                      </span>
                    </Show>
                    {/* El visor es de lectura; editar sigue siendo posible y
                        sigue autoguardando, pero deja de ser el modo por
                        defecto del panel. */}
                    <IconButtonV2
                      type="button"
                      variant={editMode() ? "contrast" : "ghost-muted"}
                      size="small"
                      aria-pressed={editMode()}
                      onClick={() => setEditMode((value) => !value)}
                      title={editMode() ? language.t("liveView.code.editStop") : language.t("liveView.code.editStart")}
                      icon={<IconV2 name="edit" size="small" />}
                    />
                  </div>
                </div>
                <Show
                  when={editMode()}
                  fallback={
                    <ScrollView class="min-h-0 flex-1">
                      <Dynamic
                        component={fileComponent}
                        mode="text"
                        file={viewerFile()}
                        class="select-text"
                      />
                    </ScrollView>
                  }
                >
                  <CodeEditor
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
                    onExit={() => setEditMode(false)}
                  />
                </Show>
                {/* liveView.code.unavailable describe un panel que no se puede
                    leer; que falle la escritura es otra cosa. */}
                <Show when={saveFailed()}>
                  <div role="alert" class="flex shrink-0 items-center gap-2 border-t border-v2-border-border-muted px-3 py-1 text-11-regular text-v2-state-fg-danger">
                    <span class="min-w-0 flex-1 truncate">{language.t("liveView.code.saveFailed")}</span>
                    {/* `save()` sólo puede reintentar mientras quede borrador:
                        sin él no habría nada que escribir y el botón mentiría. */}
                    <Show when={dirty()}>
                      <ButtonV2 type="button" variant="outline" size="small" class="shrink-0" onClick={() => void save()} disabled={saving()}>
                        {language.t("livePreview.retry")}
                      </ButtonV2>
                    </Show>
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


export function LiveViewPanel(props: { onCapture?: (file: File) => void; expandable?: boolean; sessionID?: string }) {
  const language = useLanguage()
  const { view, tabs: sessionTabs } = useSessionLayout()
  const layout = useLayout()
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

  const sessionDiffs = createMemo(() => {
    const id = props.sessionID
    if (!id) return []
    return sync().data.session_diff[id] ?? []
  })

  const [activeEditFile, setActiveEditFile] = createSignal<string | undefined>()
  const [activeProjectDir, setActiveProjectDir] = createSignal<string | undefined>()
  const [manualProjectDir, setManualProjectDir] = createSignal<string | undefined>()
  const [projectSelectorOpen, setProjectSelectorOpen] = createSignal(false)
  const [customDirInput, setCustomDirInput] = createSignal("")

  const effectiveProjectDir = () => manualProjectDir() || activeProjectDir() || sdk().directory

  const activeProjectName = createMemo(() => {
    const dir = effectiveProjectDir()
    if (!dir) return language.t("liveView.project.fallbackName")
    const normalized = dir.replace(/\\/g, "/").replace(/\/+$/, "")
    const parts = normalized.split("/").filter(Boolean)
    return parts[parts.length - 1] || dir
  })

  const resolveProjectFolder = (fp: string, baseDir?: string): string | undefined => {
    if (!fp) return undefined
    let raw = fp.replace(/\\/g, "/")
    if (raw.startsWith("file:///")) raw = raw.slice(8)
    else if (raw.startsWith("file://")) raw = raw.slice(7)

    const normBase = baseDir ? baseDir.replace(/\\/g, "/").replace(/\/+$/, "") : ""
    const CONTAINER_NAMES = new Set([
      "desktop",
      "escritorio",
      "proyectos",
      "projects",
      "apps",
      "packages",
      "workspace",
      "workspaces",
      "repos",
      "repositories",
      "dev",
      "development",
      "code",
      "documents",
      "documentos",
      "users",
      "usuarios",
    ])

    // Si la ruta está dentro de normBase
    if (normBase && raw.toLowerCase().startsWith(normBase.toLowerCase())) {
      const rel = raw.slice(normBase.length).replace(/^\/+/, "")
      if (!rel) return normBase
      const parts = rel.split("/").filter(Boolean)
      if (parts.length === 0) return normBase
      let idx = 0
      while (idx < parts.length - 1 && CONTAINER_NAMES.has(parts[idx].toLowerCase())) {
        idx++
      }
      if (idx < parts.length) {
        return `${normBase}/${parts.slice(0, idx + 1).join("/")}`
      }
      return normBase
    }

    // Si es una ruta absoluta en Windows (C:/...)
    const winDriveMatch = /^[A-Za-z]:/i.exec(raw)
    if (winDriveMatch) {
      const drive = winDriveMatch[0]
      const rest = raw.slice(2).replace(/^\/+/, "")
      const parts = rest.split("/").filter(Boolean)
      if (parts.length === 0) return drive
      let idx = 0
      while (idx < parts.length - 1) {
        const pLower = parts[idx].toLowerCase()
        if (CONTAINER_NAMES.has(pLower)) {
          if ((pLower === "users" || pLower === "usuarios") && idx + 1 < parts.length - 1) {
            idx += 2
            continue
          }
          idx++
          continue
        }
        break
      }
      return `${drive}/${parts.slice(0, idx + 1).join("/")}`
    }

    // Si es una ruta absoluta en Unix (/home/...)
    if (raw.startsWith("/")) {
      const parts = raw.split("/").filter(Boolean)
      let idx = 0
      while (idx < parts.length - 1) {
        const pLower = parts[idx].toLowerCase()
        if (CONTAINER_NAMES.has(pLower)) {
          if ((pLower === "home" || pLower === "users") && idx + 1 < parts.length - 1) {
            idx += 2
            continue
          }
          idx++
          continue
        }
        break
      }
      return `/${parts.slice(0, idx + 1).join("/")}`
    }

    // Ruta relativa
    const parts = raw.split("/").filter(Boolean)
    if (parts.length === 0) return normBase || undefined
    let idx = 0
    while (idx < parts.length - 1 && CONTAINER_NAMES.has(parts[idx].toLowerCase())) {
      idx++
    }
    const projectRel = parts.slice(0, idx + 1).join("/")
    return normBase ? `${normBase}/${projectRel}` : projectRel
  }

  // Detección reactiva de proyecto activo desde múltiples fuentes del editor
  createEffect(() => {
    if (manualProjectDir()) return
    const dir = sdk().directory

    // 1. Pestaña activa del editor
    const activeTab = sessionTabs().active()
    if (activeTab && activeTab !== "review") {
      const folder = resolveProjectFolder(activeTab, dir)
      if (folder && folder !== activeProjectDir()) {
        setActiveProjectDir(folder)
        return
      }
    }

    // 2. Otras pestañas abiertas
    const allTabs = sessionTabs().all()
    for (const t of allTabs) {
      if (t && t !== "review") {
        const folder = resolveProjectFolder(t, dir)
        if (folder && folder !== activeProjectDir()) {
          setActiveProjectDir(folder)
          return
        }
      }
    }

    // 3. Archivo en revisión
    const reviewFile = view().review.file()
    if (reviewFile) {
      const folder = resolveProjectFolder(reviewFile, dir)
      if (folder && folder !== activeProjectDir()) {
        setActiveProjectDir(folder)
        return
      }
    }

    // 4. Directorio seleccionado en home
    const homeDir = layout.home.selection()?.directory
    if (homeDir) {
      const folder = resolveProjectFolder(homeDir, dir)
      if (folder && folder !== activeProjectDir()) {
        setActiveProjectDir(folder)
      }
    }
  })

  // Lista de proyectos conocidos para cambio rápido con un clic
  const knownProjectDirs = createMemo(() => {
    const list: string[] = []
    const seen = new Set<string>()
    const add = (dir?: string) => {
      if (!dir) return
      const norm = dir.replace(/\\/g, "/").replace(/\/+$/, "")
      if (!seen.has(norm.toLowerCase())) {
        seen.add(norm.toLowerCase())
        list.push(norm)
      }
    }
    add(effectiveProjectDir())
    add(sdk().directory)
    for (const diff of sessionDiffs()) {
      if (diff.file) add(resolveProjectFolder(diff.file, sdk().directory))
    }
    for (const tab of sessionTabs().all()) {
      if (tab && tab !== "review") add(resolveProjectFolder(tab, sdk().directory))
    }
    const homeDir = layout.home.selection()?.directory
    if (homeDir) add(resolveProjectFolder(homeDir, sdk().directory))
    return list
  })

  // Seguimiento en tiempo real de archivos modificados por cualquier modelo de IA
  createEffect(() => {
    const diffs = sessionDiffs()
    if (diffs.length > 0) {
      const latest = diffs[diffs.length - 1].file
      if (latest) {
        const folder = resolveProjectFolder(latest, sdk().directory)
        if (folder && !manualProjectDir() && folder !== activeProjectDir()) setActiveProjectDir(folder)
      }
      if (latest) {
        setActiveEditFile(latest)
        window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { path: latest } }))
      }
    }
  })

  // Inspeccionar partes de ejecución de herramientas (write, edit, apply_patch, bash, etc.)
  createEffect(() => {
    const parts = sync().data.part
    const dir = sdk().directory
    for (const key of Object.keys(parts)) {
      const list = parts[key]
      if (!list) continue
      for (const p of list) {
        if ((p as any).type === "tool") {
          const input = (p as any).input
          const cwd = input?.cwd || input?.directory || input?.workdir
          if (cwd && typeof cwd === "string") {
            const folder = resolveProjectFolder(cwd, dir)
            if (folder && !manualProjectDir() && folder !== activeProjectDir()) setActiveProjectDir(folder)
          }
          if (typeof input?.command === "string") {
            const cdMatch = /(?:^|\s)cd\s+["']?([^"'\n\r&;]+)["']?/i.exec(input.command)
            if (cdMatch?.[1]) {
              const folder = resolveProjectFolder(cdMatch[1].trim(), dir)
              if (folder && !manualProjectDir() && folder !== activeProjectDir()) setActiveProjectDir(folder)
            }
            if (/(?:run\s+dev|npm\s+start|bun\s+dev|vite|next\s+dev|cargo\s+run|python\s+.*\.py|flask|uvicorn|fastapi)/i.test(input.command)) {
              retryReloadDevServer(4, 750)
            }
          }
          const toolName = (p as any).tool
          const fp = input?.filePath || input?.path || (p as any).metadata?.filepath
          if (fp && typeof fp === "string") {
            const folder = resolveProjectFolder(fp, dir)
            if (folder && !manualProjectDir() && folder !== activeProjectDir()) setActiveProjectDir(folder)
            if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
              let rel = fp
              if (dir && rel.startsWith(dir)) {
                rel = rel.slice(dir.length).replace(/^[/\\]+/, "")
              }
              rel = rel.replace(/\\/g, "/")
              if (rel) {
                setActiveEditFile(rel)
                window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { path: rel } }))
              }
            }
          }
        }
      }
    }
  })

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
  const autoStartKey = createMemo(() => {
    const fromSnap = previewAutoStartKey(snapshot())
    if (fromSnap) return fromSnap
    const diffs = sessionDiffs()
    if (diffs.length > 0) return diffs.map((d) => d.file).join("|")
    return activeEditFile()
  })
  const browserTarget = () => embeddedPreviewTarget(liveViewManagedTarget(), effectiveProjectDir(), snapshot())

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

  const retryReloadDevServer = (attempts = 3, delay = 600) => {
    let count = 0
    const timer = window.setInterval(() => {
      count++
      if (!mounted) {
        window.clearInterval(timer)
        return
      }
      window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { reason: `dev-server-retry-${count}` } }))
      if (count >= attempts) window.clearInterval(timer)
    }, delay)
  }

  let lastReportedTarget: string | undefined
  createEffect(() => {
    const target = serverTarget()
    if (target && target !== lastReportedTarget) {
      lastReportedTarget = target
      window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { url: target, reason: "server-target-changed" } }))
    }
  })

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
      if (
        update.type === "file_added" ||
        update.type === "file_modified" ||
        update.type === "file_changed" ||
        update.type === "file_removed" ||
        update.type === "preview" ||
        update.type === "dev_server_restarted"
      ) {
        const rel = isRecord(update.data) && typeof update.data.rel === "string" ? update.data.rel : undefined
        window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { path: rel, reason: update.type } }))
      }
      if (update.type === "log" && isRecord(update.data) && typeof update.data.line === "string") {
        const line = update.data.line
        if (/(?:re-?started|ready in \d+|compiled (?:successfully|in)|server running at|Local:\s*http|listening on|vite.*ready|HMR connected)/i.test(line)) {
          window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { reason: "dev-server-ready" } }))
        }
      }
      if (update.type === "session_created" || update.type === "tree_changed") void loadSnapshot()
    })
    source.onopen = () => {
      if (!mounted || eventSource !== source) return
      latestEventAt = Date.now()
      stopFallbackPolling()
      void loadSnapshot().then(() => {
        window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { reason: "sse-reconnect" } }))
      })
    }
    source.onerror = () => {
      if (!mounted || eventSource !== source) return
      startFallbackPolling()
    }
  }

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey) {
        if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
          e.preventDefault()
          view().liveView.setTab("preview")
        } else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
          e.preventDefault()
          view().liveView.setTab("code")
        } else if (e.key === "i" || e.key === "I" || e.code === "KeyI") {
          e.preventDefault()
          if (content() !== "preview") {
            view().liveView.setTab("preview")
          }
          window.dispatchEvent(new CustomEvent("tiancode:toggle-inspector"))
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)

    connectLiveEvents()
    syncWorkspaceSession()
    staleEventTimer = window.setInterval(() => {
      if (!eventSource || Date.now() - latestEventAt <= LIVE_VIEW_SSE_STALE_MS) return
      startFallbackPolling()
    }, LIVE_VIEW_FALLBACK_POLL_MS)

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
    })
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

  const [viewportMode, setViewportMode] = createSignal<ViewportMode>("fluid")
  // Every press bumps `seq` so LivePreview applies it even when the highlight already matched.
  const [deviceRequestSeq, setDeviceRequestSeq] = createSignal(0)
  const requestDevice = (mode: ViewportMode) => {
    setViewportMode(mode)
    setDeviceRequestSeq((seq) => seq + 1)
  }

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
      class="flex size-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
    >
      <div class="@container flex h-11 min-w-0 shrink-0 items-center gap-2 border-b border-v2-border-border-muted bg-[linear-gradient(180deg,var(--v2-background-bg-base),var(--v2-overlay-simple-overlay-pressed))] px-2.5">
        <div
          class="flex shrink-0 items-center gap-1.5 rounded-md bg-v2-overlay-simple-overlay-hover px-1.5 py-1 text-13-medium text-text-base select-none"
          title={language.t("liveView.sandbox")}
        >
          <span class="size-1.5 rounded-full bg-[var(--v2-state-fg-success)]" aria-hidden="true" />
          <span class="hidden @[520px]:inline">{language.t("liveView.sandbox")}</span>
        </div>

        {/* Selector interactivo de proyecto/carpeta activa.
            shrink-[3]: la zona izquierda es la única que cede ancho, así el pill
            de pestañas del centro nunca se recorta al estrechar el panel. */}
        <div class="relative flex min-w-0 max-w-28 shrink-[3] items-center @[720px]:max-w-44">
          <button
            type="button"
            onClick={() => {
              setCustomDirInput(effectiveProjectDir() || "")
              setProjectSelectorOpen(!projectSelectorOpen())
            }}
            title={`${language.t("liveView.project.active", {
              dir: effectiveProjectDir() || language.t("liveView.project.default"),
            })}\n${language.t("liveView.project.changeHint")}`}
            // Por debajo de @[420px] el chip se queda sin texto visible, así que
            // el nombre accesible tiene que venir de aquí; incluye el nombre del
            // proyecto para que siga cumpliendo label-in-name cuando sí se ve.
            aria-label={language.t("liveView.project.change", { name: activeProjectName() })}
            aria-expanded={projectSelectorOpen()}
            class="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-v2-border-border-muted bg-v2-overlay-simple-overlay-pressed px-2 text-11-medium text-text-base hover:bg-v2-overlay-simple-overlay-hover hover:border-v2-border-border-strong transition-all max-w-[170px] @[720px]:max-w-[240px]"
          >
            <IconV2 name="folder" size="small" class="shrink-0 text-v2-icon-icon-accent" />
            <span class="hidden @[420px]:block truncate font-medium">{activeProjectName()}</span>
            <span class="hidden @[420px]:inline shrink-0 text-[9px] text-text-weak opacity-70" aria-hidden="true">
              ▼
            </span>
          </button>

          <Show when={projectSelectorOpen()}>
            <div
              class="absolute left-0 top-8 z-50 w-80 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base p-3 shadow-2xl text-12-regular"
              onClick={(e) => e.stopPropagation()}
            >
              <div class="flex items-center justify-between pb-2 border-b border-v2-border-border-muted mb-2.5">
                <div class="flex items-center gap-1.5 font-semibold text-text-base text-12-medium">
                  <IconV2 name="folder" size="small" class="shrink-0 text-v2-icon-icon-accent" />
                  <span>{language.t("liveView.project.title")}</span>
                </div>
                <button
                  type="button"
                  aria-label={language.t("common.close")}
                  title={language.t("common.close")}
                  class="text-text-weak hover:text-text-base px-1 text-12-regular"
                  onClick={() => setProjectSelectorOpen(false)}
                >
                  ✕
                </button>
              </div>

              <Show when={knownProjectDirs().length > 1}>
                <div class="mb-3">
                  <span class="block text-[10px] uppercase font-semibold tracking-wider text-text-weak mb-1.5">
                    {language.t("liveView.project.detected")}
                  </span>
                  <div class="flex flex-col gap-1 max-h-36 overflow-y-auto">
                    <For each={knownProjectDirs()}>
                      {(dir) => {
                        const isCurrent = () => dir.toLowerCase() === (effectiveProjectDir() || "").toLowerCase()
                        const folderName = () => {
                          const parts = dir.split("/").filter(Boolean)
                          return parts[parts.length - 1] || dir
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setManualProjectDir(dir)
                              setActiveProjectDir(dir)
                              setProjectSelectorOpen(false)
                            }}
                            class={`flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-11-regular transition-colors ${
                              isCurrent()
                                ? "bg-v2-state-bg-info text-v2-state-fg-info font-medium"
                                : "hover:bg-v2-overlay-simple-overlay-hover text-text-base"
                            }`}
                          >
                            <span class="flex min-w-0 items-center gap-1.5">
                              <IconV2 name="folder" size="small" class="shrink-0" />
                              <span class="truncate">{folderName()}</span>
                            </span>
                            <Show when={isCurrent()}>
                              <span class="shrink-0 text-[10px]">● {language.t("liveView.project.activeBadge")}</span>
                            </Show>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </div>
              </Show>

              <div class="mb-2.5">
                <label
                  for="live-view-project-path"
                  class="block text-[10px] uppercase font-semibold tracking-wider text-text-weak mb-1"
                >
                  {language.t("liveView.project.pathLabel")}
                </label>
                <input
                  id="live-view-project-path"
                  type="text"
                  value={customDirInput()}
                  onInput={(e) => setCustomDirInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = customDirInput().trim()
                      if (val) {
                        setManualProjectDir(val)
                        setActiveProjectDir(val)
                        setProjectSelectorOpen(false)
                      }
                    }
                  }}
                  placeholder={language.t("liveView.project.pathPlaceholder")}
                  class="w-full rounded border border-v2-border-border-muted bg-v2-overlay-simple-overlay-pressed px-2 py-1.5 text-11-regular font-mono text-text-base focus:border-v2-border-border-focus focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-2 justify-between pt-1 border-t border-v2-border-border-muted">
                <Show
                  when={manualProjectDir()}
                  fallback={
                    <span class="text-[10px] text-text-weak italic">{language.t("liveView.project.auto")}</span>
                  }
                >
                  <ButtonV2
                    type="button"
                    variant="ghost-muted"
                    size="small"
                    onClick={() => {
                      setManualProjectDir(undefined)
                      setActiveProjectDir(undefined)
                      setProjectSelectorOpen(false)
                    }}
                  >
                    {language.t("liveView.project.reset")}
                  </ButtonV2>
                </Show>
                <ButtonV2
                  type="button"
                  variant="contrast"
                  size="small"
                  class="ml-auto"
                  // El onClick ignora una ruta vacía, así que el botón lo dice.
                  disabled={!customDirInput().trim()}
                  onClick={() => {
                    const val = customDirInput().trim()
                    if (val) {
                      setManualProjectDir(val)
                      setActiveProjectDir(val)
                      setProjectSelectorOpen(false)
                    }
                  }}
                >
                  {language.t("liveView.project.apply")}
                </ButtonV2>
              </div>
            </div>
          </Show>
        </div>
        {/* flex-auto en vez de flex-1: con base 0 el factor de encogimiento
            efectivo también es 0 y esta zona quedaba fuera del reparto de ancho,
            así que su contenido se salía y `overflow-hidden` lo cortaba a medias.
            Con base automática sí participa y las pestañas se comprimen. */}
        <div class="flex min-w-0 flex-auto items-center justify-center-safe gap-2">
          <div
            role="tablist"
            aria-label={language.t("liveView.sandbox")}
            class="flex h-8 min-w-0 shrink rounded-lg border border-v2-border-border-muted bg-v2-overlay-simple-overlay-pressed p-0.5 shadow-inner"
          >
            <For each={tabs()}>
              {(tab) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab() === tab.id}
                  aria-controls="live-view-content"
                  data-selected={activeTab() === tab.id || undefined}
                  // aria-label repite la etiqueta visible para que la pestaña
                  // conserve nombre cuando por debajo de @[420px] sólo se ve el
                  // icono, y siga cumpliendo label-in-name cuando se ve el texto.
                  aria-label={tab.label}
                  class="flex h-full min-w-0 shrink items-center justify-center rounded-md px-2.5 text-12-medium text-text-weak transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base focus-visible:outline focus-visible:outline-1 focus-visible:outline-v2-border-border-strong data-[selected]:bg-v2-background-bg-base data-[selected]:text-text-base data-[selected]:shadow-[var(--v2-elevation-raised)]"
                  onClick={() => view().liveView.setTab(tab.id)}
                  title={`${tab.label} (${TAB_SHORTCUTS[tab.id]})`}
                >
                  <IconV2 name={TAB_ICONS[tab.id]} size="small" class="shrink-0 @[420px]:hidden" />
                  <span class="hidden @[420px]:block truncate">{tab.label}</span>
                  <span class="ml-1.5 hidden @[820px]:inline shrink-0 text-[10px] opacity-50 font-mono">
                    {TAB_SHORTCUTS[tab.id]}
                  </span>
                </button>
              )}
            </For>
          </div>

          {/* Selector de tamaño de ventana. Sustituye a la tira de cuatro
              emojis: `text-sky-400` no tiñe un emoji de color, así que la
              selección sólo se veía por el fondo, ninguno tenía nombre accesible
              ni semántica de radiogrupo, y entre los cuatro se comían ~100 px
              del encabezado. Un único botón de 28 px deja sitio a las pestañas. */}
          <Show when={content() === "preview"}>
            <MenuV2 gutter={4} modal={false} placement="bottom-end">
              <MenuV2.Trigger
                as={IconButtonV2}
                variant="ghost-muted"
                size="large"
                class="shrink-0"
                icon={<IconV2 name="monitor" />}
                aria-label={language.t("liveView.device.current", {
                  device: language.t(VIEWPORT_LABEL_KEYS[viewportMode()]),
                })}
                title={language.t("liveView.device.current", {
                  device: language.t(VIEWPORT_LABEL_KEYS[viewportMode()]),
                })}
              />
              <MenuV2.Portal>
                <MenuV2.Content>
                  <MenuV2.RadioGroup
                    value={viewportMode()}
                    onChange={(value) => requestDevice(value as ViewportMode)}
                  >
                    <MenuV2.GroupLabel>{language.t("liveView.device.label")}</MenuV2.GroupLabel>
                    <For each={VIEWPORT_MODES}>
                      {(mode) => (
                        <MenuV2.RadioItem value={mode}>{language.t(VIEWPORT_LABEL_KEYS[mode])}</MenuV2.RadioItem>
                      )}
                    </For>
                  </MenuV2.RadioGroup>
                </MenuV2.Content>
              </MenuV2.Portal>
            </MenuV2>
          </Show>
        </div>
        {/* shrink-0: IconButtonV2 no lo trae de serie y sin él los botones de la
            derecha se aplastarían antes que el chip de carpeta. */}
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          class="shrink-0"
          onClick={() => {
            void loadSnapshot()
            retryReloadDevServer(3, 500)
            window.dispatchEvent(new CustomEvent("tiancode:preview-reload", { detail: { force: true } }))
          }}
          aria-label={language.t("liveView.reloadAll")}
          title={language.t("liveView.reloadAll")}
          icon={<IconV2 name="reset" />}
        />
        <Show when={props.expandable}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="large"
            class="shrink-0"
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
          class="shrink-0"
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
        <div
          class="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden bg-v2-background-bg-base p-2"
          style={{ display: content() === "code" ? "none" : "flex" }}
          aria-hidden={content() === "code" || undefined}
        >
          {/* Sin `transition-all`: el ResizeObserver de LivePreview llama a
              queueBounds en cada fotograma de la transición, así que cambiar el
              ancho del panel disparaba ~18 remedidas y, en la ruta de
              WebContentsView, otros tantos setBounds por IPC. */}
          <div class="size-full flex flex-col">
            <LivePreview
              directory={effectiveProjectDir}
              targetUrl={browserTarget}
              autoStartKey={autoStartKey}
              activeEditFile={activeEditFile}
              externalDevice={() => ({ mode: viewportMode(), seq: deviceRequestSeq() })}
              onDeviceChange={(mode) => setViewportMode(mode)}
              onDirectoryChange={(dir) => {
                setActiveProjectDir(dir)
              }}
              onManagedTarget={(url) => {
                const directory = effectiveProjectDir()
                if (!directory || directory === "main") return
                setLiveViewManagedTarget((current) =>
                  url ? { directory, url } : current?.directory === directory ? undefined : current,
                )
              }}
              onCapture={props.onCapture}
              onOpenSource={(path) => {
                setRequestedCodePath(path)
                view().liveView.setTab("code")
              }}
            />
          </div>
        </div>
        <div
          class="size-full min-h-0 flex-1 flex flex-col overflow-hidden"
          style={{ display: content() === "code" ? "flex" : "none" }}
          aria-hidden={content() !== "code" || undefined}
        >
          <CodePane
            followPath={snapshot()?.current_file ?? activeEditFile() ?? undefined}
            requestedPath={requestedCodePath()}
            currentCode={snapshot()?.current_code}
            files={snapshot()?.files ?? sessionDiffs().map((d) => ({ rel: d.file, kind: "file" }))}
          />
        </div>
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
