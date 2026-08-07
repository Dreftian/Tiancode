interface ImportMetaEnv {
  readonly TIANCODE_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:tiancode-server" {
  export namespace Server {
    export const listen: typeof import("../../../tiancode/dist/types/src/node").Server.listen
    export type Listener = import("../../../tiancode/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../tiancode/dist/types/src/node").Config.get
    export type Info = import("../../../tiancode/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../tiancode/dist/types/src/node").bootstrap
}

// sherpa-onnx ships untyped CommonJS (WASM build); the type surface below is
// the small subset used by the piper voice engine.
declare module "sherpa-onnx" {
  export type OfflineTtsVitsModelConfig = {
    model: string
    tokens: string
    dataDir: string
    lexicon: string
  }
  export type OfflineTtsConfig = {
    offlineTtsModelConfig: {
      offlineTtsVitsModelConfig: OfflineTtsVitsModelConfig
      numThreads: number
      debug: number
      provider: "cpu" | "cuda"
    }
    ruleFsts: string
    ruleFars: string
    maxNumSentences: number
  }
  export type OfflineTts = {
    sampleRate: number
    numSpeakers: number
    generate(config: { text: string; sid?: number; speed?: number }): {
      samples: Float32Array
      sampleRate: number
    }
    save(filename: string, audio: { samples: Float32Array; sampleRate: number }): void
    free(): void
  }
  export function createOfflineTts(config: OfflineTtsConfig): OfflineTts
}
