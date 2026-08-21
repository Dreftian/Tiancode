// Helpers puros de plugins (sin dependencias de UI) para reutilizar en la UI
// y en tests. Una entry es `string | [spec, options]`; las options son opacas
// salvo `enabled: false`, que el runtime interpreta como "no cargar".

export type PluginEntry = string | [string, { [key: string]: unknown }]

export const pluginName = (entry: PluginEntry) => (typeof entry === "string" ? entry : entry[0])
export const pluginOptions = (entry: PluginEntry) => (typeof entry === "string" ? undefined : entry[1])

// Un plugin desactivado se conserva en config con { enabled: false }; el
// runtime lo omite al cargar. Cualquier otra opción se pasa al plugin tal cual.
export const pluginEnabled = (entry: PluginEntry) => pluginOptions(entry)?.["enabled"] !== false

export const pluginOrigin = (entry: PluginEntry) => {
  const name = pluginName(entry)
  if (name.startsWith("file:") || name.startsWith(".") || name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name)) {
    return "local"
  }
  return "npm"
}

// Nombre legible: las entradas auto-descubiertas llegan como file:///.../x.ts.
export const displayName = (entry: PluginEntry) => {
  const name = pluginName(entry)
  const file = name.split("/").at(-1) ?? name
  return file.endsWith(".ts") ? file.slice(0, -3) : file
}

// Versión declarada en el spec ("pkg@1.2.3", "@scope/pkg@1.2.3"); si el spec no
// la lleva no se puede conocer sin un endpoint de estado, así que no se muestra.
export const pluginVersion = (entry: PluginEntry): string | undefined => {
  const name = pluginName(entry)
  const at = name.lastIndexOf("@")
  if (at <= 0) return undefined
  if (name.startsWith("@") && at === name.indexOf("@")) return undefined
  const version = name.slice(at + 1)
  return /^\d/.test(version) ? version : undefined
}

export const samePlugin = (a: string, b: string) => a === b || displayName(a) === displayName(b)
