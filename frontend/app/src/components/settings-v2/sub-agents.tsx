import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import { type Component, createResource, For, Show, createSignal, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const ModeOptions: { id: "subagent" | "primary"; label: string }[] = [
  { id: "subagent", label: "settings.subAgents.create.mode.subagent" },
  { id: "primary", label: "settings.subAgents.create.mode.primary" },
]

// Native agents ship with English descriptions from the server (frontmatter);
// translate the known built-in names so the list reads in the UI language.
const NativeAgentDescriptionKeys: Record<string, string> = {
  build: "settings.subAgents.native.build",
  plan: "settings.subAgents.native.plan",
  general: "settings.subAgents.native.general",
  explore: "settings.subAgents.native.explore",
  compaction: "settings.subAgents.native.compaction",
  title: "settings.subAgents.native.title",
  summary: "settings.subAgents.native.summary",
}

export const SettingsSubAgentsV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [model, setModel] = createSignal("")
  const [color, setColor] = createSignal("")
  const [mode, setMode] = createSignal<"subagent" | "primary">("subagent")
  const [creating, setCreating] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [agents, { refetch }] = createResource(
    () => serverSdk().client.app.agents(params()),
    (request) => request.then((x) => x.data),
    { initialValue: [] },
  )

  const agentList = createMemo(() => agents() ?? [])

  const nativeDescription = (agent: { name: string; description?: string }) => {
    const key = NativeAgentDescriptionKeys[agent.name]
    if (key) return language.t(key)
    return agent.description ?? ""
  }

  const submit = async () => {
    if (!name().trim()) return
    setCreating(true)
    setMessage(undefined)
    try {
      await serverSdk().client.app.agents2.create({
        ...params(),
        name: name().trim(),
        description: description().trim(),
        mode: mode(),
        ...(model().trim() ? { model: model().trim() } : {}),
        ...(color().trim() ? { color: color().trim() } : {}),
      })
      setName("")
      setDescription("")
      setModel("")
      setColor("")
      setMessage("success")
      void refetch()
    } catch {
      setMessage("error")
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">{language.t("settings.subAgents.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.subAgents.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-sub-agents">
        <Show when={message() === "success" || message() === "error"}>
          <div class="settings-v2-skills-message" data-variant={message()}>
            {message() === "success"
              ? language.t("settings.subAgents.create.success")
              : language.t("settings.subAgents.create.failed")}
          </div>
        </Show>

        <div class="settings-v2-sub-agents-layout">
          <div class="settings-v2-sub-agents-list">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.subAgents.section.agents")}</h3>
              <Show
                when={agentList().length > 0}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.subAgents.empty")}</div>}
              >
                <SettingsListV2>
                  <For each={agentList()}>
                    {(agent) => (
                      <div class="settings-v2-sub-agents-item">
                        <div class="settings-v2-sub-agents-item-copy">
                          <div class="settings-v2-sub-agents-item-name">{agent.name}</div>
                          <div class="settings-v2-sub-agents-item-description">{nativeDescription(agent)}</div>
                        </div>
                        <span class="settings-v2-sub-agents-mode" data-mode={agent.mode}>
                          {agent.mode === "subagent"
                            ? language.t("settings.subAgents.create.mode.subagent")
                            : language.t("settings.subAgents.create.mode.primary")}
                        </span>
                      </div>
                    )}
                  </For>
                </SettingsListV2>
              </Show>
            </div>
          </div>

          <div class="settings-v2-sub-agents-form">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.subAgents.section.create")}</h3>
              <SettingsListV2>
                <SettingsRowV2 title={language.t("settings.subAgents.create.name")} description="">
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={name()}
                    onInput={(event) => setName(event.currentTarget.value)}
                    placeholder={language.t("settings.subAgents.create.name.placeholder")}
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={language.t("settings.subAgents.create.name")}
                  />
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.subAgents.create.description")} description="">
                  <TextareaV2
                    value={description()}
                    onInput={(event) => setDescription(event.currentTarget.value)}
                    placeholder={language.t("settings.subAgents.create.description.placeholder")}
                    rows={2}
                    aria-label={language.t("settings.subAgents.create.description")}
                  />
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.subAgents.create.mode")} description="">
                  <SelectV2
                    appearance="inline"
                    data-action="settings-sub-agent-mode"
                    options={ModeOptions}
                    current={ModeOptions.find((option) => option.id === mode())}
                    placement="bottom-end"
                    gutter={6}
                    value={(option) => option.id}
                    label={(option) => language.t(option.label)}
                    onSelect={(option) => {
                      if (option) setMode(option.id)
                    }}
                  />
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.subAgents.create.model")} description="">
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={model()}
                    onInput={(event) => setModel(event.currentTarget.value)}
                    placeholder={language.t("settings.subAgents.create.model.placeholder")}
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={language.t("settings.subAgents.create.model")}
                  />
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.subAgents.create.color")} description="">
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={color()}
                    onInput={(event) => setColor(event.currentTarget.value)}
                    placeholder={language.t("settings.subAgents.create.color.placeholder")}
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={language.t("settings.subAgents.create.color")}
                  />
                </SettingsRowV2>
              </SettingsListV2>
              <div class="settings-v2-sub-agents-actions">
                <ButtonV2
                  type="button"
                  variant="contrast"
                  size="small"
                  disabled={creating() || !name().trim()}
                  onClick={submit}
                >
                  {creating()
                    ? language.t("settings.subAgents.creating")
                    : language.t("settings.subAgents.create.button")}
                </ButtonV2>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
