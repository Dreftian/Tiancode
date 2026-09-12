import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Markdown } from "@tiancode-ai/session-ui/markdown"
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import {
  CATEGORY_BACKEND,
  CATEGORY_FRONTEND,
  CATEGORY_TESTING,
  catalogueState,
  localizeSkillHeadings,
  SAFE_SKILLS,
} from "./skills-catalogue"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { fallbackGlyph, hashColor, SettingsItemIconV2 } from "./parts/item-icon"
import "./settings-v2.css"

const PAGE_SIZE = 8

// Ghost rows while the server answers: fewer than PAGE_SIZE so the column does not become a wall
// of shimmer, enough that it reads as a list rather than as emptiness.
const SKELETON_ROWS = [0, 1, 2, 3, 4]

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(tree|blob)\/([^/\s#]+)((?:\/[^\s#]*)?))?(?:[?#].*)?$/i

const MAX_GITHUB_SKILLS = 20
const MAX_FILES_PER_SKILL = 30

type GitHubSource = {
  owner: string
  repo: string
  kind?: "tree" | "blob"
  ref: string
  subpath: string
}

function decodeGitHubUrl(value: string): GitHubSource | undefined {
  const match = GITHUB_URL_RE.exec(value.trim())
  if (!match) return undefined
  const kind = match[3] === "tree" || match[3] === "blob" ? match[3] : undefined
  const subpath = (match[5] ?? "").replace(/^\//, "").replace(/\/$/, "")
  return {
    owner: match[1],
    repo: match[2],
    kind,
    ref: match[4] ?? "HEAD",
    subpath,
  }
}

const githubApiJson = async (url: string) => {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } })
  if (!response.ok) throw new Error(`GitHub request failed with ${response.status}`)
  return response.json()
}

const fetchGitHubFile = async (source: GitHubSource, path: string) => {
  const response = await fetch(`https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${path}`)
  if (!response.ok) throw new Error(`Failed to download ${path} (${response.status})`)
  return response.text()
}

type GitHubSkillFiles = { name: string; files: { path: string; content: string }[] }

// Resolves a GitHub URL (repo root, tree folder, or a single SKILL.md blob)
// into one entry per discovered SKILL.md. Sibling files inside each skill's
// own directory ride along so references keep working.
type GitHubTreeEntry = { type: string; path: string }

// Validates the git-trees API response shape without type assertions.
function parseGitHubBlobPaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("tree" in value) || !Array.isArray(value.tree)) return []
  const paths: string[] = []
  for (const entry of value.tree) {
    if (!entry || typeof entry !== "object") continue
    if (!("type" in entry) || !("path" in entry)) continue
    if (typeof entry.type === "string" && typeof entry.path === "string") {
      paths.push(entry.path)
    }
  }
  return paths
}

async function fetchGitHubSkills(source: GitHubSource): Promise<GitHubSkillFiles[]> {
  if (source.kind === "blob") {
    if (!source.subpath.endsWith("SKILL.md")) return []
    const content = await fetchGitHubFile(source, source.subpath)
    const segments = source.subpath.split("/")
    segments.pop()
    const name = segments.pop() ?? source.repo
    return [{ name, files: [{ path: "SKILL.md", content }] }]
  }

  const data = await githubApiJson(
    `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.ref}?recursive=1`,
  )
  const blobPaths: GitHubTreeEntry["path"][] = parseGitHubBlobPaths(data)

  const prefix = source.kind === "tree" && source.subpath ? `${source.subpath}/` : ""
  const skillPaths = blobPaths
    .filter((filePath) => filePath === "SKILL.md" || filePath.endsWith("/SKILL.md"))
    .filter((filePath) => !prefix || filePath.startsWith(prefix))
    .sort()
    .slice(0, MAX_GITHUB_SKILLS)

  return Promise.all(
    skillPaths.map(async (skillPath) => {
      const dir = skillPath.includes("/") ? skillPath.slice(0, skillPath.lastIndexOf("/")) : ""
      const siblings = dir
        ? blobPaths.filter((filePath) => filePath.startsWith(`${dir}/`)).slice(0, MAX_FILES_PER_SKILL)
        : [skillPath]
      const files = await Promise.all(
        siblings.map(async (filePath) => ({
          path: dir ? filePath.slice(dir.length + 1) : filePath,
          content: await fetchGitHubFile(source, filePath),
        })),
      )
      return { name: dir || source.repo, files }
    }),
  )
}

type SkillFilter = "all" | "safe" | "specialized" | "frontend" | "backend" | "testing"

export const SettingsSkillsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const isSpanish = createMemo(() => language.intl().toLowerCase().startsWith("es"))
  const [url, setUrl] = createSignal("")
  const [githubUrl, setGithubUrl] = createSignal("")
  const [importing, setImporting] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)
  const [selected, setSelected] = createSignal<string | undefined>(undefined)
  const [page, setPage] = createSignal(0)
  const [filterCategory, setFilterCategory] = createSignal<SkillFilter>("all")

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      try {
        const p = params()
        const loc = p ? { location: p } : undefined
        const [skillsRes, config] = await Promise.all([
          serverSdk()
            .client.v2.skill.list(p ? { location: p } : undefined, { throwOnError: false })
            .then((res) => ((res?.data as any)?.data ?? res?.data ?? []) as any[])
            .catch(async () => {
              const api = serverSdk().api as any
              const apiRes = await (api?.skills ?? api?.skill)?.list?.(loc).catch(() => undefined)
              return ((apiRes?.data as any)?.data ?? apiRes?.data ?? []) as any[]
            })
            .catch(() => [] as any[]),
          serverSdk()
            .client.config.get(p ?? undefined)
            .catch(() => ({ data: {} })),
        ])
        return {
          skills: (Array.isArray(skillsRes) ? skillsRes : []) as any[],
          disabled: new Set(((config?.data as any)?.skills?.disabled ?? []) as string[]),
          autoSelect: (config?.data as any)?.skills?.autoSelect !== false,
        }
      } catch {
        return { skills: [], disabled: new Set<string>(), autoSelect: true }
      }
    },
    { initialValue: { skills: [], disabled: new Set<string>(), autoSelect: true } },
  )

  // El servidor es la única fuente real del catálogo (incluye el SKILL.md completo de cada
  // skill). Si responde vacío porque todavía se estaba levantando — lo típico al abrir la app
  // recién actualizada — el panel se quedaba con el resumen incrustado y sin la ficha completa
  // hasta cerrar y volver a abrir. Se vuelve a preguntar unas pocas veces y al activar la
  // pestaña, en vez de dar el vacío por definitivo.
  const SKILL_RETRY_DELAYS_MS = [700, 2000, 5000]
  let skillRetries = 0
  let skillRetryTimer: ReturnType<typeof setTimeout> | undefined
  // Whether the retry budget is spent. Until it is, an empty list is "still loading", not "empty".
  const [catalogueSettled, setCatalogueSettled] = createSignal(false)
  onCleanup(() => clearTimeout(skillRetryTimer))
  createEffect(() => {
    if (data.loading) return
    if (data().skills.length > 0) {
      // Reset rather than saturate: a later refetch (toggling a skill while the sidecar restarts)
      // resolves to [] through the fetcher's catch, and a spent budget would render that as
      // "no skills installed" — the exact lie this loop exists to prevent.
      skillRetries = 0
      setCatalogueSettled(true)
      return
    }
    const delay = SKILL_RETRY_DELAYS_MS[skillRetries]
    if (delay === undefined) {
      setCatalogueSettled(true)
      return
    }
    // An empty answer is not a verdict until the ladder is spent, even if a previous load worked.
    setCatalogueSettled(false)
    skillRetries += 1
    clearTimeout(skillRetryTimer)
    skillRetryTimer = setTimeout(() => void refetch(), delay)
  })

  // Volver a la pestaña es una petición implícita de "enséñame lo que hay ahora", y con la lista
  // todavía vacía también es una petición de volver a intentarlo desde cero.
  createEffect(
    on(
      () => props.active,
      (active, previous) => {
        if (!active || previous) return
        if (data().skills.length === 0) {
          skillRetries = 0
          setCatalogueSettled(false)
        }
        void refetch()
      },
      { defer: true },
    ),
  )

  // The server is the only catalogue: `Info` already carries each skill's full SKILL.md. The panel
  // used to keep ~200 lines of hand-written Spanish summaries as an offline fallback, which meant a
  // slow first load silently showed a stub where the real document belonged. An empty list now
  // means "the server has not answered yet" (see catalogueLoading), never "you have no skills".
  const skills = createMemo(() => data().skills)

  const catalogueLoading = createMemo(
    () => catalogueState({ count: skills().length, settled: catalogueSettled() }) === "loading",
  )

  const filteredSkills = createMemo(() => {
    const list = skills()
    const cat = filterCategory()
    if (cat === "safe") return list.filter((s) => SAFE_SKILLS.has(s.name))
    if (cat === "specialized") return list.filter((s) => !SAFE_SKILLS.has(s.name))
    if (cat === "frontend") return list.filter((s) => CATEGORY_FRONTEND.has(s.name))
    if (cat === "backend") return list.filter((s) => CATEGORY_BACKEND.has(s.name))
    if (cat === "testing") return list.filter((s) => CATEGORY_TESTING.has(s.name))
    return list
  })

  const [skillOverrides, setSkillOverrides] = createSignal<Record<string, boolean>>({})

  const disabled = createMemo(() => {
    const base = new Set(data().disabled)
    const overrides = skillOverrides()
    for (const [name, enabled] of Object.entries(overrides)) {
      if (enabled) base.delete(name)
      else base.add(name)
    }
    return base
  })
  const autoSelect = createMemo(() => data().autoSelect)
  const pages = createMemo(() => Math.max(1, Math.ceil(filteredSkills().length / PAGE_SIZE)))
  const pageSkills = createMemo(() => filteredSkills().slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))
  const selectedSkill = createMemo(() => skills().find((skill) => skill.name === selected()) ?? filteredSkills()[0] ?? skills()[0])

  const enabledCount = createMemo(() => skills().filter((s) => !disabled().has(s.name)).length)
  const filterOptions = createMemo<{ id: SkillFilter; label: string; count: number }[]>(() => {
    const list = skills()
    const count = (pred: (name: string) => boolean) => list.filter((s) => pred(s.name)).length
    return [
      { id: "all", label: language.t("settings.skills.filter.all"), count: list.length },
      { id: "safe", label: language.t("settings.skills.filter.safe"), count: count((n) => SAFE_SKILLS.has(n)) },
      { id: "specialized", label: language.t("settings.skills.filter.specialized"), count: count((n) => !SAFE_SKILLS.has(n)) },
      { id: "frontend", label: language.t("settings.skills.filter.frontend"), count: count((n) => CATEGORY_FRONTEND.has(n)) },
      { id: "backend", label: language.t("settings.skills.filter.backend"), count: count((n) => CATEGORY_BACKEND.has(n)) },
      { id: "testing", label: language.t("settings.skills.filter.testing"), count: count((n) => CATEGORY_TESTING.has(n)) },
    ]
  })
  const safeEnabledCount = createMemo(() => skills().filter((s) => SAFE_SKILLS.has(s.name) && !disabled().has(s.name)).length)
  const specializedEnabledCount = createMemo(() => skills().filter((s) => !SAFE_SKILLS.has(s.name) && !disabled().has(s.name)).length)

  const updateDisabledSkills = async (newDisabledList: string[]) => {
    try {
      const sorted = newDisabledList.toSorted()
      await serverSdk().client.config.update({
        ...params(),
        config: { skills: { disabled: sorted } },
      })
      void refetch()
    } catch (e) {
      console.warn("Failed to update disabled skills", e)
    }
  }

  const enableAll = async () => {
    await updateDisabledSkills([])
  }

  const disableAll = async () => {
    await updateDisabledSkills(skills().map((s) => s.name))
  }

  const enableSafeOnly = async () => {
    const specializedNames = skills().filter((s) => !SAFE_SKILLS.has(s.name)).map((s) => s.name)
    await updateDisabledSkills(specializedNames)
  }

  const toggleSpecialized = async () => {
    const specializedNames = skills().filter((s) => !SAFE_SKILLS.has(s.name)).map((s) => s.name)
    const allSpecializedDisabled = specializedNames.every((name) => disabled().has(name))
    if (allSpecializedDisabled) {
      const newDisabled = Array.from(disabled()).filter((name) => !specializedNames.includes(name))
      await updateDisabledSkills(newDisabled)
    } else {
      const newDisabled = Array.from(new Set([...disabled(), ...specializedNames]))
      await updateDisabledSkills(newDisabled)
    }
  }

  const pickFolder = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.setAttribute("webkitdirectory", "")
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) return
      const entries = []
      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        entries.push({ path, content: await file.text() })
      }
      const root = entries[0].path.split("/")[0] || "skill"
      await runImport({
        name: root,
        files: entries.map(({ path, content }) => ({
          path: path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path,
          content,
        })),
      })
    }
    input.click()
  }

  const downloadFromUrl = () => {
    const value = url().trim()
    if (!value) return
    void runImport({ url: value })
  }

  const runImport = async (input: { name?: string; files?: { path: string; content: string }[]; url?: string }) => {
    setImporting(true)
    setMessage(undefined)
    try {
      await serverSdk().client.app.skills2.import({ ...params(), ...input })
      setMessage("success")
      void refetch()
    } catch {
      setMessage("error")
    } finally {
      setImporting(false)
    }
  }

  const toggleSkill = (name: string, enabled: boolean) => {
    // 1. Inmediato (0 ms) reactivo y toast
    setSkillOverrides((prev) => ({ ...prev, [name]: enabled }))
    showToast({
      variant: "success",
      title: language.t(enabled ? "settings.skills.toggle.enabled" : "settings.skills.toggle.disabled", { name }),
    })

    // 2. Persistencia en segundo plano sin congelar la animación del switch
    const nextDisabled = new Set(disabled())
    if (enabled) {
      nextDisabled.delete(name)
    } else {
      nextDisabled.add(name)
    }

    void updateDisabledSkills(Array.from(nextDisabled)).catch(() => {
      setSkillOverrides((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      showToast({ variant: "error", title: language.t("settings.skills.toggle.failed") })
    })
  }

  // Auto-selección: el modelo elige automáticamente las skills según las
  // señales del proyecto (framework, tooling…). Persiste en skills.autoSelect.
  const toggleAutoSelect = async (enabled: boolean) => {
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { skills: { autoSelect: enabled } },
      })
      void refetch()
    } catch (e) {
      console.warn("Failed to toggle autoSelect", e)
    }
  }

  const searchGoogle = () => {
    platform.openExternal(
      `https://www.google.com/search?q=${encodeURIComponent("tiancode skills SKILL.md")}`,
    )
  }

  const prevPage = () => {
    setPage((page() + pages() - 1) % pages())
  }

  const nextPage = () => {
    setPage((page() + 1) % pages())
  }

  const importFromGithub = async () => {
    const value = githubUrl().trim()
    if (!value) return
    const source = decodeGitHubUrl(value)
    if (!source) {
      showToast({ variant: "error", title: language.t("settings.skills.github.failed") })
      return
    }
    setImporting(true)
    setMessage(undefined)
    try {
      const skills = await fetchGitHubSkills(source)
      if (skills.length === 0) {
        showToast({ variant: "error", title: language.t("settings.skills.github.none") })
        return
      }
      for (const skill of skills) {
        await serverSdk().client.app.skills2.import({ ...params(), name: skill.name, files: skill.files })
      }
      showToast({
        variant: "success",
        title:
          skills.length === 1
            ? language.t("settings.skills.github.success.one", { name: skills[0].name })
            : language.t("settings.skills.github.success.many", { count: skills.length }),
      })
      setGithubUrl("")
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.skills.github.failed") })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
          <div class="flex items-center gap-2">
            <ButtonV2 type="button" variant="ghost" size="small" onClick={searchGoogle}>
              {language.t("settings.skills.search.google")}
            </ButtonV2>
          </div>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.skills.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-skills">
        <Show when={message() === "success" || message() === "error"}>
          <div class="settings-v2-skills-message" data-variant={message()}>
            {message() === "success"
              ? language.t("settings.skills.import.success")
              : language.t("settings.skills.import.failed")}
          </div>
        </Show>

        <div class="settings-v2-skills-layout">
          <div class="settings-v2-skills-list">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.skills.section.installed")}</h3>
              <SettingsListV2>
                <SettingsRowV2
                  title={language.t("settings.skills.autoSelect.title")}
                  description={language.t("settings.skills.autoSelect.description")}
                >
                  <Switch checked={autoSelect()} onChange={(checked) => void toggleAutoSelect(checked)} hideLabel>
                    {language.t("settings.skills.autoSelect.title")}
                  </Switch>
                </SettingsRowV2>
              </SettingsListV2>

              <Show when={!catalogueLoading()}>
              <div class="settings-v2-skills-toolbar">
                <div class="settings-v2-skills-toolbar-row">
                  <span class="settings-v2-skills-stats-pill">
                    {language.t("settings.skills.stats.active", { enabled: enabledCount(), total: skills().length })}
                  </span>
                  <div class="settings-v2-skills-quick-buttons">
                    <ButtonV2 type="button" variant="outline" size="small" onClick={() => void enableAll()}>
                      {language.t("settings.skills.actions.enableAll")}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="outline" size="small" onClick={() => void enableSafeOnly()}>
                      {language.t("settings.skills.actions.safeOnly")}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="outline" size="small" onClick={() => void toggleSpecialized()}>
                      {language.t(
                        specializedEnabledCount() > 0
                          ? "settings.skills.actions.specialized.disable"
                          : "settings.skills.actions.specialized.enable",
                      )}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void disableAll()}>
                      {language.t("settings.skills.actions.disableAll")}
                    </ButtonV2>
                  </div>
                </div>

                <div class="settings-v2-skills-filters-row">
                  <For each={filterOptions()}>
                    {(option) => (
                      <button
                        type="button"
                        class="settings-v2-skills-filter-btn"
                        data-active={filterCategory() === option.id ? "" : undefined}
                        onClick={() => {
                          setFilterCategory(option.id)
                          setPage(0)
                        }}
                      >
                        {option.label}
                        <span class="settings-v2-skills-filter-count">{option.count}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
              </Show>

              <Show
                when={filteredSkills().length > 0}
                fallback={
                  <Show
                    when={catalogueLoading()}
                    fallback={
                      <div class="settings-v2-skills-status">
                        {language.t(
                          skills().length > 0 ? "settings.skills.empty.filtered" : "settings.skills.empty",
                        )}
                      </div>
                    }
                  >
                    <SettingsListV2>
                      <For each={SKELETON_ROWS}>
                        {() => (
                          <div class="settings-v2-skills-item settings-v2-skills-item--skeleton" aria-hidden="true">
                            <div class="settings-v2-skeleton settings-v2-skeleton--icon" />
                            <div class="settings-v2-skills-item-copy">
                              <div class="settings-v2-skeleton settings-v2-skeleton--line settings-v2-skeleton--name" />
                              <div class="settings-v2-skeleton settings-v2-skeleton--line" />
                            </div>
                            <div class="settings-v2-skills-item-toggle">
                              <div class="settings-v2-skeleton settings-v2-skeleton--switch" />
                            </div>
                          </div>
                        )}
                      </For>
                    </SettingsListV2>
                    <div class="settings-v2-skills-status" role="status" aria-live="polite">
                      {language.t("settings.skills.loading")}
                    </div>
                  </Show>
                }
              >
                <SettingsListV2>
                  <For each={pageSkills()}>
                    {(skill) => (
                      <div
                        class="settings-v2-skills-item"
                        data-selected={selected() === skill.name ? "" : undefined}
                        data-disabled={disabled().has(skill.name) ? "" : undefined}
                        onClick={() => setSelected(skill.name)}
                      >
                        <SettingsItemIconV2
                          icon={skill.icon}
                          fallback={fallbackGlyph(skill.name)}
                          color={hashColor(skill.name)}
                        />
                        <div class="settings-v2-skills-item-copy">
                          <div class="settings-v2-skills-item-name flex items-center">
                            {skill.name}
                            <span
                              class={`settings-v2-skill-badge ${SAFE_SKILLS.has(skill.name) ? "settings-v2-skill-badge--safe" : "settings-v2-skill-badge--specialized"}`}
                            >
                              {language.t(
                                SAFE_SKILLS.has(skill.name) ? "settings.skills.badge.safe" : "settings.skills.badge.specialized",
                              )}
                            </span>
                          </div>
                          <div class="settings-v2-skills-item-description">
                            {skill.description ?? ""}
                          </div>
                        </div>
                        <div
                          class="settings-v2-skills-item-toggle"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Switch
                            checked={!disabled().has(skill.name)}
                            onChange={(checked) => void toggleSkill(skill.name, checked)}
                            hideLabel
                          >
                            {skill.name}
                          </Switch>
                        </div>
                      </div>
                    )}
                  </For>
                </SettingsListV2>
                <Show when={pages() > 1}>
                  <div class="settings-v2-skills-pagination">
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={prevPage}>
                      ←
                    </ButtonV2>
                    <span class="settings-v2-skills-pagination-label">
                      {page() + 1} / {pages()}
                    </span>
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={nextPage}>
                      →
                    </ButtonV2>
                  </div>
                </Show>
              </Show>
            </div>

            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.skills.section.import")}</h3>
              <SettingsListV2>
                <div class="settings-v2-skills-import-row">
                  <div class="settings-v2-skills-import-copy">
                    <div class="settings-v2-skills-item-name">
                      {language.t("settings.skills.import.folder.title")}
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {language.t("settings.skills.import.folder.description")}
                    </div>
                  </div>
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={importing()}
                    onClick={pickFolder}
                  >
                    {importing()
                      ? language.t("settings.skills.importing")
                      : language.t("settings.skills.import.folder.button")}
                  </ButtonV2>
                </div>
                <div class="settings-v2-skills-import-row">
                  <div class="settings-v2-skills-import-copy">
                    <div class="settings-v2-skills-item-name">
                      {language.t("settings.skills.import.github.title")}
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {language.t("settings.skills.import.github.description")}
                    </div>
                  </div>
                  <div class="settings-v2-skills-url">
                    <TextInputV2
                      type="url"
                      appearance="base"
                      value={githubUrl()}
                      onInput={(event) => setGithubUrl(event.currentTarget.value)}
                      placeholder={language.t("settings.skills.import.github.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.skills.import.github.title")}
                    />
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      disabled={importing() || !githubUrl()}
                      onClick={() => void importFromGithub()}
                    >
                      {importing()
                        ? language.t("settings.skills.importing")
                        : language.t("settings.skills.import.github.button")}
                    </ButtonV2>
                  </div>
                </div>
                <div class="settings-v2-skills-import-row">
                  <div class="settings-v2-skills-import-copy">
                    <div class="settings-v2-skills-item-name">
                      {language.t("settings.skills.import.url.title")}
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {language.t("settings.skills.import.url.description")}
                    </div>
                  </div>
                  <div class="settings-v2-skills-url">
                    <TextInputV2
                      type="url"
                      appearance="base"
                      value={url()}
                      onInput={(event) => setUrl(event.currentTarget.value)}
                      placeholder={language.t("settings.skills.import.url.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.skills.import.url.title")}
                    />
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      disabled={importing() || !url()}
                      onClick={downloadFromUrl}
                    >
                      {importing()
                        ? language.t("settings.skills.importing")
                        : language.t("settings.skills.import.url.button")}
                    </ButtonV2>
                  </div>
                </div>
              </SettingsListV2>
            </div>
          </div>

          <Show when={selectedSkill()} fallback={<div class="settings-v2-skills-detail-empty" />}>
            {(skill) => (
              <div class="settings-v2-skills-detail">
                <div class="settings-v2-skills-detail-header">
                  <SettingsItemIconV2
                    icon={skill().icon}
                    fallback={fallbackGlyph(skill().name)}
                    color={hashColor(skill().name)}
                  />
                  <div class="settings-v2-skills-item-copy">
                    <div class="settings-v2-skills-item-name flex items-center">
                      {skill().name}
                      <span
                        class={`settings-v2-skill-badge ${SAFE_SKILLS.has(skill().name) ? "settings-v2-skill-badge--safe" : "settings-v2-skill-badge--specialized"}`}
                      >
                        {language.t(
                          SAFE_SKILLS.has(skill().name) ? "settings.skills.badge.safe" : "settings.skills.badge.specialized",
                        )}
                      </span>
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {skill().description ?? ""}
                    </div>
                  </div>
                  <div class="settings-v2-skills-item-toggle">
                    <Switch
                      checked={!disabled().has(skill().name)}
                      onChange={(checked) => void toggleSkill(skill().name, checked)}
                      hideLabel
                    >
                      {skill().name}
                    </Switch>
                  </div>
                </div>
                <div class="settings-v2-skills-detail-meta">{skill().location}</div>

                {/* Caja de aviso de compatibilidad y optimización */}
                <div
                  class={`settings-v2-skill-compatibility-callout ${SAFE_SKILLS.has(skill().name) ? "settings-v2-skill-compatibility-callout--safe" : "settings-v2-skill-compatibility-callout--specialized"}`}
                >
                  {SAFE_SKILLS.has(skill().name)
                    ? language.t("settings.skills.callout.safe")
                    : language.t("settings.skills.callout.specialized")}
                </div>

                <div class="settings-v2-skills-detail-body">
                  <Markdown
                    text={localizeSkillHeadings(skill().content, isSpanish()) || (skill().description ?? "")}
                    class="text-12-regular"
                  />
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
