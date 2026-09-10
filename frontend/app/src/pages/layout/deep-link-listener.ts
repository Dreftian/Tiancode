import { onMount } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { base64Encode } from "@tiancode-ai/core/util/encode"
import { setSessionHandoff } from "@/pages/session/handoff"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"
import {
  collectNewSessionDeepLinks,
  collectOpenProjectDeepLinks,
  deepLinkEvent,
  drainPendingDeepLinks,
  type TiancodeWindow,
} from "./deep-links"

export interface DeepLinkDeps {
  /** Deep links are only honoured against a local server. */
  isLocal: () => boolean
  scope: () => Parameters<typeof SessionStateKey.from>[0]
  openProject: (directory: string, navigate?: boolean) => unknown
  navigate: (href: string) => void
}

/** Acts on a batch of `tiancode://` URLs. Exported for tests. */
export function handleDeepLinks(urls: string[], deps: DeepLinkDeps) {
  if (!deps.isLocal()) return

  for (const directory of collectOpenProjectDeepLinks(urls)) {
    void deps.openProject(directory)
  }

  for (const link of collectNewSessionDeepLinks(urls)) {
    void deps.openProject(link.directory, false)
    const slug = base64Encode(link.directory)
    // The prompt is stashed before navigating so the session picks it up on mount.
    if (link.prompt) {
      setSessionHandoff(SessionStateKey.from(deps.scope(), SessionRouteKey.fromLegacy(slug)), {
        prompt: link.prompt,
      })
    }
    const href = link.prompt ? `/${slug}/session?prompt=${encodeURIComponent(link.prompt)}` : `/${slug}/session`
    deps.navigate(href)
  }
}

/**
 * Subscribes to deep links delivered by the desktop shell.
 *
 * Drains whatever arrived before this mounted — the shell can hand the app a URL that opened
 * it, which lands before any listener exists — then listens for later ones.
 *
 * Must be called from a reactive owner: makeEventListener unbinds on cleanup.
 */
export function createDeepLinkListener(deps: DeepLinkDeps, target: Window & TiancodeWindow = window) {
  onMount(() => {
    const handler = (event: Event) => {
      const urls = (event as CustomEvent<{ urls: string[] }>).detail?.urls ?? []
      if (urls.length === 0) return
      handleDeepLinks(urls, deps)
    }

    handleDeepLinks(drainPendingDeepLinks(target), deps)
    makeEventListener(target, deepLinkEvent, handler as EventListener)
  })
}
