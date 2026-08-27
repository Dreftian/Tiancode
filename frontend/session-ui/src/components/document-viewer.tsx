import { useI18n } from "@tiancode-ai/ui/context/i18n"
import { createSignal, For, on, onCleanup, onMount, Show, Switch, Match, createEffect } from "solid-js"
import { decodeBase64Bytes, type DocumentKind } from "../pierre/media"
import "./document-viewer.css"

export type DocumentViewerProps = {
  kind: DocumentKind
  base64: string
  path?: string
  onLoad?: () => void
  onError?: () => void
}

// The three renderers pull heavy libraries (pdfjs, docx-preview, xlsx) only
// when their document kind actually renders, so the main bundle never pays for
// them. See AGENTS.md: keep heavy modules out of startup-sensitive paths.
export function DocumentViewer(props: DocumentViewerProps) {
  return (
    <div class="document-viewer" data-kind={props.kind} data-component="document-viewer">
      <Switch>
        <Match when={props.kind === "pdf"}>
          <PdfDocument base64={props.base64} onLoad={props.onLoad} onError={props.onError} />
        </Match>
        <Match when={props.kind === "docx"}>
          <DocxDocument base64={props.base64} onLoad={props.onLoad} onError={props.onError} />
        </Match>
        <Match when={props.kind === "xlsx"}>
          <XlsxDocument base64={props.base64} onLoad={props.onLoad} onError={props.onError} />
        </Match>
      </Switch>
    </div>
  )
}

type DocProps = { base64: string; onLoad?: () => void; onError?: () => void }

function Status(props: { state: "loading" | "error" }) {
  const i18n = useI18n()
  return (
    <div class="document-viewer-status" data-state={props.state}>
      {i18n.t(props.state === "loading" ? "ui.documentViewer.loading" : "ui.documentViewer.error")}
    </div>
  )
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function PdfDocument(props: DocProps) {
  const i18n = useI18n()
  const [total, setTotal] = createSignal(0)
  const [current, setCurrent] = createSignal(1)
  const [zoom, setZoom] = createSignal(1)
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading")

  let pdf: import("pdfjs-dist").PDFDocumentProxy | undefined
  let pdfTask: { destroy: () => Promise<void> } | undefined
  let scroll: HTMLDivElement | undefined
  const pageElements = new Map<number, HTMLDivElement>()
  const pageCanvases = new Map<number, HTMLCanvasElement>()
  const thumbCanvases = new Map<number, HTMLCanvasElement>()
  const renderedAt = new Map<number, string>()
  const thumbRendered = new Set<number>()
  let scrollFrame: number | undefined
  let disposed = false

  const pages = () => Array.from({ length: total() }, (_, i) => i + 1)

  onMount(async () => {
    try {
      const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist")
      const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      GlobalWorkerOptions.workerSrc = workerUrl
      const bytes = decodeBase64Bytes(props.base64)
      if (!bytes) throw new Error("invalid base64 payload")
      const task = getDocument({ data: bytes })
      pdfTask = task
      const loaded = await task.promise
      if (disposed) {
        void task.destroy()
        return
      }
      pdf = loaded
      setTotal(loaded.numPages)
      setState("ready")
      props.onLoad?.()
    } catch (err) {
      console.warn("[document-viewer] failed to load pdf", err)
      setState("error")
      props.onError?.()
    }
  })

  onCleanup(() => {
    disposed = true
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
    void pdfTask?.destroy()
    pdf = undefined
  })

  async function renderPage(n: number) {
    if (!pdf) return
    const canvas = pageCanvases.get(n)
    if (!canvas) return
    const key = `${n}:${zoom()}`
    if (renderedAt.get(n) === key) return
    try {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const width = canvas.parentElement?.clientWidth ?? canvas.clientWidth ?? base.width
      const viewport = page.getViewport({ scale: (width / base.width) * zoom() })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      renderedAt.set(n, key)
    } catch (err) {
      console.warn("[document-viewer] failed to render pdf page", n, err)
    }
  }

  async function renderThumb(n: number) {
    if (!pdf || thumbRendered.has(n)) return
    const canvas = thumbCanvases.get(n)
    if (!canvas) return
    try {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 72 / base.width })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      thumbRendered.add(n)
    } catch {
      // thumbnails are best-effort; the main page render reports errors
    }
  }

  let pageObserver: IntersectionObserver | undefined
  let thumbObserver: IntersectionObserver | undefined

  createEffect(() => {
    if (state() !== "ready") return
    pageObserver?.disconnect()
    thumbObserver?.disconnect()
    pageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const n = Number((entry.target as HTMLElement).dataset.page)
          void renderPage(n)
        }
      },
      { root: scroll, rootMargin: "600px 0px" },
    )
    thumbObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const n = Number((entry.target as HTMLElement).dataset.page)
          void renderThumb(n)
        }
      },
      { root: scroll, rootMargin: "600px 0px" },
    )
    for (const element of pageElements.values()) pageObserver.observe(element)
    for (const canvas of thumbCanvases.values()) thumbObserver.observe(canvas)
    onCleanup(() => {
      pageObserver?.disconnect()
      thumbObserver?.disconnect()
    })
  })

  // Zoom changes invalidate every rendered page so visible canvases redraw.
  createEffect(
    on(
      zoom,
      () => {
        renderedAt.clear()
        for (const n of pageElements.keys()) {
          const element = pageElements.get(n)
          if (!element || !scroll) continue
          const rect = element.getBoundingClientRect()
          const host = scroll.getBoundingClientRect()
          if (rect.bottom < host.top || rect.top > host.bottom) continue
          void renderPage(n)
        }
      },
      { defer: true },
    ),
  )

  const onScroll = () => {
    if (scrollFrame !== undefined) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined
      if (!scroll) return
      const host = scroll.getBoundingClientRect()
      const midline = host.top + host.height / 2
      let nearest = current()
      let distance = Number.POSITIVE_INFINITY
      for (const [n, element] of pageElements) {
        const rect = element.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const delta = Math.abs(center - midline)
        if (delta < distance) {
          distance = delta
          nearest = n
        }
      }
      if (nearest !== current()) setCurrent(nearest)
    })
  }

  const scrollToPage = (n: number) => {
    const target = clamp(n, 1, Math.max(1, total()))
    pageElements.get(target)?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <div class="document-viewer-pdf">
      <div class="document-viewer-toolbar">
        <div class="document-viewer-toolbar-group">
          <button
            type="button"
            class="document-viewer-tool"
            aria-label={i18n.t("ui.documentViewer.zoomOut")}
            onClick={() => setZoom((value) => clamp(Math.round((value - 0.25) * 100) / 100, 0.5, 3))}
          >
            −
          </button>
          <span class="document-viewer-toolbar-zoom">{Math.round(zoom() * 100)}%</span>
          <button
            type="button"
            class="document-viewer-tool"
            aria-label={i18n.t("ui.documentViewer.zoomIn")}
            onClick={() => setZoom((value) => clamp(Math.round((value + 0.25) * 100) / 100, 0.5, 3))}
          >
            +
          </button>
        </div>
        <div class="document-viewer-toolbar-group">
          <button
            type="button"
            class="document-viewer-tool"
            disabled={current() <= 1}
            aria-label={i18n.t("ui.documentViewer.previousPage")}
            onClick={() => scrollToPage(current() - 1)}
          >
            ‹
          </button>
          <span class="document-viewer-toolbar-pages">
            {i18n.t("ui.documentViewer.pages", { current: current(), total: total() })}
          </span>
          <button
            type="button"
            class="document-viewer-tool"
            disabled={current() >= total()}
            aria-label={i18n.t("ui.documentViewer.nextPage")}
            onClick={() => scrollToPage(current() + 1)}
          >
            ›
          </button>
        </div>
      </div>
      <Show
        when={state() === "ready"}
        fallback={<Status state={state() === "error" ? "error" : "loading"} />}
      >
        <div class="document-viewer-pdf-body">
          <div class="document-viewer-thumbs">
            <For each={pages()}>
              {(n) => (
                <button
                  type="button"
                  class="document-viewer-thumb"
                  data-active={current() === n ? "" : undefined}
                  aria-label={i18n.t("ui.documentViewer.pageLabel", { page: n })}
                  onClick={() => scrollToPage(n)}
                >
                  <canvas ref={(canvas) => thumbCanvases.set(n, canvas)} data-page={n} />
                </button>
              )}
            </For>
          </div>
          <div class="document-viewer-scroll" ref={scroll} onScroll={onScroll}>
            <For each={pages()}>
              {(n) => (
                <div class="document-viewer-page" data-page={n} ref={(element) => pageElements.set(n, element)}>
                  <canvas ref={(canvas) => pageCanvases.set(n, canvas)} />
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}

function DocxDocument(props: DocProps) {
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading")
  let container: HTMLDivElement | undefined

  onMount(async () => {
    try {
      const { renderAsync } = await import("docx-preview")
      const bytes = decodeBase64Bytes(props.base64)
      if (!bytes) throw new Error("invalid base64 payload")
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      await renderAsync(blob, container!)
      setState("ready")
      props.onLoad?.()
    } catch (err) {
      console.warn("[document-viewer] failed to render docx", err)
      setState("error")
      props.onError?.()
    }
  })

  return (
    <Show when={state() === "ready"} fallback={<Status state={state() === "error" ? "error" : "loading"} />}>
      <div class="document-viewer-docx" ref={container} />
    </Show>
  )
}

function XlsxDocument(props: DocProps) {
  const i18n = useI18n()
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading")
  const [sheets, setSheets] = createSignal<string[]>([])
  const [active, setActive] = createSignal("")
  let table: HTMLDivElement | undefined
  let workbook: import("xlsx").WorkBook | undefined
  let xlsx: typeof import("xlsx") | undefined
  let purge: ((html: string) => string) | undefined

  onMount(async () => {
    try {
      xlsx = await import("xlsx")
      const DOMPurify = (await import("dompurify")).default
      purge = (html) => DOMPurify.sanitize(html)
      const bytes = decodeBase64Bytes(props.base64)
      if (!bytes) throw new Error("invalid base64 payload")
      workbook = xlsx.read(bytes, { type: "array" })
      setSheets(workbook.SheetNames)
      setActive(workbook.SheetNames[0] ?? "")
      setState("ready")
      props.onLoad?.()
    } catch (err) {
      console.warn("[document-viewer] failed to render xlsx", err)
      setState("error")
      props.onError?.()
    }
  })

  createEffect(
    on(
      active,
      (name) => {
        if (!workbook || !table || !name || !purge || !xlsx) return
        const sheet = workbook.Sheets[name]
        if (!sheet) return
        table.innerHTML = purge(xlsx.utils.sheet_to_html(sheet, { header: "", footer: "" }))
      },
      { defer: true },
    ),
  )

  return (
    <Show when={state() === "ready"} fallback={<Status state={state() === "error" ? "error" : "loading"} />}>
      <div class="document-viewer-xlsx">
        <div class="document-viewer-toolbar">
          <label class="document-viewer-toolbar-group">
            <span class="document-viewer-sheet-label">{i18n.t("ui.documentViewer.sheet")}</span>
            <select
              class="document-viewer-sheet-select"
              value={active()}
              onChange={(event) => setActive(event.currentTarget.value)}
            >
              <For each={sheets()}>{(name) => <option value={name}>{name}</option>}</For>
            </select>
          </label>
        </div>
        <div class="document-viewer-xlsx-body" ref={table} />
      </div>
    </Show>
  )
}
