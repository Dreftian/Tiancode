// Voz femenina de español de Kokoro (ef_dora) con el motor kokoro de
// sherpa-onnx (WASM, sin addon nativo): el mismo espeak-ng-data compartido del
// piper fonemiza el español y el modelo multilingüe Kokoro-82M sintetiza la
// voz (el mismo style vector de la voz "Sol" de Codex/ChatGPT).
//
// Nota: kokoro-js 1.2.1 solo fonemiza inglés (su phonemizer espeak-ng no trae
// español), y el motor kokoro del wasm de sherpa-onnx SÍ funciona con el
// modelo multilingüe int8 (verificado: genera audio en español con ef_dora).

import { app } from "electron"
import { existsSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { downloadFile, ensureSharedData, isSharedDataDownloaded, reportProgress, sharedDataDir, type PiperAudio } from "./piper"
import { write as writeLog } from "./logging"

const HF_BASE = "https://huggingface.co"
const HF_API = "https://huggingface.co/api/models"
const KOKORO_ES_REPO = "csukuangfj/kokoro-int8-multi-lang-v1_0"
const DICT_DIR = "dict"
const COMPLETE_MARKER = ".complete"

function kokoroEsDir() {
  return join(app.getPath("userData"), "kokoro-es")
}

export function isKokoroEsDownloaded() {
  const dir = kokoroEsDir()
  return existsSync(join(dir, COMPLETE_MARKER)) && existsSync(join(dir, "model.int8.onnx"))
}

// Automatic narration must never turn into an implicit network operation. The
// visible voice download marker alone is not enough because its shared
// phonemizer data and a few runtime files are fetched separately.
export function isKokoroEsReadyForSynthesis() {
  const dir = kokoroEsDir()
  return (
    isKokoroEsDownloaded() &&
    isSharedDataDownloaded() &&
    ["voices.bin", "tokens.txt", "lexicon-us-en.txt", join(DICT_DIR, COMPLETE_MARKER)].every((file) => existsSync(join(dir, file)))
  )
}

// El espeak-ng-data lo comparte el piper (ya descargado con todos los idiomas,
// incluido el español); el modelo multilingüe int8 + el binario de voces (todas
// las voces kokoro, entre ellas ef_dora) + tokens/lexicon/dict son propios.
async function downloadKokoroEsInner() {
  const dir = kokoroEsDir()
  await mkdir(dir, { recursive: true })

  for (const file of ["model.int8.onnx", "voices.bin", "tokens.txt", "lexicon-us-en.txt"]) {
    const dest = join(dir, file)
    if (existsSync(dest)) continue
    await downloadFile(`${HF_BASE}/${KOKORO_ES_REPO}/resolve/main/${file}`, dest, undefined)
  }

  // dict/ (directorio pequeño con los diccionarios del tokenizador kokoro).
  const dictDir = join(dir, DICT_DIR)
  if (!existsSync(join(dictDir, COMPLETE_MARKER))) {
    await mkdir(dictDir, { recursive: true })
    const res = await fetch(`${HF_API}/${KOKORO_ES_REPO}/tree/main/${DICT_DIR}?recursive=true`)
    if (!res.ok) throw new Error(`Failed to list ${DICT_DIR}: HTTP ${res.status}`)
    const entries = (await res.json()) as { path: string; type: string }[]
    for (const entry of entries) {
      if (entry.type !== "file") continue
      const dest = join(dictDir, entry.path.slice(DICT_DIR.length + 1))
      if (existsSync(dest)) continue
      await downloadFile(`${HF_BASE}/${KOKORO_ES_REPO}/resolve/main/${entry.path}`, dest, undefined)
    }
    await writeFile(join(dictDir, COMPLETE_MARKER), "")
  }

  await writeFile(join(dir, COMPLETE_MARKER), "")
  writeLog("voices", "downloaded kokoro es voice", { voice: "ef_dora" })
}

export async function downloadKokoroEs(voiceId: string) {
  await downloadKokoroEsInner()
  reportProgress(voiceId, 100, undefined, true)
}

export async function deleteKokoroEs() {
  await rm(kokoroEsDir(), { recursive: true, force: true })
  ttsPromise = undefined
  writeLog("voices", "deleted kokoro es voice")
}

type OfflineTtsLike = {
  generate(config: { text: string; speed?: number }): { samples: Float32Array; sampleRate: number }
  free(): void
}

let ttsPromise: Promise<OfflineTtsLike> | undefined

async function getKokoroEsTts() {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      if (!isKokoroEsDownloaded()) await downloadKokoroEsInner()
      // El fonemizador espeak-ng (con español) lo comparte el piper; se
      // descarga bajo demanda la primera vez.
      await ensureSharedData()
      const { createOfflineTts } = await import("sherpa-onnx")
      const base = kokoroEsDir()
      // Los tipos de sherpa-onnx 1.13.4 solo declaran el config VITS; el
      // config kokoro existe en runtime (verificado: sintetiza español).
      const tts = createOfflineTts({
        offlineTtsModelConfig: {
          offlineTtsKokoroModelConfig: {
            model: join(base, "model.int8.onnx"),
            voices: join(base, "voices.bin"),
            tokens: join(base, "tokens.txt"),
            lexicon: join(base, "lexicon-us-en.txt"),
            dictDir: join(base, DICT_DIR),
            dataDir: sharedDataDir(),
          },
          numThreads: 2,
          debug: 0,
          provider: "cpu",
        },
        ruleFsts: "",
        ruleFars: "",
        maxNumSentences: 1,
      } as unknown as Parameters<typeof createOfflineTts>[0]) as OfflineTtsLike
      return tts
    })().catch((error) => {
      ttsPromise = undefined
      throw error
    })
  }
  return ttsPromise
}

// speed > 1 acelera el habla (misma fluidez que el piper y las kokoro-js).
export async function synthesizeKokoroEs(text: string): Promise<PiperAudio> {
  const sanitized = text
    .replace(/[^\p{L}\p{N}\p{P}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!sanitized) throw new Error("Texto vacío tras limpieza para síntesis.")

  try {
    const tts = await getKokoroEsTts()
    const result = tts.generate({ text: sanitized, speed: 1.15 })
    if (!result || !result.samples || result.samples.length === 0) {
      throw new Error("Audio vacío generado por el motor Kokoro-ES.")
    }
    return { samples: result.samples, sampleRate: result.sampleRate }
  } catch (error) {
    ttsPromise = undefined
    throw error
  }
}
