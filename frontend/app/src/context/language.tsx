import * as i18n from "@solid-primitives/i18n"
import { createEffect, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@tiancode-ai/ui/context"
import { pluralCategory, type UiI18nPluralKey } from "@tiancode-ai/ui/context/i18n"
import { Persist, persisted } from "@/utils/persist"
import { dict as en } from "@/i18n/en"
import { dict as uiEn } from "@tiancode-ai/ui/i18n/en"
import {
  createDesktopNativeBundle,
  DESKTOP_NATIVE_ENGLISH,
  DESKTOP_NATIVE_LOCALES,
  type DesktopNativeBundle,
  type DesktopNativeLocale,
} from "@/i18n/desktop-native"

export type Locale = DesktopNativeLocale
export type Direction = "ltr" | "rtl"

function localeDirection(_locale: Locale): Direction {
  return "ltr"
}

type RawDictionary = typeof en & typeof uiEn
type Dictionary = i18n.Flatten<RawDictionary>
type PluralKey =
  | UiI18nPluralKey
  | "session.question.pending"
  | "session.followupDock.summary"
  | "session.revertDock.summary"
type Source = { dict: Record<string, string> }

function cookie(locale: Locale) {
  return `oc_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

const LOCALES: readonly Locale[] = DESKTOP_NATIVE_LOCALES

const INTL: Record<Locale, string> = {
  en: "en",
  "en-150": "en-150",
  es: "es",
  ja: "ja",
  zh: "zh-Hans",
  ko: "ko",
  ru: "ru",
}

const LABEL_KEY: Partial<Record<Locale, keyof Dictionary>> = {
  en: "language.en",
  zh: "language.zh",
  ko: "language.ko",
  es: "language.es",
  ja: "language.ja",
  ru: "language.ru",
}

const LABEL: Partial<Record<Locale, string>> = {
  "en-150": "English (Europe)",
}

const base = i18n.flatten({ ...en, ...uiEn })
const dicts = new Map<Locale, Dictionary>([["en", base]])

const merge = (app: Promise<Source>, ui: Promise<Source>) =>
  Promise.all([app, ui]).then(([a, b]) => ({ ...base, ...i18n.flatten({ ...a.dict, ...b.dict }) }) as Dictionary)

const loaders: Record<Exclude<Locale, "en">, () => Promise<Dictionary>> = {
  "en-150": () => merge(import("@/i18n/en-150"), import("@tiancode-ai/ui/i18n/en-150")),
  zh: () => merge(import("@/i18n/zh"), import("@tiancode-ai/ui/i18n/zh")),
  ko: () => merge(import("@/i18n/ko"), import("@tiancode-ai/ui/i18n/ko")),
  es: () => merge(import("@/i18n/es"), import("@tiancode-ai/ui/i18n/es")),
  ja: () => merge(import("@/i18n/ja"), import("@tiancode-ai/ui/i18n/ja")),
  ru: () => merge(import("@/i18n/ru"), import("@tiancode-ai/ui/i18n/ru")),
}

function loadDict(locale: Locale) {
  const hit = dicts.get(locale)
  if (hit) return Promise.resolve(hit)
  if (locale === "en") return Promise.resolve(base)
  const load = loaders[locale]
  return load().then((next: Dictionary) => {
    dicts.set(locale, next)
    return next
  })
}

export function loadLocaleDict(locale: Locale) {
  return loadDict(locale).then(() => undefined)
}

const localeMatchers: Array<{ locale: Locale; match: (language: string) => boolean }> = [
  {
    locale: "en",
    match: (language) =>
      language.startsWith("en") &&
      (language === "en" || ["en-us", "en-ca", "en-au", "en-nz"].includes(language)),
  },
  { locale: "en-150", match: (language) => language.startsWith("en") },
  { locale: "es", match: (language) => language.startsWith("es") },
  { locale: "ja", match: (language) => language.startsWith("ja") },
  { locale: "zh", match: (language) => language.startsWith("zh") },
  { locale: "ko", match: (language) => language.startsWith("ko") },
  { locale: "ru", match: (language) => language.startsWith("ru") },
]

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    const normalized = language.toLowerCase()
    const match = localeMatchers.find((entry) => entry.match(normalized))
    if (match) return match.locale
  }

  return "en"
}

export function normalizeLocale(value: string): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : "en"
}

function readStoredLocale() {
  if (typeof localStorage !== "object") return
  try {
    const raw = localStorage.getItem("tiancode.global.dat:language")
    if (!raw) return
    const next = JSON.parse(raw) as { locale?: string }
    if (typeof next?.locale !== "string") return
    return normalizeLocale(next.locale)
  } catch {
    return
  }
}

const warm = readStoredLocale() ?? detectLocale()
if (warm !== "en") void loadDict(warm)

export const { use: useLanguage, provider: LanguageProvider } = createSimpleContext({
  name: "Language",
  gate: false,
  init: (props: { locale?: Locale; onNativeTranslations?: (bundle: DesktopNativeBundle) => void }) => {
    const initial = props.locale ?? readStoredLocale() ?? detectLocale()
    const [store, setStore, _, ready] = persisted(
      Persist.global("language", ["language.v1"]),
      createStore({
        locale: initial,
      }),
    )

    const locale = createMemo<Locale>(() => normalizeLocale(store.locale))
    const intl = createMemo(() => INTL[locale()])
    const [layout, setLayout] = createStore({ direction: undefined as Direction | undefined })
    const direction = createMemo(() => layout.direction ?? localeDirection(locale()))
    const layoutLocale = createMemo(() => {
      if (!layout.direction) return intl()
      // Kobalte derives menu direction from locale rather than accepting a direction override.
      return "en"
    })

    const [dict] = createResource(locale, loadDict, {
      initialValue: dicts.get(initial) ?? base,
    })

    const t = i18n.translator(() => dict() ?? base, i18n.resolveTemplate) as (
      key: keyof Dictionary,
      params?: Record<string, string | number | boolean>,
    ) => string

    const plural = (key: PluralKey, count: number, params?: Record<string, string | number | boolean>) => {
      const category = pluralCategory(intl(), count)
      const current = (dict.loading ? base : (dict() ?? base)) as Record<string, string>
      const candidate = `${key}.${category}`
      const fallback = `${key}.other`
      return i18n.resolveTemplate(current[candidate] ?? current[fallback] ?? fallback, { ...params, count })
    }

    const label = (value: Locale) => {
      const key = LABEL_KEY[value]
      if (key) return t(key)
      return LABEL[value] ?? value
    }

    createEffect(() => {
      if (typeof document !== "object") return
      const value = locale()
      document.documentElement.lang = value
      document.documentElement.dir = direction()
      document.cookie = cookie(value)
    })

    createEffect(() => {
      if (!props.onNativeTranslations || dict.loading) return
      const current = dict()
      if (!current) return
      props.onNativeTranslations(
        createDesktopNativeBundle(locale(), (key) => current[key] ?? DESKTOP_NATIVE_ENGLISH[key]),
      )
    })

    return {
      ready,
      locale,
      intl,
      direction,
      layoutLocale,
      locales: LOCALES,
      label,
      t,
      plural,
      setLocale(next: Locale) {
        setStore("locale", normalizeLocale(next))
      },
      setDirection(next: Direction) {
        setLayout("direction", next === localeDirection(locale()) ? undefined : next)
      },
    }
  },
})
