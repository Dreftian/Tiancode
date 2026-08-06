export * as File from "./file"

import { Revert } from "@tiancode-ai/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
