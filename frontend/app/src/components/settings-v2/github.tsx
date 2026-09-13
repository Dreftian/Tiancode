import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import type { GithubRepo } from "@tiancode-ai/sdk/v2/client"
import { useNavigate } from "@solidjs/router"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { base64Encode } from "@tiancode-ai/core/util/encode"
import { type Component, For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsPagerV2 } from "./parts/pager"
import "./github.css"

const errorText = (error: unknown): string | undefined => {
  if (error === null || typeof error !== "object") return undefined
  const obj = error as { message?: unknown; data?: { message?: unknown } }
  if (typeof obj.message === "string" && obj.message) return obj.message
  if (obj.data && typeof obj.data.message === "string" && obj.data.message) return obj.data.message
  return undefined
}

function GitHubLogo(props: { size?: number }) {
  const s = props.size ?? 48
  return (
    <svg viewBox="0 0 98 96" width={s} height={s} fill="currentColor" aria-hidden="true">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.36 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.215-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
      <path d="M12 12v3" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// Every bullet below is a capability that demonstrably consumes the stored PAT.
// Cloning leads because it is the only one that turns a private repository into a
// local project. Nothing about issues, pull requests, forking, branches, Actions or
// releases belongs here: `tiancode pr` shells out to the `gh` CLI and never reads
// this token, and no other code path does either.
const CAPABILITIES = [
  "settings.github.capabilities.clone",
  "settings.github.capabilities.browse",
  "settings.github.capabilities.create",
  "settings.github.capabilities.git",
  "settings.github.capabilities.identity",
  "settings.github.capabilities.reopen",
] as const

// Mirrors Github.MAX_REPOS: /github/repos without an explicit perPage walks every
// page of listForAuthenticatedUser and stops there. At the cap the list — and so
// every count taken from it — is a floor, not a total, and is labelled "N+".
const REPO_LIMIT = 1000

/** Rows per page in the local pager; the full list is already in memory. */
const PAGE_SIZE = 10

// GitHub's own linguist colours. These stay hardcoded on purpose: they are brand
// identifiers for the language, not theme colours, and mapping them to --v2-*
// tokens would make every dot the same and destroy what the dot is for.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  React: "#61dafb",
  Shell: "#89e051",
  PowerShell: "#012456",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Other: "#8b949e",
}

const MINUTE = 60 * 1000
const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * MINUTE],
  ["month", 30 * 24 * 60 * MINUTE],
  ["day", 24 * 60 * MINUTE],
  ["hour", 60 * MINUTE],
  ["minute", MINUTE],
]

// Intl picks the plural form and the idiomatic wording ("yesterday", "hace 2 días",
// "2 日前") per locale, so the dictionary only carries the sub-minute case — no
// RelativeTimeFormat unit expresses it well, and hand-rolled plural rules here
// would be wrong in ru the moment the count reaches 2.
function formatRelativeTime(locale: string, justNow: string, dateString?: string): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ""
  const elapsed = Date.now() - date.getTime()
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  for (const [unit, size] of RELATIVE_UNITS) {
    const value = Math.floor(elapsed / size)
    if (value >= 1) return format.format(-value, unit)
  }
  return justNow
}

export const SettingsGithubV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const navigate = useNavigate()
  const dialog = useDialog()

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [token, setToken] = createSignal("")
  const [connecting, setConnecting] = createSignal(false)
  const [banner, setBanner] = createSignal<string | undefined>(undefined)

  const [status, { refetch: refetchStatus }] = createResource(
    async () => {
      try {
        return await serverSdk().client.github.status(params()).catch(() => ({ data: { connected: false } }))
      } catch {
        return { data: { connected: false } }
      }
    },
    { initialValue: { data: { connected: false } } },
  )
  const connected = () => (status()?.data as any)?.connected === true
  const login = () => (status()?.data as any)?.login
  const avatarUrl = () => (status()?.data as any)?.avatarUrl
  // Only classic PATs report x-oauth-scopes; a fine-grained token yields nothing
  // here, and showing a guessed permission list would be worse than showing none.
  const scopes = (): string[] => {
    const value = (status()?.data as any)?.scopes
    return Array.isArray(value) ? value : []
  }

  const [repos, { refetch: refetchRepos }] = createResource(
    () => connected(),
    async (isConnected) => {
      if (!isConnected) return undefined
      try {
        return await serverSdk().client.github.repos(params()).catch(() => undefined)
      } catch {
        return undefined
      }
    },
  )
  const [current, { refetch: refetchCurrent }] = createResource(
    () => connected(),
    async (isConnected) => {
      if (!isConnected) return undefined
      try {
        return await serverSdk().client.project.current(params()).catch(() => undefined)
      } catch {
        return undefined
      }
    },
  )
  const hasProject = () => props.directory !== undefined || current()?.data !== undefined
  const [remote, { refetch: refetchRemote }] = createResource(
    () => connected(),
    async (isConnected) => {
      if (!isConnected) return undefined
      try {
        return await serverSdk().client.vcs.remote(params()).catch(() => undefined)
      } catch {
        return undefined
      }
    },
  )
  const [vcs, { refetch: refetchVcs }] = createResource(
    () => connected() && hasProject(),
    async (canFetch) => {
      if (!canFetch) return undefined
      try {
        return await serverSdk().client.vcs.get(params()).catch(() => undefined)
      } catch {
        return undefined
      }
    },
  )
  const [vcsStatus, { refetch: refetchVcsStatus }] = createResource(
    () => connected() && hasProject(),
    async (canFetch) => {
      if (!canFetch) return undefined
      try {
        return await serverSdk().client.vcs.status(params()).catch(() => undefined)
      } catch {
        return undefined
      }
    },
  )
  const [projects, { refetch: refetchProjects }] = createResource(
    () => connected(),
    async (isConnected) => {
      if (!isConnected) return []
      try {
        const res = await serverSdk().client.project.list()
        return res.data ?? []
      } catch {
        return []
      }
    },
  )

  const [search, setSearch] = createSignal("")
  const [filterType, setFilterType] = createSignal<"all" | "public" | "private">("all")
  const [sortBy, setSortBy] = createSignal<"updated" | "name" | "stars">("updated")
  const [showCreateForm, setShowCreateForm] = createSignal(false)
  const [repoPage, setRepoPage] = createSignal(1)

  const [cloning, setCloning] = createSignal<string | undefined>(undefined)
  const [createName, setCreateName] = createSignal("")
  const [createDescription, setCreateDescription] = createSignal("")
  const [createPrivate, setCreatePrivate] = createSignal(false)
  const [creating, setCreating] = createSignal(false)

  const [commitMessage, setCommitMessage] = createSignal("")
  const [committing, setCommitting] = createSignal(false)
  const [pushing, setPushing] = createSignal(false)
  const [pulling, setPulling] = createSignal(false)

  const repoList = () => repos()?.data ?? []
  const publicCount = createMemo(() => repoList().filter((r) => !r.private).length)
  const privateCount = createMemo(() => repoList().filter((r) => r.private).length)
  const capped = createMemo(() => repoList().length >= REPO_LIMIT)
  // A count off a capped list is "at least this many", never a total.
  const count = (value: number) => (capped() ? `${value}+` : String(value))
  const countTitle = () =>
    capped() ? language.t("settings.github.stats.capped", { count: REPO_LIMIT }) : undefined

  const filteredRepos = createMemo(() => {
    let list = repoList()
    const filter = filterType()
    if (filter === "public") {
      list = list.filter((r) => !r.private)
    } else if (filter === "private") {
      list = list.filter((r) => r.private)
    }
    const query = search().trim().toLowerCase()
    if (query) {
      list = list.filter(
        (repo) =>
          repo.fullName.toLowerCase().includes(query) || (repo.description?.toLowerCase().includes(query) ?? false),
      )
    }

    return [...list].sort((a, b) => {
      if (sortBy() === "stars") {
        return Number(b.stars ?? 0) - Number(a.stars ?? 0)
      }
      if (sortBy() === "name") {
        return a.fullName.localeCompare(b.fullName)
      }
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return timeB - timeA
    })
  })

  const totalRepoPages = createMemo(() => Math.max(1, Math.ceil(filteredRepos().length / PAGE_SIZE)))
  const paginatedRepos = createMemo(() => {
    const p = Math.min(repoPage(), totalRepoPages())
    const start = (p - 1) * PAGE_SIZE
    return filteredRepos().slice(start, start + PAGE_SIZE)
  })

  // Auto-reset page when filter or search query changes
  createEffect(() => {
    search()
    filterType()
    setRepoPage(1)
  })

  const projectPath = () => current()?.data?.worktree ?? props.directory
  const hasRemote = () => remote()?.data?.hasRemote === true

  const connect = async () => {
    const value = token().trim()
    if (!value || connecting()) return
    setConnecting(true)
    setBanner(undefined)
    try {
      const result = await serverSdk().client.github.connect({ ...params(), githubConnectPayload: { token: value } })
      if (result.error) {
        setBanner(errorText(result.error) ?? language.t("settings.github.connect.failed"))
        return
      }
      setToken("")
      showToast({ variant: "success", title: language.t("settings.github.connect.success") })
      void refetchStatus()
    } catch (error) {
      setBanner(errorText(error) ?? language.t("settings.github.connect.failed"))
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm(language.t("settings.github.disconnect.confirm"))) return
    setBanner(undefined)
    try {
      const result = await serverSdk().client.github.disconnect(params())
      if (result.error) {
        setBanner(errorText(result.error) ?? language.t("settings.github.disconnect.failed"))
        return
      }
      setToken("")
      showToast({ variant: "success", title: language.t("settings.github.disconnect.success") })
      void refetchStatus()
    } catch (error) {
      setBanner(errorText(error) ?? language.t("settings.github.disconnect.failed"))
    }
  }

  const [syncing, setSyncing] = createSignal(false)
  const syncAll = async () => {
    if (syncing()) return
    setSyncing(true)
    try {
      await Promise.all([
        refetchStatus(),
        refetchRepos(),
        refetchCurrent(),
        refetchRemote(),
        refetchVcs(),
        refetchVcsStatus(),
        refetchProjects(),
      ])
      const ok = connected() && repos()?.data !== undefined
      showToast({
        variant: ok ? "success" : "error",
        title: language.t(ok ? "settings.github.sync.success" : "settings.github.sync.failed"),
      })
    } finally {
      setSyncing(false)
    }
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    showToast({ variant: "success", title: language.t("settings.github.repo.copied") })
  }

  const findLocalProject = (repo: GithubRepo) => {
    const list = projects() ?? []
    const repoName = repo.name.toLowerCase()
    return list.find((p) => {
      const wt = (p.worktree ?? "").replace(/\\/g, "/").toLowerCase()
      return wt.endsWith("/" + repoName) || wt.endsWith("/" + repo.fullName.toLowerCase())
    })
  }

  const openLocalProject = (worktree: string) => {
    dialog.close()
    navigate(`/${base64Encode(worktree)}`)
  }

  const cloneRepo = async (repo: GithubRepo) => {
    setCloning(repo.fullName)
    setBanner(undefined)
    try {
      const result = await serverSdk().client.project.clone({ ...params(), cloneProjectPayload: { url: repo.url } })
      if (result.error) {
        setBanner(errorText(result.error) ?? language.t("settings.github.repo.clone.failed"))
        return
      }
      const directory = result.data?.directory
      if (directory) {
        showToast({ variant: "success", title: language.t("settings.github.repo.clone.success", { directory }) })
        dialog.close()
        navigate(`/${base64Encode(directory)}`)
      }
    } catch (error) {
      setBanner(errorText(error) ?? language.t("settings.github.repo.clone.failed"))
    } finally {
      setCloning(undefined)
    }
  }

  const createRepo = async () => {
    const value = createName().trim()
    if (!value || creating()) return
    setCreating(true)
    setBanner(undefined)
    try {
      const result = await serverSdk().client.github.createRepo({
        ...params(),
        githubCreateRepoPayload: {
          name: value,
          private: createPrivate(),
          description: createDescription().trim() || undefined,
        },
      })
      if (result.error) {
        setBanner(errorText(result.error) ?? language.t("settings.github.repo.create.failed"))
        return
      }
      setCreateName("")
      setCreateDescription("")
      setCreatePrivate(false)
      setShowCreateForm(false)
      showToast({ variant: "success", title: language.t("settings.github.repo.create.success", { name: value }) })
      void refetchRepos()
    } catch (error) {
      setBanner(errorText(error) ?? language.t("settings.github.repo.create.failed"))
    } finally {
      setCreating(false)
    }
  }

  const commit = async () => {
    const message = commitMessage().trim()
    if (!message || committing()) return
    setCommitting(true)
    try {
      const result = await serverSdk().client.vcs.commit({ ...params(), vcsCommitPayload: { message } })
      if (result.error || result.data?.success === false) {
        // git's own words ("nothing to commit", "rejected", …) beat a generic toast.
        setBanner((result.data as any)?.output || language.t("settings.github.commit.failed"))
        showToast({ variant: "error", title: language.t("settings.github.commit.failed") })
        return
      }
      setCommitMessage("")
      showToast({ variant: "success", title: language.t("settings.github.commit.success") })
      void refetchVcsStatus()
      void refetchVcs()
    } catch {
      showToast({ variant: "error", title: language.t("settings.github.commit.failed") })
    } finally {
      setCommitting(false)
    }
  }

  const push = async () => {
    if (pushing()) return
    setPushing(true)
    try {
      const result = await serverSdk().client.vcs.push({ ...params() })
      if (result.error || result.data?.success === false) {
        setBanner((result.data as any)?.output || language.t("settings.github.push.failed"))
        showToast({ variant: "error", title: language.t("settings.github.push.failed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.github.push.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.github.push.failed") })
    } finally {
      setPushing(false)
      void refetchVcsStatus()
      void refetchVcs()
    }
  }

  const pull = async () => {
    if (pulling()) return
    setPulling(true)
    try {
      const result = await serverSdk().client.vcs.pull({ ...params() })
      if (result.error || result.data?.success === false) {
        setBanner((result.data as any)?.output || language.t("settings.github.pull.failed"))
        showToast({ variant: "error", title: language.t("settings.github.pull.failed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.github.pull.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.github.pull.failed") })
    } finally {
      setPulling(false)
      void refetchVcsStatus()
      void refetchVcs()
    }
  }

  return (
    // The panel is a full-height column flex; `is-empty` lets the short
    // disconnected card claim that height and centre itself in it.
    <div class="gh-container" classList={{ "is-empty": !connected() }}>
      <Show when={banner()}>
        <div class="settings-v2-skills-message" data-variant="error">
          {banner()}
        </div>
      </Show>

      <Show
        when={connected()}
        fallback={
          /* Vista desconectada: tarjeta centrada con el formulario y lo que el token habilita */
          <div class="gh-hero-card">
            {/* El formulario y la lista de capacidades son dos columnas en cuanto el panel da de
                sí, y una sola pila por debajo. Sin ese corte la tarjeta mide más que el panel y
                lo que hay debajo del pliegue sólo se alcanza con scroll. */}
            <div class="gh-hero-main">
              <div class="gh-logo-wrapper">
                <GitHubLogo size={48} />
              </div>
              <h2 class="gh-hero-title">{language.t("settings.github.connect.title")}</h2>
              <p class="gh-hero-desc">{language.t("settings.github.connect.description")}</p>

              <div class="gh-token-box">
                <span class="gh-token-label">{language.t("settings.github.connect.token.label")}</span>
                <TextInputV2
                  type="password"
                  appearance="base"
                  class="gh-token-input"
                  value={token()}
                  onInput={(event) => setToken(event.currentTarget.value)}
                  placeholder={language.t("settings.github.connect.token.placeholder")}
                  spellcheck={false}
                  autocomplete="off"
                  disabled={status.loading}
                  aria-label={language.t("settings.github.connect.token.label")}
                />
                <span class="gh-token-hint">{language.t("settings.github.connect.hint")}</span>
              </div>

              <ButtonV2
                type="button"
                variant="contrast"
                size="normal"
                class="gh-btn-connect"
                disabled={connecting() || !token().trim() || status.loading}
                onClick={() => void connect()}
              >
                {connecting() ? language.t("settings.github.connecting") : language.t("settings.github.connect.button")}
              </ButtonV2>
            </div>

            <div class="gh-info">
              <h3 class="gh-info-title">{language.t("settings.github.capabilities.title")}</h3>
              <ul class="gh-info-list">
                <For each={CAPABILITIES}>
                  {(key) => (
                    <li class="gh-info-item">
                      <span class="gh-info-check">
                        <CheckIcon />
                      </span>
                      <span>{language.t(key)}</span>
                    </li>
                  )}
                </For>
              </ul>
              {/* The file name is a parameter so each locale keeps its own word order. */}
              <p class="gh-info-storage">{language.t("settings.github.capabilities.storage", { file: "auth.json" })}</p>
              <p class="gh-info-storage">{language.t("settings.github.capabilities.encrypted")}</p>
            </div>
          </div>
        }
      >
        {/* Vista conectada: perfil + estado del repositorio abierto + explorador */}
        <div class="gh-connected-wrapper">
          <div class="gh-profile-card">
            <div class="gh-profile-left">
              <div class="gh-avatar-container">
                <Show when={avatarUrl()} fallback={<GitHubLogo size={52} />}>
                  <img class="gh-profile-avatar" src={avatarUrl()} alt={login() ?? ""} />
                </Show>
                <div class="gh-online-dot" title={language.t("settings.github.status.authenticated")} />
              </div>
              <div class="gh-profile-copy">
                <div class="gh-profile-badge-row">
                  <span class="gh-badge-connected">
                    <CheckIcon /> {language.t("settings.github.badge.linked")}
                  </span>
                  {/* Only classic PATs report x-oauth-scopes. The badge used to state
                      "repo · read:user" no matter what the token could actually do. */}
                  <Show
                    when={scopes().length > 0}
                    fallback={
                      <span
                        class="gh-badge-scope is-unknown"
                        title={language.t("settings.github.scopes.unknown.title")}
                      >
                        {language.t("settings.github.scopes.unknown")}
                      </span>
                    }
                  >
                    <span class="gh-badge-scope" title={language.t("settings.github.scopes.title")}>
                      {scopes().join(" · ")}
                    </span>
                  </Show>
                </div>
                <div class="gh-username-row">
                  <h3 class="gh-profile-username">@{login()}</h3>
                  <a
                    href={`https://github.com/${login()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="gh-profile-link"
                    title={language.t("settings.github.profile.view.title")}
                  >
                    {language.t("settings.github.profile.view")}
                  </a>
                </div>
                <div class="gh-stats-row">
                  <span class="gh-stat-chip gh-stat-total" title={countTitle()}>
                    <strong>{count(repoList().length)}</strong> {language.t("settings.github.stats.total")}
                  </span>
                  <span class="gh-stat-chip gh-stat-public" title={countTitle()}>
                    <GlobeIcon /> <strong>{count(publicCount())}</strong> {language.t("settings.github.repo.public")}
                  </span>
                  <span class="gh-stat-chip gh-stat-private" title={countTitle()}>
                    <LockIcon /> <strong>{count(privateCount())}</strong> {language.t("settings.github.repo.private")}
                  </span>
                </div>
              </div>
            </div>

            <div class="gh-profile-actions">
              <ButtonV2
                type="button"
                variant="contrast"
                size="small"
                onClick={() => setShowCreateForm(!showCreateForm())}
                class="gh-btn-new-repo"
              >
                <PlusIcon /> {showCreateForm() ? language.t("common.close") : language.t("settings.github.create.title")}
              </ButtonV2>
              <ButtonV2 type="button" variant="outline" size="small" disabled={syncing()} onClick={syncAll}>
                {language.t("settings.github.refresh")}
              </ButtonV2>
              <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void disconnect()} class="gh-btn-disconnect">
                {language.t("settings.github.disconnect.button")}
              </ButtonV2>
            </div>
          </div>

          {/* Formulario expandible para crear un repositorio personal */}
          <Show when={showCreateForm()}>
            <div class="gh-create-repo-card">
              <div class="gh-create-repo-header">
                <h4 class="gh-create-repo-title">{language.t("settings.github.create.title")}</h4>
                {/* rest.repos.createForAuthenticatedUser only creates personal repos;
                    the form must not suggest an organisation can be picked. */}
                <p class="gh-create-repo-sub">
                  {language.t("settings.github.create.owner", { login: login() ?? "" })}
                </p>
              </div>

              <div class="gh-create-fields">
                <div class="gh-field-group">
                  <label class="gh-field-label">{language.t("settings.github.create.name")}</label>
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={createName()}
                    onInput={(e) => setCreateName(e.currentTarget.value)}
                    placeholder={language.t("settings.github.create.name.placeholder")}
                  />
                </div>

                <div class="gh-field-group">
                  <label class="gh-field-label">{language.t("settings.github.create.description.label")}</label>
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={createDescription()}
                    onInput={(e) => setCreateDescription(e.currentTarget.value)}
                    placeholder={language.t("settings.github.create.description.placeholder")}
                  />
                </div>

                <div class="gh-create-privacy-row">
                  <div class="gh-privacy-info">
                    <span class="gh-privacy-label">
                      {createPrivate()
                        ? language.t("settings.github.repo.private")
                        : language.t("settings.github.repo.public")}
                    </span>
                    <span class="gh-privacy-desc">
                      {createPrivate()
                        ? language.t("settings.github.create.private.description")
                        : language.t("settings.github.create.public.description")}
                    </span>
                  </div>
                  {/* The visible copy changes with the state, so the control keeps a
                      stable screen-reader label of its own. */}
                  <Switch checked={createPrivate()} onChange={(checked) => setCreatePrivate(checked)} hideLabel>
                    {language.t("settings.github.create.private")}
                  </Switch>
                </div>

                <div class="gh-create-actions">
                  <ButtonV2
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => setShowCreateForm(false)}
                  >
                    {language.t("common.cancel")}
                  </ButtonV2>
                  <ButtonV2
                    type="button"
                    variant="contrast"
                    size="small"
                    disabled={creating() || !createName().trim()}
                    onClick={() => void createRepo()}
                  >
                    {creating()
                      ? language.t("settings.github.create.creating")
                      : language.t("settings.github.create.button")}
                  </ButtonV2>
                </div>
              </div>
            </div>
          </Show>

          {/* Estado del proyecto abierto */}
          <Show when={hasProject()}>
            <div class="gh-vcs-card">
              <div class="gh-vcs-header">
                <div>
                  <div class="gh-vcs-title-row">
                    <BranchIcon />
                    <h4 class="gh-vcs-title">{language.t("settings.github.project.title")}</h4>
                    <span class="gh-repo-branch-tag">
                      <BranchIcon /> {(vcs()?.data as any)?.branch ?? language.t("common.loading.ellipsis")}
                    </span>
                    <Show when={vcsStatus()}>
                      {(() => {
                        const dirtyCount = () => vcsStatus()?.data?.length ?? 0
                        return (
                          <Show
                            when={dirtyCount() > 0}
                            fallback={
                              <span class="gh-vcs-state is-clean">
                                <CheckIcon /> {language.t("settings.github.vcs.clean")}
                              </span>
                            }
                          >
                            <span class="gh-vcs-state is-dirty">
                              {language.t("settings.github.vcs.dirty", { count: dirtyCount() })}
                            </span>
                          </Show>
                        )
                      })()}
                    </Show>
                  </div>
                  <p class="gh-vcs-path">{projectPath()}</p>
                  {/* Push and pull are disabled without a remote; say why instead of
                      leaving two dead buttons. Only once the probe has answered —
                      an unresolved resource also reads as "no remote". */}
                  <Show when={remote()?.data !== undefined && !hasRemote()}>
                    <p class="gh-vcs-no-remote">{language.t("settings.github.project.noRemote")}</p>
                  </Show>
                </div>
                <div class="gh-vcs-buttons">
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={pulling() || !hasRemote()}
                    onClick={() => void pull()}
                  >
                    {pulling() ? language.t("settings.github.pulling") : language.t("settings.github.pull.button")}
                  </ButtonV2>
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={pushing() || !hasRemote()}
                    onClick={() => void push()}
                  >
                    {pushing() ? language.t("settings.github.pushing") : language.t("settings.github.push.button")}
                  </ButtonV2>
                </div>
              </div>

              <div class="gh-commit-bar">
                <TextInputV2
                  type="text"
                  appearance="base"
                  value={commitMessage()}
                  onInput={(e) => setCommitMessage(e.currentTarget.value)}
                  placeholder={language.t("settings.github.commit.placeholder")}
                  aria-label={language.t("settings.github.commit.placeholder")}
                />
                <ButtonV2
                  type="button"
                  variant="contrast"
                  size="small"
                  disabled={committing() || !commitMessage().trim()}
                  onClick={() => void commit()}
                >
                  {committing()
                    ? language.t("settings.github.committing")
                    : language.t("settings.github.commit.button")}
                </ButtonV2>
              </div>
            </div>
          </Show>

          {/* Explorador de repositorios: filtros, búsqueda y paginación local */}
          <div class="gh-repos-section">
            <div class="gh-repos-toolbar">
              <div class="gh-repos-toolbar-left">
                <h4 class="gh-section-title">{language.t("settings.github.repos.title")}</h4>
                <div class="gh-filter-pills">
                  <button
                    type="button"
                    class="gh-filter-pill"
                    classList={{ active: filterType() === "all" }}
                    onClick={() => setFilterType("all")}
                    title={countTitle()}
                  >
                    {language.t("settings.github.repos.filter.all")} ({count(repoList().length)})
                  </button>
                  <button
                    type="button"
                    class="gh-filter-pill"
                    classList={{ active: filterType() === "public" }}
                    onClick={() => setFilterType("public")}
                    title={countTitle()}
                  >
                    {language.t("settings.github.repo.public")} ({count(publicCount())})
                  </button>
                  <button
                    type="button"
                    class="gh-filter-pill"
                    classList={{ active: filterType() === "private" }}
                    onClick={() => setFilterType("private")}
                    title={countTitle()}
                  >
                    {language.t("settings.github.repo.private")} ({count(privateCount())})
                  </button>
                </div>

                <div class="gh-sort-row">
                  <label class="gh-sort-label" for="gh-sort-select">
                    {language.t("settings.github.sort.label")}
                  </label>
                  <select
                    id="gh-sort-select"
                    value={sortBy()}
                    onChange={(e) => setSortBy(e.currentTarget.value as any)}
                    class="gh-sort-select"
                  >
                    <option value="updated">{language.t("settings.github.sort.updated")}</option>
                    <option value="stars">{language.t("settings.github.sort.stars")}</option>
                    <option value="name">{language.t("settings.github.sort.name")}</option>
                  </select>
                </div>
              </div>

              <TextInputV2
                type="text"
                appearance="base"
                class="gh-repos-search"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder={language.t("settings.github.repos.search.placeholder")}
                aria-label={language.t("settings.github.repos.search.placeholder")}
                showClearButton={search().length > 0}
                onClearClick={() => setSearch("")}
              />
            </div>

            {/* Lista detallada de repositorios */}
            <div class="gh-repos-table">
              <Show
                when={paginatedRepos().length > 0}
                fallback={
                  <div class="gh-repos-empty">
                    <p>
                      {repos.loading
                        ? language.t("settings.github.loading")
                        : language.t("settings.github.repos.empty")}
                    </p>
                  </div>
                }
              >
                <For each={paginatedRepos()}>
                  {(repo) => (
                    <div class="gh-repo-row">
                      <Show
                        when={repo.ownerAvatarUrl}
                        fallback={
                          <div class="gh-repo-icon-wrap" classList={{ "is-private": repo.private }}>
                            <Show when={repo.private} fallback={<GlobeIcon />}>
                              <LockIcon />
                            </Show>
                          </div>
                        }
                      >
                        <img class="gh-repo-avatar" src={repo.ownerAvatarUrl} alt="" />
                      </Show>

                      <div class="gh-repo-main">
                        <div class="gh-repo-title-line">
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="gh-repo-name-link"
                          >
                            {repo.fullName}
                          </a>
                          <span
                            class="gh-repo-vis-tag"
                            classList={{ "is-private": repo.private, "is-public": !repo.private }}
                          >
                            {repo.private
                              ? language.t("settings.github.repo.private")
                              : language.t("settings.github.repo.public")}
                          </span>
                          <Show when={repo.isFork}>
                            <span class="gh-repo-fork-tag">
                              <ForkIcon /> {language.t("settings.github.repo.fork")}
                            </span>
                          </Show>
                          <Show when={repo.defaultBranch}>
                            <span class="gh-repo-branch-tag">
                              <BranchIcon /> {repo.defaultBranch}
                            </span>
                          </Show>
                        </div>
                        <p class="gh-repo-description" classList={{ empty: !repo.description }}>
                          {repo.description || language.t("settings.github.repo.description.empty")}
                        </p>
                        <div class="gh-repo-meta">
                          <Show when={repo.language}>
                            <span class="gh-repo-lang">
                              <span
                                class="gh-lang-dot"
                                style={{ "background-color": LANGUAGE_COLORS[repo.language!] || "#8b949e" }}
                              />
                              {repo.language}
                            </span>
                          </Show>
                          <Show when={repo.stars !== undefined && Number(repo.stars) > 0}>
                            <span
                              class="gh-repo-stat"
                              title={language.t("settings.github.repo.stars.title", { count: Number(repo.stars) })}
                            >
                              <StarIcon /> {repo.stars}
                            </span>
                          </Show>
                          <Show when={repo.forks !== undefined && Number(repo.forks) > 0}>
                            <span
                              class="gh-repo-stat"
                              title={language.t("settings.github.repo.forks.title", { count: Number(repo.forks) })}
                            >
                              <ForkIcon /> {repo.forks}
                            </span>
                          </Show>
                          <Show when={repo.updatedAt}>
                            <span
                              class="gh-repo-updated"
                              title={new Date(repo.updatedAt!).toLocaleString(language.intl())}
                            >
                              {formatRelativeTime(language.intl(), language.t("common.time.justNow"), repo.updatedAt)}
                            </span>
                          </Show>
                        </div>
                      </div>

                      <div class="gh-repo-actions">
                        <button
                          type="button"
                          class="gh-repo-copy-btn"
                          onClick={() => copyUrl(repo.url)}
                          title={language.t("settings.github.repo.copy")}
                          aria-label={language.t("settings.github.repo.copy")}
                        >
                          <CopyIcon />
                        </button>
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="gh-repo-external-link"
                          title={language.t("settings.github.repo.view.title")}
                        >
                          {language.t("settings.github.repo.view")}
                        </a>
                        {(() => {
                          const local = findLocalProject(repo)
                          if (local && local.worktree) {
                            return (
                              <ButtonV2
                                type="button"
                                variant="contrast"
                                size="small"
                                onClick={() => openLocalProject(local.worktree)}
                                title={language.t("settings.github.repo.open.title")}
                              >
                                {language.t("settings.github.repo.open")}
                              </ButtonV2>
                            )
                          }
                          return (
                            <ButtonV2
                              type="button"
                              variant="outline"
                              size="small"
                              disabled={cloning() === repo.fullName}
                              onClick={() => void cloneRepo(repo)}
                            >
                              {cloning() === repo.fullName
                                ? language.t("settings.github.repo.cloning")
                                : language.t("settings.github.repo.clone")}
                            </ButtonV2>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            {/* Paginación local sobre la lista completa que devuelve /github/repos */}
            <Show when={totalRepoPages() > 1}>
              <div class="gh-pagination-wrapper">
                <span class="gh-pagination-summary">
                  {language.t("settings.github.repos.range", {
                    from: (Math.min(repoPage(), totalRepoPages()) - 1) * PAGE_SIZE + 1,
                    to: Math.min(Math.min(repoPage(), totalRepoPages()) * PAGE_SIZE, filteredRepos().length),
                    total: filteredRepos().length,
                  })}
                </span>
                <SettingsPagerV2
                  page={repoPage()}
                  totalPages={totalRepoPages()}
                  onPage={setRepoPage}
                />
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}

