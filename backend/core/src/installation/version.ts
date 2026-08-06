declare global {
  const TIANCODE_VERSION: string
  const TIANCODE_CHANNEL: string
}

export const InstallationVersion = typeof TIANCODE_VERSION === "string" ? TIANCODE_VERSION : "local"
export const InstallationChannel = typeof TIANCODE_CHANNEL === "string" ? TIANCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
