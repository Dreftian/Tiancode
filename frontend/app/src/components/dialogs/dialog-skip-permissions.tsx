import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@tiancode-ai/ui/v2/dialog-v2"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"

const SECURITY_GUIDE_URL = "https://tiancode.vercel.app/recursos/docs.html#d-permisos"

// "*" stands for the global auto-accept switch, which covers every workspace at once.
const ackKey = (directory: string | undefined) =>
  `tiancode.skip-permissions.ack:${encodeURIComponent(directory || "*")}`

export function skipPermissionsAcknowledged(directory: string | undefined) {
  try {
    return localStorage.getItem(ackKey(directory)) === "1"
  } catch {
    return false
  }
}

function acknowledgeSkipPermissions(directory: string | undefined) {
  try {
    localStorage.setItem(ackKey(directory), "1")
  } catch {
    // Without storage the warning simply shows again next time; it never blocks the choice.
  }
}

/**
 * Asks once per workspace before any control turns on "skip permissions" (the composer mode, the
 * auto-accept command, or the global switch). Resolves true when the user confirms, or when this
 * workspace was already acknowledged; false when the dialog is cancelled or dismissed.
 */
export function useConfirmSkipPermissions() {
  const dialog = useDialog()
  return (directory: string | undefined) => {
    if (skipPermissionsAcknowledged(directory)) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      // push, not show: show() disposes an open settings dialog without running its onClose.
      void dialog.push(
        () => (
          <DialogSkipPermissions
            directory={directory}
            onConfirm={() => {
              acknowledgeSkipPermissions(directory)
              finish(true)
              dialog.close()
            }}
            onCancel={() => dialog.close()}
          />
        ),
        () => finish(false),
      )
    })
  }
}

function DialogSkipPermissions(props: { directory: string | undefined; onConfirm: () => void; onCancel: () => void }) {
  const language = useLanguage()
  const platform = usePlatform()
  return (
    <Dialog fit class="dialog-skip-permissions">
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("dialog.skipPermissions.title")}
          description={language.t("dialog.skipPermissions.description")}
        />
      </DialogHeader>
      <div class="flex flex-col gap-3 px-4 max-w-[440px]">
        <code class="block w-full rounded-md bg-v2-background-bg-layer-02 px-3 py-2 text-12-mono text-v2-text-text-base break-all select-text">
          <Show when={props.directory} fallback={language.t("dialog.skipPermissions.allWorkspaces")}>
            {props.directory}
          </Show>
        </code>
        <p class="text-12-regular text-v2-text-text-muted">
          {language.t(props.directory ? "dialog.skipPermissions.once" : "dialog.skipPermissions.onceGlobal")}{" "}
          {language.t("dialog.skipPermissions.guide.before")}
          <a
            href={SECURITY_GUIDE_URL}
            class="text-v2-text-text-accent underline"
            onClick={(event) => {
              event.preventDefault()
              platform.openExternal(SECURITY_GUIDE_URL)
            }}
          >
            {language.t("dialog.skipPermissions.guide.link")}
          </a>
          {language.t("dialog.skipPermissions.guide.after")}
        </p>
      </div>
      <DialogFooter>
        <ButtonV2 variant="outline" autofocus onClick={props.onCancel}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 variant="contrast" data-action="confirm-skip-permissions" onClick={props.onConfirm}>
          {language.t("composer.mode.skip")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
