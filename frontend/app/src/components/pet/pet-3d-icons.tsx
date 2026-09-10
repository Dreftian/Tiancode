import type { Component, JSX } from "solid-js"
import type { PetKind } from "@/context/settings"

export interface Pet3DIconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  kind: PetKind | string
  size?: number | string
}

export const Pet3DIcon: Component<Pet3DIconProps> = (props) => {
  const size = () => props.size ?? 36

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
      style={props.style}
      aria-hidden="true"
    >
      <defs>
        <style>{`
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
          .pet-anim-null-antenna { animation: pet-antenna-flare 1.4s ease-in-out infinite alternate; }
          .pet-anim-cat { animation: pet-cat-waggle 2s ease-in-out infinite alternate; transform-origin: 50% 65px; }
          .pet-anim-dog { animation: pet-dog-bounce 1.3s ease-in-out infinite alternate; transform-origin: 50% 70px; }
          .pet-anim-rabbit { animation: pet-rabbit-hop 1.5s cubic-bezier(0.28, 0.84, 0.42, 1) infinite; transform-origin: 50% 75px; }
          .pet-anim-panda { animation: pet-panda-roll 2.4s ease-in-out infinite alternate; transform-origin: 50% 60px; }
          .pet-anim-fox { animation: pet-fox-float 2.2s ease-in-out infinite; transform-origin: 50% 55px; }

          @keyframes pet-dewey-squish {
            0%, 100% { transform: translateY(0) scale(1, 1) rotate(0deg); }
            25% { transform: translateY(-7px) scale(0.92, 1.08) rotate(-4deg); }
            50% { transform: translateY(-10px) scale(1.02, 0.98) rotate(0deg); }
            75% { transform: translateY(-2px) scale(1.08, 0.92) rotate(4deg); }
          }
          @keyframes pet-fireball-dance {
            0% { transform: translateY(0) scale(0.95, 1.05) rotate(-3deg); filter: drop-shadow(0 0 6px #f97316); }
            50% { transform: translateY(-8px) scale(1.06, 0.94) rotate(3deg); filter: drop-shadow(0 0 16px #ef4444); }
            100% { transform: translateY(-4px) scale(0.98, 1.03) rotate(-2deg); filter: drop-shadow(0 0 10px #f59e0b); }
          }
          @keyframes pet-hoots-glide {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            35% { transform: translateY(-8px) rotate(-6deg); }
            70% { transform: translateY(-4px) rotate(6deg); }
          }
          @keyframes pet-eye-pulse {
            0% { filter: drop-shadow(0 0 3px #0284c7); opacity: 0.85; }
            100% { filter: drop-shadow(0 0 10px #38bdf8); opacity: 1; }
          }
          @keyframes pet-rocky-hover {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            33% { transform: translateY(-8px) rotate(-4deg); }
            66% { transform: translateY(-5px) rotate(4deg); }
          }
          @keyframes pet-gem-flare {
            0% { filter: drop-shadow(0 0 3px #7e22ce); }
            100% { filter: drop-shadow(0 0 12px #c084fc); }
          }
          @keyframes pet-seedy-sway {
            0% { transform: rotate(-12deg) scale(0.98, 1.02); }
            50% { transform: rotate(0deg) scale(1.03, 0.97) translateY(-4px); }
            100% { transform: rotate(12deg) scale(0.98, 1.02); }
          }
          @keyframes pet-stacky-spring {
            0%, 100% { transform: translateY(0) scale(1, 1); }
            30% { transform: translateY(-9px) scale(0.94, 1.06); }
            60% { transform: translateY(-3px) scale(1.05, 0.95); }
            80% { transform: translateY(0) scale(1.08, 0.92); }
          }
          @keyframes pet-bsod-jitter {
            0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.98; filter: drop-shadow(0 0 4px #2563eb); }
            30% { transform: translateY(-6px) rotate(-2deg); opacity: 0.9; filter: drop-shadow(0 0 10px #60a5fa); }
            60% { transform: translateY(-4px) rotate(2deg); opacity: 0.95; filter: drop-shadow(0 0 6px #3b82f6); }
            85% { transform: translateY(-1px) rotate(-1deg); opacity: 0.88; }
          }
          @keyframes pet-null-float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-8px) rotate(-3deg); }
          }
          @keyframes pet-antenna-flare {
            0% { filter: drop-shadow(0 0 3px #0284c7); }
            100% { filter: drop-shadow(0 0 12px #38bdf8); }
          }
          @keyframes pet-cat-waggle {
            0% { transform: translateY(0) rotate(-6deg) scale(0.96); }
            50% { transform: translateY(-6px) rotate(0deg) scale(1.04); }
            100% { transform: translateY(0) rotate(6deg) scale(0.96); }
          }
          @keyframes pet-dog-bounce {
            0% { transform: translateY(0) rotate(-8deg) scale(1, 1); }
            50% { transform: translateY(-7px) rotate(0deg) scale(1.05, 0.95); }
            100% { transform: translateY(0) rotate(8deg) scale(1, 1); }
          }
          @keyframes pet-rabbit-hop {
            0%, 100% { transform: translateY(0) scale(1.08, 0.92); }
            20% { transform: translateY(-4px) scale(0.95, 1.05); }
            45% { transform: translateY(-12px) scale(0.92, 1.08) rotate(-3deg); }
            70% { transform: translateY(-5px) scale(1.02, 0.98) rotate(3deg); }
          }
          @keyframes pet-panda-roll {
            0% { transform: translateY(0) rotate(-7deg) scale(0.96, 1.04); }
            50% { transform: translateY(-6px) rotate(0deg) scale(1.05, 0.95); }
            100% { transform: translateY(0) rotate(7deg) scale(0.96, 1.04); }
          }
          @keyframes pet-fox-float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            35% { transform: translateY(-8px) rotate(-5deg); }
            70% { transform: translateY(-4px) rotate(5deg); }
          }
        `}</style>
        {/* Filtros de sombra y brillo 3D */}
        <filter id="pet3d-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.25" />
        </filter>
        <filter id="pet3d-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="glow" />
          <feComposite in="SourceGraphic" in2="glow" operator="over" />
        </filter>

        {/* Dewey: Gota de agua 3D con refracción y cáusticas */}
        <linearGradient id="dewey-body" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#7dd3fc" />
          <stop offset="35%" stop-color="#38bdf8" />
          <stop offset="70%" stop-color="#0284c7" />
          <stop offset="100%" stop-color="#0369a1" />
        </linearGradient>
        <radialGradient id="dewey-highlight" cx="38" cy="30" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="45%" stop-color="#bae6fd" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="dewey-rim" x1="75" y1="20" x2="85" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0.1" />
        </linearGradient>

        {/* Fireball: Magma 3D con llamas volumétricas */}
        <radialGradient id="fireball-core" cx="50" cy="55" r="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="25%" stop-color="#fef08a" />
          <stop offset="55%" stop-color="#f97316" />
          <stop offset="85%" stop-color="#dc2626" />
          <stop offset="100%" stop-color="#7f1d1d" />
        </radialGradient>
        <linearGradient id="fireball-flame" x1="50" y1="5" x2="50" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#fde047" />
          <stop offset="40%" stop-color="#fb923c" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>

        {/* Hoots: Búho cibernético 3D */}
        <linearGradient id="hoots-body" x1="25" y1="20" x2="75" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#475569" />
          <stop offset="50%" stop-color="#334155" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
        <radialGradient id="hoots-eye-glow" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="60%" stop-color="#0284c7" />
          <stop offset="100%" stop-color="#0c4a6e" />
        </radialGradient>

        {/* Rocky: Asteroide / Gema 3D */}
        <linearGradient id="rocky-top" x1="30" y1="20" x2="70" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#94a3b8" />
          <stop offset="60%" stop-color="#64748b" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>
        <linearGradient id="rocky-gem" x1="30" y1="40" x2="65" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#a855f7" />
          <stop offset="60%" stop-color="#7e22ce" />
          <stop offset="100%" stop-color="#3b0764" />
        </linearGradient>

        {/* Seedy: Brote bioluminiscente 3D */}
        <linearGradient id="seedy-leaf1" x1="20" y1="15" x2="60" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#86efac" />
          <stop offset="40%" stop-color="#22c55e" />
          <stop offset="100%" stop-color="#15803d" />
        </linearGradient>
        <linearGradient id="seedy-stem" x1="45" y1="35" x2="55" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#4ade80" />
          <stop offset="100%" stop-color="#166534" />
        </linearGradient>

        {/* Stacky: Pancakes 3D dorados */}
        <linearGradient id="stacky-cake" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#fed7aa" />
          <stop offset="45%" stop-color="#fba444" />
          <stop offset="100%" stop-color="#c2410c" />
        </linearGradient>
        <linearGradient id="stacky-syrup" x1="30" y1="25" x2="70" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#fbbf24" />
          <stop offset="50%" stop-color="#d97706" />
          <stop offset="100%" stop-color="#78350f" />
        </linearGradient>

        {/* BSOD: Pantalla CRT Retro 3D */}
        <linearGradient id="bsod-frame" x1="15" y1="15" x2="85" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#cbd5e1" />
          <stop offset="40%" stop-color="#94a3b8" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>
        <linearGradient id="bsod-screen" x1="25" y1="25" x2="75" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#2563eb" />
          <stop offset="100%" stop-color="#1e40af" />
        </linearGradient>

        {/* NullSignal: Bot esférico 3D */}
        <linearGradient id="null-chassis" x1="25" y1="15" x2="75" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#f8fafc" />
          <stop offset="40%" stop-color="#e2e8f0" />
          <stop offset="85%" stop-color="#94a3b8" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>
        <linearGradient id="null-visor" x1="30" y1="35" x2="70" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="50%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>

        {/* Cat: Gato 3D terciopelo */}
        <linearGradient id="cat-fur" x1="20" y1="15" x2="80" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#fcd34d" />
          <stop offset="45%" stop-color="#f59e0b" />
          <stop offset="90%" stop-color="#b45309" />
          <stop offset="100%" stop-color="#78350f" />
        </linearGradient>

        {/* Dog: Perrito 3D */}
        <linearGradient id="dog-fur" x1="25" y1="15" x2="75" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#e2e8f0" />
          <stop offset="45%" stop-color="#cbd5e1" />
          <stop offset="85%" stop-color="#94a3b8" />
          <stop offset="100%" stop-color="#64748b" />
        </linearGradient>
        <linearGradient id="dog-ear" x1="20" y1="20" x2="40" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#d97706" />
          <stop offset="100%" stop-color="#92400e" />
        </linearGradient>

        {/* Rabbit: Conejito 3D */}
        <linearGradient id="rabbit-fur" x1="25" y1="15" x2="75" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="55%" stop-color="#f1f5f9" />
          <stop offset="95%" stop-color="#cbd5e1" />
        </linearGradient>

        {/* Panda: Panda 3D */}
        <linearGradient id="panda-body" x1="30" y1="20" x2="70" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="60%" stop-color="#f8fafc" />
          <stop offset="100%" stop-color="#e2e8f0" />
        </linearGradient>

        {/* Fox: Zorro 3D origami con destello */}
        <linearGradient id="fox-fur" x1="20" y1="15" x2="80" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#fb923c" />
          <stop offset="40%" stop-color="#ea580c" />
          <stop offset="85%" stop-color="#c2410c" />
          <stop offset="100%" stop-color="#7c2d12" />
        </linearGradient>
      </defs>

      {/* Renderizado por Kind */}
      {props.kind === "dewey" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-dewey">
          <path
            d="M50 12C50 12 24 45 24 64C24 78.3594 35.6406 90 50 90C64.3594 90 76 78.3594 76 64C76 45 50 12 50 12Z"
            fill="url(#dewey-body)"
          />
          <ellipse cx="40" cy="46" rx="14" ry="20" transform="rotate(-25 40 46)" fill="url(#dewey-highlight)" />
          <ellipse cx="34" cy="38" rx="5" ry="9" transform="rotate(-25 34 38)" fill="#ffffff" opacity="0.9" />
          <path
            d="M34 72C38 78 46 82 54 82C62 82 66 78 66 78"
            stroke="url(#dewey-rim)"
            stroke-width="3.5"
            stroke-linecap="round"
          />
          <circle cx="43" cy="62" r="3.5" fill="#0f172a" />
          <circle cx="44.2" cy="60.8" r="1.2" fill="#ffffff" />
          <circle cx="57" cy="62" r="3.5" fill="#0f172a" />
          <circle cx="58.2" cy="60.8" r="1.2" fill="#ffffff" />
          <path d="M48 68C49.5 70 51.5 70 53 68" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round" />
        </g>
      )}

      {props.kind === "fireball" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-fireball">
          <path
            d="M50 6C54 18 64 24 68 34C74 44 76 56 72 68C66 82 52 90 38 88C24 84 16 70 18 56C20 40 32 30 38 18C42 10 48 6 50 6Z"
            fill="url(#fireball-flame)"
          />
          <circle cx="48" cy="60" r="28" fill="url(#fireball-core)" />
          <ellipse cx="42" cy="50" rx="10" ry="14" transform="rotate(-20 42 50)" fill="#ffffff" opacity="0.85" />
          <ellipse cx="40" cy="62" rx="3.5" ry="4.5" fill="#450a0a" />
          <circle cx="41" cy="60.5" r="1.3" fill="#fef08a" />
          <ellipse cx="56" cy="62" rx="3.5" ry="4.5" fill="#450a0a" />
          <circle cx="57" cy="60.5" r="1.3" fill="#fef08a" />
          <path d="M46 71C48 73 50 73 52 71" stroke="#450a0a" stroke-width="2" stroke-linecap="round" />
        </g>
      )}

      {props.kind === "hoots" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-hoots">
          <path d="M26 22L36 38L22 42Z" fill="#334155" />
          <path d="M74 22L64 38L78 42Z" fill="#334155" />
          <ellipse cx="50" cy="58" rx="32" ry="30" fill="url(#hoots-body)" />
          <ellipse cx="50" cy="66" rx="18" ry="16" fill="#1e293b" />
          <path d="M42 64L50 70L58 64" stroke="#64748b" stroke-width="2" stroke-linecap="round" />
          <path d="M44 70L50 75L56 70" stroke="#64748b" stroke-width="2" stroke-linecap="round" />
          <circle cx="37" cy="50" r="12" fill="#0f172a" stroke="#64748b" stroke-width="2" />
          <circle cx="37" cy="50" r="8" fill="url(#hoots-eye-glow)" class="pet-anim-hoots-eye" />
          <circle cx="39" cy="48" r="2.5" fill="#ffffff" />
          <circle cx="63" cy="50" r="12" fill="#0f172a" stroke="#64748b" stroke-width="2" />
          <circle cx="63" cy="50" r="8" fill="url(#hoots-eye-glow)" class="pet-anim-hoots-eye" />
          <circle cx="65" cy="48" r="2.5" fill="#ffffff" />
          <polygon points="50,54 44,62 56,62" fill="#f59e0b" />
        </g>
      )}

      {props.kind === "rocky" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-rocky">
          <polygon points="30,18 70,16 88,42 80,78 48,88 18,74 14,40" fill="url(#rocky-top)" />
          <polygon points="30,18 70,16 54,44 14,40" fill="#64748b" opacity="0.6" />
          <polygon points="70,16 88,42 62,56 54,44" fill="#475569" opacity="0.8" />
          <polygon points="88,42 80,78 48,88 62,56" fill="#334155" />
          <polygon points="14,40 54,44 48,88 18,74" fill="#475569" />
          <polygon points="38,36 50,42 46,62 34,54" fill="url(#rocky-gem)" class="pet-anim-rocky-gem" />
          <polygon points="46,42 60,40 56,58 46,62" fill="#c084fc" opacity="0.8" />
          <ellipse cx="36" cy="46" rx="3.5" ry="4" fill="#020617" />
          <circle cx="37" cy="44.5" r="1.2" fill="#ffffff" />
          <ellipse cx="58" cy="46" rx="3.5" ry="4" fill="#020617" />
          <circle cx="59" cy="44.5" r="1.2" fill="#ffffff" />
        </g>
      )}

      {props.kind === "seedy" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-seedy">
          <path d="M50 86C50 65 48 50 48 38C48 26 54 18 54 18" stroke="url(#seedy-stem)" stroke-width="6" stroke-linecap="round" />
          <path d="M48 46C30 44 16 32 18 20C30 18 44 32 48 46Z" fill="url(#seedy-leaf1)" />
          <path d="M22 24C32 26 42 36 46 44" stroke="#dcfce7" stroke-width="1.5" stroke-linecap="round" opacity="0.8" />
          <path d="M52 38C70 34 84 22 82 10C70 10 56 24 52 38Z" fill="url(#seedy-leaf1)" />
          <path d="M78 14C68 18 58 28 54 36" stroke="#dcfce7" stroke-width="1.5" stroke-linecap="round" opacity="0.8" />
          <ellipse cx="50" cy="82" rx="22" ry="10" fill="#78350f" />
          <circle cx="28" cy="22" r="3.5" fill="#ffffff" opacity="0.9" />
          <circle cx="44" cy="80" r="2" fill="#ffffff" />
          <circle cx="56" cy="80" r="2" fill="#ffffff" />
        </g>
      )}

      {props.kind === "stacky" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-stacky">
          <ellipse cx="50" cy="74" rx="34" ry="14" fill="#9a3412" />
          <ellipse cx="50" cy="70" rx="34" ry="14" fill="url(#stacky-cake)" />
          <ellipse cx="50" cy="56" rx="32" ry="13" fill="#9a3412" />
          <ellipse cx="50" cy="52" rx="32" ry="13" fill="url(#stacky-cake)" />
          <ellipse cx="50" cy="38" rx="30" ry="12" fill="#9a3412" />
          <ellipse cx="50" cy="34" rx="30" ry="12" fill="url(#stacky-cake)" />
          <polygon points="44,18 56,16 62,24 50,26" fill="#fef08a" />
          <polygon points="44,18 50,26 50,34 44,26" fill="#facc15" />
          <polygon points="56,16 62,24 62,32 56,24" fill="#eab308" />
          <path d="M40 38C40 46 44 48 44 54C44 60 41 62 41 68" stroke="url(#stacky-syrup)" stroke-width="4.5" stroke-linecap="round" />
          <path d="M58 36C58 44 62 48 62 58C62 66 59 70 59 74" stroke="url(#stacky-syrup)" stroke-width="4.5" stroke-linecap="round" />
          <circle cx="43" cy="52" r="2.5" fill="#451a03" />
          <circle cx="57" cy="52" r="2.5" fill="#451a03" />
          <path d="M48 56C49.5 58 50.5 58 52 56" stroke="#451a03" stroke-width="1.6" stroke-linecap="round" />
        </g>
      )}

      {props.kind === "bsod" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-bsod">
          <rect x="14" y="16" width="72" height="60" rx="10" fill="url(#bsod-frame)" stroke="#475569" stroke-width="2" />
          <rect x="22" y="24" width="56" height="44" rx="6" fill="url(#bsod-screen)" />
          <line x1="26" y1="32" x2="42" y2="32" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.9" />
          <line x1="26" y1="38" x2="68" y2="38" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round" opacity="0.7" />
          <line x1="26" y1="43" x2="60" y2="43" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round" opacity="0.7" />
          <text x="32" y="60" font-family="monospace" font-size="16" font-weight="bold" fill="#ffffff">:(</text>
          <polygon points="40,76 60,76 66,86 34,86" fill="#64748b" />
        </g>
      )}

      {props.kind === "nullsignal" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-nullsignal">
          <circle cx="50" cy="52" r="34" fill="url(#null-chassis)" />
          <path d="M22 46C22 36 34 34 50 34C66 34 78 36 78 46C78 56 66 60 50 60C34 60 22 56 22 46Z" fill="url(#null-visor)" stroke="#38bdf8" stroke-width="1.5" />
          <ellipse cx="40" cy="46" rx="5" ry="6" fill="#38bdf8" filter="url(#pet3d-glow)" />
          <circle cx="41" cy="44.5" r="1.5" fill="#ffffff" />
          <ellipse cx="60" cy="46" rx="5" ry="6" fill="#38bdf8" filter="url(#pet3d-glow)" />
          <circle cx="61" cy="44.5" r="1.5" fill="#ffffff" />
          <line x1="50" y1="18" x2="50" y2="10" stroke="#64748b" stroke-width="3" stroke-linecap="round" />
          <circle cx="50" cy="8" r="4.5" fill="#38bdf8" filter="url(#pet3d-glow)" class="pet-anim-null-antenna" />
        </g>
      )}

      {props.kind === "cat" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-cat">
          <polygon points="20,40 32,14 46,32" fill="url(#cat-fur)" />
          <polygon points="26,36 34,20 42,32" fill="#f43f5e" opacity="0.6" />
          <polygon points="80,40 68,14 54,32" fill="url(#cat-fur)" />
          <polygon points="74,36 66,20 58,32" fill="#f43f5e" opacity="0.6" />
          <ellipse cx="50" cy="56" rx="34" ry="28" fill="url(#cat-fur)" />
          <ellipse cx="37" cy="52" rx="7" ry="9" fill="#10b981" stroke="#047857" stroke-width="1" />
          <ellipse cx="37" cy="52" rx="2.5" ry="8" fill="#064e3b" />
          <circle cx="39" cy="48" r="2.2" fill="#ffffff" />
          <ellipse cx="63" cy="52" rx="7" ry="9" fill="#10b981" stroke="#047857" stroke-width="1" />
          <ellipse cx="63" cy="52" rx="2.5" ry="8" fill="#064e3b" />
          <circle cx="65" cy="48" r="2.2" fill="#ffffff" />
          <polygon points="50,61 46,65 54,65" fill="#f43f5e" />
          <path d="M46 67C48 70 50 70 50 67C50 70 52 70 54 67" stroke="#78350f" stroke-width="1.8" stroke-linecap="round" />
          <line x1="20" y1="62" x2="34" y2="64" stroke="#78350f" stroke-width="1.5" stroke-linecap="round" />
          <line x1="18" y1="68" x2="33" y2="67" stroke="#78350f" stroke-width="1.5" stroke-linecap="round" />
          <line x1="80" y1="62" x2="66" y2="64" stroke="#78350f" stroke-width="1.5" stroke-linecap="round" />
          <line x1="82" y1="68" x2="67" y2="67" stroke="#78350f" stroke-width="1.5" stroke-linecap="round" />
        </g>
      )}

      {props.kind === "dog" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-dog">
          <path d="M22 35C14 45 14 65 24 72C28 70 30 55 30 42Z" fill="url(#dog-ear)" />
          <path d="M78 35C86 45 86 65 76 72C72 70 70 55 70 42Z" fill="url(#dog-ear)" />
          <circle cx="50" cy="54" r="30" fill="url(#dog-fur)" />
          <circle cx="39" cy="50" r="5" fill="#0f172a" />
          <circle cx="41" cy="48" r="1.8" fill="#ffffff" />
          <circle cx="61" cy="50" r="5" fill="#0f172a" />
          <circle cx="63" cy="48" r="1.8" fill="#ffffff" />
          <ellipse cx="50" cy="64" rx="15" ry="11" fill="#f8fafc" />
          <polygon points="50,59 44,64 56,64" fill="#0f172a" />
          <path d="M46 67C48 70 50 70 50 67C50 70 52 70 54 67" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round" />
          <path d="M48 70C48 75 52 75 52 70Z" fill="#fb7185" />
        </g>
      )}

      {props.kind === "rabbit" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-rabbit">
          <ellipse cx="36" cy="24" rx="8" ry="20" transform="rotate(-10 36 24)" fill="url(#rabbit-fur)" />
          <ellipse cx="36" cy="24" rx="4" ry="14" transform="rotate(-10 36 24)" fill="#fbcfe8" />
          <ellipse cx="64" cy="24" rx="8" ry="20" transform="rotate(10 64 24)" fill="url(#rabbit-fur)" />
          <ellipse cx="64" cy="24" rx="4" ry="14" transform="rotate(10 64 24)" fill="#fbcfe8" />
          <circle cx="50" cy="60" r="28" fill="url(#rabbit-fur)" />
          <ellipse cx="38" cy="56" rx="4.5" ry="6" fill="#be123c" />
          <circle cx="39.5" cy="54" r="1.8" fill="#ffffff" />
          <ellipse cx="62" cy="56" rx="4.5" ry="6" fill="#be123c" />
          <circle cx="63.5" cy="54" r="1.8" fill="#ffffff" />
          <circle cx="28" cy="64" r="5" fill="#fda4af" opacity="0.4" />
          <circle cx="72" cy="64" r="5" fill="#fda4af" opacity="0.4" />
          <polygon points="50,62 47,65 53,65" fill="#f43f5e" />
          <path d="M48 67C49 69 50 69 50 67C50 69 51 69 52 67" stroke="#475569" stroke-width="1.5" stroke-linecap="round" />
        </g>
      )}

      {props.kind === "panda" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-panda">
          <circle cx="26" cy="28" r="11" fill="#0f172a" />
          <circle cx="74" cy="28" r="11" fill="#0f172a" />
          <circle cx="50" cy="56" r="30" fill="url(#panda-body)" />
          <ellipse cx="37" cy="52" rx="9" ry="11" transform="rotate(-15 37 52)" fill="#0f172a" />
          <circle cx="37" cy="52" r="3.5" fill="#ffffff" />
          <circle cx="38" cy="51" r="1.5" fill="#0f172a" />
          <ellipse cx="63" cy="52" rx="9" ry="11" transform="rotate(15 63 52)" fill="#0f172a" />
          <circle cx="63" cy="52" r="3.5" fill="#ffffff" />
          <circle cx="64" cy="51" r="1.5" fill="#0f172a" />
          <ellipse cx="50" cy="65" rx="5" ry="3.5" fill="#0f172a" />
          <path d="M47 69C49 71 50 71 50 69C50 71 51 71 53 69" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round" />
          <path d="M68 70C78 68 84 60 84 56C80 60 74 65 68 70Z" fill="#22c55e" />
        </g>
      )}

      {props.kind === "fox" && (
        <g filter="url(#pet3d-shadow)" class="pet-anim-fox">
          <polygon points="18,36 32,8 48,28" fill="url(#fox-fur)" />
          <polygon points="26,30 34,16 42,28" fill="#ffffff" />
          <polygon points="82,36 68,8 52,28" fill="url(#fox-fur)" />
          <polygon points="74,30 66,16 58,28" fill="#ffffff" />
          <polygon points="50,84 16,44 84,44" fill="url(#fox-fur)" />
          <polygon points="50,84 16,44 36,54 50,68" fill="#ffffff" />
          <polygon points="50,84 84,44 64,54 50,68" fill="#ffffff" />
          <ellipse cx="36" cy="46" rx="4.5" ry="3" transform="rotate(-15 36 46)" fill="#d97706" />
          <circle cx="36" cy="46" r="2" fill="#0f172a" />
          <circle cx="37" cy="45" r="0.8" fill="#ffffff" />
          <ellipse cx="64" cy="46" rx="4.5" ry="3" transform="rotate(15 64 46)" fill="#d97706" />
          <circle cx="64" cy="46" r="2" fill="#0f172a" />
          <circle cx="65" cy="45" r="0.8" fill="#ffffff" />
          <circle cx="50" cy="82" r="3.5" fill="#0f172a" />
        </g>
      )}
    </svg>
  )
}
