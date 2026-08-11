import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { ScrollView } from "@tiancode-ai/ui/scroll-view"
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { normalizeUrl } from "@/components/preview-panel"
import { welcomePageUrl } from "@/utils/webview-welcome"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { PreviewViewSelection, PreviewViewState } from "@/context/platform"

// Estado del dev server gestionado por el agente (DevServerManager, /preview).
type DevServerState = {
  status: "idle" | "starting" | "ready" | "error" | "stopped"
  url: string | null
  port: number | null
  framework: string | null
  packageManager: string | null
  command: string | null
  errors: { file: string | null; line: number | null; message: string }[]
  startedAt: number | null
  errorMessage: string | null
}

// Panel "App" de la vista en vivo con WebContentsView: la página se dibuja
// fuera del DOM del renderer (bounds reportados del contenedor real vía IPC),
// así que todo lo que se superponga a la vista (avisos, inspector, consola)
// vive FUERA del contenedor, en la columna flex del panel.

const CONSOLE_MAX = 200
const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
const ZOOM_STEP = 0.2
const CUSTOM_MIN = 80
const CUSTOM_MAX = 4096

const DEVICE_PRESETS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const

type DeviceId = "fit" | keyof typeof DEVICE_PRESETS | "custom"

type ConsoleEntry = { id: number; level: number; message: string; line: number; sourceId: string }

// Secuencia de ids de la consola (solo para claves de <For> por instancia).
let consoleSeq = 0

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function ToolButton(props: {
  pressed?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      data-pressed={props.pressed || undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      aria-pressed={props.pressed}
      class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-11-regular text-text-weak transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base disabled:opacity-40 data-[pressed]:bg-v2-overlay-simple-overlay-active data-[pressed]:text-text-base"
    >
      {props.children}
    </button>
  )
}

export function LivePreview(props: {
  targetUrl?: () => string | undefined
  onCapture?: (file: File) => void
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const preview = () => platform.previewView
  const sdk = useSDK()
  const server = useServer()

  const [state, setState] = createSignal<PreviewViewState | null>(null)
  const [urlInput, setUrlInput] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [fail, setFail] = createSignal<{ code: number; description: string; url: string } | null>(null)
  const [consoleOpen, setConsoleOpen] = createSignal(false)
  const [consoleEntries, setConsoleEntries] = createSignal<ConsoleEntry[]>([])
  const [selectMode, setSelectMode] = createSignal(false)
  const [selection, setSelection] = createSignal<PreviewViewSelection | null>(null)
  const [copied, setCopied] = createSignal(false)
  const [zoom, setZoom] = createSignal(1)
  const [deviceId, setDeviceId] = createSignal<DeviceId>("fit")
  const [customSize, setCustomSize] = createSignal({ width: DEVICE_PRESETS.mobile.width, height: DEVICE_PRESETS.mobile.height })
  // Dev server gestionado por el agente (DevServerManager del backend).
  const [devServer, setDevServer] = createSignal<DevServerState | null>(null)

  let container: HTMLDivElement | undefined
  // La navegación manual (URL tecleada, atrás/adelante) gana sobre la
  // auto-detección del dev server; una URL nueva del agente la reanuda.
  let lastTargetUrl: string | undefined

  // Tamaño que debe ocupar la vista: null = llenar el contenedor (fit).
  const deviceSize = () => {
    const id = deviceId()
    if (id === "fit") return null
    if (id === "custom") return customSize()
    return DEVICE_PRESETS[id]
  }

  // Bounds del WebContentsView: rect del contenedor real del panel, o el
  // dispositivo centrado dentro de él. El main escala por el zoom de ventana.
  const reportBounds = () => {
    const view = preview()
    if (!view || !container) return
    const rect = container.getBoundingClientRect()
    const device = deviceSize()
    if (!device) {
      void view.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      return
    }
    const width = Math.min(device.width, rect.width)
    const height = Math.min(device.height, rect.height)
    void view.setBounds({
      x: rect.x + Math.round((rect.width - width) / 2),
      y: rect.y + Math.round((rect.height - height) / 2),
      width,
      height,
    })
  }

  const navigateTo = (target: string) => {
    if (!target) return
    setUrlInput(target)
    void preview()?.navigate(target)
  }

  const capture = async () => {
    if (busy()) return
    setBusy(true)
    try {
      const file = await platform.captureScreenshot?.("liveView")
      if (file) props.onCapture?.(file)
    } catch {
      // Sin captura disponible: la UI sigue usable.
    } finally {
      setBusy(false)
    }
  }

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  const zoomStep = (delta: number) => {
    const next = clamp(zoom() + delta, ZOOM_MIN, ZOOM_MAX)
    setZoom(next)
    void preview()?.setZoom(next)
  }

  // Modo seleccionar: el main inyecta el overlay en la página; al hacer clic
  // el script publica un marcador en la consola y el panel lee la selección.
  // Esc o un clic válido salen del modo (marcador "exit").
  const setSelectActive = (active: boolean) => {
    setSelectMode(active)
    void preview()?.setSelectMode(active)
  }

  // Dev server gestionado por el agente (DevServerManager): estado, logs y
  // acciones se leen del HttpApi /preview del servidor del agente.
  const devServerDirectory = () => {
    const dir = sdk().directory
    return dir && dir !== "main" ? dir : undefined
  }
  const devServerHeaders = () => {
    const http = server.current?.http
    const password = http?.password
    return password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username ?? "tiancode", password })}` }
      : undefined
  }
  const fetchDevServer = async () => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !headers || !url) return
    try {
      const res = await fetch(`${url}/preview/status?directory=${encodeURIComponent(dir)}`, { headers })
      if (res.ok) setDevServer((await res.json()) as DevServerState)
    } catch {
      // Servidor del agente no disponible: se conserva el último estado.
    }
  }
  const devServerAction = async (action: "start" | "stop" | "restart") => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !headers || !url) return
    try {
      const res = await fetch(`${url}/preview/${action}?directory=${encodeURIComponent(dir)}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}",
      })
      if (res.ok) setDevServer((await res.json()) as DevServerState)
    } catch {
      // Sin servidor del agente: la UI queda como está.
    }
  }

  onMount(() => {
    const view = preview()
    if (!view || !container) return
    reportBounds()
    void view.setVisible(true)
    void view.getState().then((snapshot) => {
      if (snapshot) setState(snapshot)
      // Sin URL cargada aún: página de bienvenida para no ver negro.
      if (!snapshot?.url) void view.navigate(welcomeUrl())
    })
    const unsubscribe = view.onEvent((event) => {
      if (event.type === "state") {
        setState(event.state)
        if (event.state.url) setUrlInput(event.state.url)
        if (event.state.loading) setFail(null)
        return
      }
      if (event.type === "fail") {
        setFail({ code: event.fail.code, description: event.fail.description, url: event.fail.url })
        return
      }
      // Consola de la página: ring buffer acotado + marcador de selección.
      setConsoleEntries((entries) => [
        ...entries.slice(-(CONSOLE_MAX - 1)),
        { id: ++consoleSeq, level: event.message.level, message: event.message.message, line: event.message.line, sourceId: event.message.sourceId },
      ])
      if (event.message.message.startsWith("[tiancode-selection]")) {
        const selected = event.message.message.includes("selected")
        setSelectActive(false)
        if (selected) void view.getSelection().then((value) => value && setSelection(value))
      }
    })
    const observer = new ResizeObserver(reportBounds)
    observer.observe(container)
    window.addEventListener("resize", reportBounds)
    window.addEventListener("fullscreenchange", reportBounds)
    void fetchDevServer()
    const devTimer = window.setInterval(fetchDevServer, 2000)
    onCleanup(() => {
      window.clearInterval(devTimer)
      observer.disconnect()
      window.removeEventListener("resize", reportBounds)
      window.removeEventListener("fullscreenchange", reportBounds)
      unsubscribe()
      // Panel cerrado o pestaña distinta: la vista se oculta (no se destruye,
      // conserva su sesión y URL hasta que la ventana cierre).
      void view.setVisible(false)
    })
  })

  // URL del agente / dev server detectado / tool-call del chat: navega y
  // reanuda la auto-navegación.
  createEffect(() => {
    const target = props.targetUrl?.()
    if (!target || target === lastTargetUrl) return
    lastTargetUrl = target
    navigateTo(target)
  })

  // Dev server gestionado por el agente: cuando queda listo y el panel aún
  // muestra la página de bienvenida, navega a la URL del servidor (HMR).
  createEffect(() => {
    const serverUrl = devServer()?.url
    if (!serverUrl) return
    const current = state()?.url
    if (!current || current.startsWith("data:")) navigateTo(serverUrl)
  })

  // Errores de compilación del dev server → banner en el panel.
  createEffect(() => {
    const dev = devServer()
    if (dev?.status !== "error") return
    if (dev.errors[0] && !fail()) {
      setFail({ code: 0, description: dev.errors[0].message, url: dev.errors[0].file ?? "" })
    }
  })

  // Cambio de dispositivo (preset/custom/fit): re-posiciona la vista.
  createEffect(() => {
    void deviceSize()
    reportBounds()
  })

  const welcomeUrl = () => welcomePageUrl(language.t("liveView.appEmpty"))
  const url = () => state()?.url ?? ""

  const navigateFromInput = () => {
    const target = normalizeUrl(urlInput())
    if (!target) return
    navigateTo(target)
  }

  const goBack = () => {
    void preview()?.back()
  }

  const goForward = () => {
    void preview()?.forward()
  }

  const deviceOptions = () => [
    { id: "fit" as const, label: language.t("livePreview.fit") },
    { id: "desktop" as const, label: `${language.t("livePreview.device.desktop")} 1440×900` },
    { id: "laptop" as const, label: `${language.t("livePreview.device.laptop")} 1280×800` },
    { id: "tablet" as const, label: `${language.t("livePreview.device.tablet")} 768×1024` },
    { id: "mobile" as const, label: `${language.t("livePreview.device.mobile")} 390×844` },
    { id: "custom" as const, label: language.t("livePreview.device.custom") },
  ]

  const setCustomDimension = (axis: "width" | "height", value: string) => {
    const parsed = Number.parseInt(value, 10)
    setCustomSize((size) => ({ ...size, [axis]: Number.isFinite(parsed) ? clamp(parsed, CUSTOM_MIN, CUSTOM_MAX) : size[axis] }))
  }

  const statusTone = () => {
    const dev = devServer()
    if (dev) {
      if (dev.status === "ready") return "bg-[var(--v2-state-fg-success)]"
      if (dev.status === "starting") return "bg-[var(--v2-state-fg-warning)]"
      if (dev.status === "error") return "bg-[var(--v2-state-fg-danger)]"
      return "bg-[var(--v2-state-fg-info)]"
    }
    if (fail()) return "bg-[var(--v2-state-fg-danger)]"
    if (state()?.loading) return "bg-[var(--v2-state-fg-warning)]"
    return "bg-[var(--v2-state-fg-success)]"
  }

  const devServerStatusLabel = () => {
    const dev = devServer()
    if (!dev) return undefined
    if (dev.status === "starting") return language.t("livePreview.starting")
    if (dev.status === "ready") return language.t("livePreview.ready")
    if (dev.status === "stopped") return language.t("livePreview.stopped")
    if (dev.status === "error") return language.t("livePreview.serverError")
    return language.t("livePreview.idle")
  }

  const devServerRunning = () => devServer()?.status === "ready" || devServer()?.status === "starting"

  return (
    <div class="flex size-full min-h-0 flex-col" role="region" aria-label={language.t("liveView.tab.app")}>
      {/* Fila 1: navegación (igual que el webview anterior). */}
      <div class="flex h-9 shrink-0 items-center gap-1 border-b border-v2-border-border-muted px-1.5">
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!state()?.canGoBack}
          onClick={goBack}
          aria-label={language.t("preview.back")}
          title={language.t("preview.back")}
          icon={<IconV2 name="arrow-left" />}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!state()?.canGoForward}
          onClick={goForward}
          aria-label={language.t("preview.forward")}
          title={language.t("preview.forward")}
          icon={<IconV2 name="arrow-right" />}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          onClick={() => void preview()?.reload()}
          aria-label={language.t("liveView.refresh")}
          title={language.t("liveView.refresh")}
          icon={<IconV2 name="reset" />}
        />
        <input
          class="h-7 min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-2 text-12-regular text-text-base outline-none focus:border-v2-border-border-strong"
          value={urlInput()}
          onInput={(event) => setUrlInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") navigateFromInput()
          }}
          placeholder={language.t("liveView.url")}
          spellcheck={false}
          aria-label={language.t("liveView.url")}
        />
        <Show when={url()}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="small"
            onClick={() => platform.openExternal(url())}
            aria-label={language.t("liveView.openExternal")}
            title={language.t("liveView.openExternal")}
            icon={<IconV2 name="outline-square-arrow" />}
          />
        </Show>
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={busy()}
          onClick={() => void capture()}
          aria-label={language.t("liveView.capture")}
          title={language.t("liveView.capture")}
          icon={<IconV2 name="monitor" />}
        />
      </div>

      {/* Fila 2: estado, dev server, dispositivo, zoom, seleccionar, consola. */}
      <div class="flex h-8 shrink-0 items-center gap-1 border-b border-v2-border-border-muted px-1.5">
        <span
          class={`size-1.5 shrink-0 rounded-full ${statusTone()}`}
          title={devServerStatusLabel() ?? (url() || undefined)}
          aria-hidden="true"
        />
        <Show when={devServerDirectory()}>
          <ToolButton
            title={language.t("livePreview.start")}
            disabled={devServerRunning()}
            onClick={() => void devServerAction("start")}
          >
            ▶
          </ToolButton>
          <ToolButton
            title={language.t("livePreview.stop")}
            disabled={devServer()?.status !== "ready" && devServer()?.status !== "starting"}
            onClick={() => void devServerAction("stop")}
          >
            ■
          </ToolButton>
          <ToolButton
            title={language.t("livePreview.restart")}
            disabled={!devServerRunning()}
            onClick={() => void devServerAction("restart")}
          >
            ↻
          </ToolButton>
        </Show>
        <SelectV2
          appearance="base"
          class="w-32 shrink-0"
          options={deviceOptions()}
          current={deviceOptions().find((option) => option.id === deviceId())}
          placement="bottom-end"
          gutter={4}
          value={(option) => option.id}
          label={(option) => option.label}
          onSelect={(option) => option && setDeviceId(option.id)}
        />
        <Show when={deviceId() === "custom"}>
          <input
            type="number"
            min={CUSTOM_MIN}
            max={CUSTOM_MAX}
            value={customSize().width}
            onInput={(event) => setCustomDimension("width", event.currentTarget.value)}
            class="h-6 w-14 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-1.5 text-11-regular text-text-base outline-none focus:border-v2-border-border-strong"
            aria-label={language.t("livePreview.custom.width")}
          />
          <span class="text-11-regular text-text-faint" aria-hidden="true">
            ×
          </span>
          <input
            type="number"
            min={CUSTOM_MIN}
            max={CUSTOM_MAX}
            value={customSize().height}
            onInput={(event) => setCustomDimension("height", event.currentTarget.value)}
            class="h-6 w-14 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-1.5 text-11-regular text-text-base outline-none focus:border-v2-border-border-strong"
            aria-label={language.t("livePreview.custom.height")}
          />
        </Show>
        <div class="flex items-center">
          <ToolButton title={language.t("livePreview.zoomOut")} onClick={() => zoomStep(-ZOOM_STEP)}>
            −
          </ToolButton>
          <span class="min-w-10 text-center text-11-regular text-text-weak tabular-nums">
            {Math.round(zoom() * 100)}%
          </span>
          <ToolButton title={language.t("livePreview.zoomIn")} onClick={() => zoomStep(ZOOM_STEP)}>
            +
          </ToolButton>
        </div>
        <div class="flex-1" />
        <ToolButton
          pressed={selectMode()}
          title={language.t("livePreview.select")}
          onClick={() => setSelectActive(!selectMode())}
        >
          {language.t("livePreview.select")}
        </ToolButton>
        <ToolButton
          pressed={consoleOpen()}
          title={language.t("livePreview.console")}
          onClick={() => setConsoleOpen(!consoleOpen())}
        >
          {language.t("livePreview.console")}
        </ToolButton>
      </div>

      <Show when={selectMode()}>
        <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3 py-1.5 text-11-regular text-[var(--v2-state-fg-info)]">
          {language.t("livePreview.selectHint")}
        </div>
      </Show>

      <Show when={fail()}>
        {(failed) => (
          <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3 py-1.5 text-11-regular text-[var(--v2-state-fg-danger)]">
            <span class="min-w-0 flex-1 truncate" title={failed().description}>
              {language.t("livePreview.loadFailed", { url: failed().url, description: failed().description })}
            </span>
            <button
              type="button"
              class="shrink-0 text-text-faint hover:text-text-base"
              onClick={() => setFail(null)}
              aria-label={language.t("common.close")}
            >
              <IconV2 name="xmark-small" size="small" />
            </button>
          </div>
        )}
      </Show>

      {/* Contenedor real del preview: sus bounds (getBoundingClientRect) son
          los del WebContentsView. Nada de la UI del panel se superpone aquí. */}
      <div class="relative min-h-0 flex-1 overflow-hidden bg-v2-background-bg-base" ref={container} />

      <Show when={selection()}>
        {(selected) => (
          <div class="shrink-0 border-t border-v2-border-border-muted bg-v2-background-bg-base px-3 py-2">
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-11-medium text-text-weak">{language.t("livePreview.selection.title")}</span>
              <span class="min-w-0 flex-1 truncate font-mono text-11-regular text-text-base">
                {selected().tag}
                <Show when={selected().text} fallback={null}>
                  {" "}· {selected().text}
                </Show>
              </span>
              <button
                type="button"
                class="shrink-0 text-text-faint hover:text-text-base"
                onClick={() => setSelection(null)}
                aria-label={language.t("common.close")}
              >
                <IconV2 name="xmark-small" size="small" />
              </button>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 font-mono text-11-regular text-text-weak">
              <span class="truncate" title={selected().selector}>
                {language.t("livePreview.selection.selector")}: {selected().selector}
              </span>
              <span>
                {language.t("livePreview.selection.size")}: {selected().dims.width}×{selected().dims.height}
              </span>
              <span class="truncate" title={selected().pathname}>
                {language.t("livePreview.selection.route")}: {selected().pathname}
              </span>
            </div>
            <div class="mt-1.5 flex items-center gap-1">
              <ToolButton title={language.t("livePreview.selection.copySelector")} onClick={() => copyText(selected().selector)}>
                {copied() ? language.t("livePreview.selection.copied") : language.t("livePreview.selection.copySelector")}
              </ToolButton>
              <ToolButton title={language.t("livePreview.selection.copyData")} onClick={() => copyText(JSON.stringify(selected(), null, 2))}>
                {language.t("livePreview.selection.copyData")}
              </ToolButton>
            </div>
          </div>
        )}
      </Show>

      <Show when={consoleOpen()}>
        <div class="shrink-0 border-t border-v2-border-border-muted">
          <div class="flex h-7 items-center justify-between border-b border-v2-border-border-muted px-2">
            <span class="text-11-medium text-text-weak">{language.t("livePreview.console")}</span>
            <button
              type="button"
              class="text-11-regular text-text-weak transition-colors hover:text-text-base"
              onClick={() => setConsoleEntries([])}
            >
              {language.t("livePreview.console.clear")}
            </button>
          </div>
          <Show
            when={consoleEntries().length > 0}
            fallback={
              <div class="flex h-10 items-center justify-center px-3 text-11-regular text-text-faint">
                {language.t("livePreview.console.empty")}
              </div>
            }
          >
            <ScrollView class="max-h-36">
              <div class="min-w-max px-2 py-1">
                <For each={consoleEntries()}>
                  {(entry) => (
                    <div
                      class={`whitespace-pre-wrap break-all font-mono text-11-regular ${
                        entry.level >= 3
                          ? "text-[var(--v2-state-fg-danger)]"
                          : entry.level === 2
                            ? "text-[var(--v2-state-fg-warning)]"
                            : "text-text-weak"
                      }`}
                      title={entry.sourceId ? `${entry.sourceId}:${entry.line}` : undefined}
                    >
                      {entry.message}
                    </div>
                  )}
                </For>
              </div>
            </ScrollView>
          </Show>
        </div>
      </Show>
    </div>
  )
}
