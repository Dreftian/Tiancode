// Local plugin: keeps secret files (env, keys, credentials) out of tool writes.
//
// Export shape follows what the runtime loads: the default export must be an
// object with `id` (required for file plugins) and `server(input) => Promise<Hooks>`
// (PluginModule in backend/plugin/src/index.ts; readV1Plugin/resolvePluginId in
// backend/tiancode/src/plugin/shared.ts). This differs from the display-only
// `{ name, session, tool, shell }` template shown in the frontend settings.

import type { PluginModule } from "@tiancode-ai/plugin"

// Basename patterns for secret material, matched case-insensitively so the
// guard also covers `.ENV`, `ID_RSA` etc.
const SECRET_FILE_PATTERNS = [
  /^\.env(\.|$)/, // .env, .env.local, .env.production, ...
  /\.pem$/,
  /^id_rsa/, // id_rsa, id_rsa.pub
  /^credentials.*\.json$/,
  /\.key$/,
  /^\.git-credentials$/,
]

function isSecretPath(filePath: string): boolean {
  const name = filePath.replaceAll("\\", "/").split("/").at(-1) ?? ""
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name.toLowerCase()))
}

const EnvGuard: PluginModule = {
  id: "env-guard",
  server: async () => ({
    // `tool.execute.before` cannot block execution: the runtime passes the
    // output `{ args }` by reference but never re-applies it to the tool call
    // (trigger sites in backend/tiancode/src/session/tools.ts), so we only warn
    // here and enforce the block through "permission.ask" below.
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write" && input.tool !== "apply_patch") return
      const filePath = output.args?.filePath
      if (typeof filePath !== "string" || !isSecretPath(filePath)) return
      console.warn(
        `[env-guard] attempted modification of secret file "${filePath}" via tool "${input.tool}" (session ${input.sessionID})`,
      )
    },

    // The designed deny channel for tools: the permission service consults
    // hooks before approving a request. NOTE: "permission.ask" is declared in
    // the Hooks interface (backend/plugin/src/index.ts) but is not invoked by
    // the current runtime yet; this starts blocking once it is wired up.
    "permission.ask": async (input, output) => {
      if (input.type !== "edit" && input.type !== "write" && input.type !== "apply_patch") return
      const patterns = Array.isArray(input.pattern) ? input.pattern : input.pattern ? [input.pattern] : []
      if (!patterns.some(isSecretPath)) return
      console.warn(`[env-guard] denying ${input.type} on secret path (session ${input.sessionID})`)
      output.status = "deny"
    },
  }),
}

export default EnvGuard
