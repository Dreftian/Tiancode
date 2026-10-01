import { For, Show, createMemo, onMount, type Component } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@tiancode-ai/ui/v2/dialog-v2"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { getFilename } from "@tiancode-ai/core/util/path"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { displayName } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import "./settings-v2.css"

type WorktreeEntry = { root: string; directory: string; project: string }

/** Settings → Worktrees: review the worktrees Tiancode created and free their disk space. */
export const SettingsWorktreesV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const dialog = useDialog()
  const [state, setState] = createStore({ busy: {} as Record<string, boolean> })

  const entries = createMemo(() =>
    serverSync().data.project.flatMap((project) =>
      project.sandboxes.map((directory): WorktreeEntry => ({
        root: project.worktree,
        directory,
        project: displayName(project),
      })),
    ),
  )

  const reveal = async (directory: string) => {
    const shown = platform.revealPath ? await platform.revealPath(directory).catch(() => false) : false
    if (shown || !platform.openPath) return
    await platform.openPath(directory).catch(() =>
      showToast({ variant: "error", title: language.t("settings.projects.openFailed") }),
    )
  }

  const remove = async (entry: WorktreeEntry) => {
    setState("busy", entry.directory, true)
    const removed = await serverSDK()
      .client.worktree.remove({ directory: entry.root, worktreeRemoveInput: { directory: entry.directory } })
      .then((result) => result.data !== false)
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: language.t("workspace.delete.failed.title"),
          description: error instanceof Error ? error.message : undefined,
        })
        return false
      })
    setState("busy", entry.directory, false)
    if (!removed) return
    serverSync().set(
      "project",
      produce((draft) => {
        const project = draft.find((item) => item.worktree === entry.root)
        if (!project) return
        project.sandboxes = project.sandboxes.filter((sandbox) => sandbox !== entry.directory)
      }),
    )
    showToast({ variant: "success", title: language.t("settings.worktrees.deleted", { name: getFilename(entry.directory) }) })
  }

  const confirmRemove = (entry: WorktreeEntry) => {
    void dialog.push(() => (
      <DialogDeleteWorktree entry={entry} onConfirm={() => void remove(entry)} onClose={() => dialog.close()} />
    ))
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.worktrees")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.worktrees.description")}</p>
      </div>
      <div class="settings-v2-tab-body">
        <Show
          when={entries().length > 0}
          fallback={
            <div class="settings-v2-empty" data-component="settings-worktrees-empty">
              <div class="text-13-medium text-v2-text-text-base">{language.t("settings.worktrees.empty.title")}</div>
              <div class="text-12-regular text-v2-text-text-muted">
                {language.t("settings.worktrees.empty.description")}
              </div>
            </div>
          }
        >
          <div class="flex flex-col gap-2" data-component="settings-worktrees-list">
            <For each={entries()}>
              {(entry) => (
                <div class="flex items-center gap-3 rounded-[10px] border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-01 px-4 py-3 min-w-0">
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-13-medium text-v2-text-text-base">{getFilename(entry.directory)}</span>
                    <span class="truncate text-12-regular text-v2-text-text-muted" title={entry.directory}>
                      {entry.directory}
                    </span>
                    <span class="text-11-regular text-v2-text-text-faint">
                      {language.t("settings.worktrees.project", { project: entry.project })}
                    </span>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <ButtonV2 size="small" variant="ghost" onClick={() => void reveal(entry.directory)}>
                      {language.t("settings.projects.openFolder")}
                    </ButtonV2>
                    <ButtonV2
                      size="small"
                      variant="danger"
                      disabled={!!state.busy[entry.directory]}
                      onClick={() => confirmRemove(entry)}
                    >
                      {language.t(state.busy[entry.directory] ? "settings.worktrees.deleting" : "settings.worktrees.delete")}
                    </ButtonV2>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  )
}

function DialogDeleteWorktree(props: { entry: WorktreeEntry; onConfirm: () => void; onClose: () => void }) {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const [data, setData] = createStore({ status: "loading" as "loading" | "clean" | "dirty" | "error" })

  // Deleting runs `git worktree remove --force`: uncommitted work there is lost, so check first.
  onMount(() => {
    serverSDK()
      .api.vcs.status({ location: { directory: props.entry.directory } })
      .then((result) => setData("status", result.data.length > 0 ? "dirty" : "clean"))
      .catch(() => setData("status", "error"))
  })

  const description = () => {
    if (data.status === "loading") return language.t("workspace.status.checking")
    if (data.status === "error") return language.t("workspace.status.error")
    if (data.status === "dirty") return language.t("settings.worktrees.dirty")
    return language.t("workspace.status.clean")
  }

  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("settings.worktrees.confirm.title", { name: getFilename(props.entry.directory) })}
          description={description()}
        />
      </DialogHeader>
      <DialogFooter>
        <ButtonV2 variant="outline" autofocus onClick={props.onClose}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          variant="danger"
          disabled={data.status === "loading"}
          onClick={() => {
            props.onClose()
            props.onConfirm()
          }}
        >
          {language.t(data.status === "clean" ? "settings.worktrees.delete" : "settings.worktrees.deleteAnyway")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
