import { For } from "solid-js"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { useLanguage } from "@/context/language"

// Top "sidebar" of a settings tab: the same segmented control Connections and Computer use
// show, stretched to the header width so every section fits without scrolling.
export function SettingsSectionTabs<T extends string>(props: {
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (value: T) => void
}) {
  const language = useLanguage()
  return (
    <div class="settings-section-tabs">
      <SegmentedControlV2
        class="segmented-control-v2--full-width"
        value={props.value}
        onChange={(value) => value && props.onChange(value as T)}
        aria-label={language.t("settings.sections.label")}
      >
        <For each={props.options}>
          {(option) => <SegmentedControlItemV2 value={option.id}>{option.label}</SegmentedControlItemV2>}
        </For>
      </SegmentedControlV2>
    </div>
  )
}
