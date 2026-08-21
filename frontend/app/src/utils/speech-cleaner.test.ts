import { describe, expect, test } from "bun:test"
import { cleanMarkdownForSpeech } from "./speech-cleaner"

describe("cleanMarkdownForSpeech", () => {
  test("cleans bullet points and headings into fluid natural speech", () => {
    const markdown = `
### Ideas de mejora, en orden de impacto:

**Datos / funcionalidad CRM**
* Timeline de actividad por cliente (notas, emails)
* Recordatorios de seguimiento y notificaciones
* Estados personalizados del pipeline

**UX**
* Modo oscuro, edición inline, atajos de teclado

¿Quieres que implemente alguna?
`
    const cleaned = cleanMarkdownForSpeech(markdown)
    expect(cleaned).not.toContain("###")
    expect(cleaned).not.toContain("**")
    expect(cleaned).not.toContain("*")
    expect(cleaned).toContain("Ideas de mejora, en orden de impacto:")
    expect(cleaned).toContain("Datos / funcionalidad CRM")
    expect(cleaned).toContain("Timeline de actividad por cliente (notas, emails)")
    expect(cleaned).toContain("¿Quieres que implemente alguna?")
  })

  test("strips fenced code blocks while preserving text surrounding it", () => {
    const markdown = `
Aquí está el comando que necesitas:
\`\`\`bash
npm install -g tiancode
\`\`\`
Una vez instalado, ejecuta el servidor.
`
    const cleaned = cleanMarkdownForSpeech(markdown)
    expect(cleaned).not.toContain("```")
    expect(cleaned).not.toContain("npm install")
    expect(cleaned).toContain("Aquí está el comando que necesitas:")
    expect(cleaned).toContain("Una vez instalado, ejecuta el servidor.")
  })
})
