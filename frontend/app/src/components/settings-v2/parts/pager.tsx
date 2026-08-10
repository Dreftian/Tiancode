import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import type { Component } from "solid-js"
import { useLanguage } from "@/context/language"

// Paginador compacto para listas largas de settings (MCP, sub-agents…):
// anterior/siguiente con la página actual. Evita el scroll infinito.
export const SettingsPagerV2: Component<{
  page: number
  totalPages: number
  onPage: (page: number) => void
}> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-pager" role="navigation" aria-label={language.t("settings.pagination.label")}>
      <ButtonV2
        type="button"
        variant="outline"
        size="small"
        disabled={props.page <= 1}
        onClick={() => props.onPage(props.page - 1)}
      >
        {language.t("settings.pagination.previous")}
      </ButtonV2>
      <span class="settings-v2-pager-page">
        {language.t("settings.pagination.page", { current: props.page, total: props.totalPages })}
      </span>
      <ButtonV2
        type="button"
        variant="outline"
        size="small"
        disabled={props.page >= props.totalPages}
        onClick={() => props.onPage(props.page + 1)}
      >
        {language.t("settings.pagination.next")}
      </ButtonV2>
    </div>
  )
}
