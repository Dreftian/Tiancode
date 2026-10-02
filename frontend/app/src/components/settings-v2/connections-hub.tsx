import { type Component, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsConnectionsV2 } from "./connections"
import { SettingsConnectorsV2 } from "./connectors"
import { SettingsGithubV2 } from "./github"
import "./settings-v2.css"

export type ConnectionsSection = "connectors" | "gateways" | "github"

/** Settings › Conexiones: app connectors, messaging gateways and webhooks, and GitHub. */
export const SettingsConnectionsHubV2: Component<{
  active?: boolean
  directory?: string
  section: ConnectionsSection
  onSectionChange: (section: ConnectionsSection) => void
}> = (props) => {
  const language = useLanguage()
  return (
    <>
      <SettingsHubHeader
        icon="share"
        title={language.t("settings.tab.connections")}
        description={language.t("settings.connections.hub.descriptionApps")}
        value={props.section}
        onChange={props.onSectionChange}
        sections={[
          {
            id: "connectors",
            label: language.t("settings.connections.section.connectors"),
            hint: language.t("settings.connections.hint.connectors"),
            icon: "share",
          },
          {
            id: "gateways",
            label: language.t("settings.connections.section.gateways"),
            hint: language.t("settings.connections.hint.gateways"),
            icon: "bubble-5",
          },
          {
            id: "github",
            label: language.t("settings.connections.section.github"),
            hint: language.t("settings.connections.hint.github"),
            icon: "github",
          },
        ]}
      />
      <Show when={props.section === "connectors"}>
        <SettingsConnectorsV2 active={props.active !== false} />
      </Show>
      <Show when={props.section === "gateways"}>
        <SettingsConnectionsV2 embedded active={props.active !== false} />
      </Show>
      <Show when={props.section === "github"}>
        <SettingsGithubV2 directory={props.directory} active={props.active !== false} />
      </Show>
    </>
  )
}
