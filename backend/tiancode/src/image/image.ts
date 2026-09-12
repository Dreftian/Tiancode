import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { Config } from "@/config/config"
import { SessionV1 } from "@tiancode-ai/core/v1/session"
import type { MessageV2 } from "@/session/message-v2"
import photonWasm from "@silvia-odwyer/photon-node/photon_rs_bg.wasm" with { type: "file" }
import { Context, Effect, Layer, Option, Schema } from "effect"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const MAX_BASE64_BYTES = 5 * 1024 * 1024
const MAX_WIDTH = 2000
const MAX_HEIGHT = 2000
const AUTO_RESIZE = true
const JPEG_QUALITIES = [80, 85, 70, 55, 40]
const PHOTON_WASM = "photon_rs_bg.wasm"

function fromUrl(file: string, base: string) {
  try {
    return fileURLToPath(new URL(file, base))
  } catch {
    return undefined
  }
}

// The bundler emits the wasm next to the bundle, so the import usually points
// at it. When a packaging step moves assets around, look for it instead: the
// only fallback the patched module has is its own __dirname, which Bun bakes to
// the build machine's node_modules and does not exist on the user's machine.
function photonWasmPath() {
  const baked = path.isAbsolute(photonWasm) ? photonWasm : fromUrl(photonWasm, import.meta.url)
  const resources = (process as typeof process & { resourcesPath?: string }).resourcesPath
  return (
    [
      baked,
      fromUrl(`./${PHOTON_WASM}`, import.meta.url),
      ...(resources ? [path.join(resources, PHOTON_WASM), path.join(resources, "app.asar.unpacked", PHOTON_WASM)] : []),
    ].find((candidate) => candidate !== undefined && existsSync(candidate)) ?? baked
  )
}

export class ResizerUnavailableError extends Schema.TaggedErrorClass<ResizerUnavailableError>()(
  "ImageResizerUnavailableError",
  {},
) {
  override get message() {
    return "Image resizer is unavailable"
  }
}

export class InvalidDataUrlError extends Schema.TaggedErrorClass<InvalidDataUrlError>()("ImageInvalidDataUrlError", {
  url: Schema.String,
}) {
  override get message() {
    return "Image URL must be a base64 data URL"
  }
}

export class DecodeError extends Schema.TaggedErrorClass<DecodeError>()("ImageDecodeError", {}) {
  override get message() {
    return "Image could not be decoded"
  }
}

export class SizeError extends Schema.TaggedErrorClass<SizeError>()("ImageSizeError", {
  bytes: Schema.Number,
  max: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  max_width: Schema.Number,
  max_height: Schema.Number,
  resizable: Schema.optional(Schema.Boolean),
}) {
  override get message() {
    // With no resizer the dimensions were never read, so size is the only fact.
    if (this.resizable === false)
      return `Image with base64 size ${this.bytes} exceeds the ${this.max} byte limit and the image resizer is unavailable`
    return `Image ${this.width}x${this.height} with base64 size ${this.bytes} exceeds configured limits and could not be resized below ${this.max_width}x${this.max_height}/${this.max} bytes`
  }
}

export type Error = ResizerUnavailableError | InvalidDataUrlError | DecodeError | SizeError

/**
 * What to do with an attachment when there is no resizer: anything already
 * within the limit goes through untouched, anything larger has to fail here.
 * Forwarding it only buys an unexplained provider 400.
 *
 * @internal Exported for testing
 */
export function oversizedWithoutResizer(
  bytes: number,
  limits: { maxWidth: number; maxHeight: number; maxBase64Bytes: number },
) {
  if (bytes <= limits.maxBase64Bytes) return undefined
  return new SizeError({
    bytes,
    max: limits.maxBase64Bytes,
    width: 0,
    height: 0,
    max_width: limits.maxWidth,
    max_height: limits.maxHeight,
    resizable: false,
  })
}

export interface Interface {
  readonly normalize: (input: SessionV1.FilePart) => Effect.Effect<SessionV1.FilePart, Error>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Image") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const loadPhoton = yield* Effect.cached(
      Effect.sync(() => {
        // Patched photon-node reads this during module init so Bun compiled binaries use the embedded wasm path.
        // The name comes from the patch itself (backend/tools/patches), which still says __OPENCODE_*.
        ;(globalThis as typeof globalThis & { __OPENCODE_PHOTON_WASM_PATH?: string }).__OPENCODE_PHOTON_WASM_PATH =
          photonWasmPath()
      }).pipe(
        Effect.andThen(() => Effect.tryPromise(() => import("@silvia-odwyer/photon-node"))),
        Effect.tapError((error) => Effect.logWarning("failed to load photon", { error })),
        Effect.mapError(() => new ResizerUnavailableError()),
      ),
    )

    const normalize = Effect.fn("Image.normalize")(function* (input: SessionV1.FilePart) {
      const image = (yield* config.get()).attachment?.image
      const info = {
        autoResize: image?.auto_resize ?? AUTO_RESIZE,
        maxWidth: image?.max_width ?? MAX_WIDTH,
        maxHeight: image?.max_height ?? MAX_HEIGHT,
        maxBase64Bytes: image?.max_base64_bytes ?? MAX_BASE64_BYTES,
      }
      if (!input.url.startsWith("data:") || !input.url.includes(";base64,"))
        return yield* new InvalidDataUrlError({ url: input.url })

      const base64 = input.url.slice(input.url.indexOf(";base64,") + ";base64,".length)
      const bytes = Buffer.byteLength(base64, "utf8")

      const loaded = yield* loadPhoton.pipe(Effect.option)
      if (Option.isNone(loaded)) {
        const oversized = oversizedWithoutResizer(bytes, info)
        if (oversized) return yield* oversized
        return input
      }
      const photon = loaded.value

      const decoded = yield* Effect.try({
        try: () => photon.PhotonImage.new_from_byteslice(Buffer.from(base64, "base64")),
        catch: () => new DecodeError(),
      }).pipe(Effect.tapError((error) => Effect.logWarning("failed to decode image", { error })))

      try {
        const originalWidth = decoded.get_width()
        const originalHeight = decoded.get_height()
        if (originalWidth <= info.maxWidth && originalHeight <= info.maxHeight && bytes <= info.maxBase64Bytes)
          return input
        if (!info.autoResize)
          return yield* new SizeError({
            bytes,
            max: info.maxBase64Bytes,
            width: originalWidth,
            height: originalHeight,
            max_width: info.maxWidth,
            max_height: info.maxHeight,
          })

        const scale = Math.min(1, info.maxWidth / originalWidth, info.maxHeight / originalHeight)
        for (const size of Array.from({ length: 32 }).reduce<Array<{ width: number; height: number }>>((acc) => {
          const previous = acc.at(-1) ?? {
            width: Math.max(1, Math.round(originalWidth * scale)),
            height: Math.max(1, Math.round(originalHeight * scale)),
          }
          const next =
            acc.length === 0
              ? previous
              : {
                  width: previous.width === 1 ? 1 : Math.max(1, Math.floor(previous.width * 0.75)),
                  height: previous.height === 1 ? 1 : Math.max(1, Math.floor(previous.height * 0.75)),
                }
          return acc.some((item) => item.width === next.width && item.height === next.height) ? acc : [...acc, next]
        }, [])) {
          const resized = photon.resize(decoded, size.width, size.height, photon.SamplingFilter.Lanczos3)
          const candidate = [
            { data: Buffer.from(resized.get_bytes()).toString("base64"), mime: "image/png" },
            ...JPEG_QUALITIES.map((quality) => ({
              data: Buffer.from(resized.get_bytes_jpeg(quality)).toString("base64"),
              mime: "image/jpeg",
            })),
          ]
            .map((item) => ({ ...item, bytes: Buffer.byteLength(item.data, "utf8") }))
            .find((item) => item.bytes <= info.maxBase64Bytes)
          resized.free()

          if (candidate) {
            yield* Effect.logInfo("using resized image", {
              from_mime: input.mime,
              to_mime: candidate.mime,
              from: `${originalWidth}x${originalHeight}`,
              to: `${size.width}x${size.height}`,
            })
            return {
              ...input,
              mime: candidate.mime,
              url: `data:${candidate.mime};base64,${candidate.data}`,
            }
          }
        }

        return yield* new SizeError({
          bytes,
          max: info.maxBase64Bytes,
          width: originalWidth,
          height: originalHeight,
          max_width: info.maxWidth,
          max_height: info.maxHeight,
        })
      } finally {
        decoded.free()
      }
    })

    return Service.of({ normalize })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [Config.node] })

export * as Image from "./image"
