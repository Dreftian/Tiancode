import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["TIANCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["TIANCODE_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("TIANCODE_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  TIANCODE_AUTO_HEAP_SNAPSHOT: truthy("TIANCODE_AUTO_HEAP_SNAPSHOT"),
  TIANCODE_GIT_BASH_PATH: process.env["TIANCODE_GIT_BASH_PATH"],
  TIANCODE_CONFIG: process.env["TIANCODE_CONFIG"],
  TIANCODE_CONFIG_CONTENT: process.env["TIANCODE_CONFIG_CONTENT"],
  TIANCODE_DISABLE_AUTOUPDATE: truthy("TIANCODE_DISABLE_AUTOUPDATE"),
  TIANCODE_ALWAYS_NOTIFY_UPDATE: truthy("TIANCODE_ALWAYS_NOTIFY_UPDATE"),
  TIANCODE_DISABLE_PRUNE: truthy("TIANCODE_DISABLE_PRUNE"),
  TIANCODE_DISABLE_TERMINAL_TITLE: truthy("TIANCODE_DISABLE_TERMINAL_TITLE"),
  TIANCODE_SHOW_TTFD: truthy("TIANCODE_SHOW_TTFD"),
  TIANCODE_DISABLE_AUTOCOMPACT: truthy("TIANCODE_DISABLE_AUTOCOMPACT"),
  TIANCODE_DISABLE_MODELS_FETCH: truthy("TIANCODE_DISABLE_MODELS_FETCH"),
  TIANCODE_DISABLE_MOUSE: truthy("TIANCODE_DISABLE_MOUSE"),
  TIANCODE_FAKE_VCS: process.env["TIANCODE_FAKE_VCS"],
  TIANCODE_SERVER_PASSWORD: process.env["TIANCODE_SERVER_PASSWORD"],
  TIANCODE_SERVER_USERNAME: process.env["TIANCODE_SERVER_USERNAME"],
  TIANCODE_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("TIANCODE_DISABLE_FFF"),

  // Experimental
  TIANCODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("TIANCODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  TIANCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("TIANCODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  TIANCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("TIANCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  TIANCODE_MODELS_URL: process.env["TIANCODE_MODELS_URL"],
  TIANCODE_MODELS_PATH: process.env["TIANCODE_MODELS_PATH"],
  TIANCODE_DB: process.env["TIANCODE_DB"],

  TIANCODE_WORKSPACE_ID: process.env["TIANCODE_WORKSPACE_ID"],
  TIANCODE_EXPERIMENTAL_WORKSPACES: enabledByExperimental("TIANCODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get TIANCODE_DISABLE_PROJECT_CONFIG() {
    return truthy("TIANCODE_DISABLE_PROJECT_CONFIG")
  },
  get TIANCODE_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("TIANCODE_EXPERIMENTAL_REFERENCES")
  },
  get TIANCODE_TUI_CONFIG() {
    return process.env["TIANCODE_TUI_CONFIG"]
  },
  get TIANCODE_CONFIG_DIR() {
    return process.env["TIANCODE_CONFIG_DIR"]
  },
  get TIANCODE_PURE() {
    return truthy("TIANCODE_PURE")
  },
  get TIANCODE_PERMISSION() {
    return process.env["TIANCODE_PERMISSION"]
  },
  get TIANCODE_PLUGIN_META_FILE() {
    return process.env["TIANCODE_PLUGIN_META_FILE"]
  },
  get TIANCODE_CLIENT() {
    return process.env["TIANCODE_CLIENT"] ?? "cli"
  },
}
