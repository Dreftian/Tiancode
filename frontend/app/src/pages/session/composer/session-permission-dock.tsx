import { For, Show } from "solid-js"
import type { PermissionRequest } from "@tiancode-ai/sdk/v2"
import { Button } from "@tiancode-ai/ui/button"
import { DockPrompt } from "@tiancode-ai/session-ui/dock-prompt"
import { Icon } from "@tiancode-ai/ui/icon"
import { useLanguage } from "@/context/language"

type RiskThreat = { category: string; description: string; matched: string }

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  // AgentShield's critical matches (shell_risk): what the command would do, in the user's words.
  const threats = (): RiskThreat[] => {
    const risk = props.request.metadata?.risk
    if (!risk || typeof risk !== "object" || !("threats" in risk) || !Array.isArray(risk.threats)) return []
    return risk.threats.filter(
      (item): item is RiskThreat => typeof item === "object" && item !== null && typeof item.category === "string",
    )
  }
  const risky = () => props.request.permission === "shell_risk"
  const categoryLabel = (category: string) => {
    const key = `permission.risk.category.${category}`
    const value = language.t(key as Parameters<typeof language.t>[0])
    return value === key ? category : value
  }

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header" data-risk={risky() ? "high" : undefined}>
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">
            {language.t(risky() ? "permission.risk.title" : "notification.permission.title")}
          </div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Show when={!risky()}>
              <Button
                variant="secondary"
                size="normal"
                onClick={() => props.onDecide("always")}
                disabled={props.responding}
              >
                {language.t("ui.permission.allowAlways")}
              </Button>
            </Show>
            <Button variant="primary" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t(risky() ? "permission.risk.run" : "ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={toolDescription()}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{toolDescription()}</div>
        </div>
      </Show>

      <Show when={threats().length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <ul data-slot="permission-risks">
            <For each={threats()}>
              {(threat) => (
                <li>
                  <strong>{categoryLabel(threat.category)}</strong>
                  <code class="text-12-regular break-all">{threat.matched}</code>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={props.request.patterns.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.request.patterns}>
              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}
