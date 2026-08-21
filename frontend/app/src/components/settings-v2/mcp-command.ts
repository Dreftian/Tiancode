export function parseMcpCommand(input: string) {
  const result: string[] = []
  let current = ""
  let quote: '"' | "'" | undefined
  let escaped = false
  let started = false

  const characters = [...input.trim()]
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]!
    if (escaped) {
      current += character
      escaped = false
      started = true
      continue
    }

    if (quote) {
      if (character === quote) {
        quote = undefined
        started = true
        continue
      }
      if (character === "\\" && quote === '"' && (characters[index + 1] === '"' || characters[index + 1] === "\\")) {
        escaped = true
        continue
      }
      current += character
      started = true
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (/\s/.test(character)) {
      if (started) result.push(current)
      current = ""
      started = false
      continue
    }
    current += character
    started = true
  }

  if (escaped) current += "\\"
  if (started) result.push(current)
  return result
}

export function formatMcpCommand(command: string[]) {
  return command
    .map((argument) => {
      if (/^[^\s"'\\]+$/.test(argument)) return argument
      return `"${argument.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    })
    .join(" ")
}
