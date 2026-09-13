// Catalogue of the locally-synthesized sherpa-onnx voices (piper and mimic3).
//
// Kept free of electron imports on purpose: scripts/verify-piper-voices.ts and unit tests
// load this module directly, which is impossible from piper.ts (it needs app.getPath).

// Voices are synthesized locally with sherpa-onnx (WASM build, no native addon
// to rebuild) driving VITS models converted by csukuangfj: most come from the
// rhasspy piper-voices project, one from the MycroftAI mimic3 voices. Both
// export the same sherpa contract — model_type=vits, has_espeak=1 — so they run
// through the identical code path. Each csukuangfj repo bundles the full
// espeak-ng phonemizer data, so the 18MB espeak-ng-data tree is shared across
// voices and downloaded once.

export type PiperVoiceDef = {
  id: string
  name: string
  language: string
  repo: string
  modelFile: string
  sampleRate: number
  // Speaker index inside multi-speaker models (sharvard ships M=0/F=1, the
  // mimic3 m-ailabs model ships tux=0/victor=1/karen=2).
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
//
// Five entries, and ef_dora in kokoro-es.ts makes six, which is what
// preload/types.ts documents. es_ES-mls_10246-low left to make room for the
// mimic3 voice below: the two mls_* models measure the same (HNR 10.2 dB, no
// energy above ~3.7 kHz — they are 16 kHz "low" tier), so keeping both spent a
// catalogue slot on a duplicate of the weakest voice. mls_9972 stays because
// its median F0 is 195 Hz against 223 Hz, the warmer of two identical options.
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
  // Mimic3, not piper: the only sherpa-onnx-compatible model that adds a female
  // Spanish speaker piper does not have. "low" is mimic3's model size, not its
  // rate — this one synthesizes at 22050 Hz, not the 16000 Hz of the mls_*
  // voices, which is the part that is audible.
  //
  // Three M-AILABS speakers (0 tux, 1 victor_villarraza, 2 karen_savage, per
  // speaker_map.csv in MycroftAI/mimic3-voices). Speaker 2 is the female one:
  // Karen Savage is a real LibriVox narrator and the median F0 of her own
  // Spanish recordings is 193 Hz, so the sex here is measured, not assumed.
  //
  // The model id says es_ES and its espeak voice is Castilian, but the M-AILABS
  // author published an erratum: the "karen" speaker is Mexican. The accent in
  // the audio is hers, not the id's, so the catalogue tags her es-MX.
  {
    id: "mimic3-es-m_ailabs-karen_savage",
    name: "Karen Savage (México)",
    language: "es-MX",
    repo: "csukuangfj/vits-mimic3-es_ES-m-ailabs_low",
    modelFile: "es_ES-m-ailabs_low.onnx",
    sampleRate: 22050,
    sid: 2,
    sizeMb: 76,
    license: "M-AILABS (BSD-style, commercial use permitted)",
    gender: "female",
  },
]
