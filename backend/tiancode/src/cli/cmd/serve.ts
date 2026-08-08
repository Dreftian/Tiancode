import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@tiancode-ai/core/flag/flag"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless tiancode server",
  // Server loads instances per-request via x-tiancode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.TIANCODE_SERVER_PASSWORD) {
      console.log("Warning: TIANCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    // El hostname por defecto es 127.0.0.1 (ver cli/network.ts): el servidor
    // solo se expone fuera de loopback cuando el usuario pasa --hostname
    // (p. ej. --hostname 0.0.0.0) o activa --mdns, y en ese caso siempre se
    // exige TIANCODE_SERVER_PASSWORD. No exponer un servidor sin password
    // fuera de loopback (p. ej. mDNS → 0.0.0.0).
    const hostname = opts.hostname
    const loopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
    if (!loopback && !Flag.TIANCODE_SERVER_PASSWORD) {
      return yield* Effect.die(
        new Error(
          `Refusing to listen on ${hostname} without TIANCODE_SERVER_PASSWORD. ` +
            "Set a password or use --hostname 127.0.0.1.",
        ),
      )
    }
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`tiancode server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})
