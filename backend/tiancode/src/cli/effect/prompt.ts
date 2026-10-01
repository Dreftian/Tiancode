import * as prompts from "@clack/prompts"
import { Effect, Option } from "effect"
import { CliError } from "../effect-cmd"

export const intro = (msg: string) => Effect.sync(() => prompts.intro(msg))
export const outro = (msg: string) => Effect.sync(() => prompts.outro(msg))

export const log = {
  info: (msg: string) => Effect.sync(() => prompts.log.info(msg)),
  error: (msg: string) => Effect.sync(() => prompts.log.error(msg)),
  warn: (msg: string) => Effect.sync(() => prompts.log.warn(msg)),
  success: (msg: string) => Effect.sync(() => prompts.log.success(msg)),
}

const optional = <Value>(result: Value | symbol) => {
  if (prompts.isCancel(result)) return Option.none<Value>()
  return Option.some(result)
}

// Without a terminal clack waits for an answer that never comes (`auth login` in a script hung
// forever), so a question asked there fails at once and says what to do instead.
const ask = <Value>(run: () => Promise<Value | symbol>) =>
  process.stdin.isTTY
    ? Effect.promise(run).pipe(Effect.map((result) => optional(result)))
    : Effect.die(
        new CliError({
          message:
            "This step needs an interactive terminal. Run it in a terminal, or in scripts set the provider's API key environment variable instead (e.g. ANTHROPIC_API_KEY).",
        }),
      )

export const select = <Value>(opts: Parameters<typeof prompts.select<Value>>[0]) => ask(() => prompts.select(opts))

export const autocomplete = <Value>(opts: Parameters<typeof prompts.autocomplete<Value>>[0]) =>
  ask(() => prompts.autocomplete(opts))

export const text = (opts: Parameters<typeof prompts.text>[0]) => ask(() => prompts.text(opts))

export const password = (opts: Parameters<typeof prompts.password>[0]) => ask(() => prompts.password(opts))

export const spinner = () => {
  const s = prompts.spinner()
  return {
    start: (msg: string) => Effect.sync(() => s.start(msg)),
    stop: (msg: string, code?: number) => Effect.sync(() => s.stop(msg, code)),
  }
}
