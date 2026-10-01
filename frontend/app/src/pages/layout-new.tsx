import { createEffect, createMemo, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { ResizeHandle } from "@tiancode-ai/ui/resize-handle"
import { useSettings } from "@/context/settings"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { PetCompanion } from "@/components/pet/pet-companion"
import { PreviewPanel } from "@/components/preview/preview-panel"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar/titlebar"
import { usePlatform } from "@/context/platform"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const settings = useSettings()
  const narrow = createMediaQuery("(max-width: 767px)")
  const [state, setState] = createStore({
    debugTools: true,
    verticalTabs: undefined as HTMLElement | undefined,
    sidebarWidth: readSidebarWidth(),
  })
  // Settings > Experimental > Tabs. Phones and narrow windows keep the horizontal strip.
  const vertical = createMemo(() => settings.appearance.tabLayout() === "vertical" && !narrow())

  createEffect(() => setV2Toast(true))

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar
        update={update}
        verticalTabs={vertical() ? state.verticalTabs : undefined}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <PreviewPanel />
      <PetCompanion />
      <div class="flex flex-1 min-h-0 min-w-0 flex-row">
        <Show when={vertical()}>
          <aside
            ref={(el) => setState("verticalTabs", el)}
            data-slot="vertical-tabs-sidebar"
            class="relative shrink-0 min-h-0 border-e-[0.5px] border-v2-border-border-base"
            style={{ width: `${state.sidebarWidth}px` }}
          >
            <ResizeHandle
              direction="horizontal"
              edge="end"
              size={state.sidebarWidth}
              min={SIDEBAR_MIN}
              max={SIDEBAR_MAX}
              onResize={(width) => {
                setState("sidebarWidth", width)
                writeSidebarWidth(width)
              }}
              class="absolute inset-y-0 -end-1 z-10 w-2"
            />
          </aside>
        </Show>
        <main class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
          <Suspense>{props.children}</Suspense>
        </main>
      </div>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}

const SIDEBAR_KEY = "tiancode.vertical-tabs.width"
const SIDEBAR_MIN = 140
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 260

function readSidebarWidth() {
  try {
    const value = Number(localStorage.getItem(SIDEBAR_KEY))
    return Number.isFinite(value) && value >= SIDEBAR_MIN && value <= SIDEBAR_MAX ? value : SIDEBAR_DEFAULT
  } catch {
    return SIDEBAR_DEFAULT
  }
}

function writeSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(Math.round(width)))
  } catch {
    // Without storage the width resets to the default on the next start.
  }
}
