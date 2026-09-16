import { For } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Dialog } from "@tiancode-ai/ui/dialog"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { DESIGN_STYLES, type DesignStyle } from "@/utils/design-style"
import "./design-style-picker.css"

export function DesignStylePicker() {
  const language = useLanguage()
  const settings = useSettings()
  const dialog = useDialog()
  const choose = (style: DesignStyle) => {
    settings.general.setDesignStyle(style)
    dialog.close()
  }
  return (
    <div class="design-style-control">
      <ButtonV2
        type="button"
        variant="ghost-muted"
        data-action="design-style-picker"
        onClick={() =>
          void dialog.show(() => (
            <Dialog title={language.t("design.style.title")} class="design-style-dialog">
              <p class="design-style-intro">{language.t("design.style.description")}</p>
              <div class="design-style-grid">
                <For each={DESIGN_STYLES}>
                  {(style) => (
                    <button
                      type="button"
                      class="design-style-card"
                      aria-pressed={settings.general.designStyle() === style.id}
                      onClick={() => choose(style.id)}
                      style={{
                        "--design-bg": style.background,
                        "--design-fg": style.foreground,
                        "--design-accent": style.accent,
                        "--design-font": style.font,
                        "--design-radius": style.radius,
                      }}
                    >
                      <div class="design-style-preview" aria-hidden="true">
                        <div class="design-style-preview-nav">
                          <i />
                          <i />
                          <i />
                        </div>
                        <strong>{language.t(`design.style.${style.id}`)}</strong>
                        <span class="design-style-preview-line" />
                        <span class="design-style-preview-line" />
                        <div class="design-style-preview-button" />
                      </div>
                      <span class="design-style-card-title">{language.t(`design.style.${style.id}`)}</span>
                    </button>
                  )}
                </For>
              </div>
              <div class="design-style-footer">
                <ButtonV2 onClick={() => choose("ask")}>{language.t("design.style.ask")}</ButtonV2>
              </div>
            </Dialog>
          ))
        }
      >
        {language.t("design.style.title")} · {language.t(`design.style.${settings.general.designStyle()}`)}
      </ButtonV2>
    </div>
  )
}
