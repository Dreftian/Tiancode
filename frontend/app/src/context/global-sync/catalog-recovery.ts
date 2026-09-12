// Recuperación del catálogo de proveedores cuando arranca vacío.
//
// El cliente de consultas de la app tiene `refetchOnMount`, `refetchOnWindowFocus` y
// `refetchOnReconnect` desactivados: es lo correcto para no recargar por cada foco, pero deja
// un agujero. La consulta de proveedores se monta una sola vez, al arrancar; si en ese momento
// el servidor aún no ha terminado de cargar su catálogo (lo típico justo después de actualizar
// la app, cuando el sidecar se está levantando), la respuesta vacía se queda cacheada para
// siempre y no hay nada que la vuelva a pedir. De ahí el "abro la app y no están mis modelos;
// cierro todo, vuelvo a abrir y ya aparecen".
//
// Esto es la red de seguridad: mientras el catálogo siga vacío se vuelve a preguntar unas pocas
// veces con espera creciente, y se para en cuanto llega algo (o cuando se agotan los intentos,
// que es el caso legítimo de una instalación nueva sin ningún proveedor).

/** Esperas entre reintentos. Cubren un arranque lento sin castigar a quien no tiene proveedores. */
export const CATALOG_RECOVERY_DELAYS_MS = [800, 2_000, 5_000] as const

export type CatalogRecoveryInput = {
  /** Cuántos proveedores ve la app ahora mismo. */
  size: () => number
  /** Si el arranque inicial aún está en curso: reintentar antes no aporta nada. */
  booting: () => boolean
  refresh: () => void
  schedule: (run: () => void, delayMs: number) => { cancel: () => void }
}

export type CatalogRecovery = {
  /** Llamar cuando cambie el estado observado (tamaño del catálogo o arranque). */
  sync: () => void
  stop: () => void
}

export function createCatalogRecovery(input: CatalogRecoveryInput): CatalogRecovery {
  let attempt = 0
  let pending: { cancel: () => void } | undefined
  let stopped = false

  const clear = () => {
    pending?.cancel()
    pending = undefined
  }

  const sync = () => {
    if (stopped) return
    if (input.booting()) {
      clear()
      return
    }
    if (input.size() > 0) {
      // Ya hay catálogo: no hace falta seguir insistiendo, y si más adelante se vacía por una
      // desconexión real tampoco queremos reintentar: eso es el estado correcto.
      clear()
      attempt = CATALOG_RECOVERY_DELAYS_MS.length
      return
    }
    if (pending) return
    const delay = CATALOG_RECOVERY_DELAYS_MS[attempt]
    if (delay === undefined) return
    attempt += 1
    pending = input.schedule(() => {
      pending = undefined
      if (stopped) return
      if (input.size() > 0) return
      input.refresh()
    }, delay)
  }

  return {
    sync,
    stop: () => {
      stopped = true
      clear()
    },
  }
}
