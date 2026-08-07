// Lectura en voz alta en tiempo real: mientras el modelo genera una respuesta,
// el texto nuevo se divide en tramos y se encola para reproducirse con la voz
// seleccionada. Cada tramo suena cuando termina el anterior; si el usuario
// habla un mensaje manualmente o desactiva la opción, la cola se descarta.

import { currentSpeakingKey, speakWithVoices, stopSpeaking, isVoiceSpeaking } from "./voices"

const AUTO_KEY_PREFIX = "auto:"
const MAX_AUTO_CHARS = 60_000
// Un tramo suena ~2-4s; dividir por oraciones evita cortes a mitad de frase.
const splitChunks = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)

// Partes que ya se consideran leídas: al volver a activar la opción no se
// releen mensajes antiguos (el timeline solo encola partes nuevas).
const seenParts = new Set<string>()

let currentKey: string | undefined
let consumed = 0
let queue: string[] = []
let pumping = false

function autoKey(partId: string) {
  return `${AUTO_KEY_PREFIX}${partId}`
}

// Encola el texto nuevo de una parte (se llama en cada cambio del stream).
export function enqueueAutoSpeak(partId: string, text: string) {
  const key = autoKey(partId)
  if (!seenParts.has(partId)) {
    seenParts.add(partId)
    // Parte nueva: arranca la lectura con el texto disponible hasta ahora.
    if (!text.trim()) return
    currentKey = key
    consumed = 0
    queue = []
  } else if (currentKey !== key) {
    return
  }
  if (text.length > MAX_AUTO_CHARS) return
  const fresh = text.slice(consumed)
  consumed = text.length
  if (!fresh.trim()) return
  queue.push(...splitChunks(fresh))
  void pump(key)
}

async function pump(key: string) {
  if (pumping) return
  pumping = true
  try {
    while (queue.length > 0) {
      if (currentKey !== key) return
      // Si el usuario empezó a leer algo manualmente, se descarta la cola.
      const active = currentSpeakingKey()
      if (active && active !== key) {
        queue = []
        return
      }
      const chunk = queue[0]
      const error = await speakWithVoices(key, chunk)
      if (error) {
        queue = []
        return
      }
      if (currentKey !== key) return
      queue.shift()
    }
  } finally {
    pumping = false
  }
}

// Detiene la lectura automática y limpia la cola (sin olvidar las partes ya
// leídas, para que reactivar la opción no relea mensajes antiguos).
export function stopAutoSpeak() {
  if (currentKey && isVoiceSpeaking(currentKey)) stopSpeaking()
  currentKey = undefined
  consumed = 0
  queue = []
  pumping = false
}
