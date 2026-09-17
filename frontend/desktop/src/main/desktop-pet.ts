import { app, BrowserWindow, screen, Notification, ipcMain } from "electron"
import { readFileSync } from "node:fs"
import { write } from "./logging"
import { join } from "node:path"

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
}

// Any pet kind the app knows; the SVG table below covers the drawn ones and page-mascot sheets
// cover the illustrated characters.
export type DesktopPetKind = string

export type DesktopPetState = {
  kind: DesktopPetKind
  status: "ready" | "running" | "needs-input" | "blocked"
  text: string
  petted?: boolean
  visible: boolean
}

const petGlyphs: Record<string, string> = {
  dewey: "💧",
  fireball: "🔥",
  hoots: "🦉",
  rocky: "🪨",
  seedy: "🌱",
  stacky: "🥞",
  bsod: "🖥️",
  nullsignal: "🤖",
  cat: "🐱",
  dog: "🐶",
  rabbit: "🐰",
  panda: "🐼",
  fox: "🦊",
}

const petGlyphKinds = Object.keys(petGlyphs)

// page-mascot characters (MIT): two 3×3 WebP sheets each, packaged under resources/mascots and
// read straight from frontend/ui in development. Sent to the pet window as data URIs.
const MASCOT_KINDS = ["cat", "fox", "panda", "bunny", "otter", "owl", "dino", "penguin", "redpanda", "robot", "koala", "hamster"]
export type MascotSheets = { directions: string; reactions: string }
const sheetCache = new Map<string, MascotSheets | null>()

function mascotFor(kind: string) {
  if (kind === "rabbit") return "bunny"
  return MASCOT_KINDS.includes(kind) ? kind : undefined
}

// Candidate folders for the sprite sheets: extraResources next to the app, the copy inside
// app.asar (scripts/copy-mascots.ts) and, in development, the source folder in frontend/ui.
function mascotsDirs() {
  const packaged = [join(process.resourcesPath, "mascots"), join(__dirname, "mascots")]
  const source = join(__dirname, "../../../ui/src/components/mascots")
  return app.isPackaged ? [...packaged, source] : [source, ...packaged]
}

export function sheetsFor(kind: string): MascotSheets | null {
  const name = mascotFor(kind)
  if (!name) return null
  const cached = sheetCache.get(name)
  if (cached !== undefined) return cached
  const dirs = mascotsDirs()
  for (const dir of dirs) {
    try {
      const read = (file: string) => `data:image/webp;base64,${readFileSync(join(dir, file)).toString("base64")}`
      const sheets = { directions: read(`${name}-directions.webp`), reactions: read(`${name}-reactions.webp`) }
      sheetCache.set(name, sheets)
      return sheets
    } catch {
      // try the next folder
    }
  }
  write("pet", "mascot sheets not found", { kind: name, dirs }, "warn")
  sheetCache.set(name, null)
  return null
}

// Clockwise from the right, matching atan2 with y pointing down; values are cells of the
// directions sheet (0 up-left … 8 down-right).
const CLOCKWISE_CELLS = [5, 8, 7, 6, 3, 0, 1, 2]
let lookTimer: ReturnType<typeof setInterval> | undefined
let lastLook = 4

// The pet window cannot see the pointer once it leaves its 232×140 px; the main process can, so
// it samples the cursor and tells the page where to look while the character is idle.
function startLooking() {
  if (lookTimer) return
  lookTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return
    const bounds = petWindow.getBounds()
    const cursor = screen.getCursorScreenPoint()
    const dx = cursor.x - (bounds.x + bounds.width - 54)
    const dy = cursor.y - (bounds.y + bounds.height - 52)
    const distance = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8
    const cell = distance < 70 ? 4 : CLOCKWISE_CELLS[sector]!
    if (cell === lastLook) return
    lastLook = cell
    petWindow.webContents.send("pet-look", cell)
  }, 160)
}

function stopLooking() {
  if (!lookTimer) return
  clearInterval(lookTimer)
  lookTimer = undefined
}

let petWindow: BrowserWindow | null = null
let petState: DesktopPetState = {
  kind: "cat",
  status: "ready",
  text: "Descansando",
  visible: false,
}

function getPetSvg(kind: DesktopPetKind): string {
  const defs = `<defs>
    <style>
      .pet-anim-dewey { animation: pet-dewey-squish 2s ease-in-out infinite; transform-origin: 50% 80px; }
      .pet-anim-fireball { animation: pet-fireball-dance 1.4s ease-in-out infinite alternate; transform-origin: 50% 70px; }
      .pet-anim-hoots { animation: pet-hoots-glide 2.4s ease-in-out infinite; transform-origin: 50% 60px; }
      .pet-anim-hoots-eye { animation: pet-eye-pulse 1.8s ease-in-out infinite alternate; }
      .pet-anim-rocky { animation: pet-rocky-hover 2.2s ease-in-out infinite; transform-origin: 50% 55px; }
      .pet-anim-rocky-gem { animation: pet-gem-flare 1.6s ease-in-out infinite alternate; }
      .pet-anim-seedy { animation: pet-seedy-sway 1.8s ease-in-out infinite alternate; transform-origin: 50% 86px; }
      .pet-anim-stacky { animation: pet-stacky-spring 1.6s ease-in-out infinite; transform-origin: 50% 75px; }
      .pet-anim-bsod { animation: pet-bsod-jitter 2s ease-in-out infinite; transform-origin: 50% 50px; }
      .pet-anim-nullsignal { animation: pet-null-float 2.2s ease-in-out infinite; transform-origin: 50% 50px; }
      .pet-anim-cat { animation: pet-cat-waggle 2s ease-in-out infinite alternate; transform-origin: 50% 65px; }
      .pet-anim-dog { animation: pet-dog-bounce 1.3s ease-in-out infinite alternate; transform-origin: 50% 70px; }
      .pet-anim-rabbit { animation: pet-rabbit-hop 1.5s cubic-bezier(0.28, 0.84, 0.42, 1) infinite; transform-origin: 50% 75px; }
      .pet-anim-panda { animation: pet-panda-roll 2.4s ease-in-out infinite alternate; transform-origin: 50% 60px; }
      .pet-anim-fox { animation: pet-fox-float 2.2s ease-in-out infinite; transform-origin: 50% 55px; }

      @keyframes pet-dewey-squish { 0%, 100% { transform: translateY(0) scale(1, 1); } 25% { transform: translateY(-7px) scale(0.92, 1.08) rotate(-4deg); } 50% { transform: translateY(-10px) scale(1.02, 0.98); } 75% { transform: translateY(-2px) scale(1.08, 0.92) rotate(4deg); } }
      @keyframes pet-fireball-dance { 0% { transform: translateY(0) scale(0.95, 1.05) rotate(-3deg); filter: drop-shadow(0 0 6px #f97316); } 50% { transform: translateY(-8px) scale(1.06, 0.94) rotate(3deg); filter: drop-shadow(0 0 16px #ef4444); } 100% { transform: translateY(-4px) scale(0.98, 1.03); filter: drop-shadow(0 0 10px #f59e0b); } }
      @keyframes pet-hoots-glide { 0%, 100% { transform: translateY(0); } 35% { transform: translateY(-8px) rotate(-6deg); } 70% { transform: translateY(-4px) rotate(6deg); } }
      @keyframes pet-eye-pulse { 0% { opacity: 0.85; filter: drop-shadow(0 0 2px #0284c7); } 100% { opacity: 1; filter: drop-shadow(0 0 8px #38bdf8); } }
      @keyframes pet-rocky-hover { 0%, 100% { transform: translateY(0); } 33% { transform: translateY(-8px) rotate(-4deg); } 66% { transform: translateY(-5px) rotate(4deg); } }
      @keyframes pet-gem-flare { 0% { filter: drop-shadow(0 0 2px #7e22ce); } 100% { filter: drop-shadow(0 0 10px #c084fc); } }
      @keyframes pet-seedy-sway { 0% { transform: rotate(-12deg); } 50% { transform: rotate(0deg) translateY(-4px); } 100% { transform: rotate(12deg); } }
      @keyframes pet-stacky-spring { 0%, 100% { transform: translateY(0) scale(1, 1); } 30% { transform: translateY(-9px) scale(0.94, 1.06); } 80% { transform: translateY(0) scale(1.08, 0.92); } }
      @keyframes pet-bsod-jitter { 0%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px) rotate(-2deg); } 60% { transform: translateY(-4px) rotate(2deg); } }
      @keyframes pet-null-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px) rotate(-3deg); } }
      @keyframes pet-cat-waggle { 0% { transform: translateY(0) rotate(-6deg) scale(0.96); } 50% { transform: translateY(-6px) rotate(0deg) scale(1.04); } 100% { transform: translateY(0) rotate(6deg) scale(0.96); } }
      @keyframes pet-dog-bounce { 0% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-7px) rotate(0deg) scale(1.05, 0.95); } 100% { transform: translateY(0) rotate(8deg); } }
      @keyframes pet-rabbit-hop { 0%, 100% { transform: translateY(0) scale(1.08, 0.92); } 20% { transform: translateY(-4px); } 45% { transform: translateY(-12px) scale(0.92, 1.08); } 70% { transform: translateY(-5px); } }
      @keyframes pet-panda-roll { 0% { transform: translateY(0) rotate(-7deg); } 50% { transform: translateY(-6px) rotate(0deg); } 100% { transform: translateY(0) rotate(7deg); } }
      @keyframes pet-fox-float { 0%, 100% { transform: translateY(0); } 35% { transform: translateY(-8px) rotate(-5deg); } 70% { transform: translateY(-4px) rotate(5deg); } }
    </style>
    <filter id="p3d-s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.35"/></filter>
    <filter id="p3d-g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="g"/><feComposite in="SourceGraphic" in2="g" operator="over"/></filter>
    <linearGradient id="db" x1="20" y1="10" x2="80" y2="90"><stop offset="0%" stop-color="#7dd3fc"/><stop offset="50%" stop-color="#0284c7"/><stop offset="100%" stop-color="#0369a1"/></linearGradient>
    <radialGradient id="fb" cx="50" cy="55" r="42"><stop offset="0%" stop-color="#fff"/><stop offset="30%" stop-color="#fef08a"/><stop offset="70%" stop-color="#f97316"/><stop offset="100%" stop-color="#991b1b"/></radialGradient>
    <linearGradient id="hb" x1="25" y1="20" x2="75" y2="85"><stop offset="0%" stop-color="#475569"/><stop offset="50%" stop-color="#334155"/><stop offset="100%" stop-color="#1e293b"/></linearGradient>
    <linearGradient id="rb" x1="30" y1="20" x2="70" y2="60"><stop offset="0%" stop-color="#94a3b8"/><stop offset="60%" stop-color="#64748b"/><stop offset="100%" stop-color="#475569"/></linearGradient>
    <linearGradient id="rg" x1="30" y1="40" x2="65" y2="75"><stop offset="0%" stop-color="#a855f7"/><stop offset="60%" stop-color="#7e22ce"/><stop offset="100%" stop-color="#3b0764"/></linearGradient>
    <linearGradient id="sb" x1="20" y1="15" x2="60" y2="65"><stop offset="0%" stop-color="#86efac"/><stop offset="50%" stop-color="#22c55e"/><stop offset="100%" stop-color="#15803d"/></linearGradient>
    <linearGradient id="cb" x1="25" y1="20" x2="75" y2="85"><stop offset="0%" stop-color="#fde68a"/><stop offset="40%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient>
    <linearGradient id="dogb" x1="30" y1="20" x2="70" y2="80"><stop offset="0%" stop-color="#f8fafc"/><stop offset="50%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient>
    <linearGradient id="foxb" x1="20" y1="15" x2="80" y2="85"><stop offset="0%" stop-color="#fb923c"/><stop offset="40%" stop-color="#ea580c"/><stop offset="100%" stop-color="#7c2d12"/></linearGradient>
  </defs>`

  switch (kind) {
    case "dewey":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-dewey"><path d="M50 12C50 12 24 45 24 64C24 78 35 90 50 90C64 90 76 78 76 64C76 45 50 12 50 12Z" fill="url(#db)"/><ellipse cx="40" cy="46" rx="12" ry="18" fill="#fff" opacity="0.6"/><circle cx="43" cy="62" r="3.5" fill="#0f172a"/><circle cx="57" cy="62" r="3.5" fill="#0f172a"/><path d="M48 68C49.5 70 51.5 70 53 68" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/></g></svg>`
    case "fireball":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-fireball"><path d="M50 6C54 18 64 24 68 34C74 44 76 56 72 68C66 82 52 90 38 88C24 84 16 70 18 56C20 40 32 30 38 18C42 10 48 6 50 6Z" fill="#ef4444"/><circle cx="48" cy="60" r="28" fill="url(#fb)"/><ellipse cx="42" cy="50" rx="9" ry="13" fill="#fff" opacity="0.75"/><circle cx="40" cy="62" r="3.5" fill="#450a0a"/><circle cx="56" cy="62" r="3.5" fill="#450a0a"/><path d="M46 71C48 73 50 73 52 71" stroke="#450a0a" stroke-width="2" stroke-linecap="round"/></g></svg>`
    case "hoots":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-hoots"><path d="M26 22L36 38L22 42Z" fill="#334155"/><path d="M74 22L64 38L78 42Z" fill="#334155"/><ellipse cx="50" cy="58" rx="32" ry="30" fill="url(#hb)"/><circle cx="37" cy="50" r="11" fill="#0f172a" stroke="#64748b" stroke-width="2"/><circle cx="37" cy="50" r="7" fill="#38bdf8" filter="url(#p3d-g)" class="pet-anim-hoots-eye"/><circle cx="39" cy="48" r="2" fill="#fff"/><circle cx="63" cy="50" r="11" fill="#0f172a" stroke="#64748b" stroke-width="2"/><circle cx="63" cy="50" r="7" fill="#38bdf8" filter="url(#p3d-g)" class="pet-anim-hoots-eye"/><circle cx="65" cy="48" r="2" fill="#fff"/><polygon points="50,54 44,62 56,62" fill="#f59e0b"/></g></svg>`
    case "rocky":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-rocky"><polygon points="30,18 70,16 88,42 80,78 48,88 18,74 14,40" fill="url(#rb)"/><polygon points="38,36 50,42 46,62 34,54" fill="url(#rg)" class="pet-anim-rocky-gem"/><circle cx="36" cy="46" r="3" fill="#020617"/><circle cx="58" cy="46" r="3" fill="#020617"/></g></svg>`
    case "seedy":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-seedy"><path d="M50 86C50 65 48 50 48 38" stroke="#22c55e" stroke-width="6" stroke-linecap="round"/><path d="M48 46C30 44 16 32 18 20C30 18 44 32 48 46Z" fill="url(#sb)"/><path d="M52 38C70 34 84 22 82 10C70 10 56 24 52 38Z" fill="url(#sb)"/><ellipse cx="50" cy="82" rx="20" ry="8" fill="#78350f"/><circle cx="43" cy="36" r="2.5" fill="#0f172a"/><circle cx="55" cy="36" r="2.5" fill="#0f172a"/></g></svg>`
    case "stacky":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-stacky"><ellipse cx="50" cy="70" rx="34" ry="14" fill="#fba444"/><ellipse cx="50" cy="52" rx="32" ry="13" fill="#fbbf24"/><ellipse cx="50" cy="34" rx="30" ry="12" fill="#fde047"/><polygon points="44,18 56,16 62,24 50,26" fill="#fef08a"/><circle cx="41" cy="46" r="3" fill="#78350f"/><circle cx="59" cy="46" r="3" fill="#78350f"/><path d="M46 54C48 56 52 56 54 54" stroke="#78350f" stroke-width="2" stroke-linecap="round"/></g></svg>`
    case "bsod":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-bsod"><rect x="14" y="16" width="72" height="60" rx="8" fill="#475569"/><rect x="20" y="22" width="60" height="48" rx="4" fill="#2563eb"/><text x="32" y="54" font-family="monospace" font-size="16" font-weight="bold" fill="#fff">:(</text></g></svg>`
    case "nullsignal":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-nullsignal"><circle cx="50" cy="52" r="34" fill="#e2e8f0"/><path d="M22 46C22 36 34 34 50 34C66 34 78 36 78 46C78 56 66 60 50 60C34 60 22 56 22 46Z" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/><ellipse cx="40" cy="46" rx="4.5" ry="5.5" fill="#38bdf8" filter="url(#p3d-g)"/><ellipse cx="60" cy="46" rx="4.5" ry="5.5" fill="#38bdf8" filter="url(#p3d-g)"/></g></svg>`
    case "cat":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-cat"><polygon points="20,40 32,14 46,32" fill="url(#cb)"/><polygon points="80,40 68,14 54,32" fill="url(#cb)"/><ellipse cx="50" cy="56" rx="34" ry="28" fill="url(#cb)"/><ellipse cx="37" cy="52" rx="6" ry="8" fill="#10b981"/><circle cx="38" cy="50" r="2" fill="#fff"/><ellipse cx="63" cy="52" rx="6" ry="8" fill="#10b981"/><circle cx="64" cy="50" r="2" fill="#fff"/><polygon points="50,61 46,65 54,65" fill="#f43f5e"/><path d="M44 68C47 71 53 71 56 68" stroke="#78350f" stroke-width="1.8" stroke-linecap="round"/></g></svg>`
    case "dog":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-dog"><path d="M22 35C14 45 14 65 24 72C28 70 30 55 30 42Z" fill="#b45309"/><path d="M78 35C86 45 86 65 76 72C72 70 70 55 70 42Z" fill="#b45309"/><circle cx="50" cy="54" r="30" fill="url(#dogb)"/><circle cx="39" cy="50" r="5" fill="#0f172a"/><circle cx="40" cy="48.5" r="1.5" fill="#fff"/><circle cx="61" cy="50" r="5" fill="#0f172a"/><circle cx="62" cy="48.5" r="1.5" fill="#fff"/><ellipse cx="50" cy="64" rx="14" ry="10" fill="#fff"/><polygon points="50,59 44,64 56,64" fill="#0f172a"/></g></svg>`
    case "rabbit":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-rabbit"><ellipse cx="36" cy="24" rx="7" ry="18" fill="#fff" stroke="#e2e8f0"/><ellipse cx="36" cy="24" rx="4" ry="12" fill="#fbcfe8"/><ellipse cx="64" cy="24" rx="7" ry="18" fill="#fff" stroke="#e2e8f0"/><ellipse cx="64" cy="24" rx="4" ry="12" fill="#fbcfe8"/><circle cx="50" cy="60" r="28" fill="#fff"/><ellipse cx="38" cy="56" rx="4.5" ry="5.5" fill="#be123c"/><circle cx="39" cy="54.5" r="1.5" fill="#fff"/><ellipse cx="62" cy="56" rx="4.5" ry="5.5" fill="#be123c"/><circle cx="63" cy="54.5" r="1.5" fill="#fff"/><polygon points="50,62 47,65 53,65" fill="#f43f5e"/></g></svg>`
    case "panda":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-panda"><circle cx="26" cy="28" r="11" fill="#0f172a"/><circle cx="74" cy="28" r="11" fill="#0f172a"/><circle cx="50" cy="56" r="30" fill="#fff"/><ellipse cx="37" cy="52" rx="8" ry="10" fill="#0f172a"/><circle cx="37" cy="52" r="3" fill="#fff"/><ellipse cx="63" cy="52" rx="8" ry="10" fill="#0f172a"/><circle cx="63" cy="52" r="3" fill="#fff"/><ellipse cx="50" cy="65" rx="5" ry="3.5" fill="#0f172a"/></g></svg>`
    case "fox":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-fox"><polygon points="18,36 32,8 48,28" fill="url(#foxb)"/><polygon points="82,36 68,8 52,28" fill="url(#foxb)"/><polygon points="50,84 16,44 84,44" fill="url(#foxb)"/><polygon points="50,84 16,44 36,54 50,68" fill="#fff"/><polygon points="50,84 84,44 64,54 50,68" fill="#fff"/><ellipse cx="36" cy="46" rx="4" ry="3" fill="#d97706"/><circle cx="37" cy="45" r="1" fill="#fff"/><ellipse cx="64" cy="46" rx="4" ry="3" fill="#d97706"/><circle cx="65" cy="45" r="1" fill="#fff"/><circle cx="50" cy="82" r="3" fill="#0f172a"/></g></svg>`
    default:
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)" class="pet-anim-cat"><ellipse cx="50" cy="56" rx="34" ry="28" fill="url(#cb)"/><ellipse cx="37" cy="52" rx="6" ry="8" fill="#10b981"/><ellipse cx="63" cy="52" rx="6" ry="8" fill="#10b981"/></g></svg>`
  }
}

export function getPetHtml(state: DesktopPetState): string {
  // Todas las caras SVG se embeben como JSON para que la ventana reciba solo mensajes de estado y
  // nunca vuelva a recargar el HTML (cada loadURL provocaba un parpadeo visible en cada cambio).
  // Los personajes de page-mascot llegan como dos hojas WebP en data URIs dentro del propio estado.
  const svgRecord = Object.fromEntries(petGlyphKinds.map((kind) => [kind, getPetSvg(kind)]))

  const initial = {
    kind: state.kind,
    status: state.status,
    text: state.text,
    petted: state.petted ?? false,
    sheets: sheetsFor(state.kind),
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent !important;
      background-color: rgba(0, 0, 0, 0) !important;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .pet-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: flex-end;
      gap: 6px;
      padding: 8px 12px 10px;
      -webkit-app-region: drag;
    }
    .pet-enter { animation: pet-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
    @keyframes pet-enter { from { opacity: 0; transform: translateY(14px) scale(0.9); } to { opacity: 1; transform: none; } }

    .pet-bubble {
      -webkit-app-region: no-drag;
      position: relative;
      max-width: 208px;
      padding: 7px 11px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #e2e8f0;
      font-size: 11.5px;
      line-height: 1.35;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
      cursor: pointer;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .pet-container.has-text .pet-bubble { opacity: 1; transform: none; }
    .pet-bubble::after {
      content: "";
      position: absolute;
      right: 22px;
      bottom: -6px;
      width: 10px;
      height: 10px;
      background: rgba(15, 23, 42, 0.94);
      border-right: 1px solid rgba(148, 163, 184, 0.25);
      border-bottom: 1px solid rgba(148, 163, 184, 0.25);
      transform: rotate(45deg);
    }
    .bubble-text { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .typing-dots { display: none; margin-left: 4px; }
    .pet-container.running .typing-dots { display: inline-flex; gap: 2px; vertical-align: middle; }
    .typing-dots span { width: 4px; height: 4px; border-radius: 50%; background: #38bdf8; animation: dots 1s ease-in-out infinite; }
    .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes dots { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }

    .pet-avatar-wrapper {
      -webkit-app-region: no-drag;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 84px;
      height: 84px;
      cursor: pointer;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.22s ease;
    }
    .pet-avatar-wrapper:hover { transform: translateY(-3px); filter: drop-shadow(0 10px 18px rgba(56, 189, 248, 0.28)); }
    .pet-avatar-wrapper:active { transform: scale(0.94); }

    /* Halo de estado detrás del personaje: gira mientras trabaja, pulsa cuando espera. */
    .pet-ring {
      position: absolute;
      inset: 6px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.16), rgba(15, 23, 42, 0) 70%);
      transition: background 0.4s ease, box-shadow 0.4s ease;
    }
    .pet-container.running .pet-ring {
      background: conic-gradient(from 0deg, rgba(56, 189, 248, 0.5), rgba(56, 189, 248, 0) 60%, rgba(56, 189, 248, 0.5));
      animation: ring-spin 1.8s linear infinite;
      filter: blur(6px);
    }
    .pet-container.needs-input .pet-ring { background: radial-gradient(circle, rgba(234, 179, 8, 0.35), rgba(15, 23, 42, 0) 70%); animation: ring-pulse 1.1s ease-in-out infinite; }
    .pet-container.blocked .pet-ring { background: radial-gradient(circle, rgba(239, 68, 68, 0.35), rgba(15, 23, 42, 0) 70%); animation: ring-pulse 0.9s ease-in-out infinite; }
    @keyframes ring-spin { to { transform: rotate(360deg); } }
    @keyframes ring-pulse { 50% { transform: scale(1.12); opacity: 0.6; } }

    .pet-glyph { position: relative; z-index: 1; display: none; line-height: 1; }
    .pet-glyph svg { width: 44px; height: 44px; filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45)); }
    .pet-container:not(.has-sprite) .pet-glyph { display: inline-flex; animation: pet-breathe 2.6s ease-in-out infinite; }

    .pet-sprite {
      position: relative;
      z-index: 1;
      display: none;
      width: 72px;
      height: 72px;
      transform-origin: 50% 78%;
      filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.45));
    }
    .pet-container.has-sprite .pet-sprite { display: block; }
    .pet-layer { position: absolute; inset: 0; background-size: 300% 300%; background-repeat: no-repeat; transition: opacity 80ms linear; }
    .pet-container.running .pet-sprite { animation: pet-nod 0.9s ease-in-out infinite; }
    .pet-container.ready .pet-sprite { animation: pet-breathe 3s ease-in-out infinite; }
    .pet-container.needs-input .pet-sprite { animation: pet-bob 1.2s ease-in-out infinite; }
    @keyframes pet-breathe { 50% { transform: translateY(-1.5px) scale(1.02); } }
    @keyframes pet-nod { 50% { transform: translateY(1.5px) rotate(-2deg); } }
    @keyframes pet-bob { 50% { transform: translateY(-3px); } }

    .pet-close-btn {
      position: absolute;
      top: 4px;
      right: 2px;
      z-index: 3;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #cbd5e1;
      font-size: 11px;
      line-height: 14px;
      text-align: center;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .pet-avatar-wrapper:hover .pet-close-btn { opacity: 1; }
    .pet-close-btn:hover { background: rgba(239, 68, 68, 0.85); color: #fff; }

    .pet-status-dot {
      position: absolute;
      right: 12px;
      bottom: 10px;
      z-index: 2;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid rgba(15, 23, 42, 0.95);
      background: #22c55e;
    }
    .pet-container.running .pet-status-dot { background: #38bdf8; box-shadow: 0 0 8px #38bdf8; }
    .pet-container.needs-input .pet-status-dot { background: #eab308; }
    .pet-container.blocked .pet-status-dot { background: #ef4444; }

    .pet-hearts { position: absolute; inset: 0; pointer-events: none; }
    .heart {
      position: absolute;
      left: 50%;
      top: 30%;
      font-size: 15px;
      opacity: 0;
      animation: heart-float 1.4s ease-out forwards;
    }
    @keyframes heart-float {
      0% { opacity: 0; transform: translate(-50%, 0) scale(0.6) rotate(var(--hr)); }
      20% { opacity: 1; }
      100% { opacity: 0; transform: translate(calc(-50% + var(--hx)), -60px) scale(1.15) rotate(var(--hr)); }
    }
  </style>
</head>
<body>
  <div class="pet-container pet-enter" id="container">
    <div class="pet-bubble" id="bubble" title="Doble clic para abrir Tiancode">
      <span class="bubble-text" id="bubbleText"></span>
      <span class="typing-dots"><span></span><span></span><span></span></span>
    </div>
    <div class="pet-avatar-wrapper" id="avatar">
      <div class="pet-close-btn" id="closeBtn" title="Ocultar del escritorio">×</div>
      <div class="pet-ring"></div>
      <span class="pet-glyph"><span class="pet-box" id="glyph"></span></span>
      <span class="pet-sprite" id="sprite"><span class="pet-layer" id="dirLayer"></span><span class="pet-layer" id="reactLayer"></span></span>
      <span class="pet-status-dot" id="statusDot"></span>
      <div class="pet-hearts" id="hearts"></div>
    </div>
  </div>
  <script>
    (function () {
    const bridge = window.petApi
    const svgs = ${safeScriptJson(svgRecord)}
    const container = document.getElementById("container")
    const bubbleText = document.getElementById("bubbleText")
    const glyph = document.getElementById("glyph")
    const sprite = document.getElementById("sprite")
    const dirLayer = document.getElementById("dirLayer")
    const reactLayer = document.getElementById("reactLayer")
    const hearts = document.getElementById("hearts")

    // Mismas hojas 3×3 que la mascota de la app: nueve direcciones y nueve expresiones.
    const CENTER = 4
    const REACTION = { blink: 0, heart: 1, sparkle: 2, surprised: 3, wink: 4, bashful: 5, sleepy: 6, dizzy: 7, delighted: 8 }
    const LOOKS = [0, 1, 2, 3, 5, 4]
    const WORKS = [6, 7, 8, 7]
    const PAYOFFS = [REACTION.heart, REACTION.sparkle, REACTION.delighted]
    let currentSheets = null
    let direction = CENTER
    let reaction = null
    let mood = ""
    let epoch = 0
    let timers = []
    let boops = { count: 0, at: 0 }

    const cell = (index) => ((index % 3) * 50) + "% " + (Math.floor(index / 3) * 50) + "%"
    const pick = (items) => items[Math.floor(Math.random() * items.length)]
    function paint() {
      dirLayer.style.backgroundPosition = cell(direction)
      dirLayer.style.opacity = reaction === null ? "1" : "0"
      reactLayer.style.backgroundPosition = cell(reaction === null ? 0 : reaction)
      reactLayer.style.opacity = reaction === null ? "0" : "1"
    }
    function later(ms, run) {
      const mine = epoch
      timers.push(setTimeout(() => { if (mine === epoch) run() }, ms))
    }
    function reset() {
      epoch++
      timers.forEach(clearTimeout)
      timers = []
    }
    function blink(after) {
      reaction = REACTION.blink
      paint()
      later(150, () => { reaction = null; paint(); after() })
    }
    // Un bucle por estado, igual que el componente de la app.
    function play(next) {
      mood = next
      reset()
      reaction = null
      if (next === "idle") {
        direction = CENTER
        paint()
        const rest = () => later(3500 + Math.random() * 3500, () => blink(rest))
        rest()
        return
      }
      if (next === "blocked") { reaction = REACTION.dizzy; paint(); return }
      if (next === "waiting") {
        const wonder = () => { reaction = REACTION.surprised; paint(); later(2400, () => blink(wonder)) }
        wonder()
        return
      }
      let ticks = 0
      const work = () => {
        direction = pick(WORKS)
        paint()
        later(450 + Math.random() * 350, () => {
          if (++ticks % 7 !== 0) return work()
          reaction = REACTION.sparkle
          paint()
          later(500, () => { reaction = null; paint(); work() })
        })
      }
      work()
    }

    const pettedHearts = ["💖", "💕", "❤️", "💗", "💞"]
    function burstHearts() {
      for (let i = 0; i < 6; i++) {
        const heart = document.createElement("span")
        heart.className = "heart"
        heart.textContent = pettedHearts[i % pettedHearts.length]
        heart.style.setProperty("--hx", String(((Math.random() - 0.5) * 70) | 0) + "px")
        heart.style.setProperty("--hr", String(((Math.random() - 0.5) * 60) | 0) + "deg")
        heart.style.animationDelay = String(i * 60) + "ms"
        hearts.append(heart)
        setTimeout(() => heart.remove(), 1500)
      }
    }
    function boop() {
      reset()
      const now = Date.now()
      boops = { count: now - boops.at < 1600 ? boops.count + 1 : 1, at: now }
      const settle = () => play(mood || "idle")
      if (boops.count >= 4) {
        boops.count = 0
        reaction = REACTION.dizzy
        paint()
        later(1100, settle)
      } else {
        reaction = REACTION.blink
        paint()
        later(120, () => { reaction = PAYOFFS[(boops.count - 1) % PAYOFFS.length]; paint() })
        later(560, settle)
      }
      sprite.animate([
        { transform: "scale(1, 1)", easing: "ease-in" },
        { transform: "scale(1.10, 0.86)", offset: 0.18, easing: "ease-out" },
        { transform: "scale(0.95, 1.08)", offset: 0.45, easing: "ease-in-out" },
        { transform: "scale(1.03, 0.97)", offset: 0.72, easing: "ease-in-out" },
        { transform: "scale(1, 1)" },
      ], { duration: 420, easing: "linear" })
    }

    function applyState(state) {
      if (!state) return
      const status = state.status || "ready"
      container.className = "pet-container pet-enter " + status + (state.text ? " has-text" : "")
      bubbleText.textContent = state.text || ""
      if (state.sheets) {
        if (currentSheets !== state.sheets.directions) {
          currentSheets = state.sheets.directions
          dirLayer.style.backgroundImage = "url(" + state.sheets.directions + ")"
          reactLayer.style.backgroundImage = "url(" + state.sheets.reactions + ")"
        }
        container.classList.add("has-sprite")
      } else {
        container.classList.remove("has-sprite")
        const svg = svgs[state.kind] || svgs.cat
        if (glyph.innerHTML !== svg) glyph.innerHTML = svg
      }
      const next = status === "running" ? "writing" : status === "needs-input" ? "waiting" : status === "blocked" ? "blocked" : "idle"
      if (next !== mood) play(next)
    }

    document.getElementById("avatar").addEventListener("click", (e) => {
      e.stopPropagation()
      boop()
      burstHearts()
      bridge?.sendAction("pet")
    })
    document.getElementById("avatar").addEventListener("dblclick", (e) => {
      e.stopPropagation()
      bridge?.sendAction("focus-main")
    })
    document.getElementById("bubble").addEventListener("click", () => bridge?.sendAction("focus-main"))
    document.getElementById("closeBtn").addEventListener("click", (e) => {
      e.stopPropagation()
      bridge?.sendAction("hide")
    })

    bridge?.onSync((state) => applyState(state))
    // "pet-burst" trae solo la ráfaga de corazones (una caricia desde la app).
    bridge?.onBurst(() => { burstHearts(); if (mood === "idle") boop() })
    // El proceso principal sigue el cursor por toda la pantalla y manda hacia dónde mirar.
    bridge?.onLook?.((index) => {
      if (mood !== "idle" || reaction !== null) return
      if (direction === index) return
      direction = index
      paint()
    })

    applyState(${safeScriptJson(initial)})
    })()
  </script>
</body>
</html>`
}

let petSyncedOnce = false

export function createDesktopPetWindow(): BrowserWindow {
  if (petWindow && !petWindow.isDestroyed()) {
    return petWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { workArea } = primaryDisplay

  const width = 232
  const height = 150
  const x = workArea.x + workArea.width - width - 20
  const y = workArea.y + workArea.height - height - 20

  petWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    type: "toolbar",
    thickFrame: false,
    webPreferences: {
      preload: join(__dirname, "../preload/pet.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  petWindow.setBackgroundColor("#00000000")
  petWindow.setAlwaysOnTop(true, "screen-saver")
  petWindow.setVisibleOnAllWorkspaces(true)

  petWindow.once("ready-to-show", () => {
    if (petState.visible && petWindow && !petWindow.isDestroyed()) {
      petWindow.showInactive()
      startLooking()
    }
  })

  petSyncedOnce = false

  // La ventana se carga UNA VEZ; los cambios de estado se envían por
  // "pet-sync" y nunca se recarga el documento (el loadURL anterior en cada
  // actualización hacía parpadear la mascota).
  petWindow.webContents.on("console-message", (event) => {
    if (event.level === "error" || event.level === "warning") write("pet", "console", { level: event.level, message: event.message }, "warn")
  })
  petWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getPetHtml(petState))}`)
  petWindow.webContents.on("did-finish-load", () => {
    if (!petSyncedOnce && petWindow && !petWindow.isDestroyed()) {
      petSyncedOnce = true
      petWindow.webContents.send("pet-sync", { ...petState, sheets: sheetsFor(petState.kind) })
    }
  })

  petWindow.on("closed", () => {
    stopLooking()
    petWindow = null
    petSyncedOnce = false
  })

  return petWindow
}

export function updateDesktopPet(partial: Partial<DesktopPetState>) {
  const previousStatus = petState.status
  const previousPetted = petState.petted
  petState = { ...petState, ...partial }

  if (petState.visible && (!petWindow || petWindow.isDestroyed())) {
    createDesktopPetWindow()
  }

  if (petWindow && !petWindow.isDestroyed()) {
    if (petState.visible) {
      if (!petWindow.isVisible()) petWindow.showInactive()
      startLooking()
      if (petState.petted && !previousPetted) petWindow.webContents.send("pet-burst")
      petWindow.webContents.send("pet-sync", { ...petState, sheets: sheetsFor(petState.kind) })
    } else {
      stopLooking()
      petWindow.hide()
    }
  }

  // Notificación nativa de Windows cuando se requiere input o hay bloqueo
  if (petState.status !== previousStatus && (petState.status === "needs-input" || petState.status === "blocked")) {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: `Tiancode ${petGlyphs[petState.kind] || ""}`,
          body: petState.text || (petState.status === "needs-input" ? "Esperando tu confirmación" : "La tarea fue pausada"),
          silent: false,
        })
        notif.show()
      }
    } catch {
      // Ignore notification failures on platforms without native notification support
    }
  }
}

export function toggleDesktopPet(): boolean {
  petState.visible = !petState.visible
  updateDesktopPet({ visible: petState.visible })
  return petState.visible
}

export function registerDesktopPetIpc() {
  ipcMain.handle("desktop-pet-update", (_event, partial: Partial<DesktopPetState>) => {
    updateDesktopPet(partial)
    return petState
  })

  ipcMain.handle("desktop-pet-toggle", () => {
    return toggleDesktopPet()
  })

  ipcMain.handle("desktop-pet-get-state", () => {
    return petState
  })

  ipcMain.on("desktop-pet-action", (_event, action: string) => {
    if (action === "pet") {
      updateDesktopPet({ petted: true })
      setTimeout(() => updateDesktopPet({ petted: false }), 900)
    } else if (action === "focus-main") {
      const windows = BrowserWindow.getAllWindows().filter((w) => w !== petWindow)
      if (windows.length > 0) {
        const main = windows[0]
        if (main.isMinimized()) main.restore()
        main.show()
        main.focus()
      }
    } else if (action === "hide") {
      petState.visible = false
      stopLooking()
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.hide()
      }
    }
  })
}
