// Exporta una conversación a Markdown legible: título, mensajes con rol y
// hora, texto en bloques de código cuando corresponde, y lista de adjuntos.

type ExportPart = { type: string; text?: string; filename?: string; name?: string }

type ExportMessage = {
  id: string
  role: string
  time?: { created: number }
  agent?: string
}

const roleLabel = (role: string) => {
  switch (role) {
    case "user":
      return "Usuario"
    case "assistant":
      return "Asistente"
    case "system":
      return "Sistema"
    default:
      return role
  }
}

const formatTime = (created: number) =>
  new Date(created).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  })

const escapeFences = (text: string) => text.replace(/```/g, "\\`\\`\\`")

export function buildChatMarkdown(input: {
  title: string
  messages: ExportMessage[]
  parts: (messageID: string) => ExportPart[]
}): string {
  const lines: string[] = [`# ${input.title || "Conversación"}`, ""]

  for (const message of input.messages) {
    const time = message.time?.created ? formatTime(message.time.created) : undefined
    const agent = message.agent ? ` · ${message.agent}` : ""
    lines.push(`## ${roleLabel(message.role)}${agent}${time ? ` · ${time}` : ""}`, "")

    const parts = input.parts(message.id)
    const textParts = parts.filter((part) => part.type === "text" && part.text?.trim())
    const attachments = parts.filter((part) => part.type !== "text")

    for (const part of textParts) {
      const text = part.text!.trim()
      if (text.split("\n").length > 1) {
        lines.push("```", escapeFences(text), "```", "")
      } else {
        lines.push(text, "")
      }
    }

    if (attachments.length > 0) {
      lines.push("**Adjuntos:**", "")
      for (const attachment of attachments) {
        const name = attachment.filename ?? attachment.name ?? attachment.type
        lines.push(`- ${name}`, "")
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n"
}
