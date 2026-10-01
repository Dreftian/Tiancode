import { For } from "solid-js"
import { Icon, type IconName } from "@tiancode-ai/ui/icon"

export type HubSection<T extends string> = { id: T; label: string; hint: string; icon: IconName }

/**
 * The top of a settings page that groups several pages (Servidor, Conexiones): what the group is
 * for, and one tile per page with its icon and a line on what it holds.
 */
export function SettingsHubHeader<T extends string>(props: {
  icon: IconName
  title: string
  description: string
  sections: readonly HubSection<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div class="settings-v2-tab-header settings-v2-hub-header">
      <div class="settings-v2-hub-hero">
        <span class="settings-v2-hub-icon" aria-hidden="true">
          <Icon name={props.icon} />
        </span>
        <div class="settings-v2-hub-copy">
          <h2 class="settings-v2-tab-title">{props.title}</h2>
          <p class="settings-v2-tab-description">{props.description}</p>
        </div>
      </div>
      <div class="settings-v2-hub-tabs" role="tablist" aria-label={props.title}>
        <For each={props.sections}>
          {(section) => (
            <button
              type="button"
              role="tab"
              class="settings-v2-hub-tab"
              aria-selected={props.value === section.id}
              data-action={`settings-hub-${section.id}`}
              onClick={() => props.onChange(section.id)}
            >
              <span class="settings-v2-hub-tab-icon" aria-hidden="true">
                <Icon name={section.icon} size="small" />
              </span>
              <span class="settings-v2-hub-tab-copy">
                <span class="settings-v2-hub-tab-label">{section.label}</span>
                <span class="settings-v2-hub-tab-hint">{section.hint}</span>
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
