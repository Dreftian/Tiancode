export const LOCALES = [
  "ar",
  "br",
  "da",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "no",
  "pl",
  "ru",
  "th",
  "tr",
  "uk",
  "zh",
  "zht",
] as const

export type Locale = (typeof LOCALES)[number]

export const LOCALE_COOKIE = "tiancode-locale"
export const LOCALE_HEADER = "x-tiancode-locale"

export const basePath = "/data"
export const baseUrl = "https://tiancode.ai"

export function parseLocale(value: string | undefined | null): Locale | undefined {
  if (!value) return undefined
  const clean = value.toLowerCase().trim()
  return LOCALES.find((l) => l === clean)
}

export function fromPathname(pathname: string): Locale {
  const segs = pathname.split("/").filter(Boolean)
  if (segs.length > 0 && (LOCALES as readonly string[]).includes(segs[0])) {
    return segs[0] as Locale
  }
  return "en"
}

export function strip(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean)
  if (segs.length > 0 && (LOCALES as readonly string[]).includes(segs[0])) {
    return `/${segs.slice(1).join("/")}`
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`
}

export function route(locale: Locale, pathname: string): string {
  const stripped = strip(pathname)
  if (locale === "en") return stripped
  return `/${locale}${stripped}`
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr"
}

export function tag(locale: Locale): string {
  return locale
}

export function label(locale: Locale): string {
  const map: Record<Locale, string> = {
    ar: "العربية",
    br: "Português (Brasil)",
    da: "Dansk",
    de: "Deutsch",
    en: "English",
    es: "Español",
    fr: "Français",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    no: "Norsk",
    pl: "Polski",
    ru: "Русский",
    th: "ไทย",
    tr: "Türkçe",
    uk: "Українська",
    zh: "简体中文",
    zht: "繁體中文",
  }
  return map[locale] ?? locale
}

export function cookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
}

export function clearCookie(): string {
  return `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function detectFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return "en"
  const tokens = header.split(",").map((t) => t.trim().split(";")[0].toLowerCase())
  for (const token of tokens) {
    const direct = parseLocale(token)
    if (direct) return direct
    const short = parseLocale(token.split("-")[0])
    if (short) return short
  }
  return "en"
}

export function detectFromLanguages(languages: readonly string[] | undefined): Locale {
  if (!languages?.length) return "en"
  for (const l of languages) {
    const loc = parseLocale(l)
    if (loc) return loc
  }
  return "en"
}

export function localeFromCookieHeader(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined
  const match = header.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))
  return match ? parseLocale(match[1]) : undefined
}

export function localeFromRequest(request: Request): Locale {
  const cookieLoc = localeFromCookieHeader(request.headers.get("cookie"))
  if (cookieLoc) return cookieLoc
  return detectFromAcceptLanguage(request.headers.get("accept-language"))
}

export function localizedUrl(locale: Locale, pathname: string) {
  return `${baseUrl}${route(locale, pathname)}`
}
