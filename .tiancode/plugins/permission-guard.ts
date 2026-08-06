// Local plugin: auto-denies dangerous shell commands at the permission layer.
//
// Export shape: `{ id, server }` default export (PluginModule in
// backend/plugin/src/index.ts) as consumed by readV1Plugin in
// backend/tiancode/src/plugin/shared.ts.

import type { PluginModule } from "@tiancode-ai/plugin"

// Patterns whose matches must never run unattended. `rm -rf` on the filesystem
// root, $HOME or the current user's home; forced pushes; sudo escalation; and
// destructive Windows commands (format, diskpart, del /s /q).
const DANGEROUS_COMMAND = [
  /^\s*rm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~|\$HOME)(\/|\s|$)/,
  /git\s+push\s+(-f|--force)(\s|$)/,
  /^\s*sudo(\s|$)/,
  /^\s*(format|diskpart)(\s|$)/,
  /^\s*del\s+\/s\s+\/q/i,
]

function isDangerous(command: string): boolean {
  return DANGEROUS_COMMAND.some((pattern) => pattern.test(command))
}

const PermissionGuard: PluginModule = {
  id: "permission-guard",
  server: async () => ({
    // The shell tool puts the raw command line in `input.metadata.command`
    // (ShellTool.ask in backend/tiancode/src/tool/shell.ts; permission type is
    // "bash"). NOTE: "permission.ask" is declared in the Hooks interface
    // (backend/plugin/src/index.ts) but is not invoked by the current runtime
    // yet; this starts denying once it is wired up.
    "permission.ask": async (input, output) => {
      const command =
        typeof input.metadata.command === "string"
          ? input.metadata.command
          : typeof input.pattern === "string"
            ? input.pattern
            : ""
      if (!command || !isDangerous(command)) return
      console.warn(`[permission-guard] denying dangerous command: ${command}`)
      output.status = "deny"
    },
  }),
}

export default PermissionGuard
