import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@tiancode-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~tiancode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~tiancode/WorkspaceRef", {
  defaultValue: () => undefined,
})
