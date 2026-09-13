import type { Part as PartType, ToolPart } from "@tiancode-ai/sdk/v2"

function deletionOnly(part: ToolPart) {
  if (!("metadata" in part.state)) return false
  const metadata = part.state.metadata
  if (!metadata) return false

  const files = metadata.files
  if (Array.isArray(files) && files.length > 0) {
    return files.every((file) => !!file && typeof file === "object" && "type" in file && file.type === "delete")
  }

  const filediff = metadata.filediff
  if (!filediff || typeof filediff !== "object") return false
  if (!("additions" in filediff) || !("deletions" in filediff)) return false
  return filediff.additions === 0 && typeof filediff.deletions === "number" && filediff.deletions > 0
}

// `all` widens auto-open to every tool part, not just shell and the edit family.
// Without it a "detailed" transcript renders identically to a plain shell+edit
// transcript in a read-heavy session, because everything else returned undefined.
// The edit family keeps its exception even under `all`: a pure deletion carries
// nothing worth reading, so 1200 removed lines still open collapsed.
export function partDefaultOpen(part: PartType, shell = false, edit = false, all = false) {
  if (part.type !== "tool") return
  if (part.tool === "bash" || part.tool === "shell") return shell || all
  if (part.tool === "edit" || part.tool === "write" || part.tool === "patch" || part.tool === "apply_patch") {
    if (!edit && !all) return false
    return !deletionOnly(part)
  }
  if (all) return true
}
