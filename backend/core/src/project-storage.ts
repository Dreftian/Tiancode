import path from "node:path"
import { createHash } from "node:crypto"

/** App-owned storage, isolated by worktree even for repositories with the same name. */
export function projectStoragePath(config: string, directory: string) {
  const resolved = path.resolve(directory)
  const identity = process.platform === "win32" ? resolved.toLowerCase() : resolved
  return path.join(config, "projects", createHash("sha256").update(identity).digest("hex"))
}
