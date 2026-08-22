// La URL del WebSocket nunca lleva credenciales: la autenticación va por el
// ticket de un solo uso (emitido por pty.connectToken). Un auth_token en la
// querystring quedaría registrado en network.netlog y se exporta en el zip de
// debug; si el servidor no emite tickets, la conexión simplemente falla con
// 401 en vez de filtrar el password.
export function terminalWebSocketURL(input: {
  protocol?: "v1" | "v2"
  url: string
  id: string
  directory: string
  cursor: number
  ticket?: string
}) {
  const isV1 = input.protocol === "v1"
  const next = new URL(`${input.url}${isV1 ? `/pty/${input.id}/connect` : `/api/pty/${input.id}/connect`}`)
  if (isV1) {
    next.searchParams.set("directory", input.directory)
  } else {
    next.searchParams.set("location[directory]", input.directory)
  }
  next.searchParams.set("cursor", String(input.cursor))
  next.protocol = next.protocol === "https:" ? "wss:" : "ws:"
  if (input.ticket) next.searchParams.set("ticket", input.ticket)
  return next
}
