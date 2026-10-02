import { describe, expect, test } from "bun:test"
import { applyDictationDictionary, realAudioInputs } from "./asr"

describe("dictation dictionary", () => {
  test("fixes words that start or end with accented letters", () => {
    expect(applyDictationDictionary("pedí un cafe y un café", ["café"])).toBe("pedí un cafe y un café")
    expect(applyDictationDictionary("vi un ñandú hoy", ["Ñandú"])).toBe("vi un Ñandú hoy")
    expect(applyDictationDictionary("la ACCIÓN termina", ["acción"])).toBe("la acción termina")
  })

  test("only replaces whole words", () => {
    expect(applyDictationDictionary("typescript y typescripts", ["TypeScript"])).toBe("TypeScript y typescripts")
    expect(applyDictationDictionary("usa c++ hoy", ["C++"])).toBe("usa C++ hoy")
  })
})

describe("microphone list", () => {
  test("drops the Windows default and communications aliases", () => {
    const devices = [
      { kind: "audioinput", deviceId: "default" },
      { kind: "audioinput", deviceId: "communications" },
      { kind: "audioinput", deviceId: "abc" },
      { kind: "audiooutput", deviceId: "def" },
    ]
    expect(realAudioInputs(devices).map((device) => device.deviceId)).toEqual(["abc"])
  })
})
