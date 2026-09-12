import { describe, expect, test } from "bun:test"
import { shouldTriggerRebuild } from "@/preview/dev-server-manager"

describe("shouldTriggerRebuild", () => {
  test("source files start a rebuild", () => {
    expect(shouldTriggerRebuild("src/App.tsx")).toBe(true)
    expect(shouldTriggerRebuild("src\\components\\Card.tsx")).toBe(true)
    expect(shouldTriggerRebuild("index.html")).toBe(true)
    expect(shouldTriggerRebuild("package.json")).toBe(true)
    expect(shouldTriggerRebuild(".env")).toBe(true)
  })

  test("build output never starts a rebuild — including the directory event itself", () => {
    // This is the loop: `npm run build` writes dist/, Windows reports a change on `dist`,
    // the old prefix test ("dist/") missed it, and the panel showed "Compilando dist…" forever.
    expect(shouldTriggerRebuild("dist")).toBe(false)
    expect(shouldTriggerRebuild("dist/assets/Home-DENvPw7g.js")).toBe(false)
    expect(shouldTriggerRebuild("dist\\assets\\Tabs-CFeyy209.js")).toBe(false)
    expect(shouldTriggerRebuild("release")).toBe(false)
    expect(shouldTriggerRebuild("release/win-unpacked/app.asar")).toBe(false)
    expect(shouldTriggerRebuild("out")).toBe(false)
    expect(shouldTriggerRebuild("build/index.js")).toBe(false)
    expect(shouldTriggerRebuild("dist-electron/main.js")).toBe(false)
  })

  test("dependency trees, caches and VCS metadata are ignored at any depth", () => {
    expect(shouldTriggerRebuild("node_modules/react/index.js")).toBe(false)
    expect(shouldTriggerRebuild("packages/ui/node_modules/x/index.js")).toBe(false)
    expect(shouldTriggerRebuild(".git/index")).toBe(false)
    expect(shouldTriggerRebuild("apps/web/.next/server/page.js")).toBe(false)
    expect(shouldTriggerRebuild(".turbo/turbo-build.log")).toBe(false)
    expect(shouldTriggerRebuild(".tiancode/tiancode.json")).toBe(false)
  })

  test("editor scratch and log files are ignored", () => {
    expect(shouldTriggerRebuild("src/App.tsx~")).toBe(false)
    expect(shouldTriggerRebuild("npm-debug.log")).toBe(false)
    expect(shouldTriggerRebuild("bun.lock")).toBe(false)
    expect(shouldTriggerRebuild(".DS_Store")).toBe(false)
  })

  test("empty paths are ignored", () => {
    expect(shouldTriggerRebuild("")).toBe(false)
    expect(shouldTriggerRebuild("./")).toBe(false)
  })
})
