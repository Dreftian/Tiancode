type AgentModel = {
  providerID: string
  modelID: string
}

type Agent = {
  model?: AgentModel
  variant?: string
}

type Model = AgentModel & {
  variants?: Record<string, unknown>
}

type VariantInput = {
  variants: string[]
  selected: string | null | undefined
  configured: string | undefined
}

export function getConfiguredAgentVariant(input: { agent: Agent | undefined; model: Model | undefined }) {
  if (!input.agent?.variant) return undefined
  if (!input.agent.model) return undefined
  if (!input.model?.variants) return undefined
  if (input.agent.model.providerID !== input.model.providerID) return undefined
  if (input.agent.model.modelID !== input.model.modelID) return undefined
  if (!(input.agent.variant in input.model.variants)) return undefined
  return input.agent.variant
}

/** Stored as a model's remembered variant when the user explicitly picked the default effort. */
export const DEFAULT_VARIANT = "default"

/**
 * The effort to use, in opencode's order: this session's explicit pick, then what the user last
 * picked for this model (an explicit "default" sticks too), then the agent's configured variant.
 */
export function resolveVariant(input: VariantInput & { remembered: string | undefined }) {
  if (input.selected === null) return undefined
  if (input.selected && input.variants.includes(input.selected)) return input.selected
  if (input.remembered === DEFAULT_VARIANT) return undefined
  if (input.remembered && input.variants.includes(input.remembered)) return input.remembered
  if (input.configured && input.variants.includes(input.configured)) return input.configured
  return undefined
}

/** The model a configured "provider/model" id names; only the first slash separates them. */
export function parseModelID(value: string | undefined) {
  if (!value) return
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) return
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) }
}

/** The next model when cycling; a current model outside the list jumps to its first or last entry. */
export function nextCycleIndex(index: number, length: number, direction: 1 | -1) {
  if (length === 0) return -1
  if (index === -1) return direction > 0 ? 0 : length - 1
  return (index + direction + length) % length
}

export function resolveModelVariant(input: VariantInput) {
  if (input.selected === null) return undefined
  if (input.selected && input.variants.includes(input.selected)) return input.selected
  if (input.configured && input.variants.includes(input.configured)) return input.configured
  return undefined
}

export function cycleModelVariant(input: VariantInput) {
  if (input.variants.length === 0) return undefined
  if (input.selected === null) return input.variants[0]
  if (input.selected && input.variants.includes(input.selected)) {
    const index = input.variants.indexOf(input.selected)
    if (index === input.variants.length - 1) return undefined
    return input.variants[index + 1]
  }
  if (input.configured && input.variants.includes(input.configured)) {
    const index = input.variants.indexOf(input.configured)
    if (index === input.variants.length - 1) return input.variants[0]
    return input.variants[index + 1]
  }
  return input.variants[0]
}
