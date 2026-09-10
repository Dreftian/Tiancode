import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { previewWebContentsId } from "./preview-panel"
import "./capture-control.css"

// Captura de pantalla para el chat: adjunta la imagen como media part para
// que el modelo (con un MCP de visión como agent-vision) la analice aunque no
// tenga visión nativa. Opciones: pantalla completa, ventana de la app, área
// seleccionada con el ratón, o lo que muestra el navegador interno.

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export type CaptureArea = { x: number; y: number; width: number; height: number }

// Overlay de selección de área: muestra la captura de pantalla completa y
// deja dibujar un rectángulo; al confirmar devuelve los bounds en coordenadas
// de la imagen natural (el main recorta la captura con ellos).
function AreaOverlay(props: {
  imageUrl: string
  width: number
  height: number
  onCancel: () => void
  onConfirm: (bounds: CaptureArea) => void
}) {
  const language = useLanguage()
  const [rect, setRect] = createSignal<CaptureArea | undefined>(undefined)
  let start: { x: number; y: number } | undefined
  let imageElement: HTMLImageElement | undefined

  const currentRect = createMemo(() => {
    const current = rect()
    return current && current.width > 0 ? current : undefined
  })

  // Convierte coords del elemento (imagen escalada y centrada) a coords de la
  // imagen natural; la escala es uniforme por object-fit: contain.
  const toImageCoords = (clientX: number, clientY: number) => {
    const el = imageElement!
    const bounds = el.getBoundingClientRect()
    const scaleX = props.width / bounds.width
    const scaleY = props.height / bounds.height
    return { x: (clientX - bounds.left) * scaleX, y: (clientY - bounds.top) * scaleY }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !imageElement) return
    start = toImageCoords(event.clientX, event.clientY)
    setRect({ x: start.x, y: start.y, width: 0, height: 0 })
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!start) return
    const current = toImageCoords(event.clientX, event.clientY)
    setRect({
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    })
  }

  const onPointerUp = () => {
    const current = rect()
    start = undefined
    if (current && current.width >= 8 && current.height >= 8) setRect(current)
  }

  const confirm = () => {
    const current = rect()
    if (!current || current.width < 8 || current.height < 8) return
    props.onConfirm(current)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onCancel()
    if (event.key === "Enter") confirm()
  }

  return (
    <div
      class="capture-area-overlay"
      role="dialog"
      aria-label={language.t("capture.area.title")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div class="capture-area-stage">
        <img ref={imageElement} src={props.imageUrl} alt="" draggable={false} />
        <Show when={currentRect()}>
          {(current) => (
            <div
              class="capture-area-rect"
              style={{
                left: `${(current().x / props.width) * 100}%`,
                top: `${(current().y / props.height) * 100}%`,
                width: `${(current().width / props.width) * 100}%`,
                height: `${(current().height / props.height) * 100}%`,
              }}
            >
              <span class="capture-area-size">
                {Math.round(current().width)} × {Math.round(current().height)}
              </span>
            </div>
          )}
        </Show>
      </div>
      <div class="capture-area-actions">
        <button type="button" class="capture-area-btn" onClick={props.onCancel}>
          {language.t("capture.area.cancel")}
        </button>
        <button type="button" class="capture-area-btn capture-area-btn-primary" onClick={confirm} disabled={!rect()}>
          {language.t("capture.area.confirm")}
        </button>
      </div>
    </div>
  )
}

export function CaptureControl(props: { onCapture: (file: File) => void }) {
  const language = useLanguage()
  const platform = usePlatform()
  const [busy, setBusy] = createSignal(false)
  const [areaImage, setAreaImage] = createSignal<string | undefined>(undefined)
  const [areaSize, setAreaSize] = createSignal<{ width: number; height: number } | undefined>(undefined)

  const areaState = createMemo(() => {
    const url = areaImage()
    const size = areaSize()
    return url && size ? { imageUrl: url, width: size.width, height: size.height } : undefined
  })

  const capture = async (kind: "screen" | "window" | "preview", webContentsId?: number) => {
    if (busy()) return
    setBusy(true)
    try {
      const file = await platform.captureScreenshot?.(kind, webContentsId ? { webContentsId } : undefined)
      if (file) props.onCapture(file)
    } catch {
      // Sin captura disponible: no hacer nada (la UI sigue usable).
    } finally {
      setBusy(false)
    }
  }

  const startArea = async () => {
    if (busy()) return
    setBusy(true)
    try {
      const file = await platform.captureScreenshot?.("screen")
      if (!file) return
      const url = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        setAreaSize({ width: image.naturalWidth, height: image.naturalHeight })
        setAreaImage(url)
      }
      image.src = url
    } catch {
      // Sin captura disponible.
    } finally {
      setBusy(false)
    }
  }

  const confirmArea = async (bounds: CaptureArea) => {
    const imageUrl = areaImage()
    setAreaImage(undefined)
    setAreaSize(undefined)
    try {
      const file = await platform.captureScreenshot?.("area", { bounds })
      if (file) props.onCapture(file)
    } catch {
      // Sin captura disponible.
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }

  const cancelArea = () => {
    const imageUrl = areaImage()
    setAreaImage(undefined)
    setAreaSize(undefined)
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  }

  onCleanup(() => {
    const imageUrl = areaImage()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  })

  return (
    <>
      <MenuV2 placement="bottom-start">
        <MenuV2.Trigger
          as="button"
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-50"
          disabled={busy()}
          aria-label={language.t("capture.menu.title")}
          title={language.t("capture.menu.title")}
        >
          <CameraIcon />
        </MenuV2.Trigger>
        <MenuV2.Portal>
          <MenuV2.Content>
            <MenuV2.Item onSelect={() => void capture("screen")}>
              {language.t("capture.screen")}
            </MenuV2.Item>
            <MenuV2.Item onSelect={() => void capture("window")}>
              {language.t("capture.window")}
            </MenuV2.Item>
            <MenuV2.Item onSelect={() => void startArea()}>
              {language.t("capture.area")}
            </MenuV2.Item>
            <MenuV2.Item onSelect={() => void capture("preview", previewWebContentsId())} disabled={!previewWebContentsId()}>
              {language.t("capture.preview")}
            </MenuV2.Item>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>
      <Show when={areaState()}>
        {(state) => (
          <AreaOverlay
            imageUrl={state().imageUrl}
            width={state().width}
            height={state().height}
            onCancel={cancelArea}
            onConfirm={(bounds) => void confirmArea(bounds)}
          />
        )}
      </Show>
    </>
  )
}
