import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import type { GithubRepo } from "@tiancode-ai/sdk/v2/client"
import { useNavigate } from "@solidjs/router"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { base64Encode } from "@tiancode-ai/core/util/encode"
import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
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

  const [search, setSearch] = createSignal("")
  const [cloning, setCloning] = createSignal<string | undefined>(undefined)
  const [createName, setCreateName] = createSignal("")
  const [createPrivate, setCreatePrivate] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  const [commitMessage, setCommitMessage] = createSignal("")
  const [committing, setCommitting] = createSignal(false)
  const [pushing, setPushing] = createSignal(false)
  const [pulling, setPulling] = createSignal(false)

  const repoList = () => repos()?.data ?? []
  const visibleRepos = createMemo(() => {
    const query = search().trim().toLowerCase()
    if (!query) return repoList()
    return repoList().filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(query) || (repo.description?.toLowerCase().includes(query) ?? false),
    )
  })

  const hasProject = () => props.directory !== undefined || current()?.data !== undefined
  const projectPath = () => current()?.data?.worktree ?? props.directory
  const hasRemote = () => remote()?.data?.hasRemote === true
  const remoteUrl = () => remote()?.data?.url

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
        githubCreateRepoPayload: { name: value, private: createPrivate() },
      })
      if (result.error) {
        setBanner(errorText(result.error) ?? language.t("settings.github.repo.create.failed"))
        return
      }
      setCreateName("")
      setCreatePrivate(false)
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
        showToast({ variant: "error", title: language.t("settings.github.commit.failed") })
        return
      }
      setCommitMessage("")
      showToast({ variant: "success", title: language.t("settings.github.commit.success") })
      void refetchRemote()
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
        showToast({ variant: "error", title: language.t("settings.github.push.failed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.github.push.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.github.push.failed") })
    } finally {
      setPushing(false)
      void refetchRemote()
    }
  }

  const pull = async () => {
    if (pulling()) return
    setPulling(true)
    try {
      const result = await serverSdk().client.vcs.pull({ ...params() })
      if (result.error || result.data?.success === false) {
        showToast({ variant: "error", title: language.t("settings.github.pull.failed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.github.pull.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.github.pull.failed") })
    } finally {
      setPulling(false)
      void refetchRemote()
    }
  }

  return (
    <div class="gh-container">
      <Show when={banner()}>
        <div class="settings-v2-skills-message" data-variant="error">
          {banner()}
        </div>
      </Show>

      <Show
        when={connected()}
        fallback={
          /* Vista Desconectada: Centrada, informativa y profesional */
          <div class="gh-hero-card">
            <div class="gh-logo-wrapper">
              <GitHubLogo size={64} />
            </div>
            <h2 class="gh-hero-title">Conectar con GitHub</h2>
            <p class="gh-hero-desc">
              Sincroniza tus repositorios, clona proyectos directamente en Tiancode, realiza commits atómicos
              y empuja cambios de forma automatizada mediante tus agentes y flujos de trabajo.
            </p>

            <div class="gh-token-box">
              <span class="gh-token-label">Personal Access Token (PAT)</span>
              <TextInputV2
                type="password"
                appearance="base"
                class="gh-token-input"
                value={token()}
                onInput={(event) => setToken(event.currentTarget.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                spellcheck={false}
                autocomplete="off"
                disabled={status.loading}
                aria-label="GitHub Personal Access Token"
              />
              <span class="gh-token-hint">
                Requiere permisos <code>repo</code> y <code>read:user</code>. Puedes generarlo en Settings &gt; Developer settings de GitHub.
              </span>
            </div>

            <ButtonV2
              type="button"
              variant="contrast"
              size="normal"
              class="gh-btn-connect"
              disabled={connecting() || !token().trim() || status.loading}
              onClick={() => void connect()}
            >
              {connecting() ? "Conectando con GitHub..." : "Vincular Cuenta de GitHub"}
            </ButtonV2>
          </div>
        }
      >
        {/* Vista Conectada: Tarjeta de perfil extendida + VCS + Repositorios */}
        <div class="gh-connected-wrapper">
          {/* Header de Perfil Centrado y Extendido */}
          <div class="gh-profile-card">
            <div class="gh-profile-left">
              <Show when={avatarUrl()} fallback={<GitHubLogo size={48} />}>
                <img class="gh-profile-avatar" src={avatarUrl()} alt={login() ?? ""} />
              </Show>
              <div class="gh-profile-copy">
                <div class="gh-profile-badge-row">
                  <span class="gh-badge-connected">✓ Cuenta Vinculada</span>
                  <span class="gh-badge-repos">{repoList().length} repositorios</span>
                </div>
                <h3 class="gh-profile-username">@{login()}</h3>
                <a
                  href={`https://github.com/${login()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="gh-profile-link"
                >
                  Ver perfil en GitHub.com ↗
                </a>
              </div>
            </div>

            <div class="gh-profile-actions">
              <ButtonV2 type="button" variant="outline" size="small" onClick={() => void refetchStatus()}>
                Actualizar Estado
              </ButtonV2>
              <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void disconnect()}>
                Desvincular
              </ButtonV2>
            </div>
          </div>

          {/* Estado de VCS del Proyecto Actual */}
          <Show when={hasProject()}>
            <div class="gh-vcs-card">
              <div class="gh-vcs-header">
                <div>
                  <h4 class="gh-vcs-title">Control de Versiones (VCS)</h4>
                  <p class="gh-vcs-path">{projectPath()}</p>
                </div>
                <div class="gh-vcs-buttons">
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={pulling() || !hasRemote()}
                    onClick={() => void pull()}
                  >
                    {pulling() ? "Trayendo cambios..." : "⬇ Pull"}
                  </ButtonV2>
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={pushing() || !hasRemote()}
                    onClick={() => void push()}
                  >
                    {pushing() ? "Empujando cambios..." : "⬆ Push"}
                  </ButtonV2>
                </div>
              </div>

              <div class="gh-commit-bar">
                <TextInputV2
                  type="text"
                  appearance="base"
                  value={commitMessage()}
                  onInput={(e) => setCommitMessage(e.currentTarget.value)}
                  placeholder="Mensaje de commit (ej. feat: nueva funcionalidad)..."
                />
                <ButtonV2
                  type="button"
                  variant="contrast"
                  size="small"
                  disabled={committing() || !commitMessage().trim()}
                  onClick={() => void commit()}
                >
                  {committing() ? "Guardando..." : "Commit"}
                </ButtonV2>
              </div>
            </div>
          </Show>

          {/* Explorador de Repositorios */}
          <div class="gh-repos-section">
            <div class="gh-repos-header">
              <h4 class="gh-section-title">Tus Repositorios de GitHub</h4>
              <TextInputV2
                type="text"
                appearance="base"
                class="gh-repos-search"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder="Buscar en tus repositorios..."
                showClearButton={search().length > 0}
                onClearClick={() => setSearch("")}
              />
            </div>

            <div class="gh-repos-grid">
              <For each={visibleRepos()}>
                {(repo) => (
                  <div class="gh-repo-card">
                    <div class="gh-repo-top">
                      <span class="gh-repo-name">{repo.fullName}</span>
                      <span class="gh-repo-vis">{repo.private ? "Privado" : "Público"}</span>
                    </div>
                    <p class="gh-repo-desc">{repo.description || "Sin descripción proporcionada."}</p>
                    <div class="gh-repo-bottom">
                      <ButtonV2
                        type="button"
                        variant="outline"
                        size="small"
                        disabled={cloning() === repo.fullName}
                        onClick={() => void cloneRepo(repo)}
                      >
                        {cloning() === repo.fullName ? "Clonando..." : "Clonar y Abrir"}
                      </ButtonV2>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
