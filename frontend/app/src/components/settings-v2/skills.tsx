import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Markdown } from "@tiancode-ai/session-ui/markdown"
import { type Component, createResource, For, Show, createSignal, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

const PAGE_SIZE = 8

export const SettingsSkillsV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const [url, setUrl] = createSignal("")
  const [importing, setImporting] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)
  const [selected, setSelected] = createSignal<string | undefined>(undefined)
  const [page, setPage] = createSignal(0)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      const [skills, config] = await Promise.all([
        serverSdk().client.app.skills(params()),
        serverSdk().client.config.get(params()),
      ])
      return { skills: skills.data ?? [], disabled: new Set(config.data?.skills?.disabled ?? []) }
    },
    { initialValue: { skills: [], disabled: new Set<string>() } },
  )

  const skills = createMemo(() => data().skills)
  const disabled = createMemo(() => data().disabled)
  const pages = createMemo(() => Math.max(1, Math.ceil(skills().length / PAGE_SIZE)))
  const pageSkills = createMemo(() => skills().slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))
  const selectedSkill = createMemo(() => skills().find((skill) => skill.name === selected()))

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
      await runImport({ name: root, files: entries.map(({ path, content }) => ({ path, content })) })
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

  const toggleSkill = async (name: string, enabled: boolean) => {
    setMessage(undefined)
    try {
      await serverSdk().client.app.skills2.toggle({ ...params(), name, enabled })
      void refetch()
    } catch {
      setMessage("error")
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

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
          <ButtonV2 type="button" variant="ghost" size="small" onClick={searchGoogle}>
            {language.t("settings.skills.search.google")}
          </ButtonV2>
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
              <Show
                when={skills().length > 0}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.skills.empty")}</div>}
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
                        <div class="settings-v2-skills-item-copy">
                          <div class="settings-v2-skills-item-name">{skill.name}</div>
                          <div class="settings-v2-skills-item-description">{skill.description ?? ""}</div>
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
                  <div class="settings-v2-skills-item-copy">
                    <div class="settings-v2-skills-item-name">{skill().name}</div>
                    <div class="settings-v2-skills-item-description">{skill().description ?? ""}</div>
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
                <div class="settings-v2-skills-detail-body">
                  <Markdown text={skill().content} class="text-12-regular" />
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
