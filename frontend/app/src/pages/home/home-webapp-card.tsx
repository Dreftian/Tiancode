import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@tiancode-ai/core/util/encode"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSDK } from "@/context/server-sdk"
import { useServer } from "@/context/server"

// Tarjeta de entrada al modo "Desarrollo Web y App": abre una carpeta como
// proyecto, navega a su sesión con ?agent=webapp (session.tsx lo aplica y
// preselecciona el agente) y el panel de vista en vivo se abre solo al enviar.
export function HomeWebAppCard() {
  const language = useLanguage()
  const navigate = useNavigate()
  const layout = useLayout()
  const server = useServer()
  const serverSDK = useServerSDK()
  const pickDirectory = useDirectoryPicker()

  const startWebApp = () => {
    const conn = serverSDK().server
    pickDirectory({
      server: conn,
      title: language.t("home.webapp.folderTitle") ?? language.t("command.project.open"),
      onSelect: (result) => {
        const directory = Array.isArray(result) ? result[0] : result
        if (!directory) return
        layout.projects.open(directory)
        server.projects.touch(directory)
        navigate(`/${base64Encode(directory)}/session?agent=webapp`)
      },
    })
  }

  return (
    <button
      data-action="home-webapp-start"
      class={`
        group relative flex w-full items-center gap-3 overflow-hidden rounded-[10px]
        border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3 text-left
        transition-colors hover:border-cyan-400/40 hover:bg-v2-background-bg-layer-02
      `}
      onClick={startWebApp}
    >
      <div
        class={`
          flex size-10 shrink-0 items-center justify-center rounded-lg
          bg-gradient-to-br from-cyan-400/15 via-sky-500/15 to-indigo-500/15
          border border-cyan-400/25 text-cyan-400
        `}
      >
        <IconV2 name="monitor" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] leading-5 text-v2-text-text-base [font-weight:530]">
          {language.t("home.webapp.title")}
        </div>
        <div class="truncate text-[12px] leading-4 text-v2-text-text-muted [font-weight:440]">
          {language.t("home.webapp.description")}
        </div>
      </div>
      <ButtonV2
        variant="neutral"
        size="normal"
        class="h-7 shrink-0 px-2 [font-weight:530]"
        tabindex={-1}
        onClick={(event: MouseEvent) => {
          event.stopPropagation()
          startWebApp()
        }}
      >
        {language.t("home.webapp.action")}
      </ButtonV2>
    </button>
  )
}
