import { For, Show, createMemo, type Component } from "solid-js"
import type { Project } from "@tiancode-ai/sdk/v2"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { ProjectAvatar } from "@tiancode-ai/ui/v2/project-avatar-v2"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { getProjectAvatarVariant } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { displayName, getProjectAvatarSource } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import "./settings-v2.css"

/** Settings → Projects: every project this server knows, like opencode's page. */
export const SettingsProjectsV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const serverSync = useServerSync()
  const dialog = useDialog()
  // The server keeps a catch-all "global" project for folders without git; it is not a project
  // the user opened, so it is not listed.
  const projects = createMemo(() =>
    serverSync()
      .data.project.filter((project) => project.id !== "global" && project.worktree !== "/")
      .toSorted((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)),
  )

  const edit = (project: Project) => {
    const conn = server.current
    if (!conn) return
    void import("@/components/dialogs/dialog-edit-project-v2").then(({ DialogEditProjectV2 }) => {
      void dialog.push(() => <DialogEditProjectV2 server={conn} project={{ ...project, expanded: true }} />)
    })
  }

  const reveal = async (directory: string) => {
    const shown = platform.revealPath ? await platform.revealPath(directory).catch(() => false) : false
    if (shown) return
    if (platform.openPath) {
      await platform.openPath(directory).catch(() =>
        showToast({ variant: "error", title: language.t("settings.projects.openFailed") }),
      )
      return
    }
    showToast({ title: directory })
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.projects")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.projects.description")}</p>
      </div>
      <div class="settings-v2-tab-body">
        <Show
          when={projects().length > 0}
          fallback={
            <div class="settings-v2-empty" data-component="settings-projects-empty">
              <div class="text-13-medium text-v2-text-text-base">{language.t("settings.projects.empty.title")}</div>
              <div class="text-12-regular text-v2-text-text-muted">{language.t("settings.projects.empty.description")}</div>
            </div>
          }
        >
          <div class="flex flex-col gap-2" data-component="settings-projects-list">
            <For each={projects()}>
              {(project) => (
                <div
                  class="flex items-center gap-3 rounded-[10px] border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-01 px-4 py-3 min-w-0"
                  data-project={project.id}
                >
                  <ProjectAvatar
                    fallback={displayName(project)}
                    src={getProjectAvatarSource(project.id, project.icon)}
                    variant={getProjectAvatarVariant(project.icon?.color)}
                  />
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-13-medium text-v2-text-text-base">{displayName(project)}</span>
                    <span class="truncate text-12-regular text-v2-text-text-muted" title={project.worktree}>
                      {project.worktree}
                    </span>
                    <Show when={project.sandboxes.length > 0}>
                      <span class="text-11-regular text-v2-text-text-faint">
                        {language.t("settings.projects.worktreeCount", { count: project.sandboxes.length })}
                      </span>
                    </Show>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <ButtonV2 size="small" variant="ghost" onClick={() => void reveal(project.worktree)}>
                      {language.t("settings.projects.openFolder")}
                    </ButtonV2>
                    <ButtonV2 size="small" variant="neutral" onClick={() => edit(project)}>
                      {language.t("settings.projects.edit")}
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
