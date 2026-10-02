import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { applyDesktopXdgPaths, dropInheritedProfileEnv, migrateDesktopXdgPaths } from "./xdg-paths"

const roots: string[] = []

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "tiancode-xdg-"))
  roots.push(root)
  return root
}

async function write(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("desktop XDG paths", () => {
  test("migrates missing legacy data, config, and state under userData without copying models", async () => {
    const root = await temporaryRoot()
    const home = join(root, "legacy-home")
    const environment: Record<string, string | undefined> = {}
    const paths = applyDesktopXdgPaths(join(root, "user-data"), environment, home)

    await Promise.all([
      write(join(home, ".local", "share", "tiancode", "mcp-auth.json"), '{"remote":"token"}'),
      write(join(home, ".local", "share", "tiancode", "auth.json"), '{"provider":"key"}'),
      write(join(home, ".local", "share", "tiancode", "models", "download.gguf"), "skip"),
      write(join(home, ".config", "tiancode", "config.json"), '{"mcp":{}}'),
      write(join(home, ".config", "tiancode", "skills", "release", "SKILL.md"), "# Release"),
      write(join(home, ".config", "tiancode", "plugins", "example", "plugin.json"), '{"name":"example"}'),
      write(join(home, ".config", "tiancode", "agent", "reviewer.md"), "Review carefully."),
      write(join(root, "user-data", "tiancode", "plugin-meta.json"), '{"example":true}'),
      write(join(paths.global.config, "config.json"), '{"current":true}'),
    ])

    expect(environment.XDG_DATA_HOME).toBe(paths.homes.data)
    expect(environment.XDG_CONFIG_HOME).toBe(paths.homes.config)
    expect(environment.XDG_STATE_HOME).toBe(paths.homes.state)

    const result = await migrateDesktopXdgPaths(paths)
    expect(result.migrated).toBe(true)
    expect(await readFile(join(paths.global.data, "mcp-auth.json"), "utf8")).toContain("token")
    expect(await readFile(join(paths.global.data, "auth.json"), "utf8")).toContain("provider")
    expect(await readFile(join(paths.global.config, "config.json"), "utf8")).toBe('{"current":true}')
    expect(await readFile(join(paths.global.config, "skills", "release", "SKILL.md"), "utf8")).toBe("# Release")
    expect(await readFile(join(paths.global.config, "plugins", "example", "plugin.json"), "utf8")).toContain("example")
    expect(await readFile(join(paths.global.config, "agent", "reviewer.md"), "utf8")).toBe("Review carefully.")
    expect(await readFile(join(paths.global.state, "plugin-meta.json"), "utf8")).toContain("example")
    expect(await Bun.file(join(paths.global.data, "models", "download.gguf")).exists()).toBe(false)
    expect((await migrateDesktopXdgPaths(paths)).migrated).toBe(false)
  })

  test("keeps explicit user XDG and config overrides", () => {
    const environment: Record<string, string | undefined> = {
      XDG_DATA_HOME: "D:/custom-data",
      XDG_STATE_HOME: "D:/custom-state",
      TIANCODE_CONFIG_DIR: "D:/custom-config",
    }
    const paths = applyDesktopXdgPaths("D:/desktop-user-data", environment, "D:/home")

    expect(paths.global.data).toBe(join("D:/custom-data", "tiancode"))
    expect(paths.global.config).toBe("D:/custom-config")
    expect(paths.global.state).toBe(join("D:/custom-state", "tiancode"))
    expect(environment.TIANCODE_CONFIG_DIR).toBe("D:/custom-config")
    expect(paths.managed.data).toBe(false)
    expect(paths.managed.config).toBe(false)
    expect(paths.managed.state).toBe(false)
  })

  test("drops XDG roots and the credential key inherited from another Tiancode profile", () => {
    const appData = join("C:", "Users", "u", "AppData", "Roaming")
    const environment: Record<string, string | undefined> = {
      XDG_DATA_HOME: join(appData, "ai.tiancode.desktop", "xdg", "data"),
      XDG_STATE_HOME: join(appData, "AI.Tiancode.Desktop.Release", "xdg", "state"),
      TIANCODE_CONFIG_DIR: join(appData, "ai.tiancode.desktop", "xdg", "config", "tiancode"),
      XDG_CONFIG_HOME: join("D:", "my-xdg", "config"),
      XDG_CACHE_HOME: join(appData, "ai.tiancode.desktop - copia", "cache"),
      TIANCODE_CREDENTIAL_KEY: "from-the-previous-process",
    }
    expect(dropInheritedProfileEnv(environment, appData, join(appData, "ai.tiancode.desktop.release"))).toEqual([
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "TIANCODE_CONFIG_DIR",
    ])
    // Paths outside the Tiancode profiles are the user's, even a sibling copy of one.
    expect(environment).toEqual({
      XDG_CONFIG_HOME: join("D:", "my-xdg", "config"),
      XDG_CACHE_HOME: join(appData, "ai.tiancode.desktop - copia", "cache"),
    })
  })

  test("keeps the credential key when the inherited roots belong to the profile in use", () => {
    const appData = join("C:", "Users", "u", "AppData", "Roaming")
    const environment: Record<string, string | undefined> = {
      XDG_DATA_HOME: join(appData, "ai.tiancode.desktop", "xdg", "data"),
      TIANCODE_CREDENTIAL_KEY: "same-profile",
    }
    expect(dropInheritedProfileEnv(environment, appData, join(appData, "ai.tiancode.desktop"))).toEqual(["XDG_DATA_HOME"])
    expect(environment).toEqual({ TIANCODE_CREDENTIAL_KEY: "same-profile" })
  })

  test("drops roots and the key inherited from a portable copy whose folder this run does not use", () => {
    const appData = join("C:", "Users", "u", "AppData", "Roaming")
    const portableData = join("D:", "usb", "data")
    const environment: Record<string, string | undefined> = {
      XDG_DATA_HOME: join(portableData, "xdg", "data"),
      XDG_STATE_HOME: join("D:", "usb", "data-other", "state"),
      TIANCODE_CREDENTIAL_KEY: "the-portable-key",
    }
    expect(
      dropInheritedProfileEnv(environment, appData, join(appData, "ai.tiancode.desktop.release"), portableData),
    ).toEqual(["XDG_DATA_HOME"])
    expect(environment).toEqual({ XDG_STATE_HOME: join("D:", "usb", "data-other", "state") })
  })

  test("keeps a credential key the user set when no profile path was inherited", () => {
    const environment: Record<string, string | undefined> = { TIANCODE_CREDENTIAL_KEY: "mine" }
    expect(dropInheritedProfileEnv(environment, join("C:", "AppData"), join("C:", "AppData", "ai.tiancode.desktop"))).toEqual([])
    expect(environment.TIANCODE_CREDENTIAL_KEY).toBe("mine")
  })
})
