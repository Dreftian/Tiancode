import { decodeGitHubUrl, fetchGitHubSkills } from "./skills-github"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
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
import { createStore } from "solid-js/store"
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
import { fallbackGlyph, hashColor, SettingsItemIconV2 } from "./parts/item-icon"
import "./settings-v2.css"

// Ghost rows while the server answers: enough that it reads as a list rather than as emptiness.
const SKELETON_ROWS = [0, 1, 2, 3, 4]

type SkillFilter = "all" | "safe" | "specialized" | "frontend" | "backend" | "testing"

/** What GET /skill returns per entry (backend/tiancode/src/skill/index.ts `Info`). */
type SkillInfo = {
  name: string
  description?: string
  icon?: string
  location: string
  content: string
  disableModelInvocation?: boolean
}

type SkillOrigin = "builtin" | "project" | "installed"

// "adversarial-code-review" → "Adversarial code review": the slug stays visible under it.
function skillTitle(name: string) {
  const words = name.replace(/[-_]+/g, " ").trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : name
}

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
  const [view, setView] = createStore({
    selected: undefined as string | undefined,
    section: "installed" as "installed" | "import",
    filter: "all" as SkillFilter,
    query: "",
    // Narrow panels show the list or the detail; wide ones show both.
    viewing: false,
    bulk: false,
  })
  const selected = () => view.selected
  const setSelected = (name: string) => {
    setView("selected", name)
    setView("viewing", true)
  }
  const section = () => view.section
  const setSection = (value: "installed" | "import") => setView("section", value)
  const filterCategory = () => view.filter

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      const p = params()
      // `client.app.skills` is the real method — GET /skill, the same endpoint the import and
      // toggle calls below already use. This used to call `client.v2.skill.list`, which does not
      // exist on the client: it threw on every load, the catch chain swallowed it, and the panel
      // silently fell back to a bundled stub catalogue. That fallback is gone, so a wrong call
      // here now shows as an empty panel rather than as plausible-looking wrong data.
      const [skillsRes, config] = await Promise.all([
        serverSdk()
          .client.app.skills(p, { throwOnError: false })
          .then((res) => (Array.isArray(res?.data) ? res.data : []))
          .catch(() => []),
        serverSdk()
          .client.config.get(p ?? undefined)
          .catch(() => ({ data: {} })),
      ])
      return {
        skills: skillsRes as SkillInfo[],
        disabled: new Set(((config?.data as any)?.skills?.disabled ?? []) as string[]),
        autoSelect: (config?.data as any)?.skills?.autoSelect !== false,
      }
    },
    { initialValue: { skills: [] as SkillInfo[], disabled: new Set<string>(), autoSelect: true } },
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

  const inCategory = (name: string, cat: SkillFilter) => {
    if (cat === "safe") return SAFE_SKILLS.has(name)
    if (cat === "specialized") return !SAFE_SKILLS.has(name)
    if (cat === "frontend") return CATEGORY_FRONTEND.has(name)
    if (cat === "backend") return CATEGORY_BACKEND.has(name)
    if (cat === "testing") return CATEGORY_TESTING.has(name)
    return true
  }
  const matchesQuery = (skill: SkillInfo) => {
    const needle = view.query.trim().toLowerCase()
    if (!needle) return true
    return [skill.name, skill.description ?? "", skillTitle(skill.name)].some((text) => text.toLowerCase().includes(needle))
  }
  const filteredSkills = createMemo(() =>
    skills().filter((skill) => inCategory(skill.name, filterCategory()) && matchesQuery(skill)),
  )

  const origin = (skill: SkillInfo): SkillOrigin => {
    if (skill.location.startsWith("<")) return "builtin"
    const dir = props.directory?.replace(/\\/g, "/").toLowerCase()
    if (dir && skill.location.replace(/\\/g, "/").toLowerCase().startsWith(`${dir}/`)) return "project"
    return "installed"
  }

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
  const selectedSkill = createMemo(() => skills().find((skill) => skill.name === selected()) ?? filteredSkills()[0] ?? skills()[0])

  const enabledCount = createMemo(() => skills().filter((s) => !disabled().has(s.name)).length)
  const filterOptions = createMemo<{ id: SkillFilter; label: string; count: number; icon: string }[]>(() => {
    const list = skills()
    const count = (pred: (name: string) => boolean) => list.filter((s) => pred(s.name)).length
    return [
      { id: "all", label: language.t("settings.skills.filter.all"), count: list.length, icon: "code-lines" },
      { id: "safe", label: language.t("settings.skills.filter.safe"), count: count((n) => SAFE_SKILLS.has(n)), icon: "shield" },
      { id: "specialized", label: language.t("settings.skills.filter.specialized"), count: count((n) => !SAFE_SKILLS.has(n)), icon: "brain" },
      { id: "frontend", label: language.t("settings.skills.filter.frontend"), count: count((n) => CATEGORY_FRONTEND.has(n)), icon: "folder" },
      { id: "backend", label: language.t("settings.skills.filter.backend"), count: count((n) => CATEGORY_BACKEND.has(n)), icon: "server" },
      { id: "testing", label: language.t("settings.skills.filter.testing"), count: count((n) => CATEGORY_TESTING.has(n)), icon: "checklist" },
    ]
  })
  const specializedEnabledCount = createMemo(() => skills().filter((s) => !SAFE_SKILLS.has(s.name) && !disabled().has(s.name)).length)

  // The project's config when one is open; the global one otherwise (without a directory the
  // project route wrote a tiancode.json into whatever folder the server was started from).
  const writeSkillsConfig = (skills: { disabled?: string[]; autoSelect?: boolean }) => {
    const p = params()
    return p
      ? serverSdk().client.config.update({ ...p, config: { skills } })
      : serverSdk().client.global.config.update({ config: { skills } })
  }

  const updateDisabledSkills = async (newDisabledList: string[]) => {
    await writeSkillsConfig({ disabled: newDisabledList.toSorted() })
    void refetch()
  }

  // Bulk changes say what happened, and say it when the save failed too.
  const runBulk = async (next: string[]) => {
    if (view.bulk) return
    setView("bulk", true)
    try {
      await updateDisabledSkills(next)
      setSkillOverrides({})
      showToast({ variant: "success", title: language.t("settings.skills.bulk.done", { enabled: skills().length - next.length }) })
    } catch {
      showToast({ variant: "error", title: language.t("settings.skills.toggle.failed") })
    } finally {
      setView("bulk", false)
    }
  }

  const enableAll = () => runBulk([])

  const disableAll = () => runBulk(skills().map((s) => s.name))

  const enableSafeOnly = () => runBulk(skills().filter((s) => !SAFE_SKILLS.has(s.name)).map((s) => s.name))

  const toggleSpecialized = () => {
    const specializedNames = skills().filter((s) => !SAFE_SKILLS.has(s.name)).map((s) => s.name)
    const allSpecializedDisabled = specializedNames.every((name) => disabled().has(name))
    return runBulk(
      allSpecializedDisabled
        ? Array.from(disabled()).filter((name) => !specializedNames.includes(name))
        : Array.from(new Set([...disabled(), ...specializedNames])),
    )
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
    // The switch moves at once; the toast waits for the save, and a failed save puts it back.
    setSkillOverrides((prev) => ({ ...prev, [name]: enabled }))
    const nextDisabled = new Set(disabled())
    if (enabled) nextDisabled.delete(name)
    else nextDisabled.add(name)

    void updateDisabledSkills(Array.from(nextDisabled))
      .then(() => {
        // Saved: the server's list is the truth again, so a later bulk change is not undone by it.
        setSkillOverrides((prev) => {
          const next = { ...prev }
          delete next[name]
          return next
        })
        showToast({
          variant: "success",
          title: language.t(enabled ? "settings.skills.toggle.enabled" : "settings.skills.toggle.disabled", { name }),
        })
      })
      .catch(() => {
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
      await writeSkillsConfig({ autoSelect: enabled })
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.skills.toggle.failed") })
    }
  }

  const searchGoogle = () => {
    platform.openExternal(
      `https://www.google.com/search?q=${encodeURIComponent("tiancode skills SKILL.md")}`,
    )
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

  const skillBadges = (skill: SkillInfo) => (
    <>
      <span
        class={`settings-v2-skill-badge ${SAFE_SKILLS.has(skill.name) ? "settings-v2-skill-badge--safe" : "settings-v2-skill-badge--specialized"}`}
      >
        {language.t(SAFE_SKILLS.has(skill.name) ? "settings.skills.badge.safe" : "settings.skills.badge.specialized")}
      </span>
      <Show when={origin(skill) !== "builtin"}>
        <span class="settings-v2-sk-origin">{language.t(`settings.skills.origin.${origin(skill)}`)}</span>
      </Show>
      <Show when={skill.disableModelInvocation}>
        <span class="settings-v2-sk-origin">{language.t("settings.skills.manualOnly")}</span>
      </Show>
    </>
  )

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-sk-header">
        <div class="settings-v2-sk-heading">
          <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
          <Show when={skills().length > 0}>
            <span class="settings-v2-chip shrink-0" data-tone="accent">
              {language.t("settings.skills.stats.active", { enabled: enabledCount(), total: skills().length })}
            </span>
          </Show>
        </div>
        <SegmentedControlV2
          class="settings-v2-sk-sections"
          value={section()}
          onChange={(value) => {
            if (value === "installed" || value === "import") setSection(value)
          }}
          aria-label={language.t("settings.sections.label")}
        >
          <SegmentedControlItemV2 value="installed">{language.t("settings.skills.section.installed")}</SegmentedControlItemV2>
          <SegmentedControlItemV2 value="import">{language.t("settings.skills.section.import")}</SegmentedControlItemV2>
        </SegmentedControlV2>
      </div>

      <div class="settings-v2-tab-body settings-v2-skills" data-section={section()}>
        <Show when={message() === "success" || message() === "error"}>
          <div class="settings-v2-skills-message" data-variant={message()}>
            {message() === "success"
              ? language.t("settings.skills.import.success")
              : language.t("settings.skills.import.failed")}
          </div>
        </Show>

        <Show when={section() === "installed"}>
          <div class="settings-v2-sk-toolbar">
            <TextInputV2
              class="settings-v2-sk-search"
              type="search"
              appearance="base"
              value={view.query}
              onInput={(event) => setView("query", event.currentTarget.value)}
              placeholder={language.t("settings.skills.search.placeholder")}
              aria-label={language.t("settings.skills.search.placeholder")}
              spellcheck={false}
              autocomplete="off"
            />
            <SelectV2
              appearance="base"
              class="settings-v2-sk-category"
              aria-label={language.t("settings.skills.filter.label")}
              options={filterOptions()}
              current={filterOptions().find((option) => option.id === filterCategory())}
              value={(option) => option.id}
              label={(option) => `${option.label} · ${option.count}`}
              onSelect={(option) => option && setView("filter", option.id)}
            >
              {(option) => (
                <span class="settings-v2-sk-option">
                  <SettingsItemIconV2 icon={option.icon} fallback="checklist" />
                  <span class="settings-v2-sk-option-label">{option.label}</span>
                  <span class="settings-v2-sk-filter-count">{option.count}</span>
                </span>
              )}
            </SelectV2>
            <TooltipV2 value={language.t("settings.skills.autoSelect.description")} placement="bottom">
              <Switch
                class="settings-v2-sk-auto"
                checked={autoSelect()}
                onChange={(checked) => void toggleAutoSelect(checked)}
              >
                {language.t("settings.skills.autoSelect.short")}
              </Switch>
            </TooltipV2>
            <MenuV2 placement="bottom-end">
              <MenuV2.Trigger
                as="button"
                type="button"
                class="settings-v2-sk-actions"
                disabled={view.bulk}
                aria-label={language.t("settings.skills.bulk.title")}
              >
                <span>{language.t("settings.skills.actions.menu")}</span>
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </MenuV2.Trigger>
              <MenuV2.Portal>
                <MenuV2.Content>
                  <MenuV2.Group>
                    <MenuV2.GroupLabel>{language.t("settings.skills.bulk.title")}</MenuV2.GroupLabel>
                    <MenuV2.Item onSelect={() => void enableAll()}>
                      {language.t("settings.skills.actions.enableAll")}
                    </MenuV2.Item>
                    <MenuV2.Item onSelect={() => void enableSafeOnly()}>
                      {language.t("settings.skills.actions.safeOnly")}
                    </MenuV2.Item>
                    <MenuV2.Item onSelect={() => void toggleSpecialized()}>
                      {language.t(
                        specializedEnabledCount() > 0
                          ? "settings.skills.actions.specialized.disable"
                          : "settings.skills.actions.specialized.enable",
                      )}
                    </MenuV2.Item>
                  </MenuV2.Group>
                  <MenuV2.Separator />
                  <MenuV2.Item onSelect={() => void disableAll()}>
                    {language.t("settings.skills.actions.disableAll")}
                  </MenuV2.Item>
                </MenuV2.Content>
              </MenuV2.Portal>
            </MenuV2>
          </div>

          <div class="settings-v2-sk-layout" data-viewing={view.viewing ? "" : undefined}>
            <div class="settings-v2-sk-list">
              <Show
                when={filteredSkills().length > 0}
                fallback={
                  <Show
                    when={catalogueLoading()}
                    fallback={
                      <div class="settings-v2-skills-status">
                        {language.t(skills().length > 0 ? "settings.skills.empty.filtered" : "settings.skills.empty")}
                      </div>
                    }
                  >
                    <For each={SKELETON_ROWS}>
                      {() => (
                        <div class="settings-v2-sk-row settings-v2-sk-row--skeleton" aria-hidden="true">
                          <div class="settings-v2-skeleton settings-v2-skeleton--icon" />
                          <div class="settings-v2-sk-row-copy">
                            <div class="settings-v2-skeleton settings-v2-skeleton--line settings-v2-skeleton--name" />
                            <div class="settings-v2-skeleton settings-v2-skeleton--line" />
                          </div>
                        </div>
                      )}
                    </For>
                    <div class="settings-v2-skills-status" role="status" aria-live="polite">
                      {language.t("settings.skills.loading")}
                    </div>
                  </Show>
                }
              >
                <For each={filteredSkills()}>
                  {(skill) => (
                    <div
                      class="settings-v2-sk-row"
                      data-selected={selectedSkill()?.name === skill.name ? "" : undefined}
                      data-disabled={disabled().has(skill.name) ? "" : undefined}
                    >
                      <button
                        type="button"
                        class="settings-v2-sk-row-main"
                        aria-current={selectedSkill()?.name === skill.name ? "true" : undefined}
                        onClick={() => setSelected(skill.name)}
                      >
                        <SettingsItemIconV2 icon={skill.icon} fallback={fallbackGlyph(skill.name)} color={hashColor(skill.name)} />
                        <span class="settings-v2-sk-row-copy">
                          <span class="settings-v2-sk-row-title">{skillTitle(skill.name)}</span>
                          <span class="settings-v2-sk-row-slug">{skill.name}</span>
                          <span class="settings-v2-sk-row-description">{skill.description ?? ""}</span>
                          <span class="settings-v2-sk-row-badges">{skillBadges(skill)}</span>
                        </span>
                      </button>
                      <Switch
                        class="settings-v2-sk-row-switch"
                        checked={!disabled().has(skill.name)}
                        onChange={(checked) => void toggleSkill(skill.name, checked)}
                        hideLabel
                      >
                        {language.t("settings.skills.switch.label", { name: skillTitle(skill.name) })}
                      </Switch>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            <Show when={selectedSkill()} fallback={<div class="settings-v2-sk-detail settings-v2-sk-detail--empty" />}>
              {(skill) => (
                <div class="settings-v2-sk-detail">
                  <ButtonV2
                    type="button"
                    variant="ghost"
                    size="small"
                    class="settings-v2-sk-back"
                    onClick={() => setView("viewing", false)}
                  >
                    {language.t("settings.skills.back")}
                  </ButtonV2>
                  <div class="settings-v2-sk-detail-header">
                    <SettingsItemIconV2 icon={skill().icon} fallback={fallbackGlyph(skill().name)} color={hashColor(skill().name)} />
                    <div class="settings-v2-sk-detail-identity">
                      <h3 class="settings-v2-sk-detail-title">{skillTitle(skill().name)}</h3>
                      <span class="settings-v2-sk-row-slug">{skill().name}</span>
                    </div>
                    <Switch
                      checked={!disabled().has(skill().name)}
                      onChange={(checked) => void toggleSkill(skill().name, checked)}
                      hideLabel
                    >
                      {language.t("settings.skills.switch.label", { name: skillTitle(skill().name) })}
                    </Switch>
                  </div>
                  <p class="settings-v2-sk-detail-description">{skill().description ?? ""}</p>
                  <ul class="settings-v2-sk-facts">
                    <li
                      class="settings-v2-sk-fact"
                      data-tone={SAFE_SKILLS.has(skill().name) ? "safe" : "specialized"}
                      title={language.t("settings.skills.detail.type")}
                    >
                      {language.t(
                        SAFE_SKILLS.has(skill().name) ? "settings.skills.badge.safe" : "settings.skills.badge.specialized",
                      )}
                    </li>
                    <li class="settings-v2-sk-fact" title={language.t("settings.skills.detail.origin")}>
                      {language.t(`settings.skills.origin.${origin(skill())}`)}
                    </li>
                    <li class="settings-v2-sk-fact" title={language.t("settings.skills.detail.invocation")}>
                      {language.t(
                        skill().disableModelInvocation
                          ? "settings.skills.detail.invocation.manual"
                          : "settings.skills.detail.invocation.auto",
                      )}
                    </li>
                  </ul>
                  <p class="settings-v2-sk-note" data-tone={SAFE_SKILLS.has(skill().name) ? "safe" : "specialized"}>
                    {SAFE_SKILLS.has(skill().name)
                      ? language.t("settings.skills.callout.safe")
                      : language.t("settings.skills.callout.specialized")}
                  </p>
                  <Show when={origin(skill()) !== "builtin"}>
                    <div class="settings-v2-sk-location" title={language.t("settings.skills.detail.location")}>
                      <span title={skill().location}>{skill().location}</span>
                      <Show when={platform.revealPath}>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          size="small"
                          onClick={() => void platform.revealPath?.(skill().location)}
                        >
                          {language.t("settings.skills.detail.reveal")}
                        </ButtonV2>
                      </Show>
                    </div>
                  </Show>
                  <div class="settings-v2-skills-detail-body settings-v2-sk-detail-body">
                    <Markdown
                      text={localizeSkillHeadings(skill().content, isSpanish()) || (skill().description ?? "")}
                      class="text-12-regular"
                    />
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Show>

        <Show when={section() === "import"}>
          <p class="settings-v2-tab-description settings-v2-sk-import-intro">{language.t("settings.skills.description")}</p>
          <div class="settings-v2-section">
            <SettingsListV2>
              <div class="settings-v2-skills-import-row">
                <div class="settings-v2-skills-import-copy">
                  <div class="settings-v2-skills-item-name">{language.t("settings.skills.import.folder.title")}</div>
                  <div class="settings-v2-skills-item-description">
                    {language.t("settings.skills.import.folder.description")}
                  </div>
                </div>
                <ButtonV2 type="button" variant="outline" size="small" disabled={importing()} onClick={pickFolder}>
                  {importing() ? language.t("settings.skills.importing") : language.t("settings.skills.import.folder.button")}
                </ButtonV2>
              </div>
              <div class="settings-v2-skills-import-row">
                <div class="settings-v2-skills-import-copy">
                  <div class="settings-v2-skills-item-name">{language.t("settings.skills.import.github.title")}</div>
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
                    {importing() ? language.t("settings.skills.importing") : language.t("settings.skills.import.github.button")}
                  </ButtonV2>
                </div>
              </div>
              <div class="settings-v2-skills-import-row">
                <div class="settings-v2-skills-import-copy">
                  <div class="settings-v2-skills-item-name">{language.t("settings.skills.import.url.title")}</div>
                  <div class="settings-v2-skills-item-description">{language.t("settings.skills.import.url.description")}</div>
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
                    {importing() ? language.t("settings.skills.importing") : language.t("settings.skills.import.url.button")}
                  </ButtonV2>
                </div>
              </div>
            </SettingsListV2>
            <div class="settings-v2-sk-discover">
              <span>{language.t("settings.skills.discover.description")}</span>
              <ButtonV2 type="button" variant="ghost" size="small" onClick={searchGoogle}>
                {language.t("settings.skills.search.google")}
              </ButtonV2>
            </div>
          </div>
        </Show>
      </div>
    </>
  )
}
