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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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
  const [filterType, setFilterType] = createSignal<"all" | "public" | "private">("all")
  const [showCreateForm, setShowCreateForm] = createSignal(false)
  const [repoPage, setRepoPage] = createSignal(1)
  const PAGE_SIZE = 10

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
    return list
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

  const hasProject = () => props.directory !== undefined || current()?.data !== undefined
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

  const syncAll = () => {
    void refetchStatus()
    void refetchRepos()
    void refetchCurrent()
    void refetchRemote()
    showToast({ variant: "success", title: "GitHub sincronizado correctamente" })
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
                Requiere permisos <code>repo</code> y <code>read:user</code>. Puedes generarlo en GitHub &gt; Settings &gt; Developer settings &gt; Personal access tokens.
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
          {/* Header de Perfil Pulido y Extendido con Métricas */}
          <div class="gh-profile-card">
            <div class="gh-profile-left">
              <div class="gh-avatar-container">
                <Show when={avatarUrl()} fallback={<GitHubLogo size={52} />}>
                  <img class="gh-profile-avatar" src={avatarUrl()} alt={login() ?? ""} />
                </Show>
                <div class="gh-online-dot" title="Conectado y autenticado" />
              </div>
              <div class="gh-profile-copy">
                <div class="gh-profile-badge-row">
                  <span class="gh-badge-connected">✓ Cuenta Vinculada</span>
                  <span class="gh-badge-scope" title="Permisos activos del token">repo · read:user</span>
                </div>
                <div class="gh-username-row">
                  <h3 class="gh-profile-username">@{login()}</h3>
                  <a
                    href={`https://github.com/${login()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="gh-profile-link"
                    title="Abrir perfil de GitHub en el navegador"
                  >
                    Ver perfil ↗
                  </a>
                </div>
                <div class="gh-stats-row">
                  <span class="gh-stat-chip gh-stat-total">
                    <strong>{repoList().length}</strong> repositorios
                  </span>
                  <span class="gh-stat-chip gh-stat-public">
                    <GlobeIcon /> <strong>{publicCount()}</strong> públicos
                  </span>
                  <span class="gh-stat-chip gh-stat-private">
                    <LockIcon /> <strong>{privateCount()}</strong> privados
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
                <PlusIcon /> {showCreateForm() ? "Cerrar" : "Nuevo Repositorio"}
              </ButtonV2>
              <ButtonV2 type="button" variant="outline" size="small" onClick={syncAll} title="Sincronizar repositorios y estado">
                🔄 Sincronizar
              </ButtonV2>
              <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void disconnect()} class="gh-btn-disconnect">
                Desvincular
              </ButtonV2>
            </div>
          </div>

          {/* Formulario Expandible para Crear Nuevo Repositorio */}
          <Show when={showCreateForm()}>
            <div class="gh-create-repo-card">
              <div class="gh-create-repo-header">
                <h4 class="gh-create-repo-title">Crear Nuevo Repositorio en GitHub</h4>
                <p class="gh-create-repo-sub">
                  El repositorio se creará directamente bajo tu cuenta personal @{login()}
                </p>
              </div>

              <div class="gh-create-fields">
                <div class="gh-field-group">
                  <label class="gh-field-label">Nombre del Repositorio *</label>
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={createName()}
                    onInput={(e) => setCreateName(e.currentTarget.value)}
                    placeholder="ej. mi-proyecto-genial"
                  />
                </div>

                <div class="gh-field-group">
                  <label class="gh-field-label">Descripción (opcional)</label>
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={createDescription()}
                    onInput={(e) => setCreateDescription(e.currentTarget.value)}
                    placeholder="Breve resumen del propósito del repositorio..."
                  />
                </div>

                <div class="gh-create-privacy-row">
                  <div class="gh-privacy-info">
                    <span class="gh-privacy-label">
                      {createPrivate() ? "Repositorio Privado" : "Repositorio Público"}
                    </span>
                    <span class="gh-privacy-desc">
                      {createPrivate()
                        ? "Solo tú y las personas a las que des acceso podrán ver este repositorio."
                        : "Cualquier persona en Internet podrá ver este repositorio."}
                    </span>
                  </div>
                  <Switch
                    checked={createPrivate()}
                    onChange={(checked) => setCreatePrivate(checked)}
                  />
                </div>

                <div class="gh-create-actions">
                  <ButtonV2
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancelar
                  </ButtonV2>
                  <ButtonV2
                    type="button"
                    variant="contrast"
                    size="small"
                    disabled={creating() || !createName().trim()}
                    onClick={() => void createRepo()}
                  >
                    {creating() ? "Creando en GitHub..." : "Crear Repositorio"}
                  </ButtonV2>
                </div>
              </div>
            </div>
          </Show>

          {/* Estado de VCS del Proyecto Actual */}
          <Show when={hasProject()}>
            <div class="gh-vcs-card">
              <div class="gh-vcs-header">
                <div>
                  <div class="gh-vcs-title-row">
                    <BranchIcon />
                    <h4 class="gh-vcs-title">Control de Versiones (VCS)</h4>
                  </div>
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

          {/* Explorador de Repositorios con Filtros y Paginación 10x10 */}
          <div class="gh-repos-section">
            <div class="gh-repos-toolbar">
              <div class="gh-repos-toolbar-left">
                <h4 class="gh-section-title">Repositorios de GitHub</h4>
                <div class="gh-filter-pills">
                  <button
                    type="button"
                    class="gh-filter-pill"
                    classList={{ active: filterType() === "all" }}
                    onClick={() => setFilterType("all")}
                  >
                    Todos ({repoList().length})
                  </button>
                  <button
                    type="button"
                    class="gh-filter-pill"
                    classList={{ active: filterType() === "public" }}
                    onClick={() => setFilterType("public")}
                  >
                    Públicos ({publicCount()})
                  </button>
                  <button
                    type="button"
                    class="gh-filter-pill"
                    classList={{ active: filterType() === "private" }}
                    onClick={() => setFilterType("private")}
                  >
                    Privados ({privateCount()})
                  </button>
                </div>
              </div>

              <TextInputV2
                type="text"
                appearance="base"
                class="gh-repos-search"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder="Buscar por nombre o descripción..."
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
                    <p>No se encontraron repositorios con los filtros seleccionados.</p>
                  </div>
                }
              >
                <For each={paginatedRepos()}>
                  {(repo) => (
                    <div class="gh-repo-row">
                      <div class="gh-repo-icon-wrap" classList={{ "is-private": repo.private }}>
                        <Show when={repo.private} fallback={<GlobeIcon />}>
                          <LockIcon />
                        </Show>
                      </div>

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
                            {repo.private ? "Privado" : "Público"}
                          </span>
                          <Show when={repo.defaultBranch}>
                            <span class="gh-repo-branch-tag">
                              <BranchIcon /> {repo.defaultBranch}
                            </span>
                          </Show>
                        </div>
                        <p class="gh-repo-description">
                          {repo.description || "Sin descripción proporcionada."}
                        </p>
                      </div>

                      <div class="gh-repo-actions">
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="gh-repo-external-link"
                          title="Ver en GitHub.com"
                        >
                          Ver ↗
                        </a>
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
              </Show>
            </div>

            {/* Paginación 10x10 sin scroll excesivo */}
            <Show when={totalRepoPages() > 1}>
              <div class="gh-pagination-wrapper">
                <span class="gh-pagination-summary">
                  Mostrando {(repoPage() - 1) * PAGE_SIZE + 1} - {Math.min(repoPage() * PAGE_SIZE, filteredRepos().length)} de {filteredRepos().length} repositorios
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

