import type { Computer } from "@tiancode-ai/schema/computer"

/** UI-TARS predictions are data. Never evaluate the Python-looking action as code. */
export function parseTarsAction(prediction: string): Computer.Request {
  const source = prediction.trim().replace(/^```(?:python)?\s*|\s*```$/g, "")
  const body = source.startsWith("Thought:") ? source.slice(source.indexOf("\nAction:") + 1) : source
  const action = /^(?:Action:\s*)?([a-z_]+)\(([^]*)\)$/.exec(body.trim())
  if (!action || prediction.length > 12_000)
    throw new Error("Predicción UI-TARS inválida: se espera una única Action: nombre(...).")
  const entries: Record<string, string> = {}
  const argument = /\s*([a-z_]+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[[\d.,\s+-]+\]|[\d.]+)\s*(,|$)/gy
  const input = action[2]!.trim()
  while (argument.lastIndex < input.length) {
    const position = argument.lastIndex
    const match = argument.exec(input)
    if (!match || entries[match[1]!] !== undefined) throw new Error("Argumentos UI-TARS inválidos o repetidos.")
    const raw = match[2]!
    entries[match[1]!] =
      raw.startsWith("'") || raw.startsWith('"')
        ? raw
            .slice(1, -1)
            .replace(/\\(n|r|t|\\|'|")/g, (_, value: string) => ({ n: "\n", r: "\r", t: "\t" })[value] ?? value)
        : raw
    if (argument.lastIndex <= position) throw new Error("Predicción UI-TARS inválida.")
  }
  const accepted = [
    "click",
    "left_click",
    "left_single",
    "left_double",
    "double_click",
    "right_click",
    "right_single",
    "middle_click",
    "mouse_move",
    "hover",
  ].includes(action[1]!)
    ? ["start_box"]
    : ["drag", "left_click_drag", "select"].includes(action[1]!)
      ? ["start_box", "end_box"]
      : action[1] === "scroll"
        ? ["start_box", "direction"]
        : action[1] === "hotkey"
          ? ["key"]
          : ["content"]
  if (Object.keys(entries).some((key) => !accepted.includes(key)))
    throw new Error("Argumento no soportado en la acción UI-TARS.")
  const point = (key: string) => {
    const raw = entries[key]
    if (!raw) throw new Error(`Falta ${key} en la acción UI-TARS.`)
    const box = /^(?:\[([\d.,\s+-]+)\]|<\|box_start\|>\(([\d.,\s+-]+)\)<\|box_end\|>)$/.exec(raw)
    if (!box) throw new Error("Formato de caja UI-TARS inválido.")
    const values = (box[1] || box[2])!.split(",").map((value) => (value.trim() ? Number(value.trim()) : Number.NaN))
    if (![2, 4].includes(values.length) || values.some((value) => !Number.isFinite(value) || value < 0 || value > 1000))
      throw new Error("Las cajas UI-TARS usan dos o cuatro coordenadas entre 0 y 1000.")
    if (values.length === 4 && (values[2]! < values[0]! || values[3]! < values[1]!))
      throw new Error("La caja UI-TARS está invertida.")
    return {
      x: (values.length === 2 ? values[0]! : (values[0]! + values[2]!) / 2) / 1000,
      y: (values.length === 2 ? values[1]! : (values[1]! + values[3]!) / 2) / 1000,
    }
  }
  const click = [
    "click",
    "left_click",
    "left_single",
    "left_double",
    "double_click",
    "right_click",
    "right_single",
    "middle_click",
  ]
  if (click.includes(action[1]!))
    return {
      action: "click",
      ...point("start_box"),
      coordinateSpace: "normalized",
      button: action[1]!.startsWith("right") ? "right" : action[1] === "middle_click" ? "middle" : "left",
      double: ["left_double", "double_click"].includes(action[1]!),
    }
  if (["drag", "left_click_drag", "select"].includes(action[1]!)) {
    const end = point("end_box")
    return { action: "drag", ...point("start_box"), endX: end.x, endY: end.y, coordinateSpace: "normalized" }
  }
  if (["mouse_move", "hover"].includes(action[1]!))
    return { action: "move", ...point("start_box"), coordinateSpace: "normalized" }
  if (action[1] === "type") return { action: "type", text: entries.content }
  if (action[1] === "hotkey") return { action: "key", keys: entries.key?.trim().replace(/\s+/g, "+") }
  if (action[1] === "scroll") {
    const direction = entries.direction
    if (!["up", "down", "left", "right"].includes(direction ?? "")) throw new Error("Dirección UI-TARS inválida.")
    return {
      action: "scroll",
      ...(entries.start_box ? point("start_box") : {}),
      coordinateSpace: "normalized",
      direction: direction as "up" | "down" | "left" | "right",
    }
  }
  if (["wait", "finished", "call_user"].includes(action[1]!))
    return {
      action: action[1] as "wait" | "finished" | "call_user",
      text: entries.content,
      ...(action[1] === "wait" ? { durationMs: 5000 } : {}),
    }
  throw new Error(`Acción UI-TARS no soportada: ${action[1]}.`)
}

/** Coordinates belong to one captured monitor, including negative origins and image resizing. */
export function mapComputerPoint(
  x: number,
  y: number,
  space: Computer.Request["coordinateSpace"],
  frame: {
    display: Computer.Display
    imageWidth: number
    imageHeight: number
  },
) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Las coordenadas deben ser finitas.")
  if (space === "screen" || !space) return { x: Math.round(x), y: Math.round(y) }
  const width = space === "normalized" ? 1 : frame.imageWidth
  const height = space === "normalized" ? 1 : frame.imageHeight
  if (x < 0 || y < 0 || x > width || y > height) throw new Error("El punto está fuera de la captura.")
  return {
    x:
      frame.display.bounds.x +
      Math.min(frame.display.bounds.width - 1, Math.round((x / width) * frame.display.bounds.width)),
    y:
      frame.display.bounds.y +
      Math.min(frame.display.bounds.height - 1, Math.round((y / height) * frame.display.bounds.height)),
  }
}
