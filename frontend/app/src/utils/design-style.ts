/** Original design directions; no third-party prompts or assets are embedded. */
export const DESIGN_STYLES = [
  {
    id: "studio",
    background: "#f4f1eb",
    foreground: "#242824",
    accent: "#3e6b52",
    font: "serif",
    radius: "3px",
    instruction:
      "Warm editorial studio: ivory surfaces, forest-green accents, expressive serif headings, readable sans-serif body, generous asymmetric whitespace and strong photography hierarchy.",
  },
  {
    id: "product",
    background: "#f8fafc",
    foreground: "#162339",
    accent: "#2563eb",
    font: "sans-serif",
    radius: "10px",
    instruction:
      "Clear product interface: cool neutral surfaces, restrained blue accents, sans-serif typography, an eight-pixel spacing rhythm, compact navigation and accessible forms with explicit states.",
  },
  {
    id: "midnight",
    background: "#10151d",
    foreground: "#e5edf5",
    accent: "#65d6c4",
    font: "sans-serif",
    radius: "12px",
    instruction:
      "Midnight workspace: deep charcoal rather than pure black, subtle layered surfaces, mint accents, crisp readable sans-serif text, restrained borders and data-focused visual hierarchy.",
  },
  {
    id: "geometric",
    background: "#fff4dc",
    foreground: "#231b32",
    accent: "#e9663f",
    font: "sans-serif",
    radius: "2px",
    instruction:
      "Playful geometric identity: warm cream, coral and ink, bold geometric headings, flat color blocks, deliberate grid breaks and tactile buttons. Keep ornament secondary to content.",
  },
  {
    id: "precision",
    background: "#eef1ed",
    foreground: "#14251e",
    accent: "#24734b",
    font: "monospace",
    radius: "2px",
    instruction:
      "Technical precision: pale neutral-green surfaces, dark ink, monospace labels with readable body text, precise alignment, thin rules, information-dense tables and clear interactive affordances.",
  },
  {
    id: "atelier",
    background: "#211c1b",
    foreground: "#f4e9d9",
    accent: "#d7ae71",
    font: "serif",
    radius: "0px",
    instruction:
      "Refined atelier: espresso and warm ivory, muted brass accents, elegant serif titles, fine rules, deliberate whitespace, large product imagery and minimal motion.",
  },
] as const

export type DesignStyle = "ask" | (typeof DESIGN_STYLES)[number]["id"]

export function designStyleDirective(agent: string, style: DesignStyle) {
  if (agent !== "webapp") return
  const selected = DESIGN_STYLES.find((item) => item.id === style)
  return [
    "[TIANCODE DESIGN DIRECTION]",
    selected
      ? `The user selected this visual direction: ${selected.instruction}`
      : "For a new interface without a stated visual direction, offer three distinct, concrete visual directions using the question tool before implementation. Describe palette, typography and layout. If the user already chose a style or asks you to decide, proceed with that instruction.",
    "Respect the existing brand and components when modifying a project. Implement the UI and its backend behavior, including loading, empty, error and success states. Verify narrow and wide viewports, keyboard navigation, contrast and reduced motion. Show actual work in the live preview when available. Do not invent screenshots, progress, backend data or test results.",
  ].join("\n")
}

export const CLEAR_RESPONSE_DIRECTIVE =
  "[TIANCODE RESPONSE STYLE]\nLead with the result or next concrete action. Use short paragraphs and numbered steps only for sequences. Keep essential evidence, errors, uncertainty and costs visible. Expand technical detail when the user asks. Do not omit validation or necessary work to shorten the answer."
