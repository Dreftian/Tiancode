import { For, Show, createMemo, createUniqueId, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import {
  clonePreset,
  expandableCategories,
  parseTimelineDetail,
  timelineCategories,
  timelinePreset,
  timelinePresets,
  transcriptViewDetail,
  type TimelineCategory,
  type TimelineDetail,
  type TimelinePlacement,
} from "@/pages/session/timeline/detail"
import "./timeline-detail.css"

const EyeIcon = (props: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
    <Show when={props.off}>
      <path d="M2.5 13.5l11-11" stroke-linecap="round" />
    </Show>
  </svg>
)

/** Settings → General → Timeline: opencode's 5-step timeline detail slider with an Advanced grid. */
export const SettingsTimelineDetailV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const id = createUniqueId()
  // Remembers how a category was shown before it was hidden, so showing it again restores that.
  const [visible, setVisible] = createStore<Partial<Record<TimelineCategory, Exclude<TimelinePlacement, "hidden">>>>({})
  const value = createMemo<TimelineDetail>(
    () => parseTimelineDetail(settings.general.timelineDetail()) ?? transcriptViewDetail(settings.general.transcriptView()),
  )
  const preset = createMemo(() => timelinePreset(value()))
  const position = () => {
    const current = preset()
    return current ? timelinePresets.findIndex((item) => item.id === current) : 2
  }
  const label = () =>
    language.t(preset() ? `settings.timeline.preset.${preset()!}` : "settings.timeline.custom")
  const change = (next: TimelineDetail) => settings.general.setTimelineDetail(next)
  const update = <C extends TimelineCategory>(category: C, patch: Partial<TimelineDetail[C]>) =>
    change({ ...value(), [category]: { ...value()[category], ...patch } })
  const isExpandable = (category: TimelineCategory) =>
    (expandableCategories as readonly TimelineCategory[]).includes(category)
  const categoryLabel = (category: TimelineCategory) => language.t(`settings.timeline.category.${category}`)

  return (
    <div data-component="timeline-detail-control">
      <div class="timeline-detail-copy">
        <label class="timeline-detail-title" for={`${id}-slider`}>
          {language.t("settings.timeline.detail")}
        </label>
        <div id={`${id}-description`} class="timeline-detail-description">
          {language.t("settings.timeline.description")}
        </div>
      </div>
      <div class="timeline-detail-scale">
        <div
          class="timeline-detail-track"
          aria-hidden="true"
          style={{ "--timeline-detail-progress": `${(position() / (timelinePresets.length - 1)) * 100}%` }}
        >
          <For each={timelinePresets}>
            {(_, index) => (
              <span
                data-selected={index() <= position() ? "" : undefined}
                style={{ "inset-inline-start": `${(index() / (timelinePresets.length - 1)) * 100}%` }}
              />
            )}
          </For>
        </div>
        <input
          id={`${id}-slider`}
          data-action="settings-timeline-detail"
          type="range"
          min="0"
          max={timelinePresets.length - 1}
          step="1"
          value={position()}
          aria-valuetext={label()}
          aria-describedby={`${id}-description ${id}-preset`}
          onInput={(event) => change(clonePreset(timelinePresets[event.currentTarget.valueAsNumber]!.id))}
        />
      </div>
      <p id={`${id}-preset`} class="timeline-detail-preset" aria-live="polite">
        <strong>{language.t("settings.timeline.summary", { preset: label() })}</strong>{" "}
        {language.t(`settings.timeline.description.${preset() ?? "custom"}`)}
      </p>
      <details class="timeline-detail-advanced" open={!preset()}>
        <summary>{language.t("settings.timeline.advanced")}</summary>
        <div class="timeline-detail-grid" role="group" aria-label={language.t("settings.timeline.advanced.description")}>
          <div class="timeline-detail-columns" aria-hidden="true">
            <span />
            <span>{language.t("settings.timeline.group")}</span>
            <span>{language.t("settings.timeline.collapse")}</span>
          </div>
          <For each={timelineCategories}>
            {(category) => {
              const hidden = () => value()[category].placement === "hidden"
              return (
                <div class="timeline-detail-category" data-hidden={hidden() ? "" : undefined}>
                  <div class="timeline-detail-activity">
                    <button
                      type="button"
                      class="timeline-detail-eye"
                      data-action="timeline-detail-visibility"
                      aria-pressed={!hidden()}
                      aria-label={language.t("settings.timeline.visibility.label", { activity: categoryLabel(category) })}
                      title={language.t(hidden() ? "settings.timeline.visibility.show" : "settings.timeline.visibility.hide")}
                      onClick={() => {
                        const placement = value()[category].placement
                        if (placement !== "hidden") setVisible(category, placement)
                        update(category, {
                          placement: placement === "hidden" ? (visible[category] ?? "grouped") : "hidden",
                        } as Partial<TimelineDetail[typeof category]>)
                      }}
                    >
                      <EyeIcon off={hidden()} />
                    </button>
                    <span>{categoryLabel(category)}</span>
                  </div>
                  <div class="timeline-detail-cell">
                    <Show when={!hidden()} fallback={<span class="timeline-detail-dash" aria-hidden="true" />}>
                      <Switch
                        checked={value()[category].placement === "grouped"}
                        aria-label={language.t("settings.timeline.grouped.label", { activity: categoryLabel(category) })}
                        onChange={(checked) =>
                          update(category, { placement: checked ? "grouped" : "separate" } as Partial<
                            TimelineDetail[typeof category]
                          >)
                        }
                      />
                    </Show>
                  </div>
                  <div class="timeline-detail-cell">
                    <Show when={isExpandable(category) && !hidden()} fallback={<span class="timeline-detail-dash" aria-hidden="true" />}>
                      <Switch
                        checked={(value()[category] as { details?: string }).details !== "expanded"}
                        aria-label={language.t("settings.timeline.collapsed.label", { activity: categoryLabel(category) })}
                        onChange={(checked) =>
                          update(category, { details: checked ? "collapsed" : "expanded" } as Partial<
                            TimelineDetail[typeof category]
                          >)
                        }
                      />
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </details>
    </div>
  )
}
