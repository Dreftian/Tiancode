import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon } from "@tiancode-ai/ui/icon"
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

// Error bodies come in several shapes (`{ _tag, message }`,
// `{ name, data: { message } }`, plain `{ message }`); extract the message
// so the banner can show the real reason instead of a generic fallback.
const errorText = (error: unknown): string | undefined => {
  if (error === null || typeof error !== "object") return undefined
  const obj = error as { message?: unknown; data?: { message?: unknown } }
  if (typeof obj.message === "string" && obj.message) return obj.message
  if (obj.data && typeof obj.data.message === "string" && obj.data.message) return obj.data.message
  return undefined
}

export const SettingsGithubV2: Component<{
  directory?: string
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
    async () => serverSdk().client.github.status(params()),
  )
  const connected = () => status()?.data?.connected === true
  const login = () => status()?.data?.login
  const avatarUrl = () => status()?.data?.avatarUrl

  // Repo list, project info and remote state only matter once a GitHub
  // account is connected; re-fetching the status after connect/disconnect
  // flips the source and re-runs these automatically.
  const [repos, { refetch: refetchRepos }] = createResource(
    () => connected(),
    (isConnected) => (isConnected ? serverSdk().client.github.repos(params()) : undefined),
  )
  const [current, { refetch: refetchCurrent }] = createResource(
    () => connected(),
    (isConnected) => (isConnected ? serverSdk().client.project.current(params()) : undefined),
  )
  const [remote, { refetch: refetchRemote }] = createResource(
    () => connected(),
    (isConnected) => (isConnected ? serverSdk().client.vcs.remote(params()) : undefined),
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
        navigate(`/${base64Encode(directory)}/session`)
      }
    } catch (error) {
      setBanner(errorText(error) ?? language.t("settings.github.repo.clone.failed"))
    } finally {
      setCloning(undefined)
    }
  }

  const createRepo = async () => {
    const name = createName().trim()
    if (!name || creating()) return
    setCreating(true)
    setBanner(undefined)
    try {
      const result = await serverSdk().client.github.createRepo({
        ...params(),
        githubCreateRepoPayload: { name, private: createPrivate() },
      })
      if (result.error) {
        setBanner(errorText(result.error) ?? language.t("settings.github.create.failed"))
        return
      }
      setCreateName("")
      showToast({ variant: "success", title: language.t("settings.github.create.success") })
      void refetchRepos()
    } catch (error) {
      setBanner(errorText(error) ?? language.t("settings.github.create.failed"))
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
    } catch {
      showToast({ variant: "error", title: language.t("settings.github.commit.failed") })
    } finally {
      setCommitting(false)
      void refetchRemote()
      void refetchCurrent()
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
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.github.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.github.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-github">
        <Show when={banner()}>
          <div class="settings-v2-skills-message" data-variant="error">
            {banner()}
          </div>
        </Show>

        <Show when={status.loading}>
          <div class="settings-v2-skills-status">{language.t("settings.github.loading")}</div>
        </Show>

        <Show
          when={!status.loading && connected()}
          fallback={
            <Show when={!status.loading}>
              <div class="settings-v2-section settings-v2-github-connect">
                <h3 class="settings-v2-section-title">{language.t("settings.github.connect.title")}</h3>
                <p class="settings-v2-github-description">{language.t("settings.github.connect.description")}</p>
                <TextInputV2
                  type="password"
                  appearance="base"
                  class="settings-v2-github-token"
                  value={token()}
                  onInput={(event) => setToken(event.currentTarget.value)}
                  placeholder={language.t("settings.github.connect.token.placeholder")}
                  spellcheck={false}
                  autocomplete="off"
                  aria-label={language.t("settings.github.connect.token.placeholder")}
                />
                <span class="settings-v2-github-hint">{language.t("settings.github.connect.hint")}</span>
                <div class="settings-v2-github-actions">
                  <ButtonV2
                    type="button"
                    variant="contrast"
                    size="small"
                    disabled={connecting() || !token().trim()}
                    onClick={() => void connect()}
                  >
                    {connecting()
                      ? language.t("settings.github.connecting")
                      : language.t("settings.github.connect.button")}
                  </ButtonV2>
                </div>
              </div>
            </Show>
          }
        >
          <div class="settings-v2-github-account">
            <Show when={avatarUrl()} fallback={<Icon name="github" />}>
              <img class="settings-v2-github-avatar" src={avatarUrl()} alt={login() ?? ""} />
            </Show>
            <div class="settings-v2-github-account-copy">
              <span class="settings-v2-github-account-label">{language.t("settings.github.connected.title")}</span>
              <span class="settings-v2-github-account-login">{login()}</span>
            </div>
            <div class="settings-v2-github-account-actions">
              <ButtonV2 type="button" variant="outline" size="small" onClick={() => void refetchStatus()}>
                {language.t("settings.github.refresh")}
              </ButtonV2>
              <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void disconnect()}>
                {language.t("settings.github.disconnect.button")}
              </ButtonV2>
            </div>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.github.repos.title")}</h3>
            <TextInputV2
              type="text"
              appearance="base"
              class="settings-v2-github-search"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
              placeholder={language.t("settings.github.repos.search.placeholder")}
              showClearButton={search().length > 0}
              onClearClick={() => setSearch("")}
              spellcheck={false}
              autocomplete="off"
              aria-label={language.t("settings.github.repos.search.placeholder")}
            />
            <Show
              when={visibleRepos().length > 0}
              fallback={<div class="settings-v2-skills-status">{language.t("settings.github.repos.empty")}</div>}
            >
              <SettingsListV2>
                <For each={visibleRepos()}>
                  {(repo) => (
                    <div class="settings-v2-github-repo">
                      <div class="settings-v2-github-repo-copy">
                        <div class="settings-v2-github-repo-name-row">
                          <span class="settings-v2-github-repo-name">{repo.fullName}</span>
                          <span class="settings-v2-github-chip" data-variant="type">
                            {language.t(repo.private ? "settings.github.repo.private" : "settings.github.repo.public")}
                          </span>
                        </div>
                        <Show when={repo.description}>
                          <div class="settings-v2-github-repo-description">{repo.description}</div>
                        </Show>
                      </div>
                      <ButtonV2
                        type="button"
                        variant="outline"
                        size="small"
                        disabled={cloning() !== undefined}
                        onClick={() => void cloneRepo(repo)}
                      >
                        {cloning() === repo.fullName
                          ? language.t("settings.github.repo.cloning")
                          : language.t("settings.github.repo.clone")}
                      </ButtonV2>
                    </div>
                  )}
                </For>
              </SettingsListV2>
            </Show>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.github.create.title")}</h3>
            <SettingsListV2>
              <SettingsRowV2 title={language.t("settings.github.create.name")} description="">
                <TextInputV2
                  type="text"
                  appearance="base"
                  value={createName()}
                  onInput={(event) => setCreateName(event.currentTarget.value)}
                  placeholder={language.t("settings.github.create.name.placeholder")}
                  spellcheck={false}
                  autocomplete="off"
                  aria-label={language.t("settings.github.create.name")}
                />
              </SettingsRowV2>
              <SettingsRowV2 title={language.t("settings.github.create.private")} description="">
                <div class="flex items-center">
                  <Switch checked={createPrivate()} onChange={setCreatePrivate} hideLabel>
                    {language.t("settings.github.create.private")}
                  </Switch>
                </div>
              </SettingsRowV2>
            </SettingsListV2>
            <div class="settings-v2-github-actions">
              <ButtonV2
                type="button"
                variant="contrast"
                size="small"
                disabled={creating() || !createName().trim()}
                onClick={() => void createRepo()}
              >
                {language.t("settings.github.create.button")}
              </ButtonV2>
            </div>
          </div>

          <Show when={hasProject()}>
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.github.project.title")}</h3>
              <div class="settings-v2-github-project">
                <div class="settings-v2-github-project-path" title={projectPath()}>
                  {projectPath()}
                </div>
                <Show when={remoteUrl()}>
                  <div class="settings-v2-github-project-remote" title={remoteUrl()}>
                    {remoteUrl()}
                  </div>
                </Show>
              </div>
              <Show
                when={hasRemote()}
                fallback={<span class="settings-v2-github-hint">{language.t("settings.github.project.noRemote")}</span>}
              >
                <div class="settings-v2-github-vcs">
                  <div class="settings-v2-github-vcs-row">
                    <ButtonV2 type="button" variant="outline" size="small" disabled={pulling()} onClick={() => void pull()}>
                      {language.t("settings.github.pull.button")}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="contrast" size="small" disabled={pushing()} onClick={() => void push()}>
                      {language.t("settings.github.push.button")}
                    </ButtonV2>
                  </div>
                  <div class="settings-v2-github-vcs-commit">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      value={commitMessage()}
                      onInput={(event) => setCommitMessage(event.currentTarget.value)}
                      placeholder={language.t("settings.github.commit.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.github.commit.placeholder")}
                    />
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      disabled={committing() || !commitMessage().trim()}
                      onClick={() => void commit()}
                    >
                      {language.t("settings.github.commit.button")}
                    </ButtonV2>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </>
  )
}
