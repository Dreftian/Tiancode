import { createSignal } from "solid-js"

// The managed runtime's URL (Vite, JSX, Python…) the Sandbox should show. It is tied to its
// directory so a new session never inherits another project's URL. Kept apart from
// live-view-panel.tsx so the session page can set it without loading the whole Sandbox.
export type LiveViewManagedTarget = { directory: string; url: string }
export const [liveViewManagedTarget, setLiveViewManagedTarget] = createSignal<LiveViewManagedTarget | undefined>(undefined)

export function managedUrlForDirectory(target: LiveViewManagedTarget | undefined, directory: string | undefined) {
  return target && target.directory === directory ? target.url : undefined
}
