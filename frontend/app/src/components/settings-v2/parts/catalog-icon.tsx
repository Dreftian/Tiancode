import { type Component, createMemo, createResource, type JSX, Match, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useServerSDK } from "@/context/server-sdk"
import { BrandIcon, brandFor } from "./brand-icon"
import { BRAND_ICONS, type BrandIconName } from "./brand-icons"

// A site's icon is fetched once per session; cards that show the same vendor share the request.
const siteIcons = new Map<string, Promise<string | undefined>>()

/**
 * The real logo of a catalog entry: the bundled mark of a brand the entry is named after, else the
 * logo its catalog publishes, else the icon its website declares (fetched by the server), else
 * `fallback`.
 */
export const CatalogIcon: Component<{
  title: string
  name?: string
  icon?: string
  domain?: string
  size?: number
  fallback: JSX.Element
}> = (props) => {
  const serverSdk = useServerSDK()
  const [state, setState] = createStore({ remoteFailed: false, siteFailed: false })
  const brand = createMemo(() => namedBrand(props.title, props.name))
  const remote = () => (!brand() && !state.remoteFailed ? props.icon : undefined)
  const [site] = createResource(
    () => (!brand() && !remote() && props.domain) || undefined,
    (domain) => {
      const cached = siteIcons.get(domain)
      if (cached) return cached
      const request = serverSdk()
        .client.global.marketplace.icon({ domain })
        .then((result) => result.data ?? undefined)
        .catch(() => undefined)
      siteIcons.set(domain, request)
      return request
    },
  )
  const size = () => props.size ?? 20
  return (
    <Switch fallback={props.fallback}>
      <Match when={brand()}>{(name) => <BrandIcon name={name()} size={size()} />}</Match>
      <Match when={remote()}>
        {(url) => (
          <img
            src={url()}
            alt=""
            width={size()}
            height={size()}
            decoding="async"
            referrerpolicy="no-referrer"
            data-component="catalog-icon"
            onError={() => setState("remoteFailed", true)}
          />
        )}
      </Match>
      <Match when={!state.siteFailed && site()}>
        {(url) => (
          <img
            src={url()}
            alt=""
            width={size()}
            height={size()}
            decoding="async"
            data-component="catalog-icon"
            onError={() => setState("siteFailed", true)}
          />
        )}
      </Match>
    </Switch>
  )
}

/**
 * A bundled brand only when the entry is named after it ("Google Drive", "Notion", "Postgres"):
 * the loose matching `brandFor` does for commands would give "Outlook Calendar" Google's calendar.
 */
export function namedBrand(...names: Array<string | undefined>): BrandIconName | undefined {
  for (const name of names) {
    const text = name?.toLowerCase().trim()
    if (!text) continue
    const brand = brandFor(text)
    if (!brand) continue
    const title = BRAND_ICONS[brand][0].toLowerCase()
    const compact = text.replace(/[\s._-]+/g, "")
    if (text.includes(title) || compact.includes(brand)) return brand
    // A shortened brand name counts ("postgres" for PostgreSQL), a word the brand merely contains does not.
    const words = text.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
    if (words.some((word) => brand.startsWith(word) || title.startsWith(word))) return brand
  }
  return undefined
}
