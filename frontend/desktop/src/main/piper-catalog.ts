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
}

export const PIPER_VOICES: PiperVoiceDef[] = [
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
  },
  {
    id: "piper-es_AR-daniela-high",
    name: "Daniela (Argentina)",
    language: "es-AR",
    repo: "csukuangfj/vits-piper-es_AR-daniela-high",
    modelFile: "es_AR-daniela-high.onnx",
    sampleRate: 22050,
    sizeMb: 114,
    license: "CC BY-SA 4.0",
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
  },
  {
    id: "piper-es_MX-ald-medium",
    name: "Sofia / Ald (México)",
    language: "es-MX",
    repo: "csukuangfj/vits-piper-es_MX-ald-medium",
    modelFile: "es_MX-ald-medium.onnx",
    sampleRate: 22050,
    sizeMb: 75,
    license: "CC BY 4.0",
  },
  {
    id: "piper-es_MX-claude-high",
    name: "Lucia / Claude (México)",
    language: "es-MX",
    repo: "csukuangfj/vits-piper-es_MX-claude-high",
    modelFile: "es_MX-claude-high.onnx",
    sampleRate: 22050,
    sizeMb: 110,
    license: "CC BY-SA 4.0",
  },
  {
    id: "piper-es_ES-carlfm-x_low",
    name: "Carlota (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-carlfm-x_low",
    modelFile: "es_ES-carlfm-x_low.onnx",
    sampleRate: 16000,
    sizeMb: 45,
    license: "CC BY 4.0",
  },
  {
    id: "piper-es_ES-davefx-medium",
    name: "Elena (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-davefx-medium",
    modelFile: "es_ES-davefx-medium.onnx",
    sampleRate: 22050,
    sizeMb: 78,
    license: "CC BY 4.0",
  },
  {
    id: "piper-es_ES-miro-high",
    name: "Miro (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-miro-high",
    modelFile: "es_ES-miro-high.onnx",
    sampleRate: 22050,
    sizeMb: 60,
    license: "CC BY 4.0",
  },
  {
    id: "piper-es_ES-glados-medium",
    name: "GLaDOS (España)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-glados-medium",
    modelFile: "es_ES-glados-medium.onnx",
    sampleRate: 22050,
    sizeMb: 60,
    license: "CC BY 4.0",
  },
]
