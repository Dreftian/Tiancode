/**
 * Design mode: pick an element of the previewed page and hand it to the chat.
 *
 * The picker always runs inside the page, because a dev server is another origin than the app.
 * In the iframe it reports picks with postMessage (DESIGN_PICKER_SCRIPT below); the desktop
 * native view runs a twin script from frontend/desktop/src/main/preview-view.ts that reports
 * through the main process. Both produce a PickedElement.
 */
export type PickedElement = {
  tag: string
  id: string
  classes: string
  selector: string
  text: string
  html: string
  styles: string
  margin: string
  padding: string
  url: string
  /** CSS pixels, relative to the page's viewport. */
  rect: { x: number; y: number; width: number; height: number }
  viewport: { width: number; height: number }
}

export const DESIGN_SELECTION_MESSAGE = "tiancode:design-selection"
export const DESIGN_EXIT_MESSAGE = "tiancode:design-exit"

/**
 * Starts the picker in the page. It stays on until Escape (or Ctrl/Cmd+Alt+I) in the page, or
 * until the host runs DESIGN_PICKER_EXIT_SCRIPT. Each click posts the element to the parent.
 */
export const DESIGN_PICKER_SCRIPT = String.raw`(() => {
  if (typeof window.__tiancodeDesign === "function") return "active"
  const root = document.documentElement
  const overlay = document.createElement("div")
  overlay.setAttribute("data-tiancode-design", "")
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:transparent;"
  const outline = document.createElement("div")
  outline.setAttribute("data-tiancode-design", "")
  outline.style.cssText = "position:fixed;display:none;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:2px solid #06b6d4;background:rgba(6,182,212,.12);border-radius:2px;"
  const label = document.createElement("div")
  label.style.cssText = "position:absolute;left:-2px;padding:2px 6px;border-radius:4px;background:#083344;color:#67e8f9;border:1px solid #06b6d4;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;"
  outline.appendChild(label)
  root.appendChild(overlay)
  root.appendChild(outline)
  const STYLE_KEYS = ["display", "position", "color", "background-color", "font-family", "font-size", "font-weight", "line-height", "border-radius", "gap"]
  const escape = (value) => (window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c))
  const selectorFor = (el) => {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body && node !== root) {
      if (node.id) { parts.unshift("#" + escape(node.id)); break }
      let part = node.tagName.toLowerCase() + Array.from(node.classList).slice(0, 2).map((c) => "." + escape(c)).join("")
      const parent = node.parentElement
      if (parent && Array.from(parent.children).filter((s) => s.tagName === node.tagName).length > 1) {
        part += ":nth-child(" + (Array.from(parent.children).indexOf(node) + 1) + ")"
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(" > ") || el.tagName.toLowerCase()
  }
  const describe = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const read = (key) => cs.getPropertyValue(key).trim()
    const html = el.outerHTML
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: typeof el.className === "string" ? el.className.trim() : "",
      selector: selectorFor(el),
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
      html: html.length > 1200 ? html.slice(0, 1200) + "…" : html,
      styles: STYLE_KEYS.map((key) => [key, read(key)]).filter((entry) => entry[1] && entry[1] !== "normal" && entry[1] !== "none").map((entry) => entry[0] + ": " + entry[1]).join("; "),
      margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"].map(read).join(" "),
      padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"].map(read).join(" "),
      url: location.href,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      viewport: { width: innerWidth, height: innerHeight },
    }
  }
  const pick = (x, y) => {
    overlay.style.pointerEvents = "none"
    const el = document.elementFromPoint(x, y)
    overlay.style.pointerEvents = "auto"
    if (!el || el === overlay || el === outline || outline.contains(el) || el === root || el === document.body) return null
    return el
  }
  const send = (message) => {
    try { window.parent.postMessage(message, "*") } catch {}
  }
  const hide = () => { outline.style.display = "none" }
  const move = (e) => {
    const el = pick(e.clientX, e.clientY)
    if (!el) return hide()
    const r = el.getBoundingClientRect()
    outline.style.display = "block"
    outline.style.left = r.x + "px"
    outline.style.top = r.y + "px"
    outline.style.width = r.width + "px"
    outline.style.height = r.height + "px"
    label.textContent = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "  " + Math.round(r.width) + " × " + Math.round(r.height)
    const below = r.top < 26
    label.style.top = below ? "100%" : "auto"
    label.style.bottom = below ? "auto" : "100%"
    label.style.margin = below ? "4px 0 0" : "0 0 4px"
  }
  const click = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const el = pick(e.clientX, e.clientY)
    if (!el) return
    const selection = describe(el)
    // The outline must be gone from the screen before the host captures it.
    hide()
    requestAnimationFrame(() => requestAnimationFrame(() => send({ type: "tiancode:design-selection", selection })))
  }
  const key = (e) => {
    const toggle = (e.ctrlKey || e.metaKey) && e.altKey && (e.key === "i" || e.key === "I" || e.code === "KeyI")
    if (e.key !== "Escape" && !toggle) return
    e.preventDefault()
    exit()
    send({ type: "tiancode:design-exit" })
  }
  const exit = () => {
    overlay.remove()
    outline.remove()
    document.removeEventListener("keydown", key, true)
    window.removeEventListener("scroll", hide, true)
    window.__tiancodeDesign = undefined
  }
  overlay.addEventListener("mousemove", move)
  overlay.addEventListener("click", click, true)
  document.addEventListener("keydown", key, true)
  window.addEventListener("scroll", hide, true)
  window.__tiancodeDesign = exit
  return "ok"
})()`

export const DESIGN_PICKER_EXIT_SCRIPT = String.raw`(() => {
  if (typeof window.__tiancodeDesign === "function") window.__tiancodeDesign()
  document.querySelectorAll("[data-tiancode-design]").forEach((el) => el.remove())
  return "ok"
})()`

// The page owns what it posts, so every field is checked and capped before it reaches the chat.
const LIMITS = {
  tag: 40,
  id: 200,
  classes: 400,
  selector: 600,
  text: 200,
  html: 1201,
  styles: 800,
  margin: 80,
  padding: 80,
  url: 2000,
} as const

export function parsePickedElement(value: unknown): PickedElement | undefined {
  if (!isRecord(value)) return
  const read = (key: keyof typeof LIMITS) => {
    const field = value[key]
    return typeof field === "string" ? field.slice(0, LIMITS[key]) : undefined
  }
  const tag = read("tag")
  const id = read("id")
  const classes = read("classes")
  const selector = read("selector")
  const text = read("text")
  const html = read("html")
  const styles = read("styles")
  const margin = read("margin")
  const padding = read("padding")
  const url = read("url")
  const rect = readBox(value.rect)
  const viewport = readBox(value.viewport)
  if (
    tag === undefined ||
    id === undefined ||
    classes === undefined ||
    selector === undefined ||
    text === undefined ||
    html === undefined ||
    styles === undefined ||
    margin === undefined ||
    padding === undefined ||
    url === undefined ||
    !rect ||
    !viewport
  )
    return
  return {
    tag,
    id,
    classes,
    selector,
    text,
    html,
    styles,
    margin,
    padding,
    url,
    rect,
    viewport: { width: viewport.width, height: viewport.height },
  }
}

/** The message the user sends with the element; they finish it with what should change. */
export function elementPrompt(
  element: PickedElement,
  labels: { intro: string; page: string; selector: string; text: string; size: string; styles: string },
) {
  const size = `${Math.round(element.rect.width)} × ${Math.round(element.rect.height)} px`
  return [
    labels.intro,
    "",
    ...(element.url ? [`- ${labels.page}: ${element.url}`] : []),
    `- ${labels.selector}: \`${element.selector}\``,
    ...(element.text ? [`- ${labels.text}: "${element.text}"`] : []),
    `- ${labels.size}: ${size}`,
    ...(element.styles ? [`- ${labels.styles}: ${element.styles}`] : []),
    "",
    "```html",
    element.html,
    "```",
    "",
  ].join("\n")
}

/**
 * Crops a capture to the element plus a small margin.
 *
 * `rect` is in the CSS pixels of the captured surface and `viewportWidth` is that surface's CSS
 * width, so device pixel ratio, zoom and any downscaling of the capture all fold into one scale.
 */
export async function cropCapture(input: {
  image: Blob
  rect: PickedElement["rect"]
  viewportWidth: number
  name: string
}): Promise<File | undefined> {
  const bitmap = await createImageBitmap(input.image).catch(() => undefined)
  if (!bitmap) return
  const scale = input.viewportWidth > 0 ? bitmap.width / input.viewportWidth : 1
  const pad = 8 * scale
  const x = Math.max(0, Math.floor(input.rect.x * scale - pad))
  const y = Math.max(0, Math.floor(input.rect.y * scale - pad))
  const width = Math.min(bitmap.width - x, Math.ceil(input.rect.width * scale + pad * 2))
  const height = Math.min(bitmap.height - y, Math.ceil(input.rect.height * scale + pad * 2))
  if (width < 4 || height < 4) {
    bitmap.close()
    return
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) return
  return new File([blob], `${input.name}.png`, { type: "image/png" })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readBox(value: unknown) {
  if (!isRecord(value)) return
  const x = typeof value.x === "number" ? value.x : 0
  const y = typeof value.y === "number" ? value.y : 0
  const width = value.width
  const height = value.height
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height))
    return
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  return { x, y, width, height }
}
