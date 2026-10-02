export * as DecisionEngine from "./engine"

import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { Context, Duration, Effect, Layer, Option, Schedule, Semaphore } from "effect"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { Global } from "@tiancode-ai/core/global"
import { DecisionSequence, type Question } from "./sequence"
import { DecisionTokenizer } from "./tokenizer"

/**
 * Local decisions with laya-multilingual (Convai Innovations, Apache-2.0): a 322M-parameter
 * encoder that answers typed questions about a text in one forward pass, offline, in 100+
 * languages. The int8 ONNX export (about 360 MB with its tokenizer) is downloaded on request,
 * pinned to a revision and checked by SHA-256; the runtime is the onnxruntime-node the desktop
 * app already ships. Nothing is sent anywhere once the files are on disk.
 */
export const MODEL = {
  name: "laya-multilingual (int8)",
  repo: "soyelmismo/laya-multilingual-onnx",
  base: "convaiinnovations/laya-multilingual",
  revision: "0966c4fa58da6878b39e7e14cb5e93313b82d828",
  files: [
    {
      name: "model.onnx",
      bytes: 325_734_062,
      sha256: "d389d2304822a59569387e257067360a84e016aed43b407f1cfde87dadb7e485",
    },
    {
      name: "tokenizer.json",
      bytes: 34_363_188,
      sha256: "609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f",
    },
  ],
  maxLen: 1024,
  headMaxLen: 256,
} as const

const TOTAL_BYTES = MODEL.files.reduce((sum, file) => sum + file.bytes, 0)
// Loaded weights hold about 0.6 GB; they are released after this long without a question.
const IDLE_UNLOAD_MS = 10 * 60 * 1000
const RUNTIME = ["onnxruntime", "node"].join("-")

export type State = "unavailable" | "missing" | "downloading" | "ready" | "error"

export interface Status {
  readonly state: State
  readonly loaded: boolean
  readonly totalBytes: number
  readonly receivedBytes: number
  readonly message?: string
  readonly loadMs?: number
}

export interface Answer {
  readonly choice: string
  readonly confidence: number
  readonly probabilities: Record<string, number>
  readonly ms: number
}

export interface Interface {
  readonly status: () => Effect.Effect<Status>
  /** Starts the download in the background; the status reports its progress. */
  readonly install: () => Effect.Effect<Status>
  readonly cancel: () => Effect.Effect<Status>
  readonly remove: () => Effect.Effect<Status>
  /** None when the model is not installed, could not load or took longer than `timeout`. */
  readonly decide: (text: string, question: Question, timeoutMs?: number) => Effect.Effect<Option.Option<Answer>>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/DecisionEngine") {}

type OrtTensor = { readonly data: unknown }
type OrtSession = {
  run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>>
  release: () => Promise<void>
}
type Ort = {
  Tensor: new (type: string, data: BigInt64Array | Uint8Array, dims: number[]) => OrtTensor
  InferenceSession: { create: (path: string, options: Record<string, unknown>) => Promise<OrtSession> }
}

type Loaded = { ort: Ort; session: OrtSession; tok: DecisionTokenizer.Tokenizer; loadMs: number }

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const dir = path.join(Global.Path.data, "decision", "laya-multilingual-int8")
    const lock = Semaphore.makeUnsafe(1)
    const state = {
      download: undefined as { controller: AbortController; received: number } | undefined,
      error: undefined as string | undefined,
      loaded: undefined as Loaded | undefined,
      // A load outlives a caller's timeout; later callers wait for it instead of opening a second copy.
      loading: undefined as Promise<Loaded> | undefined,
      lastUsed: 0,
    }

    const runtimeAvailable = () => {
      try {
        createRequire(import.meta.url).resolve(RUNTIME)
        return true
      } catch {
        return false
      }
    }

    const installed = () =>
      Effect.promise(() =>
        Promise.all(
          MODEL.files.map((file) =>
            stat(path.join(dir, file.name)).then(
              (info) => info.size === file.bytes,
              () => false,
            ),
          ),
        ),
      ).pipe(Effect.map((sizes) => sizes.every(Boolean)))

    const status = Effect.fn("DecisionEngine.status")(function* () {
      const base = {
        loaded: state.loaded !== undefined,
        totalBytes: TOTAL_BYTES,
        receivedBytes: 0,
        loadMs: state.loaded?.loadMs,
      }
      const result: Status = !runtimeAvailable()
        ? { ...base, state: "unavailable" }
        : state.download
          ? { ...base, state: "downloading", receivedBytes: state.download.received }
          : state.error
            ? { ...base, state: "error", message: state.error }
            : (yield* installed())
              ? { ...base, state: "ready", receivedBytes: TOTAL_BYTES }
              : { ...base, state: "missing" }
      return result
    })

    const download = (controller: AbortController) =>
      Effect.tryPromise({
        try: async () => {
          await mkdir(dir, { recursive: true })
          const done: number[] = []
          for (const file of MODEL.files) {
            const target = path.join(dir, file.name)
            const ready = await stat(target).then(
              (info) => info.size === file.bytes,
              () => false,
            )
            if (ready) {
              done.push(file.bytes)
              continue
            }
            const part = `${target}.part`
            const offset = await stat(part).then(
              (info) => (info.size < file.bytes ? info.size : 0),
              () => 0,
            )
            const url = `https://huggingface.co/${MODEL.repo}/resolve/${MODEL.revision}/${file.name}`
            const response = await fetch(url, {
              headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
              redirect: "follow",
              signal: controller.signal,
            })
            if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} downloading ${file.name}`)
            const resuming = response.status === 206
            let received = resuming ? offset : 0
            const sum = () => done.reduce((a, b) => a + b, 0)
            const counted = Readable.fromWeb(response.body as never).on("data", (chunk: Buffer) => {
              received += chunk.byteLength
              if (state.download) state.download.received = sum() + received
            })
            await pipeline(counted, createWriteStream(part, { flags: resuming ? "a" : "w" }), {
              signal: controller.signal,
            })
            const digest = createHash("sha256")
            await pipeline(createReadStream(part), digest)
            if (digest.digest("hex") !== file.sha256) {
              await rm(part, { force: true })
              throw new Error(`${file.name} did not match its SHA-256; it was discarded`)
            }
            await rename(part, target)
            done.push(file.bytes)
          }
        },
        catch: (error) => (error instanceof Error ? error.message : String(error)),
      })

    const install = Effect.fn("DecisionEngine.install")(function* () {
      if (!runtimeAvailable() || state.download) return yield* status()
      const controller = new AbortController()
      state.download = { controller, received: 0 }
      state.error = undefined
      yield* download(controller).pipe(
        Effect.catch((message) =>
          Effect.sync(() => {
            if (!controller.signal.aborted) state.error = message
          }).pipe(Effect.andThen(Effect.logWarning("decision model download failed", { message }))),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (state.download?.controller === controller) state.download = undefined
          }),
        ),
        Effect.forkDetach,
      )
      return yield* status()
    })

    const cancel = Effect.fn("DecisionEngine.cancel")(function* () {
      state.download?.controller.abort()
      state.download = undefined
      return yield* status()
    })

    const unload = Effect.promise(async () => {
      const loaded = state.loaded
      state.loaded = undefined
      await loaded?.session.release().catch(() => undefined)
    })

    const remove = Effect.fn("DecisionEngine.remove")(function* () {
      state.download?.controller.abort()
      state.download = undefined
      state.error = undefined
      yield* lock.withPermits(1)(unload)
      yield* Effect.promise(() => rm(dir, { recursive: true, force: true }))
      return yield* status()
    })

    const open = async () => {
      const started = performance.now()
      const required: unknown = createRequire(import.meta.url)(RUNTIME)
      const ort = required as Ort
      const tok = DecisionTokenizer.parse(JSON.parse(await readFile(path.join(dir, "tokenizer.json"), "utf8")))
      if (!tok) throw new Error("the tokenizer could not be read")
      // Leave cores for the editor and for a local llama-server.
      const threads = Math.max(1, Math.min(4, Math.floor(os.availableParallelism() / 2)))
      const session = await ort.InferenceSession.create(path.join(dir, "model.onnx"), {
        intraOpNumThreads: threads,
        interOpNumThreads: 1,
        graphOptimizationLevel: "all",
      })
      state.loaded = { ort, session, tok, loadMs: Math.round(performance.now() - started) }
      // Counted as a use, or the idle check would release weights a timed-out caller just loaded.
      state.lastUsed = Date.now()
      return state.loaded
    }

    const load = Effect.tryPromise({
      try: () => {
        if (state.loaded) return Promise.resolve(state.loaded)
        state.loading ??= open().finally(() => {
          state.loading = undefined
        })
        return state.loading
      },
      catch: (error) => (error instanceof Error ? error.message : String(error)),
    })

    const run = (text: string, question: Question) =>
      Effect.gen(function* () {
        const engine = yield* load
        const started = performance.now()
        const seq = DecisionSequence.build(engine.tok, text, question, MODEL.maxLen, MODEL.headMaxLen)
        const length = seq.ids.length
        const count = seq.markers.length
        const output = yield* Effect.tryPromise({
          try: () =>
            engine.session.run({
              input_ids: new engine.ort.Tensor("int64", BigInt64Array.from(seq.ids, BigInt), [1, length]),
              attention_mask: new engine.ort.Tensor("int64", new BigInt64Array(length).fill(1n), [1, length]),
              marker_pos: new engine.ort.Tensor("int64", BigInt64Array.from(seq.markers, BigInt), [1, count]),
              marker_mask: new engine.ort.Tensor("bool", new Uint8Array(count).fill(1), [1, count]),
              qtype: new engine.ort.Tensor(
                "int64",
                BigInt64Array.from([BigInt(DecisionSequence.QUESTION_TYPE[question.type])]),
                [1],
              ),
            }),
          catch: (error) => (error instanceof Error ? error.message : String(error)),
        })
        const logits = output.logits?.data
        if (!(logits instanceof Float32Array)) return yield* Effect.fail("the model returned no logits")
        const probabilities = DecisionSequence.softmax(Array.from(logits.slice(0, count)))
        const labels = DecisionSequence.labels(question)
        const best = probabilities.indexOf(Math.max(...probabilities))
        state.lastUsed = Date.now()
        return {
          choice: labels[best] ?? "",
          confidence: Math.round(probabilities[best] * 1000) / 1000,
          probabilities: Object.fromEntries(
            labels.map((label, i) => [label, Math.round((probabilities[i] ?? 0) * 1000) / 1000]),
          ),
          ms: Math.round(performance.now() - started),
        } satisfies Answer
      })

    const decide = Effect.fn("DecisionEngine.decide")(function* (text: string, question: Question, timeoutMs?: number) {
      if (!runtimeAvailable() || state.download || !(yield* installed())) return Option.none<Answer>()
      return yield* lock
        .withPermits(1)(run(text, question))
        .pipe(
          Effect.map(Option.some),
          Effect.catch((message) =>
            Effect.logWarning("local decision failed", { message }).pipe(Effect.as(Option.none<Answer>())),
          ),
          Effect.timeoutOption(Duration.millis(timeoutMs ?? 30_000)),
          Effect.map(Option.flatten),
        )
    })

    // Release the weights after a quiet spell; the next question loads them again.
    yield* Effect.gen(function* () {
      if (!state.loaded || Date.now() - state.lastUsed < IDLE_UNLOAD_MS) return
      yield* lock.withPermits(1)(unload)
      yield* Effect.logInfo("decision model unloaded after idle")
    }).pipe(Effect.repeat(Schedule.spaced(Duration.minutes(1))), Effect.forkScoped)
    yield* Effect.addFinalizer(() => unload)

    return Service.of({ status, install, cancel, remove, decide })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
