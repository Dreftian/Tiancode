// Local plugin: logs (and later notifies) when a session goes idle on Windows.
//
// Export shape: `{ id, server }` default export (PluginModule in
// backend/plugin/src/index.ts) as consumed by readV1Plugin in
// backend/tiancode/src/plugin/shared.ts.
//
// There is no `session.idle` hook: idle is delivered as an event through the
// single `Hooks.event` hook (`EventSessionIdle` in backend/sdk/js/src/gen/types.gen.ts).

import type { PluginModule } from "@tiancode-ai/plugin"

const NotifyIdle: PluginModule = {
  id: "notify-idle",
  server: async () => ({
    event: async (input) => {
      if (input.event.type !== "session.idle") return
      const sessionID = input.event.properties.sessionID
      if (process.platform !== "win32") return

      // TODO: surface a real desktop notification once the runtime exposes an
      // API for it — the agent process has no Notification mechanism today
      // (frontend/desktop renders the TUI, it does not run here).
      console.log(`[notify-idle] session ${sessionID} went idle (win32)`)
    },
  }),
}

export default NotifyIdle
