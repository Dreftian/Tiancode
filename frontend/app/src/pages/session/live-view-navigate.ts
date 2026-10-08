import { createEffect, createSignal, on } from "solid-js"

// Redirección de destinos de vista previa local hacia el panel "Vista en
// vivo": el desktop shell reenvía aquí los clics del renderer (window.open,
// target="_blank", will-navigate) que apuntan a un dev server local o a un
// HTML del proyecto, y el wrapper de openExternal hace lo mismo con las
// URLs que la propia UI intenta abrir fuera. Un solo consumidor (la sesión
// con sandbox) navega el panel; sin sesión abierta la URL se ignora para no
// robar foco a otras vistas.

const [liveViewNavigateRequest, setLiveViewNavigateRequest] = createSignal<{ url: string; stamp: number } | undefined>()

export function requestLiveViewNavigation(url: string) {
  setLiveViewNavigateRequest({ url, stamp: Date.now() })
}

export { liveViewNavigateRequest }

/**
 * Opens the Sandbox once per navigation request.
 *
 * The request is consumed as soon as it is seen. It used to stay pending, and the effect that
 * answered it also read the layout store through `open()`, so closing the panel re-ran the effect
 * with the same request and reopened it: a preview the user could not close.
 */
export function useLiveViewNavigation(input: { enabled: () => boolean; open: (url: string) => void }) {
  createEffect(
    on(liveViewNavigateRequest, (request) => {
      if (!request) return
      setLiveViewNavigateRequest(undefined)
      if (!input.enabled()) return
      input.open(request.url)
    }),
  )
}
