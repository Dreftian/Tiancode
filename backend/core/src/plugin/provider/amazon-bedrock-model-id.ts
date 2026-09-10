// Pure Bedrock model-id rules, kept in their own module with no imports.
// amazon-bedrock.ts cannot be imported directly from a test: it pulls in provider.ts,
// which imports it back, and the cycle throws before any test runs.

// Bedrock cross-region inference profiles require regional prefixes only for
// specific model/region combinations. Keep the mapping narrow and avoid
// double-prefixing model IDs that models.dev already marks as global/us/eu/etc.
// Exported for tests: the surrounding plugin needs a live AWS SDK, so the ID rules can only
// be pinned deterministically in isolation.
export function resolveModelID(modelID: string, region: string | undefined) {
  // An ARN already names its region and model exactly; prefixing it produces
  // "us.arn:aws:bedrock:..." and an immediate ValidationException.
  if (modelID.startsWith("arn:")) return modelID
  const crossRegionPrefixes = ["global.", "us.", "eu.", "jp.", "apac.", "au."]
  if (crossRegionPrefixes.some((prefix) => modelID.startsWith(prefix))) return modelID

  const resolvedRegion = region ?? "us-east-1"
  const regionPrefix = resolvedRegion.split("-")[0]
  if (regionPrefix === "us") {
    const requiresPrefix = ["nova-micro", "nova-lite", "nova-pro", "nova-premier", "nova-2", "claude", "deepseek.r1"].some(
      (item) => modelID.includes(item),
    )
    if (requiresPrefix && !resolvedRegion.startsWith("us-gov")) return `${regionPrefix}.${modelID}`
    return modelID
  }
  if (regionPrefix === "eu") {
    const regionRequiresPrefix = [
      "eu-west-1",
      "eu-west-2",
      "eu-west-3",
      "eu-north-1",
      "eu-central-1",
      "eu-south-1",
      "eu-south-2",
    ].some((item) => resolvedRegion.includes(item))
    const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "llama3", "pixtral"].some((item) =>
      modelID.includes(item),
    )
    return regionRequiresPrefix && modelRequiresPrefix ? `${regionPrefix}.${modelID}` : modelID
  }
  if (regionPrefix !== "ap") return modelID

  const australia = ["ap-southeast-2", "ap-southeast-4"].includes(resolvedRegion)
  if (australia && ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"].some((item) => modelID.includes(item))) {
    return `au.${modelID}`
  }

  const prefix = resolvedRegion === "ap-northeast-1" ? "jp" : "apac"
  return ["claude", "nova-lite", "nova-micro", "nova-pro"].some((item) => modelID.includes(item))
    ? `${prefix}.${modelID}`
    : modelID
}
