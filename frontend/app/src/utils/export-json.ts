import type { Message, Part, Session } from "@tiancode-ai/sdk/v2/client"

// Misma estructura que produce `opencode export` (CLI):
// `{ info: sesión, messages: [{ info, parts }] }`.
export type SessionExportData = {
  info: Session
  messages: {
    info: Message
    parts: Part[]
  }[]
}

// Solo la parte del cliente SDK que necesita la exportación.
export type SessionExportClient = {
  session: {
    get: (input: { sessionID: string; directory?: string }) => Promise<{ data?: Session | null }>
    messages: (input: {
      sessionID: string
      directory?: string
    }) => Promise<{ data?: SessionExportData["messages"] | null }>
  }
}

// Obtiene la sesión y sus mensajes completos desde el servidor.
export async function fetchSessionExport(input: {
  sessionID: string
  directory?: string
  client: SessionExportClient
}): Promise<SessionExportData> {
  const [sessionRes, messagesRes] = await Promise.all([
    input.client.session.get({ sessionID: input.sessionID, directory: input.directory }),
    input.client.session.messages({ sessionID: input.sessionID, directory: input.directory }),
  ])

  if (!sessionRes?.data) {
    throw new Error(`No se encontró la sesión: ${input.sessionID}`)
  }
  if (!messagesRes?.data) {
    throw new Error(`No se pudieron cargar los mensajes de la sesión: ${input.sessionID}`)
  }

  return {
    info: sessionRes.data,
    messages: messagesRes.data,
  }
}

// Nombre de archivo con el título (o slug, o id) normalizado a minúsculas.
export function sessionExportFilename(session: { id: string; title?: string; slug?: string }) {
  const name = session.title || session.slug || session.id
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  return `${clean || session.id}.json`
}
