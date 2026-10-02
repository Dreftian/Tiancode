import { describe, expect, test } from "bun:test"
import {
  cycleModelVariant,
  DEFAULT_VARIANT,
  getConfiguredAgentVariant,
  nextCycleIndex,
  parseModelID,
  resolveModelVariant,
  resolveVariant,
} from "./model-variant"

describe("model variant", () => {
  test("resolves configured agent variant when model matches", () => {
    const value = getConfiguredAgentVariant({
      agent: {
        model: { providerID: "openai", modelID: "gpt-5.2" },
        variant: "xhigh",
      },
      model: {
        providerID: "openai",
        modelID: "gpt-5.2",
        variants: { low: {}, high: {}, xhigh: {} },
      },
    })

    expect(value).toBe("xhigh")
  })

  test("ignores configured variant when model does not match", () => {
    const value = getConfiguredAgentVariant({
      agent: {
        model: { providerID: "openai", modelID: "gpt-5.2" },
        variant: "xhigh",
      },
      model: {
        providerID: "anthropic",
        modelID: "claude-sonnet-4",
        variants: { low: {}, high: {}, xhigh: {} },
      },
    })

    expect(value).toBeUndefined()
  })

  test("prefers selected variant over configured variant", () => {
    const value = resolveModelVariant({
      variants: ["low", "high", "xhigh"],
      selected: "high",
      configured: "xhigh",
    })

    expect(value).toBe("high")
  })

  test("lets an explicit default override the configured variant", () => {
    const value = resolveModelVariant({
      variants: ["low", "high", "xhigh"],
      selected: null,
      configured: "xhigh",
    })

    expect(value).toBeUndefined()
  })

  test("cycles from configured variant to next", () => {
    const value = cycleModelVariant({
      variants: ["low", "high", "xhigh"],
      selected: undefined,
      configured: "high",
    })

    expect(value).toBe("xhigh")
  })

  test("wraps from configured last variant to first", () => {
    const value = cycleModelVariant({
      variants: ["low", "high", "xhigh"],
      selected: undefined,
      configured: "xhigh",
    })

    expect(value).toBe("low")
  })

  test("cycles from an explicit default to the first variant", () => {
    const value = cycleModelVariant({
      variants: ["low", "high", "xhigh"],
      selected: null,
      configured: "xhigh",
    })

    expect(value).toBe("low")
  })
})

describe("opencode v2 model selection rules", () => {
  test("session pick, then remembered per model, then the agent's configured variant", () => {
    const variants = ["low", "medium", "high"]
    expect(resolveVariant({ variants, selected: "low", remembered: "high", configured: "medium" })).toBe("low")
    expect(resolveVariant({ variants, selected: undefined, remembered: "high", configured: "medium" })).toBe("high")
    expect(resolveVariant({ variants, selected: undefined, remembered: undefined, configured: "medium" })).toBe("medium")
    expect(resolveVariant({ variants, selected: null, remembered: "high", configured: "medium" })).toBeUndefined()
  })

  test("an explicit default for a model beats the agent's configured variant", () => {
    expect(
      resolveVariant({ variants: ["high"], selected: undefined, remembered: DEFAULT_VARIANT, configured: "high" }),
    ).toBeUndefined()
  })

  test("a remembered variant the model no longer has falls through", () => {
    expect(resolveVariant({ variants: ["low"], selected: undefined, remembered: "max", configured: "low" })).toBe("low")
  })

  test("configured ids keep every slash after the provider", () => {
    expect(parseModelID("openrouter/anthropic/claude-sonnet-4.5")).toEqual({
      providerID: "openrouter",
      modelID: "anthropic/claude-sonnet-4.5",
    })
    expect(parseModelID("lmstudio/qwen/qwen3-8b")?.modelID).toBe("qwen/qwen3-8b")
    expect(parseModelID("anthropic/claude")).toEqual({ providerID: "anthropic", modelID: "claude" })
    expect(parseModelID("no-slash")).toBeUndefined()
    expect(parseModelID("/leading")).toBeUndefined()
    expect(parseModelID(undefined)).toBeUndefined()
  })

  test("cycling from a model outside the recent list jumps to an end", () => {
    expect(nextCycleIndex(-1, 3, 1)).toBe(0)
    expect(nextCycleIndex(-1, 3, -1)).toBe(2)
    expect(nextCycleIndex(2, 3, 1)).toBe(0)
    expect(nextCycleIndex(0, 3, -1)).toBe(2)
    expect(nextCycleIndex(0, 0, 1)).toBe(-1)
  })
})
