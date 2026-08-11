import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"
import { resolve } from "node:path"

const legacyDesktopEntry = "resources/linux/tiancode-desktop.desktop"

test("uses the repository Windows signing script", async () => {
  const module = await import("./electron-builder.config.ts?sign-script")

  expect(module.windowsSignScript).toBe(resolve(import.meta.dir, "../../backend/tools/script/sign-windows.ps1"))
  expect(await Bun.file(module.windowsSignScript).exists()).toBe(true)
})

const channels = [
  { channel: "dev", appId: "ai.tiancode.desktop.codex" },
  { channel: "beta", appId: "ai.tiancode.desktop.beta" },
  { channel: "prod", appId: "ai.tiancode.desktop" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.TIANCODE_CHANNEL
    process.env.TIANCODE_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.TIANCODE_CHANNEL
    else process.env.TIANCODE_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
    expect(config.deb?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
    expect(config.rpm?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
  })
}

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const previous = process.env.TIANCODE_CHANNEL
  process.env.TIANCODE_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?compat=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.TIANCODE_CHANNEL
  else process.env.TIANCODE_CHANNEL = previous

  expect(
    config.deb?.fpm?.some((entry) =>
      entry.endsWith("tiancode-desktop.desktop=/usr/share/applications/tiancode-desktop.desktop"),
    ),
  ).toBe(true)
  expect(
    config.rpm?.fpm?.some((entry) =>
      entry.endsWith("tiancode-desktop.desktop=/usr/share/applications/tiancode-desktop.desktop"),
    ),
  ).toBe(true)

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/Tiancode/ai.tiancode.desktop %U")
  expect(desktop).toContain("Icon=ai.tiancode.desktop")
  expect(desktop).toContain("StartupWMClass=ai.tiancode.desktop")
  expect(desktop).toContain("NoDisplay=true")
})

test("bundles the CLI outside the dev app archive", async () => {
  const previous = process.env.TIANCODE_CHANNEL
  process.env.TIANCODE_CHANNEL = "dev"
  const module = await import("./electron-builder.config.ts?cli-resource")
  const config = module.default as Configuration
  if (previous === undefined) delete process.env.TIANCODE_CHANNEL
  else process.env.TIANCODE_CHANNEL = previous

  expect(config.files).toContain("!resources/tiancode-cli*")
  expect(config.extraResources).toContainEqual({
    from: "resources/",
    to: "",
    filter: ["tiancode-cli*"],
  })
})

test("keeps runtime icons outside the app archive", async () => {
  const previous = process.env.TIANCODE_CHANNEL
  process.env.TIANCODE_CHANNEL = "prod"
  const module = await import("./electron-builder.config.ts?runtime-icons")
  const config = module.default as Configuration
  if (previous === undefined) delete process.env.TIANCODE_CHANNEL
  else process.env.TIANCODE_CHANNEL = previous

  expect(config.files).toContain("!resources/icons/**/*")
  expect(config.extraResources).toContainEqual({
    from: "resources/icons",
    to: "icons",
  })
})

for (const channel of ["beta", "prod"] as const) {
  test(`does not bundle the CLI in ${channel} builds`, async () => {
    const previous = process.env.TIANCODE_CHANNEL
    process.env.TIANCODE_CHANNEL = channel
    const module = await import(`./electron-builder.config.ts?no-cli-resource=${channel}`)
    const config = module.default as Configuration
    if (previous === undefined) delete process.env.TIANCODE_CHANNEL
    else process.env.TIANCODE_CHANNEL = previous

    expect(config.extraResources).not.toContainEqual({
      from: "resources/",
      to: "",
      filter: ["tiancode-cli*"],
    })
  })
}
