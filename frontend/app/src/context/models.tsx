import { type Accessor, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { DateTime } from "luxon"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@tiancode-ai/ui/context"
import { useProviders } from "@/hooks/use-providers"
import { Persist, persisted } from "@/utils/persist"

export type ModelKey = { providerID: string; modelID: string }

type Visibility = "show" | "hide"
type User = ModelKey & { visibility: Visibility; favorite?: boolean }
type Store = {
  user: User[]
  recent: ModelKey[]
  variant?: Record<string, string | undefined>
}

const RECENT_LIMIT = 5

function modelKey(model: ModelKey) {
  return `${model.providerID}:${model.modelID}`
}

export const { use: useModels, provider: ModelsProvider } = createSimpleContext({
  name: "Models",
  gate: false,
  init: (props: { directory?: Accessor<string | undefined> } = {}) => {
    const providers = useProviders(() => props.directory?.())

    const [store, setStore, _, ready] = persisted(
      Persist.global("model", ["model.v1"]),
      createStore<Store>({
        user: [],
        recent: [],
        variant: {},
      }),
    )

    const available = createMemo(() => {
      const connectedProviders = providers.connected()
      const isConnected = (id: string) => connectedProviders.some((p) => p.id === id)
      const allProviders = Array.from(providers.all().values()).filter((p) => {
        if (p.id === "tiancode-native") return false
        if ((p.id === "lmstudio" || p.id === "ollama") && !isConnected(p.id)) return false
        return true
      })
      const activeProviders = connectedProviders.filter((p) => p.id !== "tiancode-native")
      const localProvidersWithModels = allProviders.filter(
        (p) => p.id === "local" && Object.keys(p.models ?? {}).length > 0,
      )
      const combined = new Map<string, (typeof allProviders)[number]>()
      for (const p of activeProviders) combined.set(p.id, p)
      for (const p of localProvidersWithModels) combined.set(p.id, p)

      const seenKeys = new Set<string>()
      const list: Array<(typeof allProviders)[number]["models"][string] & { provider: (typeof allProviders)[number] }> = []

      for (const p of combined.values()) {
        for (const [modelKeyId, m] of Object.entries(p.models ?? {})) {
          if (!m) continue
          const rawId = (m as any).id || modelKeyId
          if (typeof rawId !== "string" || !rawId) continue
          const rawName = (m as any).name || rawId
          const cleanID = rawId.replace(/\.gguf$/i, "")
          const key = `${p.id}:${cleanID}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          list.push({
            ...(m as any),
            id: cleanID,
            name: typeof rawName === "string" ? rawName.replace(/\.gguf$/i, "") : cleanID,
            provider: p,
          })
        }
      }
      return list
    })

    const release = createMemo(
      () =>
        new Map(
          available().map((model) => {
            const parsed = DateTime.fromISO(model.release_date)
            return [modelKey({ providerID: model.provider.id, modelID: model.id }), parsed] as const
          }),
        ),
    )

    const latest = createMemo(() =>
      pipe(
        available(),
        filter(
          (x) =>
            Math.abs(
              (release().get(modelKey({ providerID: x.provider.id, modelID: x.id })) ?? DateTime.invalid("invalid"))
                .diffNow()
                .as("months"),
            ) < 6,
        ),
        groupBy((x) => x.provider.id),
        mapValues((models) =>
          pipe(
            models,
            groupBy((x) => x.family),
            values(),
            (groups) =>
              groups.flatMap((g) => {
                const first = firstBy(g, [(x) => x.release_date, "desc"])
                return first ? [{ modelID: first.id, providerID: first.provider.id }] : []
              }),
          ),
        ),
        values(),
        flat(),
      ),
    )

    const latestSet = createMemo(() => new Set(latest().map((x) => modelKey(x))))

    const visibility = createMemo(() => {
      const map = new Map<string, Visibility>()
      for (const item of store.user) map.set(`${item.providerID}:${item.modelID}`, item.visibility)
      return map
    })

    const list = createMemo(() =>
      available().map((m) => ({
        ...m,
        name: m.name.replace("(latest)", "").trim(),
        latest: m.name.includes("(latest)"),
      })),
    )

    const find = (key: ModelKey) => list().find((m) => m.id === key.modelID && m.provider.id === key.providerID)

    function update(model: ModelKey, state: Visibility) {
      const index = store.user.findIndex((x) => x.modelID === model.modelID && x.providerID === model.providerID)
      if (index >= 0) {
        setStore("user", index, (current) => ({ ...current, visibility: state }))
        return
      }
      setStore("user", store.user.length, { ...model, visibility: state })
    }

    const visible = (model: ModelKey) => {
      const key = modelKey(model)
      const state = visibility().get(key)
      if (state === "hide") return false
      if (state === "show") return true
      if (latestSet().has(key)) return true
      if (model.providerID === "local") {
        return true
      }
      if (model.providerID === "ollama" || model.providerID === "lmstudio") {
        return providers.connected().some((p) => p.id === model.providerID)
      }
      const date = release().get(key)
      if (!date?.isValid) return true
      return false
    }

    const setVisibility = (model: ModelKey, state: boolean) => {
      update(model, state ? "show" : "hide")
    }

    const push = (model: ModelKey) => {
      const uniq = uniqueBy([model, ...store.recent], (x) => `${x.providerID}:${x.modelID}`)
      if (uniq.length > RECENT_LIMIT) uniq.pop()
      setStore("recent", uniq)
    }

    const variantKey = (model: ModelKey) => `${model.providerID}/${model.modelID}`
    const getVariant = (model: ModelKey) => store.variant?.[variantKey(model)]

    const setVariant = (model: ModelKey, value: string | undefined) => {
      const key = variantKey(model)
      if (!store.variant) {
        setStore("variant", { [key]: value })
        return
      }
      setStore("variant", key, value)
    }

    const [recentModels] = createResource(
      async () => {
        const recent = store.recent
        await ready.promise
        return recent
      },
      (p) => p,
      { initialValue: [] },
    )

    const connectedProviderIds = createMemo(() => new Set(providers.connected().map((p) => p.id)))

    return {
      ready,
      list,
      find,
      visible,
      setVisibility,
      recent: {
        list: () => {
          const avail = available()
          const connectedSet = connectedProviderIds()
          return (recentModels() ?? []).filter(
            (r) =>
              connectedSet.has(r.providerID) &&
              avail.some((m) => m.id === r.modelID && m.provider.id === r.providerID),
          )
        },
        push,
      },
      variant: {
        get: getVariant,
        set: setVariant,
      },
    }
  },
})
