import { For } from "solid-js"
import { createStore } from "solid-js/store"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { usePermission } from "@/context/permission"
import { showToast } from "@/utils/toast"
import {
  applyComposerMode,
  COMPOSER_MODES,
  getComposerMode,
  setComposerMode,
  type ComposerMode,
} from "@/utils/composer-mode"

export function ComposerModeButton(props: {
  sessionID?: string
  working: boolean
  onPlan: () => void
  onBuild: () => void
}) {
  const sdk = useSDK()
  const server = useServerSDK()
  const language = useLanguage()
  const permissions = usePermission()
  const [state, setState] = createStore({ saving: false })
  const mode = () =>
    getComposerMode(sdk().scope, sdk().directory, props.sessionID)?.mode ??
    (props.sessionID
      ? permissions.isAutoAccepting(props.sessionID, sdk().directory)
        ? "skip"
        : "auto"
      : permissions.isGlobalAutoAccepting() || permissions.isAutoAcceptingDirectory(sdk().directory)
        ? "skip"
        : "auto")
  const select = async (value: ComposerMode) => {
    const previous = mode()
    setState("saving", true)
    try {
      if (props.sessionID)
        await applyComposerMode({
          scope: sdk().scope,
          directory: sdk().directory,
          sessionID: props.sessionID,
          client: sdk().client,
          mode: value,
        })
      if (!props.sessionID) setComposerMode(sdk().scope, sdk().directory, undefined, { mode: value })
      if (value === "plan") props.onPlan()
      if (previous === "plan" && value !== "plan") props.onBuild()
    } catch {
      showToast({ variant: "error", title: language.t("composer.mode.failed") })
    } finally {
      setState("saving", false)
    }
  }
  const disabled = () => state.saving || props.working || server().protocolKind() !== "v1"
  return (
    <MenuV2>
      <MenuV2.Trigger
        disabled={disabled()}
        title={
          server().protocolKind() === "v2"
            ? language.t("composer.mode.v2Unavailable")
            : language.t("composer.mode.title")
        }
        class="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
        aria-label={language.t("composer.mode.title")}
      >
        {language.t(`composer.mode.${mode()}`)}
        <span aria-hidden="true">⌄</span>
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content class="min-w-64 max-w-80">
          <For each={COMPOSER_MODES}>
            {(value) => (
              <MenuV2.Item onSelect={() => void select(value)}>
                <span class="flex flex-col gap-0.5">
                  <span>
                    {language.t(`composer.mode.${value}`)}
                    {mode() === value ? " ✓" : ""}
                  </span>
                  <span class="text-[11px] text-v2-text-text-muted whitespace-normal">
                    {language.t(`composer.mode.${value}.description`)}
                  </span>
                </span>
              </MenuV2.Item>
            )}
          </For>
        </MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )
}
