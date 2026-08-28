interface ImportMetaEnv {
  readonly VITE_TIANCODE_SERVER_HOST: string
  readonly VITE_TIANCODE_SERVER_PORT: string
  readonly VITE_TIANCODE_CHANNEL?: "dev" | "beta" | "prod"
  readonly VITE_TIANCODE_VERSION?: string

  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_SENTRY_RELEASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.png" {
  const src: string
  export default src
}

declare module "*.mp4" {
  const src: string
  export default src
}

export declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: true
    }
  }
}

interface Window {
  __TIANCODE__?: {
    deepLinks?: string[]
  }
  api?: {
    setTitlebar?: (theme: { mode: "light" | "dark"; scheme?: "system" | "light" | "dark" }) => Promise<void>
    exportDebugLogs?: () => Promise<string>
    storeGet?: (name: string, key: string) => Promise<string | null>
    storeSet?: (name: string, key: string, value: string) => Promise<void>
    relaunchApp?: () => Promise<void>
    notify?: (title: string, body: string) => Promise<void>
    setLoginItem?: (enabled: boolean) => Promise<boolean>
    getLoginItem?: () => Promise<boolean>
    clearWebviewData?: () => Promise<void>
    backupNow?: () => Promise<string | null>
    listBackups?: () => Promise<{ name: string; createdAt: number }[]>
    restoreBackup?: (name: string) => Promise<void>
    isFirstLaunchOnboardingPending?: () => Promise<boolean>
    finishFirstLaunchOnboarding?: (createDefaultProject?: boolean) => Promise<string | null>
    setCompactWindow?: (options?: { width?: number; height?: number }) => Promise<void>
    restoreMainWindow?: () => Promise<void>
    voices?: any
    asr?: any
    runtime?: {
      install: (kind: "ollama" | "lmstudio") => Promise<{ ok: boolean; error?: string }>
      onState: (
        cb: (state: {
          status: "idle" | "downloading" | "installing" | "error"
          progress?: number
          error?: string
        }) => void,
      ) => () => void
    }
  }
}
