import { describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@tiancode-ai/sdk/v2/client"
import { fetchSessionExport, sessionExportFilename, type SessionExportClient } from "./export-json"

const session = {
  id: "s1",
  slug: "mi-sesion",
  projectID: "p1",
  directory: "/tmp/proj",
  title: "Mi Sesión",
  version: "1",
  time: { created: 1, updated: 2 },
} satisfies Session

const message = {
  id: "m1",
  sessionID: "s1",
  role: "user",
  time: { created: 1 },
  agent: "primary",
  model: { providerID: "provider", modelID: "model" },
} satisfies Message

const part = {
  id: "p1",
  sessionID: "s1",
  messageID: "m1",
  type: "text",
  text: "Hola",
} satisfies Part

const fakeClient = (input: {
  session: Session | null
  messages: { info: Message; parts: Part[] }[] | null
}): SessionExportClient => ({
  session: {
    get: async () => ({ data: input.session }),
    messages: async () => ({ data: input.messages }),
  },
})

describe("sessionExportFilename", () => {
  test("normaliza el título a minúsculas y guiones", () => {
    expect(sessionExportFilename({ id: "s1", title: "Mi Sesión: Beta!" })).toBe("mi-sesi-n-beta.json")
  })

  test("conserva guiones y guiones bajos", () => {
    expect(sessionExportFilename({ id: "s1", title: "Fix_Scroll v2" })).toBe("fix_scroll-v2.json")
  })

  test("usa el id cuando el nombre queda vacío", () => {
    expect(sessionExportFilename({ id: "abc123", title: "!!!" })).toBe("abc123.json")
  })

  test("usa el slug cuando no hay título", () => {
    expect(sessionExportFilename({ id: "abc123", slug: "Mi Slug" })).toBe("mi-slug.json")
  })
})

describe("fetchSessionExport", () => {
  test("combina la sesión con sus mensajes", async () => {
    const messages = [{ info: message, parts: [part] }]
    const data = await fetchSessionExport({
      sessionID: "s1",
      client: fakeClient({ session, messages }),
    })
    expect(data).toEqual({ info: session, messages })
  })

  test("lanza cuando la sesión no existe", async () => {
    const client = fakeClient({ session: null, messages: [] })
    expect(fetchSessionExport({ sessionID: "s1", client })).rejects.toThrow("No se encontró la sesión")
  })

  test("lanza cuando falla la carga de mensajes", async () => {
    const client = fakeClient({ session, messages: null })
    expect(fetchSessionExport({ sessionID: "s1", client })).rejects.toThrow(
      "No se pudieron cargar los mensajes de la sesión",
    )
  })

  test("reenvía el directorio en ambas peticiones", async () => {
    const calls: [string, string][] = []
    const client: SessionExportClient = {
      session: {
        get: async (input) => {
          calls.push(["get", input.directory ?? ""])
          return { data: session }
        },
        messages: async (input) => {
          calls.push(["messages", input.directory ?? ""])
          return { data: [{ info: message, parts: [part] }] }
        },
      },
    }
    await fetchSessionExport({ sessionID: "s1", directory: "/tmp/proj", client })
    expect(calls).toEqual([
      ["get", "/tmp/proj"],
      ["messages", "/tmp/proj"],
    ])
  })
})
