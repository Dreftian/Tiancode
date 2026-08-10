// Lectura en voz alta del anuncio del asistente, sincronizada con el stream.
//
// Mientras el modelo genera una respuesta, su primer tramo de texto es el
// anuncio de lo que va a hacer. Leerlo por fragmentos suena cortado y
// desincronizado ("Voy a" → pausa → "crear la web"), así que se espera a que
// el texto deje de crecer (pausa del stream) y se lee el anuncio COMPLETO de
// una vez. El resto del mensaje no se lee. Si el usuario envía una petición o
// desactiva la opción, la lectura se corta (stopAutoSpeak) y el siguiente
// anuncio arranca limpio.

import { currentSpeakingKey, speakWithVoices, stopSpeaking, isVoiceSpeaking } from "./voices"

const AUTO_KEY_PREFIX = "auto:"
const MAX_AUTO_CHARS = 60_000
// Número máximo de partes recordadas: el set crece con cada parte transmitida,
// así que las más antiguas se descartan para no acumular memoria sin límite.
const MAX_SEEN_PARTS = 500
// Pausa del stream que indica que el anuncio está completo (el modelo suele
// pausar entre el plan y la ejecución).
const STABILIZE_MS = 1400
// Si el modelo genera sin pausas, se lee lo acumulado pasada esta espera.
const MAX_WAIT_MS = 8000

// Partes que ya se consideran leídas: al volver a activar la opción no se
// releen mensajes antiguos (el timeline solo encola partes nuevas).
const seenParts = new Set<string>()

// Partes cuyo anuncio ya se leyó: el resto del texto de la misma parte no se
// vuelve a leer (solo anuncio).
const announcedParts = new Set<string>()

// Devuelve true si la parte es nueva (y la recuerda); false si ya se vio. El
// set conserva el orden de inserción, así que descartar la primera entrada
// evita las más antiguas. Una parte descartada podría releerse si sigue
// transmitiendo texto, un coste asumible en sesiones de miles de partes.
function markSeen(partId: string) {
  if (seenParts.has(partId)) return false
  seenParts.add(partId)
  if (seenParts.size > MAX_SEEN_PARTS) {
    const oldest = seenParts.values().next().value
    if (oldest !== undefined) seenParts.delete(oldest)
  }
  return true
}

function autoKey(partId: string) {
  return `${AUTO_KEY_PREFIX}${partId}`
}

let currentKey: string | undefined
let pendingText = ""
let stabilizeTimer: ReturnType<typeof setTimeout> | undefined
let maxWaitTimer: ReturnType<typeof setTimeout> | undefined

// Encola el texto nuevo de la parte (se llama en cada cambio del stream).
export function enqueueAutoSpeak(partId: string, text: string) {
  const key = autoKey(partId)
  if (markSeen(partId)) {
    // Parte nueva: el anuncio empieza a formarse. Se espera a que el stream
    // haga una pausa para leerlo completo, no en fragmentos.
    if (!text.trim()) return
    currentKey = key
    pendingText = text
    scheduleStabilize(key)
    return
  }
  if (currentKey !== key) return
  if (announcedParts.has(partId)) return
  if (text.length > MAX_AUTO_CHARS) return
  if (text === pendingText) return
  pendingText = text
  scheduleStabilize(key)
}

function scheduleStabilize(key: string) {
  if (stabilizeTimer !== undefined) clearTimeout(stabilizeTimer)
  stabilizeTimer = setTimeout(() => {
    stabilizeTimer = undefined
    if (maxWaitTimer !== undefined) {
      clearTimeout(maxWaitTimer)
      maxWaitTimer = undefined
    }
    void readAnnouncement(key)
  }, STABILIZE_MS)
  if (maxWaitTimer === undefined) {
    maxWaitTimer = setTimeout(() => {
      maxWaitTimer = undefined
      if (stabilizeTimer !== undefined) {
        clearTimeout(stabilizeTimer)
        stabilizeTimer = undefined
      }
      void readAnnouncement(key)
    }, MAX_WAIT_MS)
  }
}

async function readAnnouncement(key: string) {
  if (currentKey !== key) return
  const partId = key.slice(AUTO_KEY_PREFIX.length)
  if (announcedParts.has(partId)) return
  const text = pendingText
  if (!text.trim()) return
  // Si el usuario empezó a leer algo manualmente, se descarta la lectura.
  const active = currentSpeakingKey()
  if (active && active !== key) return
  const error = await speakWithVoices(key, text)
  if (error) return
  announcedParts.add(partId)
}

// Detiene la lectura automática y limpia el estado (sin olvidar las partes ya
// leídas, para que reactivar la opción no relea mensajes antiguos).
export function stopAutoSpeak() {
  if (currentKey && isVoiceSpeaking(currentKey)) stopSpeaking()
  currentKey = undefined
  pendingText = ""
  if (stabilizeTimer !== undefined) {
    clearTimeout(stabilizeTimer)
    stabilizeTimer = undefined
  }
  if (maxWaitTimer !== undefined) {
    clearTimeout(maxWaitTimer)
    maxWaitTimer = undefined
  }
}
