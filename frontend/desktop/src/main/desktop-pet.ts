import { BrowserWindow, screen, Notification, ipcMain } from "electron"

export type DesktopPetKind =
  | "dewey"
  | "fireball"
  | "hoots"
  | "rocky"
  | "seedy"
  | "stacky"
  | "bsod"
  | "nullsignal"
  | "cat"
  | "dog"
  | "rabbit"
  | "panda"
  | "fox"

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

let petWindow: BrowserWindow | null = null
let petState: DesktopPetState = {
  kind: "cat",
  status: "ready",
  text: "Descansando",
  visible: false,
}

function getPetSvg(kind: DesktopPetKind): string {
  const defs = `<defs>
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
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><path d="M50 12C50 12 24 45 24 64C24 78 35 90 50 90C64 90 76 78 76 64C76 45 50 12 50 12Z" fill="url(#db)"/><ellipse cx="40" cy="46" rx="12" ry="18" fill="#fff" opacity="0.6"/><circle cx="43" cy="62" r="3.5" fill="#0f172a"/><circle cx="57" cy="62" r="3.5" fill="#0f172a"/><path d="M48 68C49.5 70 51.5 70 53 68" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/></g></svg>`
    case "fireball":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><path d="M50 6C54 18 64 24 68 34C74 44 76 56 72 68C66 82 52 90 38 88C24 84 16 70 18 56C20 40 32 30 38 18C42 10 48 6 50 6Z" fill="#ef4444"/><circle cx="48" cy="60" r="28" fill="url(#fb)"/><ellipse cx="42" cy="50" rx="9" ry="13" fill="#fff" opacity="0.75"/><circle cx="40" cy="62" r="3.5" fill="#450a0a"/><circle cx="56" cy="62" r="3.5" fill="#450a0a"/><path d="M46 71C48 73 50 73 52 71" stroke="#450a0a" stroke-width="2" stroke-linecap="round"/></g></svg>`
    case "hoots":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><path d="M26 22L36 38L22 42Z" fill="#334155"/><path d="M74 22L64 38L78 42Z" fill="#334155"/><ellipse cx="50" cy="58" rx="32" ry="30" fill="url(#hb)"/><circle cx="37" cy="50" r="11" fill="#0f172a" stroke="#64748b" stroke-width="2"/><circle cx="37" cy="50" r="7" fill="#38bdf8" filter="url(#p3d-g)"/><circle cx="39" cy="48" r="2" fill="#fff"/><circle cx="63" cy="50" r="11" fill="#0f172a" stroke="#64748b" stroke-width="2"/><circle cx="63" cy="50" r="7" fill="#38bdf8" filter="url(#p3d-g)"/><circle cx="65" cy="48" r="2" fill="#fff"/><polygon points="50,54 44,62 56,62" fill="#f59e0b"/></g></svg>`
    case "rocky":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><polygon points="30,18 70,16 88,42 80,78 48,88 18,74 14,40" fill="url(#rb)"/><polygon points="38,36 50,42 46,62 34,54" fill="url(#rg)"/><circle cx="36" cy="46" r="3" fill="#020617"/><circle cx="58" cy="46" r="3" fill="#020617"/></g></svg>`
    case "seedy":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><path d="M50 86C50 65 48 50 48 38" stroke="#22c55e" stroke-width="6" stroke-linecap="round"/><path d="M48 46C30 44 16 32 18 20C30 18 44 32 48 46Z" fill="url(#sb)"/><path d="M52 38C70 34 84 22 82 10C70 10 56 24 52 38Z" fill="url(#sb)"/><ellipse cx="50" cy="82" rx="20" ry="8" fill="#78350f"/><circle cx="43" cy="36" r="2.5" fill="#0f172a"/><circle cx="55" cy="36" r="2.5" fill="#0f172a"/></g></svg>`
    case "stacky":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><ellipse cx="50" cy="70" rx="34" ry="14" fill="#fba444"/><ellipse cx="50" cy="52" rx="32" ry="13" fill="#fbbf24"/><ellipse cx="50" cy="34" rx="30" ry="12" fill="#fde047"/><polygon points="44,18 56,16 62,24 50,26" fill="#fef08a"/><circle cx="41" cy="46" r="3" fill="#78350f"/><circle cx="59" cy="46" r="3" fill="#78350f"/><path d="M46 54C48 56 52 56 54 54" stroke="#78350f" stroke-width="2" stroke-linecap="round"/></g></svg>`
    case "bsod":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><rect x="14" y="16" width="72" height="60" rx="8" fill="#475569"/><rect x="20" y="22" width="60" height="48" rx="4" fill="#2563eb"/><text x="32" y="54" font-family="monospace" font-size="16" font-weight="bold" fill="#fff">:(</text></g></svg>`
    case "nullsignal":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><circle cx="50" cy="52" r="34" fill="#e2e8f0"/><path d="M22 46C22 36 34 34 50 34C66 34 78 36 78 46C78 56 66 60 50 60C34 60 22 56 22 46Z" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/><ellipse cx="40" cy="46" rx="4.5" ry="5.5" fill="#38bdf8" filter="url(#p3d-g)"/><ellipse cx="60" cy="46" rx="4.5" ry="5.5" fill="#38bdf8" filter="url(#p3d-g)"/></g></svg>`
    case "cat":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><polygon points="20,40 32,14 46,32" fill="url(#cb)"/><polygon points="80,40 68,14 54,32" fill="url(#cb)"/><ellipse cx="50" cy="56" rx="34" ry="28" fill="url(#cb)"/><ellipse cx="37" cy="52" rx="6" ry="8" fill="#10b981"/><circle cx="38" cy="50" r="2" fill="#fff"/><ellipse cx="63" cy="52" rx="6" ry="8" fill="#10b981"/><circle cx="64" cy="50" r="2" fill="#fff"/><polygon points="50,61 46,65 54,65" fill="#f43f5e"/><path d="M44 68C47 71 53 71 56 68" stroke="#78350f" stroke-width="1.8" stroke-linecap="round"/></g></svg>`
    case "dog":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><path d="M22 35C14 45 14 65 24 72C28 70 30 55 30 42Z" fill="#b45309"/><path d="M78 35C86 45 86 65 76 72C72 70 70 55 70 42Z" fill="#b45309"/><circle cx="50" cy="54" r="30" fill="url(#dogb)"/><circle cx="39" cy="50" r="5" fill="#0f172a"/><circle cx="40" cy="48.5" r="1.5" fill="#fff"/><circle cx="61" cy="50" r="5" fill="#0f172a"/><circle cx="62" cy="48.5" r="1.5" fill="#fff"/><ellipse cx="50" cy="64" rx="14" ry="10" fill="#fff"/><polygon points="50,59 44,64 56,64" fill="#0f172a"/></g></svg>`
    case "rabbit":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><ellipse cx="36" cy="24" rx="7" ry="18" fill="#fff" stroke="#e2e8f0"/><ellipse cx="36" cy="24" rx="4" ry="12" fill="#fbcfe8"/><ellipse cx="64" cy="24" rx="7" ry="18" fill="#fff" stroke="#e2e8f0"/><ellipse cx="64" cy="24" rx="4" ry="12" fill="#fbcfe8"/><circle cx="50" cy="60" r="28" fill="#fff"/><ellipse cx="38" cy="56" rx="4.5" ry="5.5" fill="#be123c"/><circle cx="39" cy="54.5" r="1.5" fill="#fff"/><ellipse cx="62" cy="56" rx="4.5" ry="5.5" fill="#be123c"/><circle cx="63" cy="54.5" r="1.5" fill="#fff"/><polygon points="50,62 47,65 53,65" fill="#f43f5e"/></g></svg>`
    case "panda":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><circle cx="26" cy="28" r="11" fill="#0f172a"/><circle cx="74" cy="28" r="11" fill="#0f172a"/><circle cx="50" cy="56" r="30" fill="#fff"/><ellipse cx="37" cy="52" rx="8" ry="10" fill="#0f172a"/><circle cx="37" cy="52" r="3" fill="#fff"/><ellipse cx="63" cy="52" rx="8" ry="10" fill="#0f172a"/><circle cx="63" cy="52" r="3" fill="#fff"/><ellipse cx="50" cy="65" rx="5" ry="3.5" fill="#0f172a"/></g></svg>`
    case "fox":
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<g filter="url(#p3d-s)"><polygon points="18,36 32,8 48,28" fill="url(#foxb)"/><polygon points="82,36 68,8 52,28" fill="url(#foxb)"/><polygon points="50,84 16,44 84,44" fill="url(#foxb)"/><polygon points="50,84 16,44 36,54 50,68" fill="#fff"/><polygon points="50,84 84,44 64,54 50,68" fill="#fff"/><ellipse cx="36" cy="46" rx="4" ry="3" fill="#d97706"/><circle cx="37" cy="45" r="1" fill="#fff"/><ellipse cx="64" cy="46" rx="4" ry="3" fill="#d97706"/><circle cx="65" cy="45" r="1" fill="#fff"/><circle cx="50" cy="82" r="3" fill="#0f172a"/></g></svg>`
    default:
      return `<svg viewBox="0 0 100 100" width="34" height="34">${defs}<ellipse cx="50" cy="56" rx="34" ry="28" fill="url(#cb)"/><ellipse cx="37" cy="52" rx="6" ry="8" fill="#10b981"/><ellipse cx="63" cy="52" rx="6" ry="8" fill="#10b981"/></svg>`
  }
}

function getPetHtml(state: DesktopPetState): string {
  // Todas las caras de la mascota se embeben como JSON para que la ventana
  // reciba solo mensajes de estado y nunca vuelva a recargar el HTML (cada
  // loadURL anterior provocaba un parpadeo visible en cada cambio).
  const svgRecord = Object.fromEntries(
    petGlyphKinds.map((kind) => [kind, getPetSvg(kind as DesktopPetKind)]),
  )

  const initial = JSON.stringify({
    kind: state.kind,
    status: state.status,
    text: state.text,
    petted: state.petted ?? false,
  })

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent;
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
      padding: 10px 14px;
      -webkit-app-region: drag;
    }
    .pet-bubble {
      -webkit-app-region: no-drag;
      position: relative;
      background: rgba(15, 18, 28, 0.92);
      backdrop-filter: blur(18px);
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 14px;
      padding: 8px 12px;
      font-size: 11.5px;
      line-height: 1.45;
      color: #f1f5f9;
      max-width: 216px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
      margin-bottom: 8px;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.2s ease;
      cursor: pointer;
    }
    .pet-bubble:hover {
      transform: translateY(-1px) scale(1.02);
      border-color: rgba(56, 189, 248, 0.5);
    }
    .pet-bubble::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 14px;
      pointer-events: none;
      background: linear-gradient(120deg, rgba(34, 211, 238, 0.14), transparent 45%);
    }
    .pet-bubble .typing-dots {
      display: none;
      gap: 4px;
      align-items: center;
      padding: 2px 0;
    }
    .pet-bubble .typing-dots span {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #67e8f9;
      animation: typing-dot 1s ease-in-out infinite;
    }
    .pet-bubble .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
    .pet-bubble .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
    .pet-container.running .pet-bubble .typing-dots { display: flex; }
    .pet-container.running .pet-bubble .bubble-text { display: none; }
    @keyframes typing-dot {
      0%, 100% { transform: translateY(0); opacity: 0.5; }
      50% { transform: translateY(-3px); opacity: 1; }
    }

    .pet-avatar-wrapper {
      -webkit-app-region: no-drag;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 58px;
      cursor: pointer;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .pet-avatar-wrapper:hover { transform: scale(1.1); }
    .pet-avatar-wrapper:active { transform: scale(0.9); }

    /* Anillo de estado: gradiente cónico girando mientras trabaja */
    .pet-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      padding: 2px;
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5);
      transition: background 0.4s ease, box-shadow 0.4s ease;
    }
    .pet-ring::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(from 180deg, transparent 10%, rgba(34, 211, 238, 0.9) 60%, rgba(99, 102, 241, 0.9) 90%, transparent);
      opacity: 0;
      transition: opacity 0.4s ease;
    }
    .pet-ring::after {
      content: "";
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(10, 14, 26, 0.98));
    }
    .pet-container.running .pet-ring::before {
      opacity: 1;
      animation: ring-spin 1.6s linear infinite;
    }
    .pet-container.running .pet-ring {
      box-shadow: 0 0 22px rgba(34, 211, 238, 0.45), 0 10px 26px rgba(0, 0, 0, 0.5);
    }
    .pet-container.needs-input .pet-ring { animation: ring-pulse-amber 1.1s ease-in-out infinite; }
    .pet-container.blocked .pet-ring { animation: ring-pulse-red 0.9s ease-in-out infinite; }
    .pet-container.ready .pet-ring::after { background: rgba(255, 255, 255, 0.04); }
    @keyframes ring-spin { to { transform: rotate(360deg); } }
    @keyframes ring-pulse-amber {
      0%, 100% { box-shadow: 0 0 6px rgba(234, 179, 8, 0.35), 0 10px 26px rgba(0, 0, 0, 0.5); }
      50% { box-shadow: 0 0 22px rgba(234, 179, 8, 0.75), 0 10px 26px rgba(0, 0, 0, 0.5); }
    }
    @keyframes ring-pulse-red {
      0%, 100% { box-shadow: 0 0 6px rgba(239, 68, 68, 0.35), 0 10px 26px rgba(0, 0, 0, 0.5); transform: rotate(0deg); }
      25% { transform: rotate(3deg); }
      75% { transform: rotate(-3deg); }
    }

    .pet-glyph {
      position: relative;
      z-index: 1;
      font-size: 28px;
      line-height: 1;
      display: inline-flex;
      animation: pet-breathe 2.6s ease-in-out infinite;
    }
    .pet-container.running .pet-glyph { animation: pet-bounce 0.7s ease-in-out infinite alternate; }
    .pet-container.running .pet-glyph svg { animation: pet-wiggle 0.7s ease-in-out infinite alternate; }
    .pet-box { display: inline-flex; }
    .pet-box svg { width: 30px; height: 30px; }
    @keyframes pet-breathe {
      0%, 100% { transform: scale(1) translateY(0); }
      50% { transform: scale(1.035) translateY(-1px); }
    }
    @keyframes pet-bounce {
      0% { transform: translateY(0) rotate(-2deg); }
      100% { transform: translateY(-5px) rotate(3deg); }
    }
    @keyframes pet-wiggle {
      0% { transform: rotate(-2deg); }
      100% { transform: rotate(3deg); }
    }

    .pet-activity {
      position: absolute;
      z-index: 2;
      bottom: -2px;
      left: -2px;
      font-size: 15px;
      display: none;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
      animation: typing-float 1s ease-in-out infinite alternate;
    }
    .pet-container.running .pet-activity { display: block; }
    .pet-container.needs-input .pet-activity { display: block; animation: typing-float 0.5s ease-in-out infinite alternate; }
    @keyframes typing-float {
      0% { transform: scale(1) translateY(0); }
      100% { transform: scale(1.15) translateY(-3px); }
    }
    .pet-status-dot {
      position: absolute;
      z-index: 2;
      bottom: 3px;
      right: 3px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #64748b;
      border: 2px solid #0f172a;
      transition: background 0.3s ease, box-shadow 0.3s ease;
    }
    .pet-container.running .pet-status-dot { background: #22c55e; box-shadow: 0 0 10px #22c55e; }
    .pet-container.needs-input .pet-status-dot { background: #eab308; box-shadow: 0 0 10px #eab308; }
    .pet-container.blocked .pet-status-dot { background: #ef4444; box-shadow: 0 0 10px #ef4444; }

    .pet-hearts {
      position: absolute;
      z-index: 3;
      inset: 0;
      pointer-events: none;
      overflow: visible;
    }
    .heart {
      position: absolute;
      left: 50%;
      bottom: 40%;
      font-size: 13px;
      animation: heart-rise 1s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
      filter: drop-shadow(0 2px 6px rgba(244, 63, 94, 0.6));
    }
    @keyframes heart-rise {
      0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
      18% { opacity: 1; }
      100% { transform: translate(var(--hx, 0px), -56px) scale(1.25) rotate(var(--hr, 0deg)); opacity: 0; }
    }
    .pet-close-btn {
      position: absolute;
      z-index: 4;
      top: -5px;
      left: -5px;
      width: 19px;
      height: 19px;
      border-radius: 50%;
      background: rgba(30, 41, 59, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #cbd5e1;
      font-size: 11.5px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .pet-avatar-wrapper:hover .pet-close-btn { display: flex; }
    .pet-close-btn:hover { background: #ef4444; color: white; }

    .pet-enter { animation: pet-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
    @keyframes pet-enter {
      from { opacity: 0; transform: translateY(18px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
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
      <div class="pet-close-btn" id="closeBtn" title="Ocultar de escritorio">×</div>
      <div class="pet-ring"></div>
      <span class="pet-glyph"><span class="pet-box" id="glyph"></span></span>
      <span class="pet-activity" title="Programando / Investigando">💻</span>
      <span class="pet-status-dot" id="statusDot"></span>
      <div class="pet-hearts" id="hearts"></div>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require("electron")
    const svgs = ${JSON.stringify(svgRecord)}
    const container = document.getElementById("container")
    const bubbleText = document.getElementById("bubbleText")
    const glyph = document.getElementById("glyph")
    const hearts = document.getElementById("hearts")

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

    function applyState(state) {
      container.className = "pet-container pet-enter " + (state.status || "ready")
      bubbleText.textContent = state.text || ""
      const svg = svgs[state.kind] || svgs.cat
      if (glyph.innerHTML !== svg) glyph.innerHTML = svg
    }

    document.getElementById("avatar").addEventListener("click", (e) => {
      e.stopPropagation()
      ipcRenderer.send("desktop-pet-action", "pet")
    })
    document.getElementById("avatar").addEventListener("dblclick", (e) => {
      e.stopPropagation()
      ipcRenderer.send("desktop-pet-action", "focus-main")
    })
    document.getElementById("bubble").addEventListener("click", () => {
      ipcRenderer.send("desktop-pet-action", "focus-main")
    })
    document.getElementById("closeBtn").addEventListener("click", (e) => {
      e.stopPropagation()
      ipcRenderer.send("desktop-pet-action", "hide")
    })

    ipcRenderer.on("pet-sync", (_event, state) => {
      // La ráfaga de corazones viaja solo por "pet-burst"; "pet-sync" solo
      // pinta el estado para no duplicar la animación.
      applyState(state)
    })

    ipcRenderer.on("pet-burst", () => burstHearts())

    applyState(${initial})
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
  const height = 128
  const x = workArea.x + workArea.width - width - 20
  const y = workArea.y + workArea.height - height - 20

  petWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  petWindow.setAlwaysOnTop(true, "screen-saver")
  petWindow.setVisibleOnAllWorkspaces(true)

  petWindow.once("ready-to-show", () => {
    if (petState.visible && petWindow && !petWindow.isDestroyed()) {
      petWindow.showInactive()
    }
  })

  petSyncedOnce = false

  // La ventana se carga UNA VEZ; los cambios de estado se envían por
  // "pet-sync" y nunca se recarga el documento (el loadURL anterior en cada
  // actualización hacía parpadear la mascota).
  petWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getPetHtml(petState))}`)
  petWindow.webContents.on("did-finish-load", () => {
    if (!petSyncedOnce && petWindow && !petWindow.isDestroyed()) {
      petSyncedOnce = true
      petWindow.webContents.send("pet-sync", petState)
    }
  })

  petWindow.on("closed", () => {
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
      if (petState.petted && !previousPetted) petWindow.webContents.send("pet-burst")
      petWindow.webContents.send("pet-sync", petState)
    } else {
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
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.hide()
      }
    }
  })
}
