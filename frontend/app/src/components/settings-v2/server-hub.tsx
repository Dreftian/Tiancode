import { type Component, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsServersV2 } from "./servers"
import { SettingsProjectsV2 } from "./projects"
import { SettingsWorktreesV2 } from "./worktrees"
import "./settings-v2.css"

export type ServerSection = "servers" | "projects" | "worktrees"
export const SERVER_SECTIONS: readonly ServerSection[] = ["servers", "projects", "worktrees"]

/** Settings › Servidor: where Tiancode runs, the projects it has open and their worktrees. */
export const SettingsServerHubV2: Component<{
  active?: boolean
  section: ServerSection
  onSectionChange: (section: ServerSection) => void
}> = (props) => {
  const language = useLanguage()
  return (
    <>
      <SettingsHubHeader
        icon="server"
        title={language.t("settings.tab.server")}
        description={language.t("settings.server.description")}
        value={props.section}
        onChange={props.onSectionChange}
        sections={[
          { id: "servers", label: language.t("status.popover.tab.servers"), hint: language.t("settings.server.hint.servers"), icon: "server" },
          { id: "projects", label: language.t("settings.tab.projects"), hint: language.t("settings.server.hint.projects"), icon: "folder" },
          { id: "worktrees", label: language.t("settings.tab.worktrees"), hint: language.t("settings.server.hint.worktrees"), icon: "branch" },
        ]}
      />
      <Show when={props.section === "servers"}>
        <SettingsServersV2 embedded />
      </Show>
      <Show when={props.section === "projects"}>
        <SettingsProjectsV2 embedded active={props.active} />
      </Show>
      <Show when={props.section === "worktrees"}>
        <SettingsWorktreesV2 embedded active={props.active} />
      </Show>
    </>
  )
}
