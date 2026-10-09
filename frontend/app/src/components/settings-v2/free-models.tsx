import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { Tag } from "@tiancode-ai/ui/v2/badge-v2"
import { ProviderIcon } from "@tiancode-ai/ui/provider-icon"
import type { Provider } from "@tiancode-ai/sdk/v2"
import { createEffect, createMemo, createSignal, For, Show, type Accessor, type Component } from "solid-js"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useProviders } from "@/hooks/use-providers"
import { showToast } from "@/utils/toast"
import "./free-models.css"

/** Written by the welcome wizard, whose window has no server sync; the main window applies it. */
export const PENDING_FREE_MODELS_KEY = "tiancode.first_launch.free_models"

/** OpenCode Zen's free models today. The server refreshes the catalog every hour, so the list follows Zen. */
export function freeZenModels(provider: Provider | undefined) {
  return Object.values(provider?.models ?? {})
    .filter((model) => model.cost.input === 0 && model.cost.output === 0 && model.status !== "deprecated")
    .map((model) => model.name)
    .toSorted((a, b) => a.localeCompare(b))
}

/** The `free_models` switch, shared by Ajustes › Proveedores and Ajustes › Modelos. */
function useFreeModelsSwitch() {
  const language = useLanguage()
  const serverSync = useServerSync()
  const [saving, setSaving] = createSignal(false)
  const enabled = () => serverSync().data.config.free_models === true

  const toggle = async (value: boolean) => {
    if (saving()) return
    setSaving(true)
    try {
      await serverSync().updateConfig({ free_models: value })
      await serverSync().refreshProviders()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return { enabled, saving, toggle }
}

/** Ajustes › Proveedores › Modelos gratuitos: the `free_models` switch and what it offers right now. */
export const SettingsFreeModelsV2: Component<{ directory: Accessor<string | undefined> }> = (props) => {
  const language = useLanguage()
  const providers = useProviders(props.directory)
  const free = useFreeModelsSwitch()
  const models = createMemo(() => freeZenModels(providers.all().get("opencode")))

  return (
    <div class="settings-v2-section" data-component="free-models-section">
      <h3 class="settings-v2-section-title">{language.t("settings.providers.free.title")}</h3>
      <div class="settings-v2-free-models">
        <div class="settings-v2-provider-row">
          <div class="settings-v2-provider-lead">
            <ProviderIcon id="opencode" width={16} height={16} class="settings-v2-provider-icon shrink-0" />
            <div class="settings-v2-provider-copy">
              <div class="settings-v2-provider-main">
                <span class="settings-v2-provider-name">{language.t("settings.providers.free.name")}</span>
                <Tag>{language.t("model.tag.free")}</Tag>
              </div>
              <p class="settings-v2-provider-description">{language.t("settings.providers.free.description")}</p>
            </div>
          </div>
          <Switch
            hideLabel
            checked={free.enabled()}
            disabled={free.saving()}
            onChange={(value) => void free.toggle(value)}
            data-action="settings-free-models"
          >
            {language.t("settings.providers.free.title")}
          </Switch>
        </div>
        <Show when={free.enabled() && models().length > 0}>
          <div class="settings-v2-free-models-list" aria-label={language.t("settings.providers.free.available")}>
            <For each={models()}>{(name) => <span class="settings-v2-free-models-chip">{name}</span>}</For>
          </div>
        </Show>
        <p class="settings-v2-free-models-note">{language.t("settings.providers.free.note")}</p>
      </div>
    </div>
  )
}

/**
 * Ajustes › Modelos: the same switch above the model groups. Once on, the "OpenCode Free" group
 * below lists each free model with its own switch, as in opencode.
 */
export const SettingsFreeModelsSwitchV2: Component = () => {
  const language = useLanguage()
  const free = useFreeModelsSwitch()
  return (
    <div class="settings-v2-free-models settings-v2-free-models--compact" data-component="free-models-switch">
      <div class="settings-v2-provider-row">
        <div class="settings-v2-provider-lead">
          <ProviderIcon id="opencode" width={16} height={16} class="settings-v2-provider-icon shrink-0" />
          <div class="settings-v2-provider-copy">
            <div class="settings-v2-provider-main">
              <span class="settings-v2-provider-name">{language.t("settings.providers.free.name")}</span>
              <Tag>{language.t("model.tag.free")}</Tag>
            </div>
            <p class="settings-v2-provider-description">
              {language.t(free.enabled() ? "settings.models.free.on" : "settings.models.free.off")}
            </p>
          </div>
        </div>
        <Switch
          hideLabel
          checked={free.enabled()}
          disabled={free.saving()}
          onChange={(value) => void free.toggle(value)}
          data-action="settings-models-free"
        >
          {language.t("settings.providers.free.title")}
        </Switch>
      </div>
    </div>
  )
}

/**
 * Applies the wizard's free-models choice once the main window reaches its server, when the wizard
 * could not reach it itself. The wizard only leaves a value when the user moved the switch.
 */
export function PendingFreeModelsRunner() {
  const global = useGlobal()
  const server = useServer()
  let applying = false

  createEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome")) return
    const pending = (() => {
      try {
        return localStorage.getItem(PENDING_FREE_MODELS_KEY)
      } catch {
        return null
      }
    })()
    if ((pending !== "on" && pending !== "off") || applying) return
    const list = global.servers.list()
    const conn = list.find((item) => ServerConnection.key(item) === server.key) ?? list[0]
    if (!conn) return
    const ctx = global.ensureServerCtx(conn)
    // The same readiness StartModeRunner waits for: the server answered its first sync.
    if (!ctx.sync.data.path) return
    applying = true
    void ctx.sdk.client.global.config
      .update({ config: { free_models: pending === "on" } })
      .then(() => {
        try {
          localStorage.removeItem(PENDING_FREE_MODELS_KEY)
        } catch {
          // A storage failure only means the same update is sent again on the next start.
        }
      })
      .catch(() => {
        applying = false
      })
  })

  return null
}
