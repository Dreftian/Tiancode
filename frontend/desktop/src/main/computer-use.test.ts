import { describe, expect, test } from "bun:test"
import {
  computerUseEnabled,
  FALLBACK_TEXT,
  encodedHostCommand,
  formatFallback,
  guardForeground,
  isCredentialProcess,
  isExtendedKey,
  isInputAction,
  MAX_TYPE_CHARS,
  normalizeDeniedApp,
  parseChord,
  parseDeniedApps,
  processName,
  validateComputerRequest,
  type ForegroundWindow,
} from "./computer-use"

const VK = { shift: 0x10, ctrl: 0x11, alt: 0x12, win: 0x5b, enter: 0x0d, left: 0x25, p: 0x50, f5: 0x74 }

describe("parseChord", () => {
  test("splits modifiers from the key", () => {
    const result = parseChord("ctrl+shift+p")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.chord.modifiers).toEqual([VK.ctrl, VK.shift])
    expect(result.chord.key).toBe(VK.p)
    expect(result.chord.extended).toBe(false)
  })

  test("accepts named keys, function keys and aliases", () => {
    expect(parseChord("enter")).toMatchObject({ ok: true, chord: { key: VK.enter, modifiers: [] } })
    expect(parseChord("F5")).toMatchObject({ ok: true, chord: { key: VK.f5 } })
    expect(parseChord("Cmd+A")).toMatchObject({ ok: true, chord: { modifiers: [VK.win], key: 0x41 } })
  })

  test("flags arrows and the editing block as extended keys", () => {
    const left = parseChord("alt+left")
    expect(left).toMatchObject({ ok: true, chord: { modifiers: [VK.alt], key: VK.left, extended: true } })
    expect(isExtendedKey(VK.enter)).toBe(false)
  })

  // "ctrl++" no puede perder el "+" final al partir por "+".
  test("handles a trailing plus as the key itself", () => {
    expect(parseChord("ctrl++")).toMatchObject({ ok: true, chord: { modifiers: [VK.ctrl], key: 0xbb } })
  })

  test("a repeated modifier is pressed once", () => {
    expect(parseChord("ctrl+control+s")).toMatchObject({ ok: true, chord: { modifiers: [VK.ctrl] } })
  })

  test("reports unknown keys and non-modifiers instead of throwing", () => {
    expect(parseChord("")).toMatchObject({ ok: false })
    expect(parseChord("banana")).toMatchObject({ ok: false })
    expect(parseChord("q+s")).toMatchObject({ ok: false })
    expect(parseChord("ctrl+alt+shift+win+a+b")).toMatchObject({ ok: false })
  })
})

describe("validateComputerRequest", () => {
  test("move needs both coordinates", () => {
    expect(validateComputerRequest({ action: "move", x: 10, y: 20 })).toMatchObject({
      ok: true,
      request: { action: "move", x: 10, y: 20 },
    })
    expect(validateComputerRequest({ action: "move", x: 10 })).toMatchObject({ ok: false })
    expect(validateComputerRequest({ action: "move" })).toMatchObject({ ok: false })
  })

  test("click may omit coordinates and defaults to a single left click", () => {
    const result = validateComputerRequest({ action: "click" })
    expect(result).toMatchObject({ ok: true, request: { button: "left", double: false } })
    if (result.ok) expect(result.request.x).toBeUndefined()
    expect(validateComputerRequest({ action: "click", button: "middle", double: true })).toMatchObject({
      ok: true,
      request: { button: "middle", double: true },
    })
  })

  test("coordinates arriving as strings are rounded to integers", () => {
    expect(validateComputerRequest({ action: "move", x: "10.6", y: 20.2 })).toMatchObject({
      ok: true,
      request: { x: 11, y: 20 },
    })
  })

  test("rejects coordinates that are off any screen", () => {
    expect(validateComputerRequest({ action: "move", x: 1e9, y: 0 })).toMatchObject({ ok: false })
  })

  test("type is bounded and refuses control characters", () => {
    expect(validateComputerRequest({ action: "type", text: "hola\n" })).toMatchObject({ ok: true })
    expect(validateComputerRequest({ action: "type" })).toMatchObject({ ok: false })
    expect(validateComputerRequest({ action: "type", text: "a".repeat(MAX_TYPE_CHARS + 1) })).toMatchObject({
      ok: false,
    })
    expect(validateComputerRequest({ action: "type", text: "a\u0007b" })).toMatchObject({ ok: false })
  })

  test("key validates the chord up front", () => {
    expect(validateComputerRequest({ action: "key", keys: "ctrl+s" })).toMatchObject({ ok: true })
    expect(validateComputerRequest({ action: "key", keys: "ctrl+banana" })).toMatchObject({ ok: false })
  })

  test("scroll clamps the amount and requires a direction", () => {
    expect(validateComputerRequest({ action: "scroll", direction: "down" })).toMatchObject({
      ok: true,
      request: { amount: 3 },
    })
    expect(validateComputerRequest({ action: "scroll", direction: "up", amount: 99 })).toMatchObject({
      ok: true,
      request: { amount: 10 },
    })
    expect(validateComputerRequest({ action: "scroll" })).toMatchObject({ ok: false })
  })

  // El renderer puede reenviar la acción del puente entera; la de dentro es la que vale.
  test("unwraps the action nested in a bridge command", () => {
    expect(validateComputerRequest({ type: "computer", computer: { action: "scroll", direction: "down" } })).toMatchObject(
      { ok: true, request: { action: "scroll", direction: "down" } },
    )
  })

  test("rejects anything that is not one of the seven actions", () => {
    expect(validateComputerRequest({ action: "shutdown" })).toMatchObject({ ok: false })
    expect(validateComputerRequest(null)).toMatchObject({ ok: false })
    expect(validateComputerRequest("click")).toMatchObject({ ok: false })
  })

  test("the two read-only actions are not input", () => {
    expect(isInputAction("cursor_position")).toBe(false)
    expect(isInputAction("foreground_window")).toBe(false)
    expect(isInputAction("click")).toBe(true)
  })
})

describe("processName", () => {
  test("takes the executable from a full path, lowercased", () => {
    expect(processName("C:\\Program Files\\Notepad++\\notepad++.exe")).toBe("notepad++.exe")
    expect(processName("/usr/bin/Foo")).toBe("foo")
    expect(processName("")).toBe("")
  })
})

describe("guardForeground", () => {
  const base: ForegroundWindow = {
    pid: 4242,
    elevation: "no",
    selfElevated: false,
    exe: "C:\\Windows\\System32\\notepad.exe",
    title: "Untitled - Notepad",
  }

  test("lets a normal window through", () => {
    expect(guardForeground(base, 10)).toEqual({ allow: true })
  })

  test("never targets our own window", () => {
    const decision = guardForeground({ ...base, pid: 10 }, 10)
    expect(decision.allow).toBe(false)
  })

  test("refuses an elevated window while we are not elevated", () => {
    const decision = guardForeground({ ...base, elevation: "yes" }, 10)
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toContain("UIPI")
  })

  // Si no se puede leer el token del proceso de delante, se cierra en vez de abrir.
  test("refuses when elevation cannot be read", () => {
    expect(guardForeground({ ...base, elevation: "unknown" }, 10).allow).toBe(false)
  })

  test("an elevated Tiancode may act on an elevated window", () => {
    expect(guardForeground({ ...base, elevation: "yes", selfElevated: true }, 10)).toEqual({ allow: true })
  })

  test("refuses known credential managers and the UAC prompt", () => {
    expect(guardForeground({ ...base, exe: "C:\\x\\1Password.exe" }, 10).allow).toBe(false)
    expect(guardForeground({ ...base, exe: "C:\\Windows\\System32\\consent.exe" }, 10).allow).toBe(false)
    expect(isCredentialProcess("KeePassXC.exe")).toBe(true)
    expect(isCredentialProcess("notepad.exe")).toBe(false)
  })

  test("refuses when there is no foreground window at all", () => {
    expect(guardForeground({ ...base, pid: 0 }, 10).allow).toBe(false)
  })

  // La lista de vetados es persistente y resta; la de permitidas de la sesión no puede saltársela.
  test("refuses an executable the user blocked", () => {
    const decision = guardForeground(base, 10, new Set(["notepad.exe"]))
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toContain("notepad.exe")
  })

  test("the blocklist only matches the executable name, not the window", () => {
    expect(guardForeground(base, 10, new Set(["chrome.exe"])).allow).toBe(true)
    expect(guardForeground({ ...base, exe: "D:\\otro\\NOTEPAD.EXE" }, 10, new Set(["notepad.exe"])).allow).toBe(false)
  })
})

describe("computer use master switch", () => {
  // Ausente = encendido: la tool ya existía sin ajuste y actualizar no puede apagarla sola.
  test("defaults to on while nothing has been stored", () => {
    expect(computerUseEnabled(undefined)).toBe(true)
    expect(computerUseEnabled(null)).toBe(true)
    expect(computerUseEnabled("")).toBe(true)
  })

  // El store del renderer guarda cadenas ("false"), no booleanos; se aceptan las dos formas.
  test("is off for the string and the boolean", () => {
    expect(computerUseEnabled("false")).toBe(false)
    expect(computerUseEnabled("False")).toBe(false)
    expect(computerUseEnabled(false)).toBe(false)
    expect(computerUseEnabled("true")).toBe(true)
  })
})

describe("denied applications", () => {
  test("stores the executable name, lowercased and without the path", () => {
    expect(normalizeDeniedApp("  C:\\Program Files\\Slack\\Slack.exe ")).toBe("slack.exe")
    expect(normalizeDeniedApp("Discord.exe")).toBe("discord.exe")
  })

  test("reads the JSON the settings screen writes and drops the rest", () => {
    expect(parseDeniedApps('["Slack.exe","C:\\\\x\\\\Discord.exe"]')).toEqual(["slack.exe", "discord.exe"])
    expect(parseDeniedApps(["a.exe", "A.exe", "", 7])).toEqual(["a.exe"])
    expect(parseDeniedApps("no soy json")).toEqual([])
    expect(parseDeniedApps(undefined)).toEqual([])
    expect(parseDeniedApps({ slack: true })).toEqual([])
  })
})

describe("indicator and dialog text", () => {
  test("substitutes parameters in the fallback copy", () => {
    expect(formatFallback(FALLBACK_TEXT["desktop.computerUse.indicator.app"]!, { app: "Notepad" })).toBe(
      "Controlling Notepad",
    )
    expect(formatFallback("Stop ({{shortcut}})", {})).toBe("Stop ({{shortcut}})")
  })
})

describe("host script", () => {
  // El script viaja en -EncodedCommand: si crece más que la línea de comandos de Windows, el host
  // deja de arrancar con un error que no explica nada.
  test("fits in the Windows command line", () => {
    expect(encodedHostCommand().length).toBeLessThan(30_000)
  })

  test("carries no backtick or template hazards", () => {
    const command = Buffer.from(encodedHostCommand(), "base64").toString("utf16le")
    expect(command).not.toContain("`")
    expect(command).toContain("SendInput")
  })
})
