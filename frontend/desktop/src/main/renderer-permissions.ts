const permissions = new Set([
  "clipboard-sanitized-write",
  "clipboard-read",
  "notifications",
  "media",
  "fullscreen",
  "pointerLock",
])

// Electron permission handlers belong to the session shared by all app windows.
// Opening a welcome or second window must not revoke the first window's audio.
export function createRendererPermissionPolicy(isTrustedURL: (url?: string) => boolean) {
  const renderers = new Set<number>()
  return {
    register: (id: number) => renderers.add(id),
    unregister: (id: number) => renderers.delete(id),
    allows: (input: { id?: number; permission: string; topURL?: string; requestingURL?: string }) =>
      input.id !== undefined &&
      renderers.has(input.id) &&
      permissions.has(input.permission) &&
      isTrustedURL(input.topURL) &&
      isTrustedURL(input.requestingURL),
  }
}
