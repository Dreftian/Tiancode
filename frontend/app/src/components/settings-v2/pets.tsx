import { For, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { petKinds, petPositions, useSettings, type PetKind, type PetPosition } from "@/context/settings"
import { Pet3DIcon } from "@/components/pet-3d-icons"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

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
              title={language.t("settings.pets.desktop.float.title") ?? "Mascota Flotante en Escritorio"}
              description={language.t("settings.pets.desktop.float.desc") ?? "Muestra un compañero interactivo flotante en tu escritorio de Windows con diseño 3D interactivo."}
            >
              <div class="flex items-center gap-2" data-action="settings-pet-desktop">
                <Switch
                  checked={settings.general.petDesktop()}
                  onChange={(checked) => {
                    settings.general.setPetDesktop(checked)
                    const api = (window as unknown as { api?: { pet?: { toggle: () => Promise<boolean> } } })?.api
                    if (api?.pet) void api.pet.toggle()
                  }}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title="Probar Reacción / Acariciar"
              description="Envía un pulso de interacción y cariño a tu mascota activa en tiempo real."
            >
              <ButtonV2
                type="button"
                variant="outline"
                size="small"
                onClick={() => {
                  const api = (window as unknown as { api?: { pet?: { update: (data: unknown) => Promise<unknown> } } })?.api
                  if (api?.pet?.update) {
                    void api.pet.update({ petted: true, text: "¡Hola! Estoy listo para ayudarte a programar." })
                    setTimeout(() => void api.pet?.update({ petted: false }), 1200)
                  }
                }}
              >
                Acariciar 💖
              </ButtonV2>
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
                    class="settings-v2-pets-card cursor-pointer select-none"
                    onClick={() => {
                      settings.general.setPetKind(kind)
                      settings.general.setPetEnabled(true)
                      const api = (window as unknown as { api?: { pet?: { update: (data: { kind: string }) => Promise<unknown> } } })?.api
                      if (api?.pet?.update) {
                        void api.pet.update({ kind })
                      }
                    }}
                  >
                    <span class="settings-v2-pets-card-glyph settings-v2-pets-card-3d pointer-events-none" aria-hidden="true">
                      <Pet3DIcon kind={kind} size={42} />
                    </span>
                    <span class="settings-v2-pets-card-copy pointer-events-none">
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
