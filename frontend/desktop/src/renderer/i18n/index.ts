import * as i18n from "@solid-primitives/i18n"

import { dict as desktopEn } from "./en"
import { dict as desktopZh } from "./zh"
import { dict as desktopKo } from "./ko"
import { dict as desktopEs } from "./es"
import { dict as desktopJa } from "./ja"
import { dict as desktopRu } from "./ru"

import { dict as appEn } from "../../../../app/src/i18n/en"
import { dict as appZh } from "../../../../app/src/i18n/zh"
import { dict as appKo } from "../../../../app/src/i18n/ko"
import { dict as appEs } from "../../../../app/src/i18n/es"
import { dict as appJa } from "../../../../app/src/i18n/ja"
import { dict as appRu } from "../../../../app/src/i18n/ru"

export type Locale = "en" | "en-150" | "es" | "ja" | "zh" | "ko" | "ru"

type RawDictionary = typeof appEn & typeof desktopEn
type Dictionary = Record<keyof i18n.Flatten<RawDictionary>, string>

const LOCALES: readonly Locale[] = ["en", "en-150", "es", "ja", "zh", "ko", "ru"]

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    const normalized = language.toLowerCase()
    if (
      normalized.startsWith("en") &&
      (normalized === "en" || ["en-us", "en-ca", "en-au", "en-nz"].includes(normalized))
    )
      return "en"
    if (normalized.startsWith("en")) return "en-150"
    if (normalized.startsWith("es")) return "es"
    if (normalized.startsWith("ja")) return "ja"
    if (normalized.startsWith("zh")) return "zh"
    if (normalized.startsWith("ko")) return "ko"
    if (normalized.startsWith("ru")) return "ru"
  }

  return "en"
}

function parseLocale(value: unknown): Locale | null {
  if (!value) return null
  if (typeof value !== "string") return null
  if ((LOCALES as readonly string[]).includes(value)) return value as Locale
  return null
}

function parseRecord(value: unknown) {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseStored(value: unknown) {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function pickLocale(value: unknown): Locale | null {
  const direct = parseLocale(value)
  if (direct) return direct

  const record = parseRecord(value)
  if (!record) return null

  return parseLocale(record.locale)
}

const base = i18n.flatten({ ...appEn, ...desktopEn })

function build(locale: Locale): Dictionary {
  if (locale === "en" || locale === "en-150") return base
  if (locale === "zh") return { ...base, ...i18n.flatten(appZh), ...i18n.flatten(desktopZh) }
  if (locale === "es") return { ...base, ...i18n.flatten(appEs), ...i18n.flatten(desktopEs) }
  if (locale === "ja") return { ...base, ...i18n.flatten(appJa), ...i18n.flatten(desktopJa) }
  if (locale === "ru") return { ...base, ...i18n.flatten(appRu), ...i18n.flatten(desktopRu) }
  return { ...base, ...i18n.flatten(appKo), ...i18n.flatten(desktopKo) }
}

const state = {
  locale: detectLocale(),
  dict: base as Dictionary,
  init: undefined as Promise<Locale> | undefined,
}

state.dict = build(state.locale)

const translate = i18n.translator(() => state.dict, i18n.resolveTemplate)

export function t(key: keyof Dictionary, params?: Record<string, string | number>) {
  return translate(key, params)
}

export function initI18n(): Promise<Locale> {
  const cached = state.init
  if (cached) return cached

  const promise = (async () => {
    const raw = await window.api.storeGet("tiancode.global.dat", "language").catch(() => null)
    const value = parseStored(raw)
    const next = pickLocale(value) ?? state.locale

    state.locale = next
    state.dict = build(next)
    return next
  })().catch(() => state.locale)

  state.init = promise
  return promise
}
