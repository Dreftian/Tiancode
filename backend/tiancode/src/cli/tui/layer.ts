import { run as runTui, type TuiInput } from "@tiancode-ai/tui"
import { Global } from "@tiancode-ai/core/global"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
