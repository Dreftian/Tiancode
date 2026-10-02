// Static UI assets the browser fetches without app-managed credentials, e.g.
// the manifest link in <head>. These bypass auth so the page can install/render
// the manifest icons even when a server password is configured.
export const PUBLIC_UI_PATHS = new Set<string>([
  "/site.webmanifest",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-v3.ico",
  "/favicon-v3.svg",
  "/favicon-96x96-v3.png",
  "/apple-touch-icon-v3.png",
])

// The hashed bundle under /assets/ is the open-source app itself. Keeping it public lets a
// device that opened a pairing link (`/?auth_token=…`) load the page's scripts without a
// browser login prompt; the page shell and every API route still need credentials. This
// check only guards the UI fallback route, never the typed API.
export function isPublicUIPath(method: string, pathname: string) {
  if (method !== "GET") return false
  return PUBLIC_UI_PATHS.has(pathname) || pathname.startsWith("/assets/")
}
