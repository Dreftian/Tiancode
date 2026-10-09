"""Generates the animated README banners (frontend/icons/readme/hero-{dark,light}[-en].svg).

The cat logo only exists as PNG, so each banner embeds it as a data URI at its real proportions
(GitHub renders SVG images through its proxy: no external files, no scripts, CSS animations work).
Run: python tools/script/readme-banner.py
"""
import base64
import random
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/icons/readme"
WIDTH, HEIGHT = 1280, 420
COPY = {
    "es": {
        "tagline": "Inteligencia agéntica local-first para programar",
        "features": [
            "Modelos gratuitos de OpenCode, con un interruptor por modelo",
            "Descubrir: plugins, skills y servidores MCP con un clic",
            "Uso visual de Windows: observa, actúa y verifica",
            "Modelos locales GGUF con el motor incluido",
            "Vista previa en vivo de tus apps en el Sandbox",
            "CLI para Windows, macOS y Linux",
        ],
    },
    "en": {
        "tagline": "Local-first agentic intelligence for coding",
        "features": [
            "OpenCode's free models, with one switch per model",
            "Discover: plugins, skills and MCP servers in one click",
            "Visual Windows control: observe, act and verify",
            "Local GGUF models with the engine included",
            "Live preview of your apps in the Sandbox",
            "CLI for Windows, macOS and Linux",
        ],
    },
}
THEMES = {
    "dark": {
        "bg0": "#05060b",
        "bg1": "#0d1124",
        "glow": "#4f7cff",
        "title0": "#ffffff",
        "title1": "#8fb3ff",
        "text": "#c9cfdf",
        "muted": "#8a93a8",
        "chip": "#151a2e",
        "chipBorder": "#2a3352",
        "star": "#ffffff",
        "logo": "tian-white.png",
    },
    "light": {
        "bg0": "#f7f8fc",
        "bg1": "#e8edfb",
        "glow": "#3b63e6",
        "title0": "#0b0d14",
        "title1": "#3554c9",
        "text": "#2a3040",
        "muted": "#5c6478",
        "chip": "#ffffff",
        "chipBorder": "#cfd7ee",
        "star": "#3554c9",
        "logo": "tian-black.png",
    },
}


def stars(color: str) -> str:
    rnd = random.Random(7)
    out = []
    for index in range(46):
        x, y = rnd.uniform(0, WIDTH), rnd.uniform(0, HEIGHT)
        r = rnd.choice([0.7, 0.9, 1.1, 1.4])
        delay = rnd.uniform(0, 4)
        out.append(
            f'<circle class="star" cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="{color}" style="animation-delay:{delay:.2f}s"/>'
        )
    return "\n    ".join(out)


def banner(theme: str, lang: str) -> str:
    t = THEMES[theme]
    copy = COPY[lang]
    logo = base64.b64encode((ROOT / "frontend/icons" / t["logo"]).read_bytes()).decode()
    cycle = 3.2 * len(copy["features"])
    step = 100 / len(copy["features"])
    features = "\n    ".join(
        f'<text class="feature" x="560" y="330" style="animation-delay:{index * 3.2:.1f}s">{escape(text)}</text>'
        for index, text in enumerate(copy["features"])
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="Tiancode: {escape(copy['tagline'])}">
  <title>Tiancode</title>
  <defs>
    <radialGradient id="bg" cx="30%" cy="45%" r="85%">
      <stop offset="0" stop-color="{t['bg1']}"/>
      <stop offset="1" stop-color="{t['bg0']}"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="{t['glow']}" stop-opacity=".45"/>
      <stop offset="1" stop-color="{t['glow']}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="{t['title0']}"/>
      <stop offset=".45" stop-color="{t['title0']}"/>
      <stop offset=".5" stop-color="{t['title1']}"/>
      <stop offset=".55" stop-color="{t['title0']}"/>
      <stop offset="1" stop-color="{t['title0']}"/>
      <animate attributeName="x1" values="-1;1" dur="5s" repeatCount="indefinite"/>
      <animate attributeName="x2" values="0;2" dur="5s" repeatCount="indefinite"/>
    </linearGradient>
    <clipPath id="type">
      <rect x="560" y="200" height="60" width="0">
        <animate attributeName="width" values="0;640;640;0" keyTimes="0;.35;.9;1" dur="9s" repeatCount="indefinite"/>
      </rect>
    </clipPath>
  </defs>
  <style>
    .star {{ opacity: .15; animation: twinkle 4s ease-in-out infinite; }}
    @keyframes twinkle {{ 0%, 100% {{ opacity: .12; }} 50% {{ opacity: .85; }} }}
    .orbit {{ transform-origin: 300px 210px; animation: spin 24s linear infinite; }}
    .orbit.slow {{ animation-duration: 40s; animation-direction: reverse; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    .cat {{ animation: float 6s ease-in-out infinite; }}
    @keyframes float {{ 0%, 100% {{ transform: translateY(0); }} 50% {{ transform: translateY(-8px); }} }}
    .halo {{ transform-origin: 300px 210px; animation: pulse 6s ease-in-out infinite; }}
    @keyframes pulse {{ 0%, 100% {{ opacity: .55; transform: scale(.94); }} 50% {{ opacity: 1; transform: scale(1.06); }} }}
    .title {{ font: 800 92px 'Segoe UI', Inter, system-ui, -apple-system, sans-serif; letter-spacing: -2px; }}
    .tagline {{ font: 500 30px 'Segoe UI', Inter, system-ui, -apple-system, sans-serif; fill: {t['text']}; }}
    .caret {{ fill: {t['glow']}; animation: blink 1s steps(1) infinite; }}
    @keyframes blink {{ 50% {{ opacity: 0; }} }}
    .feature {{ font: 600 22px 'Segoe UI', Inter, system-ui, -apple-system, sans-serif; fill: {t['muted']}; opacity: 0; animation: feature {cycle:.1f}s ease-in-out infinite; }}
    @keyframes feature {{ 0% {{ opacity: 0; transform: translateY(10px); }} {step * 0.12:.2f}% {{ opacity: 1; transform: translateY(0); }} {step * 0.85:.2f}% {{ opacity: 1; transform: translateY(0); }} {step:.2f}%, 100% {{ opacity: 0; transform: translateY(-10px); }} }}
    .chip {{ fill: {t['chip']}; stroke: {t['chipBorder']}; }}
    @media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; }} .feature:first-of-type {{ opacity: 1; }} }}
  </style>
  <rect width="{WIDTH}" height="{HEIGHT}" rx="24" fill="url(#bg)"/>
  <g>
    {stars(t['star'])}
  </g>
  <circle class="halo" cx="300" cy="210" r="190" fill="url(#halo)"/>
  <g fill="none" stroke="{t['glow']}" stroke-opacity=".35">
    <ellipse class="orbit" cx="300" cy="210" rx="200" ry="74" stroke-dasharray="4 10"/>
    <ellipse class="orbit slow" cx="300" cy="210" rx="160" ry="150" stroke-dasharray="2 14" stroke-opacity=".25"/>
  </g>
  <g class="cat">
    <image href="data:image/png;base64,{logo}" x="140" y="102" width="320" height="216" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <text class="title" x="556" y="176" fill="url(#title)">Tiancode</text>
  <g clip-path="url(#type)">
    <text class="tagline" x="560" y="240">{escape(copy['tagline'])}</text>
  </g>
  <rect class="caret" x="560" y="214" width="3" height="32">
    <animate attributeName="x" values="560;1200;1200;560" keyTimes="0;.35;.9;1" dur="9s" repeatCount="indefinite"/>
  </rect>
  <rect class="chip" x="548" y="300" width="680" height="44" rx="22"/>
  <g>
    {features}
  </g>
</svg>
"""


OUT.mkdir(parents=True, exist_ok=True)
for name in THEMES:
    for lang in COPY:
        file = OUT / (f"hero-{name}.svg" if lang == "es" else f"hero-{name}-{lang}.svg")
        file.write_text(banner(name, lang), encoding="utf-8", newline="\n")
        print("wrote", file)
