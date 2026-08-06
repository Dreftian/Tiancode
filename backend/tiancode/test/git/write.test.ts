import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { describe, expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { Git } from "../../src/git"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Git.node])))

const scopedTmpdir = (options?: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const run = Effect.fnUntraced(function* (svc: Git.Interface, cwd: string, args: string[]) {
  const result = yield* svc.run(args, { cwd })
  if (result.exitCode !== 0)
    return yield* Effect.die(new Error(`git ${args.join(" ")} failed: ${result.stderr.toString("utf8")}`))
})

describe("Git write", () => {
  it.live("add(), commit(), remoteUrl(), push(), pull() and clone() work end to end", () =>
    Effect.gen(function* () {
      const remote = yield* scopedTmpdir()
      const tmp = yield* scopedTmpdir({ git: true })
      const svc = yield* Git.Service
      const bare = path.join(remote.path, "bare.git")

      yield* run(svc, remote.path, ["init", "--bare", bare])

      // remoteUrl: no origin yet -> undefined
      const before = yield* svc.remoteUrl(tmp.path)
      expect(before).toBeUndefined()

      yield* run(svc, tmp.path, ["remote", "add", "origin", bare])
      yield* run(svc, tmp.path, ["config", "user.email", "test@example.com"])
      yield* run(svc, tmp.path, ["config", "user.name", "test"])

      yield* Effect.promise(() => Bun.write(path.join(tmp.path, "file.txt"), "hello\n"))
      const added = yield* svc.add(tmp.path)
      expect(added.exitCode).toBe(0)

      const committed = yield* svc.commit(tmp.path, "initial commit")
      expect(committed.success).toBe(true)
      expect(committed.nothingToCommit).toBe(false)

      // nothing to commit is not an error
      const again = yield* svc.commit(tmp.path, "again")
      expect(again.success).toBe(true)
      expect(again.nothingToCommit).toBe(true)

      const url = yield* svc.remoteUrl(tmp.path)
      expect(url).toBe(bare)

      const pushed = yield* svc.push(tmp.path)
      expect(pushed.exitCode).toBe(0)

      // force flag is accepted
      const forced = yield* svc.push(tmp.path, { force: true })
      expect(forced.exitCode).toBe(0)

      // clone with explicit branch into a new directory
      const target = yield* scopedTmpdir()
      const checkout = path.join(target.path, "checkout")
      const cloned = yield* svc.clone(target.path, bare, checkout, { branch: "main" })
      expect(cloned.exitCode).toBe(0)

      const remoteHead = yield* svc.run(["log", "-1", "--format=%s"], { cwd: checkout })
      expect(remoteHead.text().trim()).toBe("initial commit")

      // pull --ff-only on the clone works
      const pulled = yield* svc.pull(checkout, { branch: "main" })
      expect(pulled.exitCode).toBe(0)
    }),
  )
})
