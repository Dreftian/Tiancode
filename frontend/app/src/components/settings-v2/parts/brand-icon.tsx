import { createMemo, Show, type Component, type JSX } from "solid-js"
import { BRAND_ICONS, type BrandIconName } from "./brand-icons"

export type { BrandIconName } from "./brand-icons"

// Ordered from specific to generic: the first pattern that matches a candidate wins, and
// candidates are tested one at a time so an id or display name beats a command line.
const MATCHERS: Array<[RegExp, BrandIconName]> = [
  [/github/, "github"],
  [/gitlab/, "gitlab"],
  [/bitbucket/, "bitbucket"],
  [/slack/, "slack"],
  [/notion/, "notion"],
  [/figma/, "figma"],
  [/linear/, "linear"],
  [/jira/, "jira"],
  [/confluence/, "confluence"],
  [/atlassian/, "atlassian"],
  [/postgres|pgsql|\bpg\b/, "postgresql"],
  [/supabase/, "supabase"],
  [/stripe/, "stripe"],
  [/sentry/, "sentry"],
  [/vercel/, "vercel"],
  [/cloudflare/, "cloudflare"],
  [/gmail/, "gmail"],
  [/calendar/, "googlecalendar"],
  [/sheets/, "googlesheets"],
  [/maps/, "googlemaps"],
  [/drive/, "googledrive"],
  [/youtube/, "youtube"],
  [/discord/, "discord"],
  [/telegram/, "telegram"],
  [/docker/, "docker"],
  [/kubernetes|\bk8s\b/, "kubernetes"],
  [/redis/, "redis"],
  [/mongo/, "mongodb"],
  [/sqlite/, "sqlite"],
  [/mysql|mariadb/, "mysql"],
  [/brave/, "brave"],
  [/hugging|\bhf\b/, "huggingface"],
  [/ollama/, "ollama"],
  [/openai|\bgpt\b|codex/, "openai"],
  [/anthropic|claude/, "anthropic"],
  [/gemini/, "googlegemini"],
  [/zapier/, "zapier"],
  [/airtable/, "airtable"],
  [/trello/, "trello"],
  [/asana/, "asana"],
  [/obsidian/, "obsidian"],
  [/zoom/, "zoom"],
  [/canva/, "canva"],
  [/\bnpm\b/, "npm"],
  [/python|\bpip\b|pandas|numpy|jupyter/, "python"],
  [/\bnode(?:js|\.js)?\b/, "nodedotjs"],
  [/react/, "react"],
  [/\bvue/, "vuedotjs"],
  [/angular/, "angular"],
  [/svelte/, "svelte"],
  [/next\.?js/, "nextdotjs"],
  [/tailwind/, "tailwindcss"],
  [/typescript/, "typescript"],
  [/\brust\b|cargo/, "rust"],
  [/\bgo(?:lang)?\b/, "go"],
  [/android/, "android"],
  [/\bios\b|apple|xcode|swift|macos/, "apple"],
  [/prisma/, "prisma"],
  [/firebase/, "firebase"],
  [/graphql/, "graphql"],
  [/terraform/, "terraform"],
  [/shopify/, "shopify"],
  [/wordpress/, "wordpress"],
  [/hubspot/, "hubspot"],
  [/salesforce/, "salesforce"],
  [/chrome|browser/, "googlechrome"],
  [/perplexity/, "perplexity"],
  [/postman/, "postman"],
  [/owasp/, "owasp"],
  [/wireshark/, "wireshark"],
  [/kali/, "kalilinux"],
  [/dropbox/, "dropbox"],
  [/\bgcp\b|google.?cloud|vertex/, "googlecloud"],
  [/\baws\b|amazon|bedrock/, "amazonwebservices"],
  [/digitalocean/, "digitalocean"],
  [/heroku/, "heroku"],
  [/netlify/, "netlify"],
  [/\bvite\b/, "vite"],
  [/\bjest\b/, "jest"],
  [/cypress/, "cypress"],
  [/storybook/, "storybook"],
  [/unity/, "unity"],
  [/blender/, "blender"],
  [/framer/, "framer"],
  [/webflow/, "webflow"],
  [/paypal/, "paypal"],
  [/\bmeta\b|llama/, "meta"],
  [/nvidia|cuda/, "nvidia"],
  [/linux|ubuntu/, "linux"],
  [/google/, "google"],
  [/\bgit\b/, "git"],
]

// Resolve the official mark for an integration from its id, display name or command.
export function brandFor(...candidates: Array<string | undefined | null>): BrandIconName | undefined {
  for (const candidate of candidates) {
    const text = candidate?.toLowerCase().trim()
    if (!text) continue
    const hit = MATCHERS.find(([pattern]) => pattern.test(text))
    if (hit) return hit[1]
  }
  return undefined
}

function luminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) => ((value >> shift) & 255) / 255
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

export const BrandIcon: Component<{ name: BrandIconName; size?: number; class?: string; mono?: boolean }> = (props) => {
  const entry = () => BRAND_ICONS[props.name]
  // Near-black marks (GitHub, Apple, Vercel…) vanish on dark surfaces: those follow the text colour.
  const fill = () => (props.mono || luminance(entry()[1]) < 0.22 ? "currentColor" : entry()[1])
  return (
    <svg
      data-component="brand-icon"
      role="img"
      aria-label={entry()[0]}
      viewBox="0 0 24 24"
      width={props.size ?? 18}
      height={props.size ?? 18}
      class={props.class}
      fill={fill()}
    >
      <title>{entry()[0]}</title>
      <path d={entry()[2]} />
    </svg>
  )
}

// Official mark when one is recognised, otherwise whatever the caller already showed (emoji, glyph).
export const BrandOrFallback: Component<{
  names: Array<string | undefined | null>
  size?: number
  fallback: JSX.Element
}> = (props) => {
  const brand = createMemo(() => brandFor(...props.names))
  return (
    <Show when={brand()} fallback={props.fallback}>
      {(name) => <BrandIcon name={name()} size={props.size} />}
    </Show>
  )
}
