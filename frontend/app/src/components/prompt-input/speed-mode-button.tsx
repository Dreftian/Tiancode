import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { isSpeed2xActive, toggleSpeed2x } from "@/utils/speed-mode"

export function BoltIcon(props: { class?: string; filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill={props.filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={props.class}
    >
      <polygon points="9.5 1.5 2.5 9 8 9 6.5 14.5 13.5 7 8 7 9.5 1.5" />
    </svg>
  )
}

export function SpeedModeButton(props: { class?: string; native: boolean }) {
  const language = useLanguage()

  const tooltipTitle = () =>
    isSpeed2xActive() ? language.t("composer.fast.disable") : language.t("composer.fast.enable")

  const tooltipDesc = () =>
    props.native ? language.t("composer.fast.description") : language.t("composer.fast.unavailable")

  return (
    <TooltipV2
      placement="top"
      gutter={4}
      value={
        <div class="max-w-[240px] text-center text-xs leading-normal py-0.5">
          <div class="font-medium">{tooltipTitle()}</div>
          <div class="text-[11px] text-v2-text-text-muted mt-0.5">{tooltipDesc()}</div>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => toggleSpeed2x()}
        class={`flex h-7 px-1.5 items-center justify-center gap-1 rounded-md text-xs transition-all select-none ${
          isSpeed2xActive()
            ? "bg-amber-500/15 text-amber-500 font-semibold border border-amber-500/30 hover:bg-amber-500/25 shadow-sm"
            : "text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base border border-transparent"
        } ${props.class ?? ""}`}
        aria-label={tooltipTitle()}
        aria-pressed={isSpeed2xActive()}
        data-action="toggle-speed-mode-2x"
      >
        <BoltIcon class="size-3.5" filled={isSpeed2xActive()} />
      </button>
    </TooltipV2>
  )
}
