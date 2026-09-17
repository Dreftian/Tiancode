import { Popover } from "@kobalte/core/popover"
import { createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { useI18n } from "@tiancode-ai/ui/context/i18n"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import type { PromptInputV2SelectControl } from "./interaction"

const ULTRACODE = "__tiancode_ultracode"
const ORDER = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max", ULTRACODE]

// Effort slider modelled on Claude Code Desktop: a "Faster … Smarter" scale with one notch per
// level the selected model exposes, and Ultracode as the last notch with its own tint. The help
// mark opens the explanation on click and keeps it open until dismissed.
export function EffortControl(props: { control: PromptInputV2SelectControl; footer?: JSX.Element }) {
  const i18n = useI18n()
  const [help, setHelp] = createSignal(false)
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length - 2)
  const options = createMemo(() => props.control.options().toSorted((a, b) => rank(a.id) - rank(b.id)))
  const index = () => Math.max(0, options().findIndex((option) => option.id === props.control.current()))
  const label = (id: string, fallback: string) =>
    ORDER.includes(id) && id !== ULTRACODE ? i18n.t(`ui.promptInput.effort.${id}`) : fallback
  const currentLabel = () => {
    const option = options()[index()]
    return option ? label(option.id, option.label) : i18n.t("ui.promptInput.effort.default")
  }
  const ultra = () => props.control.current() === ULTRACODE
  // The last notch a model offers gets the premium shimmer (like Claude Code's top effort) and
  // Ultracode keeps its violet one; every other level carries its own tint through data-level.
  const topIndex = () => {
    const last = options().length - 1
    return options()[last]?.id === ULTRACODE ? last - 1 : last
  }
  const level = () => options()[index()]?.id ?? "default"
  const tier = () => (ultra() ? "ultra" : options().length > 1 && index() === topIndex() ? "top" : "base")
  const ultraAvailable = () => options().some((option) => option.id === ULTRACODE)
  const progress = () => `${(index() / Math.max(1, options().length - 1)) * 100}%`

  return (
    <Popover placement="top-end" gutter={10} modal={false} onOpenChange={(open) => !open && setHelp(false)}>
      <TooltipV2 placement="top" value={i18n.t("ui.promptInput.chooseVariant")}>
        <Popover.Trigger
          type="button"
          class="effort-trigger"
          data-action="prompt-effort"
          aria-label={i18n.t("ui.promptInput.chooseVariant")}
          data-ultra={ultra() || undefined}
          data-level={level()}
          data-tier={tier()}
        >
          <span class="effort-label">{currentLabel()}</span>
        </Popover.Trigger>
      </TooltipV2>
      <Popover.Portal>
        <Popover.Content
          class="effort-popover"
          data-ultra={ultra() || undefined}
          data-level={level()}
          data-tier={tier()}
          aria-label={i18n.t("ui.promptInput.effort.title")}
        >
          <Show when={help()}>
            <div class="effort-help-bubble" role="note" id="effort-help-note">
              <strong>{i18n.t("ui.promptInput.effort.title")}</strong>
              <p>{i18n.t("ui.promptInput.effort.description")}</p>
              <Show when={!ultraAvailable()}>
                <p>{i18n.t("ui.promptInput.effort.ultracodeUnavailable")}</p>
              </Show>
            </div>
          </Show>
          <div class="effort-heading">
            <Popover.Title class="effort-title">{i18n.t("ui.promptInput.effort.title")}</Popover.Title>
            <span class="effort-value" aria-live="polite">
              {currentLabel()}
            </span>
            <Show when={props.footer}>
              <span class="effort-accessory">{props.footer}</span>
            </Show>
            <button
              type="button"
              class="effort-help"
              aria-label={i18n.t("ui.promptInput.effort.help")}
              aria-expanded={help()}
              aria-controls="effort-help-note"
              onClick={() => setHelp((value) => !value)}
            >
              ?
            </button>
          </div>
          <div class="effort-scale" aria-hidden="true">
            <span>{i18n.t("ui.promptInput.effort.faster")}</span>
            <span>{i18n.t("ui.promptInput.effort.deeper")}</span>
          </div>
          <div class="effort-track" style={{ "--effort-progress": progress() }}>
            <span class="effort-fill" aria-hidden="true" />
            <span class="effort-dots" aria-hidden="true">
              <For each={options()}>{() => <span />}</For>
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0, options().length - 1)}
              step="1"
              value={index()}
              aria-label={i18n.t("ui.promptInput.effort.title")}
              aria-valuetext={currentLabel()}
              onInput={(event) => {
                const option = options()[Number(event.currentTarget.value)]
                if (option) props.control.onSelect(option.id)
              }}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}
