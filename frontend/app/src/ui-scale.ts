/** The interface scales Settings offers; Ctrl + and Ctrl - step through the same list. */
export const UI_SCALES = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2] as const

/** The next scale up or down from `current`, staying inside the list. */
export function stepUiScale(current: number, direction: 1 | -1) {
  const next =
    direction > 0
      ? UI_SCALES.find((scale) => scale > current + 0.001)
      : UI_SCALES.findLast((scale) => scale < current - 0.001)
  return next ?? (direction > 0 ? UI_SCALES[UI_SCALES.length - 1] : UI_SCALES[0])
}
