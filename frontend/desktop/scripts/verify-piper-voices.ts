// Verifies that every voice in the piper catalogue actually resolves on HuggingFace.
//
// The catalogue has already shipped entries pointing at repositories that do not exist:
// every download attempt failed with HTTP 401 and the only existing TTS check
// (verify-tts.ts) covers Kokoro, never this catalogue. This script closes that gap and
// runs as part of `prepare:release`, so a dead repo cannot ship again.
//
// Run manually with `bun run scripts/verify-piper-voices.ts` from frontend/desktop.
import { PIPER_VOICES } from "../src/main/piper-catalog"

const HF_BASE = "https://huggingface.co"
const TIMEOUT_MS = 30_000

type Result = { id: string; file: string; status: number | string; ok: boolean }

async function head(url: string): Promise<number | string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal })
    return res.status
  } catch (error) {
    return error instanceof Error ? error.name : String(error)
  } finally {
    clearTimeout(timer)
  }
}

const results: Result[] = []
for (const voice of PIPER_VOICES) {
  for (const file of [voice.modelFile, "tokens.txt"]) {
    const status = await head(`${HF_BASE}/${voice.repo}/resolve/main/${file}`)
    results.push({ id: voice.id, file, status, ok: status === 200 })
  }
}

const broken = results.filter((r) => !r.ok)
for (const voice of PIPER_VOICES) {
  const rows = results.filter((r) => r.id === voice.id)
  const bad = rows.filter((r) => !r.ok)
  const mark = bad.length === 0 ? "ok  " : "FAIL"
  console.log(
    `${mark} ${voice.id.padEnd(34)} ${voice.repo}` +
      (bad.length ? `  -> ${bad.map((r) => `${r.file}:${r.status}`).join(", ")}` : ""),
  )
}

console.log(`\n${PIPER_VOICES.length} voices checked, ${broken.length} broken file(s).`)
if (broken.length > 0) {
  console.error(
    "Some piper voices point at repositories that do not resolve. Fix the catalogue in src/main/piper-catalog.ts.",
  )
  process.exit(1)
}
