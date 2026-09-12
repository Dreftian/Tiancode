// The native @parcel/watcher binding, on its own, with no other imports.
//
// The loader used to live inside ./watcher.ts, which pulls Effect, Config, Git, Location and the
// event bus in at module scope — so anything that only wants to watch a directory (the live
// preview, for one) had to drag the whole session runtime along or hand-roll its own require.
// Hand-rolling is not an option: the `@parcel/watcher-<platform>-<arch>` binding packages are
// declared by backend/core and frontend/desktop but NOT by backend/tiancode, so a copy of this
// require placed in backend/tiancode would resolve in the bundle and fail from source.

// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper"
import type ParcelWatcher from "@parcel/watcher"
import { lazy } from "../util/lazy"

// Defined by backend/tiancode/script/build.ts for linux (and as "" elsewhere), and not defined at
// all by script/build-node.ts — so the typeof guard below is load-bearing, not decoration.
declare const TIANCODE_LIBC: string | undefined

/** The platform binding, or undefined when it is missing — callers must have a fallback. */
export const native = lazy((): typeof import("@parcel/watcher") | undefined => {
  try {
    const libc = typeof TIANCODE_LIBC === "undefined" ? undefined : TIANCODE_LIBC
    const binding = require(
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${libc || "glibc"}` : ""}`,
    )
    return createWrapper(binding) as typeof import("@parcel/watcher")
  } catch {
    return
  }
})

/** The watcher backend for this platform, or undefined where parcel has none. */
export function backend(): ParcelWatcher.BackendType | undefined {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
}
