import { For, Show, createSignal, onMount, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Tag } from "@tiancode-ai/ui/v2/badge-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { petKinds, petPositions, useSettings, type PetKind } from "@/context/settings"
import { Pet3DIcon } from "@/components/pet/pet-3d-icons"
import { PET_GLYPHS } from "./pets-catalogue"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const petPositionLabels = {
  "bottom-right": "settings.pets.position.bottomRight",
  "bottom-left": "settings.pets.position.bottomLeft",
  "top-right": "settings.pets.position.topRight",
  "top-left": "settings.pets.position.topLeft",
} as const

const petStatusLabels = {
  ready: "settings.pets.state.ready",
  running: "settings.pets.state.running",
  "needs-input": "settings.pets.state.needsInput",
  blocked: "settings.pets.state.blocked",
} as const

type PetStatus = keyof typeof petStatusLabels

type PetSnapshot = {
  kind: string
  status: PetStatus
  text: string
  visible: boolean
}

type PetApi = {
  update: (partial: Record<string, unknown>) => Promise<unknown>
  toggle: () => Promise<boolean>
  getState: () => Promise<PetSnapshot>
}

// window.api lo inyecta el preload de Electron: en la build web no existe mascota de escritorio.
const petApi = (): PetApi | undefined =>
  (window as unknown as { api?: { pet?: PetApi } }).api?.pet

export const SettingsPetsV2: Component<{ active?: boolean }> = (_props) => {
  const language = useLanguage()
  const settings = useSettings()

  const desktopAvailable = !!petApi()
  const [petState, setPetState] = createSignal<PetSnapshot>()

  const refreshPetState = () => {
    const api = petApi()
    if (!api) return
    void api
      .getState()
      .then((state) => setPetState(state))
      .catch(() => setPetState(undefined))
  }

  onMount(refreshPetState)

  const selectPet = (kind: PetKind) => {
    settings.general.setPetKind(kind)
    settings.general.setPetEnabled(true)
    const api = petApi()
    if (!api) return
    void api.update({ kind }).then(refreshPetState)
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.pets.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.pets.description")}</p>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.pets.section.companion")}</h3>

          <Show when={petState()}>
            {(state) => (
              <div class="settings-v2-pets-state" data-state={state().status}>
                <span class="settings-v2-pets-state-dot" aria-hidden="true" />
                <span class="settings-v2-pets-state-label">{language.t(petStatusLabels[state().status])}</span>
                <span class="settings-v2-pets-state-text">{state().text}</span>
                <span class="settings-v2-pets-state-visibility">
                  {language.t(state().visible ? "settings.pets.state.visible" : "settings.pets.state.hidden")}
                </span>
              </div>
            )}
          </Show>

          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.pets.enabled")}
              description={language.t("settings.pets.enabled.description")}
            >
              <Switch
                checked={settings.general.petEnabled()}
                onChange={(checked) => settings.general.setPetEnabled(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.pets.position")}
              description={language.t("settings.pets.position.description")}
            >
              <SelectV2
                appearance="inline"
                data-action="settings-pet-position"
                options={[...petPositions]}
                current={settings.general.petPosition()}
                placement="bottom-end"
                gutter={6}
                label={(option) => language.t(petPositionLabels[option])}
                onSelect={(option) => option && settings.general.setPetPosition(option)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.pets.desktop.float.title")}
              description={language.t("settings.pets.desktop.float.desc")}
            >
              <Show
                when={desktopAvailable}
                fallback={
                  <p class="settings-v2-note settings-v2-pets-unavailable">
                    {language.t("settings.pets.desktop.unavailable")}
                  </p>
                }
              >
                <div class="flex items-center gap-2" data-action="settings-pet-desktop">
                  <Switch
                    checked={settings.general.petDesktop()}
                    onChange={(checked) => {
                      settings.general.setPetDesktop(checked)
                      const api = petApi()
                      if (api) void api.toggle().then(refreshPetState)
                    }}
                  />
                </div>
              </Show>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.pets.pet.title")}
              description={language.t("settings.pets.pet.description")}
            >
              <ButtonV2
                type="button"
                variant="contrast"
                size="small"
                disabled={!desktopAvailable}
                onClick={() => {
                  const api = petApi()
                  if (!api) return
                  void api
                    .update({ petted: true, text: language.t("settings.pets.pet.greeting") })
                    .then(refreshPetState)
                  // El pulso de cariño es momentáneo: la mascota vuelve a su estado normal sola.
                  setTimeout(() => void api.update({ petted: false }).then(refreshPetState), 1200)
                }}
              >
                {language.t("settings.pets.pet.action")}
              </ButtonV2>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section mt-6">
          <div class="settings-v2-pets-head">
            <h3 class="settings-v2-section-title">{language.t("settings.pets.kind")}</h3>
            <span class="settings-v2-pets-count">
              {language.t("settings.pets.total", { count: petKinds.length })}
            </span>
          </div>

          <div class="settings-v2-pets-grid" role="radiogroup" aria-label={language.t("settings.pets.kind")}>
            <For each={petKinds}>
              {(kind) => {
                const selected = () => settings.general.petKind() === kind

                return (
                  <button
                    type="button"
                    role="radio"
                    class="settings-v2-pets-card"
                    aria-checked={selected()}
                    data-selected={selected() ? "" : undefined}
                    onClick={() => selectPet(kind)}
                  >
                    <span class="settings-v2-pets-card-glyph" aria-hidden="true">
                      <Pet3DIcon kind={kind} size={40} />
                    </span>
                    <span class="settings-v2-pets-card-copy">
                      <span class="settings-v2-pets-card-name">
                        {language.t(`settings.pets.kind.${kind}`)}
                        <Show when={selected()}>
                          <span class="settings-v2-pets-card-selected">{language.t("settings.pets.selected")}</span>
                        </Show>
                      </span>
                      <span class="settings-v2-pets-card-meta">
                        <Tag variant={selected() ? "accent" : "neutral"}>
                          {language.t(`settings.pets.kind.${kind}.species`)}
                        </Tag>
                        <span class="settings-v2-pets-card-id">
                          {PET_GLYPHS[kind]} {kind}
                        </span>
                      </span>
                      <span class="settings-v2-pets-card-description">
                        {language.t(`settings.pets.kind.${kind}.description`)}
                      </span>
                      <span class="settings-v2-pets-card-trait">
                        {language.t(`settings.pets.kind.${kind}.trait`)}
                      </span>
                    </span>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </div>
    </>
  )
}
