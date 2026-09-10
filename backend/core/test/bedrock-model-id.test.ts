import { describe, expect, test } from "bun:test"
import { resolveModelID } from "../src/plugin/provider/amazon-bedrock-model-id"

// Bedrock needs a cross-region inference-profile prefix for some models in us-* regions, but
// the rule used to be too broad: it matched every "deepseek" id and every id at all, including
// ARNs, producing identifiers the API rejects outright.

describe("resolveModelID", () => {
  test("leaves an ARN untouched", () => {
    // An ARN already names its region and model; "us." in front is an instant ValidationException.
    const arn = "arn:aws:bedrock:us-east-1::foundation-model/deepseek.v3.2"
    expect(resolveModelID(arn, "us-east-1")).toBe(arn)
    const profile = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude"
    expect(resolveModelID(profile, "us-east-1")).toBe(profile)
  })

  test("prefixes DeepSeek R1 but not other DeepSeek models", () => {
    expect(resolveModelID("deepseek.r1-v1:0", "us-east-1")).toBe("us.deepseek.r1-v1:0")
    expect(resolveModelID("deepseek.v3.2", "us-east-1")).toBe("deepseek.v3.2")
  })

  test("does not double-prefix an id that already carries one", () => {
    expect(resolveModelID("us.deepseek.r1-v1:0", "us-east-1")).toBe("us.deepseek.r1-v1:0")
    expect(resolveModelID("global.anthropic.claude", "us-east-1")).toBe("global.anthropic.claude")
  })

  test("still prefixes the models that need it", () => {
    expect(resolveModelID("anthropic.claude-sonnet", "us-east-1")).toBe("us.anthropic.claude-sonnet")
    expect(resolveModelID("amazon.nova-pro-v1:0", "us-east-1")).toBe("us.amazon.nova-pro-v1:0")
  })

  test("never prefixes in us-gov regions", () => {
    expect(resolveModelID("anthropic.claude-sonnet", "us-gov-west-1")).toBe("anthropic.claude-sonnet")
  })
})
