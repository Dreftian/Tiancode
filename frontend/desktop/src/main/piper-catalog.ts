// Catalogue of the locally-synthesized piper voices.
//
// Kept free of electron imports on purpose: scripts/verify-piper-voices.ts and unit tests
// load this module directly, which is impossible from piper.ts (it needs app.getPath).

// Piper voices are synthesized locally with sherpa-onnx (WASM build, no native
// addon to rebuild) driving VITS models converted from the rhasspy piper-voices
// project. Each csukuangfj repo bundles the full espeak-ng phonemizer data, so
// the 18MB espeak-ng-data tree is shared across voices and downloaded once.

export type PiperVoiceDef = {
  id: string
  name: string
  language: string
  repo: string
  modelFile: string
  sampleRate: number
  // Speaker index inside multi-speaker models (sharvard ships M=0/F=1).
  sid?: number
  sizeMb: number
  license: string
  // Read from the upstream dataset card, never assumed: voices.ts used to stamp
  // "female" on the whole catalogue, which is how a male model (es_MX-ald) ended
  // up shipping under an invented female name.
  gender: "female" | "male"
}

// Only voices whose upstream dataset card documents a female Spanish speaker and
// a licence that allows redistribution. The name is the upstream dataset name plus
// the accent; inventing a human name hides which model is actually being used.
export const PIPER_VOICES: PiperVoiceDef[] = [
  {
    id: "piper-es_AR-daniela-high",
    name: "Daniela (Argentina)",
    language: "es-AR",
    repo: "csukuangfj/vits-piper-es_AR-daniela-high",
    modelFile: "es_AR-daniela-high.onnx",
    sampleRate: 22050,
    sizeMb: 114,
    license: "CC BY-SA 4.0",
    gender: "female",
  },
  {
    id: "piper-es_ES-sharvard-medium",
    name: "Sharvard (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-sharvard-medium",
    modelFile: "es_ES-sharvard-medium.onnx",
    sampleRate: 22050,
    sid: 1,
    sizeMb: 77,
    license: "CC BY 3.0",
    gender: "female",
  },
  {
    id: "piper-es_MX-claude-high",
    name: "Claude (México)",
    language: "es-MX",
    repo: "csukuangfj/vits-piper-es_MX-claude-high",
    modelFile: "es_MX-claude-high.onnx",
    sampleRate: 22050,
    sizeMb: 110,
    license: "CC BY-SA 4.0",
    gender: "female",
  },
  {
    id: "piper-es_ES-mls_9972-low",
    name: "MLS 9972 (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-mls_9972-low",
    modelFile: "es_ES-mls_9972-low.onnx",
    sampleRate: 16000,
    sizeMb: 63,
    license: "CC BY 4.0",
    gender: "female",
  },
  {
    id: "piper-es_ES-mls_10246-low",
    name: "MLS 10246 (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-mls_10246-low",
    modelFile: "es_ES-mls_10246-low.onnx",
    sampleRate: 16000,
    sizeMb: 63,
    license: "CC BY 4.0",
    gender: "female",
  },
]
