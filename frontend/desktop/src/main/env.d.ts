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
