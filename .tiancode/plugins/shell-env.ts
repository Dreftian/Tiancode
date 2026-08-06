// Local plugin: injects a marker env var into every shell subprocess.
//
// Export shape: `{ id, server }` default export (PluginModule in
// backend/plugin/src/index.ts) as consumed by readV1Plugin in
// backend/tiancode/src/plugin/shared.ts.

import type { PluginModule } from "@tiancode-ai/plugin"

const ShellEnv: PluginModule = {
  id: "shell-env",
  server: async () => ({
    // The runtime consumes the returned `env` and merges it into the shell
    // subprocess environment (backend/tiancode/src/session/prompt.ts,
    // backend/tiancode/src/tool/shell.ts, and the pty handler).
    "shell.env": async (input, output) => {
      output.env = { ...output.env, TIAN_PLUGIN_ENABLED: "1" }
    },
  }),
}

export default ShellEnv
