import { InstallationVersion } from "@tiancode-ai/core/installation/version"
import { which } from "@tiancode-ai/core/util/which"
import type { Hooks } from "@tiancode-ai/plugin"
import { Schema } from "effect"
import { OAUTH_DUMMY_KEY } from "../auth"
import { Process } from "../util/process"

// Ported from opencode v1.18.30 (releases 1.18.24-1.18.26): sign in to Azure with Microsoft
// Entra ID through the Azure CLI instead of requiring an API key. The resource name is asked
// for directly rather than queried from the Azure management APIs.

const AZURE_COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default"
const AZURE_FOUNDRY_SCOPE = "https://ai.azure.com/.default"
/** Refresh this far before expiry so a request never races the token going stale. */
const AZURE_TOKEN_REFRESH_BUFFER = 60_000

const AzureCliToken = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  // The CLI reports expiry as either a unix timestamp or a formatted string, by version.
  expires_on: Schema.optional(Schema.Number),
  expiresOn: Schema.optional(Schema.NonEmptyString),
})
const decodeAzureCliToken = Schema.decodeUnknownPromise(AzureCliToken)
type AzureCommand = (args: string[]) => Promise<unknown>

export async function AzureAuthPlugin(): Promise<Hooks> {
  const available = Boolean(which("az"))
  return createAzureAuthHooks(runAzure, fetch, available)
}

/** Split out from the plugin entry point so the CLI and fetch can be substituted in tests. */
export function createAzureAuthHooks(
  run: AzureCommand,
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  available: boolean,
): Hooks {
  const tokens = new Map<string, { token: string; expires: number }>()
  async function token(scope: string) {
    const cached = tokens.get(scope)
    if (cached && cached.expires - Date.now() > AZURE_TOKEN_REFRESH_BUFFER) return cached.token

    const result = await decodeAzureCliToken(
      await run(["account", "get-access-token", "--scope", scope, "--output", "json"]),
    )
    const expires = result.expires_on !== undefined ? result.expires_on * 1000 : Date.parse(result.expiresOn ?? "")
    if (!Number.isFinite(expires)) throw new Error("Azure CLI returned an invalid token expiration")
    const refreshed = { token: result.accessToken, expires }
    tokens.set(scope, refreshed)
    return refreshed.token
  }

  const prompts = []
  if (!process.env.AZURE_RESOURCE_NAME) {
    prompts.push({
      type: "text" as const,
      key: "resourceName",
      message: "Enter Azure Resource Name",
      placeholder: "e.g. my-models",
    })
  }

  const hooks: Hooks = {
    auth: {
      provider: "azure",
      async loader(getAuth) {
        if ((await getAuth()).type !== "oauth") return {}

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(input: RequestInfo | URL, init?: RequestInit) {
            const headers = new Headers(input instanceof Request ? input.headers : undefined)
            new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
            // A bearer token replaces the key headers entirely; leaving them set makes Azure
            // reject the request.
            headers.delete("api-key")
            headers.delete("x-api-key")
            headers.set("authorization", `Bearer ${await token(scopeForRequest(input))}`)
            headers.set("User-Agent", `tiancode/${InstallationVersion}`)
            return request(input, { ...init, headers })
          },
        }
      },
      methods: [
        {
          type: "api",
          label: "API key",
          prompts,
        },
        {
          type: "oauth",
          label: "Microsoft Entra ID (Azure CLI)",
          prompts,
          async authorize(inputs) {
            return {
              url: "",
              instructions: "Sign in with `az login` before continuing.",
              method: "auto",
              callback: async () => {
                const resourceName = inputs?.resourceName ?? process.env.AZURE_RESOURCE_NAME
                if (!resourceName) throw new Error("Azure Resource Name is required")

                // Fetch once up front so a broken `az login` fails here rather than on the
                // first model request.
                await token(AZURE_COGNITIVE_SERVICES_SCOPE)
                return {
                  type: "success",
                  access: OAUTH_DUMMY_KEY,
                  refresh: OAUTH_DUMMY_KEY,
                  expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
                  accountId: resourceName,
                }
              },
            }
          },
        },
      ],
    },
  }
  // Offering Entra ID without the CLI installed would present a method that cannot complete.
  if (!available && hooks.auth) hooks.auth.methods = hooks.auth.methods.filter((method) => method.type !== "oauth")
  return hooks
}

async function runAzure(args: string[]): Promise<unknown> {
  const result = await Process.run([which("az") ?? "az", ...args])
  return JSON.parse(result.stdout.toString())
}

/** Azure AI Foundry endpoints need a different scope from the classic Cognitive Services ones. */
function scopeForRequest(input: RequestInfo | URL) {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.hostname.endsWith(".services.ai.azure.com") && !url.pathname.startsWith("/models")) {
    return AZURE_FOUNDRY_SCOPE
  }
  return AZURE_COGNITIVE_SERVICES_SCOPE
}
