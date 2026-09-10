import { createMemo, ErrorBoundary, Show, type ParentProps } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { ServerConnection, serverName, useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { useTabs } from "@/context/tabs"
import { ErrorPage } from "@/pages/error"
import { isLocalSessionNotFoundError, isSessionNotFoundError } from "@/utils/server-errors"
import { SessionPanelFrame, SessionRouteFrame } from "./session-frames"

// Error handling for the session route: a session that no longer exists gets a dedicated
// screen with a way out (close the tab), and anything else falls through to the generic
// error page.

function isCurrentSessionNotFoundError(error: unknown, sessionID: string | undefined) {
  if (!sessionID) return false
  return isSessionNotFoundError(error, sessionID) || isLocalSessionNotFoundError(error, sessionID)
}

export function SessionRouteErrorBoundary(
  props: ParentProps<{ sessionID?: string; serverKey?: ServerConnection.Key; padded?: boolean }>,
) {
  const settings = useSettings()
  return (
    <ErrorBoundary
      fallback={(error) =>
        settings.general.newLayoutDesigns() ? (
          <SessionRouteFrame padded={props.padded}>
            <SessionPanelFrame newLayout raised={!!props.sessionID}>
              <SessionErrorFallback error={error} sessionID={props.sessionID} serverKey={props.serverKey} />
            </SessionPanelFrame>
          </SessionRouteFrame>
        ) : (
          <ErrorPage error={error} />
        )
      }
    >
      {props.children}
    </ErrorBoundary>
  )
}

export function SessionErrorFallback(props: { error: unknown; sessionID?: string; serverKey?: ServerConnection.Key }) {
  const language = useLanguage()
  const server = useServer()
  const tabs = useTabs()
  const displayServer = createMemo(() => {
    const key = props.serverKey ?? server.key
    const conn = server.list.find((item) => ServerConnection.key(item) === key)
    return conn ? serverName(conn) : key
  })
  const closeTab = () => {
    if (!props.sessionID) return
    tabs.removeSessionTab({ server: props.serverKey ?? server.key, sessionId: props.sessionID })
  }
  if (isCurrentSessionNotFoundError(props.error, props.sessionID)) {
    return (
      <div class="flex-1 min-h-0 overflow-hidden">
        <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-4">
          <div class="flex flex-col items-center gap-2">
            <div class="text-16-medium text-text max-w-md">{language.t("session.error.notFound")}</div>
            <div class="text-13-regular text-text-weak max-w-md">
              {language.t("session.error.notFound.description")}
            </div>
          </div>
          <Show when={props.sessionID}>
            {(sessionID) => (
              <div class="max-w-full flex flex-col items-center gap-1">
                <div class="max-w-full text-11-regular text-text-faint break-all">{displayServer()}</div>
                <code class="max-w-full rounded-[4px] px-1 py-0.5 font-mono text-xs font-medium leading-4 text-text-base break-all bg-[color-mix(in_oklch,var(--v2-text-text-base)_8%,transparent)]">
                  {sessionID()}
                </code>
              </div>
            )}
          </Show>
          <ButtonV2 variant="neutral" size="normal" icon="xmark-small" onClick={closeTab}>
            {language.t("session.error.notFound.closeTab")}
          </ButtonV2>
        </div>
      </div>
    )
  }
  return <ErrorPage error={props.error} />
}
