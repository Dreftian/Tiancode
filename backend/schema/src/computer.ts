export * as Computer from "./computer"

import { Schema } from "effect"
import { optional } from "./schema"

export const Actions = [
  "observe",
  "windows",
  "focus",
  "move",
  "click",
  "drag",
  "type",
  "key",
  "scroll",
  "wait",
  "finished",
  "call_user",
  "tars",
  "cursor_position",
  "foreground_window",
] as const

export const Request = Schema.Struct({
  action: Schema.Literals(Actions),
  x: optional(Schema.Number),
  y: optional(Schema.Number),
  endX: optional(Schema.Number),
  endY: optional(Schema.Number),
  button: optional(Schema.Literals(["left", "right", "middle"])),
  double: optional(Schema.Boolean),
  text: optional(Schema.String),
  keys: optional(Schema.String),
  direction: optional(Schema.Literals(["up", "down", "left", "right"])),
  amount: optional(Schema.Number),
  durationMs: optional(Schema.Number),
  windowId: optional(Schema.String),
  displayId: optional(Schema.String),
  snapshotId: optional(Schema.String),
  coordinateSpace: optional(Schema.Literals(["screen", "screenshot", "normalized"])),
  prediction: optional(Schema.String),
})
export interface Request extends Schema.Schema.Type<typeof Request> {}

export const Bounds = Schema.Struct({ x: Schema.Number, y: Schema.Number, width: Schema.Number, height: Schema.Number })
export const Display = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  bounds: Bounds,
  scaleFactor: Schema.Number,
})
export interface Display extends Schema.Schema.Type<typeof Display> {}

export const Status = Schema.Struct({
  supported: Schema.Boolean,
  active: Schema.Boolean,
  allowed: Schema.Array(Schema.String),
  actions: Schema.Number,
  stopShortcut: Schema.NullOr(Schema.String),
  enabled: Schema.Boolean,
  denied: Schema.Array(Schema.String),
  displays: Schema.Array(Display),
  displayId: Schema.String,
  capabilities: Schema.Array(Schema.String),
})
export interface Status extends Schema.Schema.Type<typeof Status> {}

export const Window = Schema.Struct({
  id: Schema.String,
  pid: Schema.Number,
  exe: Schema.String,
  title: Schema.String,
  elevation: Schema.String,
  selfElevated: Schema.Boolean,
  bounds: Bounds,
  minimized: Schema.Boolean,
})
export interface Window extends Schema.Schema.Type<typeof Window> {}

export const Control = Schema.Struct({
  name: Schema.String,
  role: Schema.String,
  bounds: Bounds,
  enabled: Schema.Boolean,
  focused: Schema.Boolean,
  password: Schema.Boolean,
})

export const Observation = Schema.Struct({
  kind: Schema.Literal("computer_observation"),
  snapshotId: Schema.String,
  capturedAt: Schema.Number,
  display: Display,
  imageWidth: Schema.Number,
  imageHeight: Schema.Number,
  screenshot: Schema.String,
  foreground: Window,
  controls: Schema.Array(Control),
  accessibility: Schema.String,
})
export interface Observation extends Schema.Schema.Type<typeof Observation> {}
