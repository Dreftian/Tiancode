import { expect, test } from "bun:test"
import type { NormalizedProviderListResponse } from "@tiancode-ai/session-ui/context"
import { selectProviderCatalog } from "./provider-catalog"

const catalog = (id: string): NormalizedProviderListResponse => ({
  all: new Map([[id, { id, name: id, source: "api", env: [], options: {}, models: {} }]]),
  connected: [id],
  default: { [id]: `${id}-model` },
})

const EMPTY = { all: new Map(), connected: [], default: {} }

test("prefers a ready directory catalog over the global one", () => {
  const directory = catalog("directory")

  expect(
    selectProviderCatalog({
      directory: "/repo",
      catalog: { ready: true, providers: directory },
      global: catalog("global"),
    }),
  ).toBe(directory)
})

test("prefers the global catalog while the directory one is still resolving", () => {
  const global = catalog("global")

  expect(
    selectProviderCatalog({
      directory: "/repo",
      catalog: { ready: false, providers: catalog("directory") },
      global,
    }),
  ).toBe(global)
})

test("uses an unresolved directory catalog rather than showing nothing", () => {
  // Deliberate since "fix(providers): restore catalog providers list and ensure local gguf
  // models visibility" (2026-08-28): with no global catalog to fall back on, an unready
  // directory catalog that already has providers beats an empty list, so locally installed
  // GGUF models stay visible while the directory store settles.
  const directory = catalog("directory")

  expect(
    selectProviderCatalog({
      directory: "/repo",
      catalog: { ready: false, providers: directory },
    }),
  ).toBe(directory)
})

test("falls back to the global catalog when it has entries", () => {
  const global = catalog("global")
  expect(selectProviderCatalog({ global })).toBe(global)
})

test("returns an empty catalog when there is nothing to show", () => {
  expect(selectProviderCatalog({})).toEqual(EMPTY)
  expect(selectProviderCatalog({ directory: "/repo" })).toEqual(EMPTY)
})

test("an empty directory catalog does not mask a populated global one", () => {
  const global = catalog("global")

  expect(
    selectProviderCatalog({
      directory: "/repo",
      catalog: { ready: true, providers: { all: new Map(), connected: [], default: {} } },
      global,
    }),
  ).toBe(global)
})
