#!/usr/bin/env bash
# Publica los paquetes npm del fork en el orden correcto (el plugin depende del
# sdk): @tiancode-ai/sdk y @tiancode-ai/plugin.
#
# Los paquetes se publican con el código fuente TypeScript (exports -> src):
# sus únicos consumidores son el propio Tiancode (runtime Bun, que ejecuta TS
# directamente) y los plugins locales del usuario, así que no hace falta
# compilar a dist.
#
# Uso:
#   bash tools/script/publish-npm.sh          # publica ambos paquetes
#   bash tools/script/publish-npm.sh --dry-run # solo prepara y empaqueta
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -W 2>/dev/null || pwd)"
DRY="${1:-}"

# versiones reales de los paquetes workspace (para resolver workspace:*)
sdk_version="$(node -p "require('$ROOT/backend/sdk/js/package.json').version")"
plugin_version="$(node -p "require('$ROOT/backend/plugin/package.json').version")"

publish_pkg() {
  local name="$1" dir="$2" version="$3"
  local stage
  stage="$(mktemp -d)"
  cp -r "$dir/src" "$stage/src"
  node - "$dir/package.json" "$sdk_version" "$ROOT/package.json" "$stage/package.json" <<'EOF'
const fs = require("fs")
const [srcPkg, sdkVersion, rootPkgPath, out] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(srcPkg, "utf8"))
const root = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"))
const catalog = root.workspaces?.catalog ?? {}
const resolve = (key, dep) => {
  if (dep === "workspace:*") return sdkVersion // única dep workspace: el sdk
  if (typeof dep === "string" && dep.startsWith("catalog:")) {
    // el valor "catalog:" se resuelve por el NOMBRE de la dependencia
    if (!catalog[key]) throw new Error(`catálogo sin versión para ${key}`)
    return catalog[key]
  }
  return dep
}
const next = {
  ...pkg,
  files: ["src"],
  dependencies: Object.fromEntries(
    Object.entries(pkg.dependencies ?? {}).map(([k, v]) => [k, resolve(k, v)]),
  ),
  devDependencies: undefined,
  scripts: {},
  // exports apuntan a src: se mantienen (consumidores Bun).
}
fs.writeFileSync(out, JSON.stringify(next, null, 2) + "\n")
EOF
  if [ "$DRY" = "--dry-run" ]; then
    (cd "$stage" && npm pack --dry-run 2>&1 | grep -E "Tarball|total files|package size" )
  else
    (cd "$stage" && npm publish --access public)
  fi
  rm -rf "$stage"
  echo "== $name@$version listo =="
}

echo "== Preparando @tiancode-ai/sdk@$sdk_version =="
publish_pkg "@tiancode-ai/sdk" "$ROOT/backend/sdk/js" "$sdk_version"
echo "== Preparando @tiancode-ai/plugin@$plugin_version =="
publish_pkg "@tiancode-ai/plugin" "$ROOT/backend/plugin" "$plugin_version"
echo "OK"
