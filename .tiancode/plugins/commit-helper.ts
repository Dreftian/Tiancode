// Local plugin: warns when a /commit command uses a non-conventional message.
//
// Export shape: `{ id, server }` default export (PluginModule in
// backend/plugin/src/index.ts) as consumed by readV1Plugin in
// backend/tiancode/src/plugin/shared.ts.

import type { PluginModule } from "@tiancode-ai/plugin"
import type { Part } from "@tiancode-ai/sdk"

const CONVENTIONAL_COMMIT = /^(feat|fix|docs|refactor|chore|test|build|ci|style|perf|revert)(\([a-z0-9_-]+\))?!?: .+/i

// Picks the first message passed via -m/--message, quoted or bare.
function commitMessage(command: string, args: string): string | undefined {
  const match = /(?:^|\s)(?:-m|--message)\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(`${command} ${args}`)
  if (!match) return
  return match[1] ?? match[2] ?? match[3]
}

const CommitHelper: PluginModule = {
  id: "commit-helper",
  server: async () => ({
    // Warning-only hook: we push a synthetic text part into `output.parts`
    // (the same array the runtime later resolves into the user message in
    // backend/tiancode/src/session/prompt.ts, which fills in id/messageID)
    // and never block the command.
    "command.execute.before": async (input, output) => {
      if (!input.command.startsWith("git commit")) return
      const message = commitMessage(input.command, input.arguments)
      if (!message) return // no -m message (editor flow) — nothing to check
      if (CONVENTIONAL_COMMIT.test(message)) return

      console.warn(`[commit-helper] non-conventional commit message: "${message}"`)
      const part = {
        type: "text" as const,
        synthetic: true,
        text: `[commit-helper] Warning: commit message is not in conventional format (expected feat(scope):, fix:, docs:, refactor:, chore:, test:, ...). Got: "${message}"`,
      }
      output.parts.push(part as Part)
    },
  }),
}

export default CommitHelper
