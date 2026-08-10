import { For, type Component } from "solid-js"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { petKinds, petPositions, useSettings, type PetKind } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

// El compañero renderiza estos glifos (pet-companion.tsx): se reutilizan aquí
// para que la tarjeta muestre exactamente lo que aparece en la interfaz.
const petGlyph: Record<PetKind, string> = {
  cat: "🐱",
  dog: "🐶",
  rabbit: "🐰",
}

const petPositionLabels = {
  "bottom-right": "settings.pets.position.bottomRight",
  "bottom-left": "settings.pets.position.bottomLeft",
  "top-right": "settings.pets.position.topRight",
  "top-left": "settings.pets.position.topLeft",
} as const

export const SettingsPetsV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

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
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.pets.enabled")}
              description={language.t("settings.pets.enabled.description")}
            >
              <div data-action="settings-pet-enabled">
                <Switch checked={settings.general.petEnabled()} onChange={settings.general.setPetEnabled} />
              </div>
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
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.pets.kind")}</h3>
          <div class="settings-v2-pets-grid" role="radiogroup" aria-label={language.t("settings.pets.kind")}>
            <For each={[...petKinds]}>
              {(kind) => {
                const selected = settings.general.petKind() === kind
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-action="settings-pet-kind"
                    data-selected={selected || undefined}
                    class="settings-v2-pets-card"
                    onClick={() => settings.general.setPetKind(kind)}
                  >
                    <span class="settings-v2-pets-card-glyph" aria-hidden="true">
                      {petGlyph[kind]}
                    </span>
                    <span class="settings-v2-pets-card-copy">
                      <span class="settings-v2-pets-card-name">
                        {language.t(`settings.pets.kind.${kind}`)}
                        {selected && <span class="settings-v2-pets-card-selected">{language.t("settings.pets.selected")}</span>}
                      </span>
                      <span class="settings-v2-pets-card-description">
                        {language.t(`settings.pets.kind.${kind}.description`)}
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
