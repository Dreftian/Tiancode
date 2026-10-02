import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@tiancode-ai/ui/v2/dialog-v2"
import { DividerV2 } from "@tiancode-ai/ui/v2/divider-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import type { McpLocalConfig, McpRemoteConfig } from "@tiancode-ai/sdk/v2/client"
import { Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { EMPTY_MCP_FORM, type McpForm, mcpConfigFromForm, mcpFormFromConfig, parseMcpConfig } from "./mcp-config"

type McpDefinition = McpLocalConfig | McpRemoteConfig

// GET /config hides saved secrets behind this marker; saving it back keeps the stored value.
const REDACTED = "<redacted>"

/**
 * Add or edit an MCP server. The fields cover what the config supports (command, folder,
 * environment, URL, headers, OAuth, timeout); "Edit as JSON" switches to the raw definition for
 * anything else, and switching back reads the JSON into the fields.
 */
export function DialogMcpServer(props: {
  name?: string
  config?: McpDefinition
  editing: boolean
  onSave: (name: string, config: McpDefinition, activate: boolean) => Promise<void>
  onClose: () => void
}) {
  const language = useLanguage()
  const [state, setState] = createStore({
    name: props.name ?? "",
    form: props.config ? mcpFormFromConfig(props.config) : { ...EMPTY_MCP_FORM },
    json: false,
    text: "",
    // A new server is switched on when saved: the user just asked for it. An edit keeps its state.
    activate: !props.editing,
    error: "",
    saving: false,
  })

  const field = <K extends keyof McpForm>(key: K, value: McpForm[K]) => {
    setState("form", key, value)
    setState("error", "")
  }

  const build = () =>
    state.json ? parseMcpConfig(JSON.parse(state.text)) : mcpConfigFromForm(state.form, props.config)

  const toggleJson = () => {
    if (!state.json) {
      // Half-filled fields still give a useful starting point for the JSON.
      const config = (() => {
        try {
          return build()
        } catch {
          return props.config
        }
      })()
      setState({ json: true, text: JSON.stringify(config ?? { type: state.form.type }, null, 2), error: "" })
      return
    }
    try {
      setState({ form: mcpFormFromConfig(parseMcpConfig(JSON.parse(state.text))), json: false, error: "" })
    } catch {
      setState("error", language.t("settings.mcpPlugins.form.invalid"))
    }
  }

  const save = async (event: Event) => {
    event.preventDefault()
    const name = state.name.trim()
    if (!name) {
      setState("error", language.t("settings.mcpPlugins.toast.formIncomplete"))
      return
    }
    const config = (() => {
      try {
        return build()
      } catch {
        return undefined
      }
    })()
    if (!config) {
      setState("error", language.t("settings.mcpPlugins.form.invalid"))
      return
    }
    setState({ saving: true, error: "" })
    await props
      .onSave(name, config, state.activate)
      .then(() => props.onClose())
      .catch(() => setState("error", language.t("settings.mcpPlugins.toast.saveFailed")))
      .finally(() => setState("saving", false))
  }

  return (
    <Dialog fit>
      <form class="contents" onSubmit={(event) => void save(event)}>
        <DialogHeader>
          <DialogTitle>
            {language.t(props.editing ? "settings.mcpServers.edit.title" : "settings.mcpPlugins.add.server")}
          </DialogTitle>
        </DialogHeader>
        <DividerV2 />
        <DialogBody class="settings-v2-mp-dialog">
          <FormField label={language.t("settings.mcpPlugins.form.name")}>
            <TextInputV2
              autofocus={!props.editing}
              appearance="base"
              disabled={props.editing}
              value={state.name}
              placeholder={language.t("settings.mcpPlugins.form.name.placeholder")}
              onInput={(event) => setState({ name: event.currentTarget.value, error: "" })}
              spellcheck={false}
            />
          </FormField>

          <Show
            when={!state.json}
            fallback={
              <FormField label={language.t("settings.marketplace.config")} hint={language.t("settings.mcpPlugins.form.json.hint")}>
                <TextareaV2
                  class="settings-v2-mp-json"
                  rows={12}
                  value={state.text}
                  spellcheck={false}
                  onInput={(event) => setState({ text: event.currentTarget.value, error: "" })}
                />
              </FormField>
            }
          >
            <FormField group label={language.t("settings.mcpServers.field.type")}>
              <SegmentedControlV2
                value={state.form.type}
                onChange={(value) => {
                  if (value === "local" || value === "remote") field("type", value)
                }}
              >
                <SegmentedControlItemV2 value="local">{language.t("settings.mcpServers.type.local")}</SegmentedControlItemV2>
                <SegmentedControlItemV2 value="remote">{language.t("settings.mcpServers.type.remote")}</SegmentedControlItemV2>
              </SegmentedControlV2>
            </FormField>

            <Show
              when={state.form.type === "local"}
              fallback={
                <>
                  <FormField label={language.t("settings.mcpServers.field.url")}>
                    <TextInputV2
                      appearance="base"
                      type="url"
                      value={state.form.url}
                      placeholder={language.t("settings.mcpServers.field.url.placeholder")}
                      onInput={(event) => field("url", event.currentTarget.value)}
                      spellcheck={false}
                    />
                  </FormField>
                  <FormField
                    label={language.t("settings.mcpServers.field.headers")}
                    hint={state.form.headers.includes(REDACTED) ? language.t("settings.mcpPlugins.form.redacted") : undefined}
                  >
                    <TextareaV2
                      class="settings-v2-mp-mono"
                      rows={3}
                      value={state.form.headers}
                      placeholder="Authorization=Bearer …"
                      onInput={(event) => field("headers", event.currentTarget.value)}
                      spellcheck={false}
                    />
                  </FormField>
                  <div class="settings-v2-mp-switch-row">
                    <span class="settings-v2-mp-field-copy">
                      <span class="settings-v2-mp-field-label">{language.t("settings.mcpPlugins.form.oauth")}</span>
                      <span class="settings-v2-mp-field-hint">{language.t("settings.mcpPlugins.form.oauth.description")}</span>
                    </span>
                    <Switch checked={state.form.oauth} onChange={(checked) => field("oauth", checked)} hideLabel>
                      {language.t("settings.mcpPlugins.form.oauth")}
                    </Switch>
                  </div>
                  <Show when={state.form.oauth}>
                    <div class="settings-v2-mp-pair">
                      <FormField label={language.t("settings.mcpPlugins.form.oauth.clientId")}>
                        <TextInputV2
                          appearance="base"
                          value={state.form.clientId}
                          onInput={(event) => field("clientId", event.currentTarget.value)}
                          spellcheck={false}
                        />
                      </FormField>
                      <FormField label={language.t("settings.mcpPlugins.form.oauth.scope")}>
                        <TextInputV2
                          appearance="base"
                          value={state.form.scope}
                          onInput={(event) => field("scope", event.currentTarget.value)}
                          spellcheck={false}
                        />
                      </FormField>
                    </div>
                  </Show>
                </>
              }
            >
              <FormField
                label={language.t("settings.mcpServers.field.command")}
                hint={language.t("settings.mcpServers.field.command.hint")}
              >
                <TextInputV2
                  appearance="base"
                  class="settings-v2-mp-mono"
                  value={state.form.command}
                  placeholder={language.t("settings.mcpServers.field.command.placeholder")}
                  onInput={(event) => field("command", event.currentTarget.value)}
                  spellcheck={false}
                />
              </FormField>
              <FormField
                label={language.t("settings.mcpServers.field.environment")}
                hint={state.form.environment.includes(REDACTED) ? language.t("settings.mcpPlugins.form.redacted") : undefined}
              >
                <TextareaV2
                  class="settings-v2-mp-mono"
                  rows={3}
                  value={state.form.environment}
                  placeholder={language.t("settings.mcpServers.field.environment.placeholder")}
                  onInput={(event) => field("environment", event.currentTarget.value)}
                  spellcheck={false}
                />
              </FormField>
              <FormField label={language.t("settings.mcpServers.field.cwd")}>
                <TextInputV2
                  appearance="base"
                  class="settings-v2-mp-mono"
                  value={state.form.cwd}
                  onInput={(event) => field("cwd", event.currentTarget.value)}
                  spellcheck={false}
                />
              </FormField>
            </Show>

            <FormField label={language.t("settings.mcpServers.field.timeout")}>
              <TextInputV2
                appearance="base"
                inputMode="decimal"
                class="settings-v2-mp-short"
                value={state.form.timeout}
                placeholder="5"
                onInput={(event) => field("timeout", event.currentTarget.value)}
              />
            </FormField>
          </Show>

          <Show when={!props.editing}>
            <div class="settings-v2-mp-switch-row">
              <span class="settings-v2-mp-field-copy">
                <span class="settings-v2-mp-field-label">{language.t("settings.mcpPlugins.form.activate")}</span>
                <span class="settings-v2-mp-field-hint">{language.t("settings.mcpPlugins.form.activate.description")}</span>
              </span>
              <Switch checked={state.activate} onChange={(checked) => setState("activate", checked)} hideLabel>
                {language.t("settings.mcpPlugins.form.activate")}
              </Switch>
            </div>
          </Show>

          <Show when={state.error}>
            <p class="settings-v2-mp-error" role="alert">
              {state.error}
            </p>
          </Show>
        </DialogBody>
        <DialogFooter>
          <ButtonV2 type="button" variant="ghost" class="mr-auto" onClick={toggleJson}>
            {language.t(state.json ? "settings.mcpPlugins.form.fields" : "settings.mcpPlugins.form.json")}
          </ButtonV2>
          <ButtonV2 type="button" variant="outline" onClick={props.onClose}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 type="submit" variant="contrast" disabled={state.saving}>
            {language.t(state.saving ? "common.saving" : "common.save")}
          </ButtonV2>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

/** Add a plugin by npm package or local file; the spec is the whole entry. */
export function DialogMcpPlugin(props: { onSave: (spec: string) => Promise<void>; onClose: () => void }) {
  const language = useLanguage()
  const [state, setState] = createStore({ spec: "", error: "", saving: false })

  const save = async (event: Event) => {
    event.preventDefault()
    const spec = state.spec.trim()
    if (!spec) {
      setState("error", language.t("settings.mcpPlugins.toast.formIncomplete"))
      return
    }
    setState({ saving: true, error: "" })
    await props
      .onSave(spec)
      .then(() => props.onClose())
      .catch(() => setState("error", language.t("settings.mcpPlugins.toast.saveFailed")))
      .finally(() => setState("saving", false))
  }

  return (
    <Dialog fit>
      <form class="contents" onSubmit={(event) => void save(event)}>
        <DialogHeader>
          <DialogTitle>{language.t("settings.mcpPlugins.add.plugin")}</DialogTitle>
        </DialogHeader>
        <DividerV2 />
        <DialogBody class="settings-v2-mp-dialog">
          <FormField
            label={language.t("settings.mcpPlugins.form.command.plugin")}
            hint={language.t("settings.mcpPlugins.form.plugin.hint")}
          >
            <TextInputV2
              autofocus
              appearance="base"
              class="settings-v2-mp-mono"
              value={state.spec}
              placeholder={language.t("settings.mcpPlugins.form.command.plugin.placeholder")}
              onInput={(event) => setState({ spec: event.currentTarget.value, error: "" })}
              spellcheck={false}
            />
          </FormField>
          <Show when={state.error}>
            <p class="settings-v2-mp-error" role="alert">
              {state.error}
            </p>
          </Show>
        </DialogBody>
        <DialogFooter>
          <ButtonV2 type="button" variant="outline" onClick={props.onClose}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 type="submit" variant="contrast" disabled={state.saving}>
            {language.t(state.saving ? "common.saving" : "common.save")}
          </ButtonV2>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

// A label for one input; a group (role="group") for controls with several buttons, where a
// label would forward clicks on its text to the first button.
function FormField(props: { label: string; hint?: string; group?: boolean; children: JSX.Element }) {
  const content = () => (
    <>
      <span class="settings-v2-mp-field-label">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="settings-v2-mp-field-hint">{props.hint}</span>
      </Show>
    </>
  )
  return (
    <Show when={props.group} fallback={<label class="settings-v2-mp-field">{content()}</label>}>
      <div class="settings-v2-mp-field" role="group" aria-label={props.label}>
        {content()}
      </div>
    </Show>
  )
}
