import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { type Component, createResource, For, Show, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

export const SettingsSkillsV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const [url, setUrl] = createSignal("")
  const [importing, setImporting] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [skills, { refetch }] = createResource(
    () => serverSdk().client.app.skills(params()),
    (request) => request.then((x) => x.data),
    { initialValue: [] },
  )

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

  const searchGoogle = () => {
    platform.openExternal(
      `https://www.google.com/search?q=${encodeURIComponent("tiancode skills SKILL.md")}`,
    )
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

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.skills.section.installed")}</h3>
          <Show
            when={(skills() ?? []).length > 0}
            fallback={<div class="settings-v2-skills-status">{language.t("settings.skills.empty")}</div>}
          >
            <SettingsListV2>
              <For each={skills()}>
                {(skill) => (
                  <SettingsRowV2 title={skill.name} description={skill.description ?? ""}>
                    <span class="settings-v2-skills-location">{skill.location}</span>
                  </SettingsRowV2>
                )}
              </For>
            </SettingsListV2>
          </Show>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.skills.section.import")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.skills.import.folder.title")}
              description={language.t("settings.skills.import.folder.description")}
            >
              <ButtonV2 type="button" variant="outline" size="small" disabled={importing()} onClick={pickFolder}>
                {importing() ? language.t("settings.skills.importing") : language.t("settings.skills.import.folder.button")}
              </ButtonV2>
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.skills.import.url.title")}
              description={language.t("settings.skills.import.url.description")}
            >
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
                <ButtonV2 type="button" variant="outline" size="small" disabled={importing() || !url()} onClick={downloadFromUrl}>
                  {importing() ? language.t("settings.skills.importing") : language.t("settings.skills.import.url.button")}
                </ButtonV2>
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
