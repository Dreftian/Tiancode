"""Generates frontend/icons/readme/terminal[-en].svg: an animated Tiancode CLI session for the README.

Commands type themselves in, their output appears line by line, and the loop restarts. Pure SVG +
SMIL/CSS so GitHub's image proxy renders it (no scripts, no external fonts or files).
Run: python tools/script/readme-terminal.py
"""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/icons/readme"
WIDTH, LINE, TOP, LEFT = 920, 26, 70, 28
LOOP = 16.0

MODELS = [
    ("cmd", "tiancode models opencode", 0.4),
    ("out", "opencode/big-pickle", 2.0),
    ("out", "opencode/ling-3.1-flash-free", 2.2),
    ("out", "opencode/nemotron-3.5-lightning-free", 2.4),
    ("out", "opencode/space-bunny-free", 2.6),
]
# (kind, text, start second). Commands type in over ~1.2 s; output lines simply appear.
COPY = {
    "es": {
        "label": "Sesión de ejemplo del CLI de Tiancode",
        "title": "tiancode — ~/proyectos/web",
        "script": MODELS
        + [
            ("cmd", 'tiancode run "Añade un modo oscuro que siga al sistema"', 3.8),
            ("dim", "> build · deepseek-v4-pro", 5.6),
            ("ok", "✓ Leer      src/styles.css", 6.4),
            ("ok", "✓ Editar    src/styles.css  +38 −4", 7.2),
            ("ok", "✓ Shell     bun run build", 8.2),
            ("say", "Listo: el tema oscuro sigue al sistema y la preferencia se guarda.", 9.4),
        ],
    },
    "en": {
        "label": "Example Tiancode CLI session",
        "title": "tiancode — ~/projects/web",
        "script": MODELS
        + [
            ("cmd", 'tiancode run "Add a dark mode that follows the system"', 3.8),
            ("dim", "> build · deepseek-v4-pro", 5.6),
            ("ok", "✓ Read      src/styles.css", 6.4),
            ("ok", "✓ Edit      src/styles.css  +38 −4", 7.2),
            ("ok", "✓ Shell     bun run build", 8.2),
            ("say", "Done: dark mode follows the system and the choice is saved.", 9.4),
        ],
    },
}
COLORS = {"out": "#c9d1e3", "dim": "#7d879c", "ok": "#5bd38c", "say": "#e8ecf6"}


def line(index: int, kind: str, text: str, start: float) -> str:
    y = TOP + index * LINE
    begin = start / LOOP
    end = 0.94
    visible = (
        f'<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;{begin:.4f};{begin + 0.001:.4f};{end};1" '
        f'dur="{LOOP}s" repeatCount="indefinite"/>'
    )
    if kind != "cmd":
        return f'<text x="{LEFT}" y="{y}" fill="{COLORS[kind]}" opacity="0">{escape(text)}{visible}</text>'
    width = 22 + len(text) * 9.6
    typed = (start + 1.2) / LOOP
    return f"""<g opacity="0">{visible}
      <text x="{LEFT}" y="{y}" fill="#7aa2ff">❯</text>
      <clipPath id="c{index}"><rect x="{LEFT + 20}" y="{y - 18}" height="24" width="0">
        <animate attributeName="width" values="0;0;{width:.0f};{width:.0f};0" keyTimes="0;{begin:.4f};{typed:.4f};{end};1" dur="{LOOP}s" repeatCount="indefinite"/>
      </rect></clipPath>
      <text x="{LEFT + 20}" y="{y}" fill="#ffffff" clip-path="url(#c{index})">{escape(text)}</text>
    </g>"""


def terminal(lang: str) -> str:
    copy = COPY[lang]
    script = copy["script"]
    height = TOP + len(script) * LINE + 30
    body = "\n    ".join(line(index, *item) for index, item in enumerate(script))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" viewBox="0 0 {WIDTH} {height}" role="img" aria-label="{escape(copy['label'])}">
  <title>Tiancode CLI</title>
  <style>
    text {{ font: 15.5px 'Cascadia Code', 'JetBrains Mono', Consolas, 'SFMono-Regular', Menlo, monospace; white-space: pre; }}
    .cursor {{ animation: blink 1s steps(1) infinite; }}
    @keyframes blink {{ 50% {{ opacity: 0; }} }}
    @media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; }} }}
  </style>
  <rect width="{WIDTH}" height="{height}" rx="14" fill="#0b0d14"/>
  <rect width="{WIDTH}" height="40" rx="14" fill="#151927"/>
  <rect y="26" width="{WIDTH}" height="14" fill="#151927"/>
  <circle cx="24" cy="20" r="6" fill="#ff5f57"/>
  <circle cx="44" cy="20" r="6" fill="#febc2e"/>
  <circle cx="64" cy="20" r="6" fill="#28c840"/>
  <text x="{WIDTH / 2}" y="25" fill="#8a93a8" text-anchor="middle" style="font-size:13px">{escape(copy['title'])}</text>
  <g>
    {body}
  </g>
  <rect class="cursor" x="{LEFT}" y="{height - 30}" width="9" height="18" fill="#7aa2ff"/>
</svg>
"""


OUT.mkdir(parents=True, exist_ok=True)
for lang in COPY:
    file = OUT / ("terminal.svg" if lang == "es" else f"terminal-{lang}.svg")
    file.write_text(terminal(lang), encoding="utf-8", newline="\n")
    print("wrote", file)
