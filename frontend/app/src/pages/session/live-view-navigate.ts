import { createSignal } from "solid-js"

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
