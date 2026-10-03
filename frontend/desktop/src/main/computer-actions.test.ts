import { describe, expect, test } from "bun:test"
import { mapComputerPoint, parseTarsAction } from "./computer-actions"
import { validateComputerRequest } from "./computer-use"

const frame = {
  display: { id: "left", label: "Left", bounds: { x: -3840, y: 200, width: 3840, height: 2160 }, scaleFactor: 1.5 },
  imageWidth: 1800,
  imageHeight: 1012,
}

describe("observed desktop coordinates", () => {
  test("maps a reduced screenshot to a monitor with a negative origin", () => {
    expect(mapComputerPoint(900, 506, "screenshot", frame)).toEqual({ x: -1920, y: 1280 })
    expect(mapComputerPoint(0.5, 0.5, "normalized", frame)).toEqual({ x: -1920, y: 1280 })
  })
  test("uses the final real pixel for a normalized edge", () => {
    expect(mapComputerPoint(1, 1, "normalized", frame)).toEqual({ x: -1, y: 2359 })
  })
  test("rejects points outside the image and non-finite coordinates", () => {
    expect(() => mapComputerPoint(1801, 0, "screenshot", frame)).toThrow()
    expect(() => mapComputerPoint(-0.1, 0.5, "normalized", frame)).toThrow()
    expect(() => mapComputerPoint(Number.NaN, 0, "screen", frame)).toThrow()
  })
  test("preserves legacy physical coordinates", () => {
    expect(mapComputerPoint(-20.2, 20.6, "screen", frame)).toEqual({ x: -20, y: 21 })
  })
})

describe("UI-TARS compatibility", () => {
  test("accepts the desktop action vocabulary and bounding-box centers", () => {
    expect(
      parseTarsAction("Thought: choose the button\nAction: left_double(start_box='[400, 200, 600, 400]')"),
    ).toMatchObject({ action: "click", x: 0.5, y: 0.3, double: true, button: "left" })
    expect(parseTarsAction("right_single(start_box='[0, 1000]')")).toMatchObject({ button: "right", x: 0, y: 1 })
    expect(parseTarsAction("hover(start_box='[500, 500]')")).toMatchObject({ action: "move" })
    expect(parseTarsAction("click(start_box='<|box_start|>(500,300)<|box_end|>')")).toMatchObject({ x: 0.5, y: 0.3 })
  })
  test("keeps drag endpoints and fractional normalized coordinates", () => {
    const parsed = parseTarsAction("drag(start_box='[0, 125]', end_box='[750, 875]')")
    expect(parsed).toMatchObject({ action: "drag", x: 0, y: 0.125, endX: 0.75, endY: 0.875 })
    expect(validateComputerRequest(parsed)).toMatchObject({ ok: true, request: { y: 0.125 } })
  })
  test("decodes literal text, commas, quotes and Unicode without evaluating it", () => {
    expect(parseTarsAction("type(content='Hola, señor. \\n\\t\\'bien\\'')")).toMatchObject({
      action: "type",
      text: "Hola, señor. \n\t'bien'",
    })
    expect(parseTarsAction("type(content=\"print(1); __import__('os')\")")).toMatchObject({ action: "type" })
  })
  test("supports shortcuts, scroll at a point and explicit handoff", () => {
    expect(parseTarsAction("hotkey(key='ctrl shift p')")).toEqual({ action: "key", keys: "ctrl+shift+p" })
    expect(parseTarsAction("scroll(start_box='[500, 250]', direction='down')")).toMatchObject({
      action: "scroll",
      direction: "down",
      x: 0.5,
      y: 0.25,
    })
    expect(parseTarsAction("wait()")).toMatchObject({ action: "wait" })
    expect(parseTarsAction("finished(content='Hecho')")).toMatchObject({ action: "finished", text: "Hecho" })
    expect(parseTarsAction("call_user()")).toMatchObject({ action: "call_user" })
  })
  test("rejects executable expressions, extra commands and invalid boxes", () => {
    ;[
      "click(start_box=__import__('os').system('cmd'))",
      "click(start_box='[500, 500]'); type(content='bad')",
      "click(start_box='[1001, 500]')",
      "click(start_box='[900, 500, 200, 600]')",
      "shutdown()",
      "type(content='a', content='b')",
      "Action: click(start_box='[500, 500]')\nAction: type(content='bad')",
      "click(start_box='[500, 500]', unexpected='ignored')",
      "click(start_box='[500,,500]')",
    ].forEach((prediction) => expect(() => parseTarsAction(prediction)).toThrow())
  })
})

describe("new request validation", () => {
  test("validates drag endpoints, window identity and bounded waits", () => {
    expect(validateComputerRequest({ action: "drag", x: 0, y: 0, endX: 1, endY: 1 })).toMatchObject({ ok: true })
    expect(validateComputerRequest({ action: "drag", x: 0, y: 0 })).toMatchObject({ ok: false })
    expect(validateComputerRequest({ action: "drag", x: 0, y: 0, endX: 1, endY: 1, durationMs: 5000 })).toMatchObject({
      ok: false,
    })
    expect(validateComputerRequest({ action: "focus" })).toMatchObject({ ok: false })
    expect(validateComputerRequest({ action: "focus", windowId: "246" })).toMatchObject({ ok: true })
    expect(validateComputerRequest({ action: "wait", durationMs: 5001 })).toMatchObject({ ok: false })
    expect(validateComputerRequest({ action: "click", x: 1.2, y: 0.5, coordinateSpace: "normalized" })).toMatchObject({
      ok: false,
    })
  })
})
