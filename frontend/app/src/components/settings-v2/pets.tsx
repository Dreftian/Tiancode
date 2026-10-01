import { createEffect, createSignal, For, onCleanup, Show, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { petDisplays, petKinds, petPositions, useSettings, type PetDisplay, type PetKind } from "@/context/settings"
import { mascotFor, PetGlyph } from "@/components/pet/pet-glyph"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const petDisplayLabels = {
  both: "settings.pets.display.both",
  app: "settings.pets.display.app",
  desktop: "settings.pets.display.desktop",
} as const

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
  getState: () => Promise<PetSnapshot>
  resetPosition?: () => Promise<void>
}

// window.api lo inyecta el preload de Electron: en la build web no existe mascota de escritorio.
const petApi = (): PetApi | undefined => (window as unknown as { api?: { pet?: PetApi } }).api?.pet

// The animated page-mascot characters first, then the classic drawn ones.
const ANIMATED = petKinds.filter((kind) => mascotFor(kind))
const CLASSIC = petKinds.filter((kind) => !mascotFor(kind))

export const SettingsPetsV2: Component<{ active?: boolean }> = (props) => {
  const language = useLanguage()
  const settings = useSettings()
  const desktopAvailable = !!petApi()
  const [petState, setPetState] = createSignal<PetSnapshot>()

  const refreshPetState = () =>
    void petApi()
      ?.getState()
      .then(setPetState)
      .catch(() => setPetState(undefined))

  // The panel stays mounted between visits: refresh while it is open and after every change.
  createEffect(() => {
    if (props.active === false || !desktopAvailable) return
    refreshPetState()
    const timer = setInterval(refreshPetState, 3000)
    onCleanup(() => clearInterval(timer))
  })
  createEffect(() => {
    settings.general.petEnabled()
    settings.general.petDisplay()
    settings.general.petKind()
    // The app pushes the new state to the desktop pet first; read it back right after.
    setTimeout(refreshPetState, 250)
  })

  const selectPet = (kind: PetKind) => {
    settings.general.setPetKind(kind)
    settings.general.setPetEnabled(true)
  }

  // The companion in the app reacts and tells the desktop pet, so both play the same greeting.
  const pet = () =>
    window.dispatchEvent(new CustomEvent("tiancode:pet-pet", { detail: { text: language.t("settings.pets.pet.greeting") } }))

  const current = () => settings.general.petKind()
  const status = () => petState()?.status ?? "ready"

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.pets.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.pets.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-pets">
        <section class="settings-v2-pets-hero" data-enabled={settings.general.petEnabled() ? "" : undefined}>
          <span class="settings-v2-pets-hero-glyph" aria-hidden="true">
            <PetGlyph kind={current()} size={84} mood={status() === "running" ? "writing" : "idle"} />
          </span>
          <div class="settings-v2-pets-hero-copy">
            <div class="settings-v2-pets-hero-head">
              <h3 class="settings-v2-pets-hero-name">{language.t(`settings.pets.kind.${current()}`)}</h3>
              <span class="settings-v2-pets-tag">{language.t(`settings.pets.kind.${current()}.species`)}</span>
            </div>
            <p class="settings-v2-pets-hero-trait">{language.t(`settings.pets.kind.${current()}.trait`)}</p>
            <div class="settings-v2-pets-hero-status">
              <Show
                when={settings.general.petEnabled()}
                fallback={<span class="settings-v2-pets-state" data-state="off">{language.t("settings.pets.state.off")}</span>}
              >
                <span class="settings-v2-pets-state" data-state={status()}>
                  {language.t(petStatusLabels[status()])}
                </span>
                <Show when={desktopAvailable && settings.general.petDisplay() !== "app"}>
                  <span class="settings-v2-pets-state" data-state={petState()?.visible ? "visible" : "hidden"}>
                    {language.t(petState()?.visible ? "settings.pets.state.visible" : "settings.pets.state.hidden")}
                  </span>
                </Show>
              </Show>
            </div>
          </div>
          <div class="settings-v2-pets-hero-actions">
            <Switch
              checked={settings.general.petEnabled()}
              onChange={(checked) => settings.general.setPetEnabled(checked)}
            >
              {language.t("settings.pets.enabled")}
            </Switch>
            <ButtonV2 variant="outline" size="small" disabled={!settings.general.petEnabled()} onClick={pet}>
              {language.t("settings.pets.pet.action")}
            </ButtonV2>
          </div>
        </section>

        <SettingsListV2>
          <SettingsRowV2
            title={language.t("settings.pets.display.title")}
            description={
              desktopAvailable ? language.t("settings.pets.display.description") : language.t("settings.pets.desktop.unavailable")
            }
          >
            <SelectV2
              appearance="inline"
              data-action="settings-pet-display"
              options={desktopAvailable ? [...petDisplays] : (["app"] as PetDisplay[])}
              current={desktopAvailable ? settings.general.petDisplay() : "app"}
              placement="bottom-end"
              gutter={6}
              label={(option) => language.t(petDisplayLabels[option])}
              onSelect={(option) => option && settings.general.setPetDisplay(option)}
            />
          </SettingsRowV2>
          <Show when={settings.general.petDisplay() !== "desktop"}>
            <SettingsRowV2 title={language.t("settings.pets.position")} description={language.t("settings.pets.position.description")}>
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
          </Show>
          <Show when={desktopAvailable && settings.general.petDisplay() !== "app"}>
            <SettingsRowV2
              title={language.t("settings.pets.desktopPosition.title")}
              description={language.t("settings.pets.desktopPosition.description")}
            >
              <ButtonV2 variant="outline" size="small" onClick={() => void petApi()?.resetPosition?.()}>
                {language.t("settings.pets.desktopPosition.reset")}
              </ButtonV2>
            </SettingsRowV2>
          </Show>
        </SettingsListV2>

        <For
          each={[
            { title: "settings.pets.group.animated", kinds: ANIMATED },
            { title: "settings.pets.group.classic", kinds: CLASSIC },
          ] as const}
        >
          {(group) => (
            <div class="settings-v2-section">
              <div class="settings-v2-pets-head">
                <h3 class="settings-v2-section-title">{language.t(group.title)}</h3>
                <span class="settings-v2-pets-count">{group.kinds.length}</span>
              </div>
              <div class="settings-v2-pets-grid" role="radiogroup" aria-label={language.t(group.title)}>
                <For each={group.kinds}>
                  {(kind) => (
                    <button
                      type="button"
                      role="radio"
                      class="settings-v2-pets-card"
                      aria-checked={current() === kind}
                      title={language.t(`settings.pets.kind.${kind}.trait`)}
                      onClick={() => selectPet(kind)}
                    >
                      <span class="settings-v2-pets-card-glyph" aria-hidden="true">
                        <PetGlyph kind={kind} size={44} track={false} />
                      </span>
                      <span class="settings-v2-pets-card-copy">
                        <span class="settings-v2-pets-card-name">{language.t(`settings.pets.kind.${kind}`)}</span>
                        <span class="settings-v2-pets-card-species">{language.t(`settings.pets.kind.${kind}.species`)}</span>
                        <span class="settings-v2-pets-card-description">{language.t(`settings.pets.kind.${kind}.description`)}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </>
  )
}
