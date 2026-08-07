// Helpers puros de instalación de runtimes (sin dependencias de Electron).

// Comprueba si el runtime responde en su puerto conocido (Ollama 11434,
// LM Studio 1234). `fetchFn` se inyecta para poder testear sin red.
export async function probeRuntime(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 2500,
): Promise<boolean> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}
