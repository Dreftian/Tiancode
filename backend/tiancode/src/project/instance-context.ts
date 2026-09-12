import { LocalContext } from "@/util/local-context"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { isFilesystemRoot } from "@tiancode-ai/core/util/path"
import type * as Project from "./project"

export interface InstanceContext {
  directory: string
  worktree: string
  project: Project.Info
}

export const context = LocalContext.create<InstanceContext>("instance")

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 */
export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (FSUtil.contains(ctx.directory, filepath)) return true
  // A worktree at a filesystem root ("/" or "C:\") would match ANY absolute path.
  // Skip the worktree check in that case to preserve external_directory permissions.
  if (isFilesystemRoot(ctx.worktree)) return false
  return FSUtil.contains(ctx.worktree, filepath)
}
