export * as AgentShield from "./agent-shield"

export type ThreatLevel = "critical" | "warning"
export type ThreatCategory = "destructive" | "secret_leak" | "unsafe_remote_exec"

export interface ShieldThreat {
  readonly level: ThreatLevel
  readonly category: ThreatCategory
  readonly description: string
  readonly matched: string
}

export interface ShieldScanResult {
  readonly safe: boolean
  readonly threats: ReadonlyArray<ShieldThreat>
}

const DESTRUCTIVE_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern: /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+[\/\\](?:\s|$|\*)/i,
    description: "Intento de eliminación recursiva forzada de la raíz del sistema de archivos",
  },
  {
    pattern: /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+~(?:\s|$|\/|\\)/i,
    description: "Intento de eliminación recursiva forzada del directorio de usuario principal (~)",
  },
  {
    pattern: /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+\.git(?:\s|$|\/|\\)/i,
    description: "Intento de eliminación forzada del repositorio Git (.git)",
  },
  {
    pattern: /\brmdir\s+\/s\s+\/q\s+[c-zC-Z]:\\(?:\s|$)/i,
    description: "Intento de eliminación destructiva de una unidad completa en Windows (rmdir /s /q)",
  },
  {
    pattern: /\bdel\s+\/f\s+\/s\s+\/q\s+[c-zC-Z]:\\(?:\s|$)/i,
    description: "Intento de eliminación masiva de una unidad en Windows (del /f /s /q)",
  },
  {
    pattern: /\bformat\s+[c-zC-Z]:(?:\s|$)/i,
    description: "Intento de formateo de unidad de disco",
  },
  {
    pattern: /\bmkfs(?:\.\w+)?\s+/i,
    description: "Intento de sobreescritura de sistema de archivos (mkfs)",
  },
  {
    pattern:
      /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+(?:"|')?\$(?:HOME|\{HOME\})(?:[\/\\](?:\*|\.\*|\.\[[^\]\s]*\]\*|\{[^}\s]*\}|\.\.)?)?(?=["'\s;&|]|$)/i,
    description: "Intento de eliminación recursiva forzada del directorio de usuario ($HOME)",
  },
  {
    pattern:
      /\b(?:Remove-Item|ri|rm|del|rd|rmdir)\b(?=[^;|&\n]*-Recurse)[^;|&\n]*?[\s'"](?:[A-Za-z]:\\?\*?|~[\\\/]?\*?|\$HOME|\$env:USERPROFILE|\$env:SystemRoot|C:\\Windows|C:\\Users(?:\\[^\\\s'"]+)?)(?=['"\s]|$)/i,
    description:
      "Intento de borrado recursivo de una unidad, del perfil de usuario o de Windows (Remove-Item -Recurse)",
  },
  {
    pattern: /\bdd\b[^;|&\n]*\bof=\/dev\/(?:sd|hd|vd|nvme|disk|mmcblk)/i,
    description: "Escritura directa sobre un disco (dd of=/dev/…)",
  },
  {
    pattern:
      /(?:^|[;&|({"'=]|\bcmd(?:\.exe)?\s+\/[ck]|\b(?:powershell|pwsh)(?:\.exe)?(?:\s+-[\w:]+)*|\bStart-Process\b[^;&|\n]{0,200}?|\bstart|\bsudo)\s*["']?\s*(?:Format-Volume|Clear-Disk|Initialize-Disk|diskpart(?:\.exe)?)\b/im,
    description: "Comando que formatea o reparticiona discos",
  },
  {
    pattern: /\b(?:chmod|chown)\s+-R\s+\S+\s+\/(?:\s|$)/i,
    description: "Cambio recursivo de permisos o propietario de la raíz del sistema",
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    description: "Bomba fork que bloquea el equipo",
  },
]

const SECRET_LEAK_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern: /\b(?:cat|type|more|less|tail|head)\s+.*(?:\.env|\.env\.local|\.env\.production|\.env\.prod)\b/i,
    description: "Comando que expone variables de entorno y claves secretas (.env)",
  },
  {
    pattern: /\b(?:cat|type|more|less)\s+.*(?:id_rsa|id_ed25519|id_ecdsa)\b/i,
    description: "Comando que expone claves privadas SSH del sistema",
  },
  {
    pattern: /\b(?:cat|type)\s+.*(?:\.aws[\\\/]credentials|\.azure[\\\/]credentials)\b/i,
    description: "Comando que expone credenciales en la nube (AWS/Azure)",
  },
  {
    pattern: /\b(?:cat|type)\s+.*\.npmrc\b.*_authtoken/i,
    description: "Comando que expone tokens de autenticación de npm registry",
  },
]

// Sending secrets over the network is critical, not a warning: once uploaded they cannot be recalled.
// Uploads of secret files are found by reading the command as words (see exfiltration below).
const EXFILTRATION_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern:
      /\b(?:printenv|env|set|Get-ChildItem\s+env:|gci\s+env:|dir\s+env:)\s*\|\s*(?:curl|wget|nc|ncat|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b/i,
    description: "Envía las variables de entorno (con posibles claves) a la red",
  },
]

const NETWORK = /^(?:curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm|nc|ncat|scp|sftp|rsync)$/
const READER = /^(?:cat|type|more|less|head|tail|get-content|gc)$/
// After these the next word is not sent: an exclusion, or where a download is saved.
const NOT_SENT = /^(?:--exclude|--exclude-from|-o|-O|--output|--output-document|-OutFile|>)$/i
const NOT_SENT_INLINE = /^(?:--exclude|--exclude-from|--output|--output-document|-OutFile)=/i
const URL_WORD = /^[a-z][\w+.-]*:\/\//i
// `host:path` for scp and rsync; one letter before the colon is a Windows drive.
const REMOTE_WORD = /^(?:[\w.-]+@)?[\w.-]{2,}:/
const TEMPLATE = /\.(?:example|sample|template|dist)$/i

/**
 * Finds a network command that sends a secret file, or a secret file piped into one. The command is
 * read as words and segments instead of with one regex: a quoted header or URL can hold `;` or `&`,
 * and a pattern over long tokens backtracked for seconds on the server thread.
 */
function exfiltration(command: string, depth = 0): { description: string; matched: string } | undefined {
  const parts = segments(command)
  for (const [index, part] of parts.entries()) {
    const start = part.words.findIndex((word) => !/^(?:sudo|\w+=\S*)$/.test(word))
    const words = start === -1 ? [] : part.words.slice(start)
    const head = program(words[0] ?? "")
    if (NETWORK.test(head)) {
      const secret = words.slice(1).find((word, i) => !NOT_SENT.test(words[i] ?? "") && secretFile(word))
      if (secret)
        return {
          description: "Envía a la red archivos con secretos (.env, claves SSH o credenciales)",
          matched: `${words[0]} ${secret}`,
        }
      const source = part.piped ? parts[index - 1]?.words : undefined
      if (source && READER.test(program(source[0] ?? "")) && source.slice(1).some(secretFile))
        return {
          description: "Pasa archivos con secretos a un comando de red",
          matched: `${source.join(" ")} | ${words[0]}`,
        }
    }
    // A command run through `powershell -Command "..."` or `sh -c '...'` is one quoted word.
    if (depth >= 2) continue
    for (const word of part.words) {
      if (!/\s/.test(word)) continue
      const nested = exfiltration(word, depth + 1)
      if (nested) return nested
    }
  }
}

function segments(command: string) {
  const parts: { words: string[]; piped: boolean }[] = [{ words: [], piped: false }]
  let word = ""
  let quote = ""
  const end = () => {
    if (word) parts[parts.length - 1].words.push(word)
    word = ""
  }
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    if (quote) {
      if (char === quote) quote = ""
      else word += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ";" || char === "&" || char === "|" || char === "\n") {
      end()
      const piped = char === "|" && command[i + 1] !== "|" && command[i - 1] !== "|"
      if (parts[parts.length - 1].words.length > 0) parts.push({ words: [], piped })
      continue
    }
    if (char === "<" || char === ">") {
      end()
      if (char === ">") parts[parts.length - 1].words.push(">")
      continue
    }
    if (/\s/.test(char)) {
      end()
      continue
    }
    word += char
  }
  end()
  return parts.filter((part) => part.words.length > 0)
}

function program(word: string) {
  return (word.split(/[\\/]/).at(-1) ?? "").toLowerCase().replace(/\.exe$/, "")
}

function secretFile(word: string) {
  if (URL_WORD.test(word) || REMOTE_WORD.test(word) || NOT_SENT_INLINE.test(word)) return false
  // `@file`, `-d@file`, `-F name=@file`, `--data-binary=@file`.
  const file = word.includes("@") ? word.slice(word.lastIndexOf("@") + 1) : word.replace(/^-{1,2}[\w-]+=/, "")
  const name = file.split(/[\\/]/).at(-1) ?? ""
  if (/^[\w.-]*\.env(?:\.[\w-]+)*$/i.test(name) && !TEMPLATE.test(name)) return true
  if (/^(?:id_rsa|id_ed25519|id_ecdsa|id_dsa|\.npmrc|\.netrc|\.pgpass|\.git-credentials)$/i.test(name)) return true
  return /\.(?:aws|azure)[\\/]credentials$/i.test(file) || /(?:^|[\\/])\.ssh(?:[\\/]|$)/i.test(file)
}

const REMOTE_EXEC_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern: /\b(?:curl|wget)\s+[^|;]+?\|\s*(?:ba)?sh\b/i,
    description: "Ejecución remota no verificada de scripts mediante tubería (curl/wget | sh)",
  },
  {
    pattern: /\biwr\s+[^|;]+?\|\s*iex\b/i,
    description: "Ejecución remota no verificada en PowerShell (Invoke-WebRequest | Invoke-Expression)",
  },
  {
    pattern: /\b(?:irm|Invoke-RestMethod|Invoke-WebRequest)\s+[^|;]+?\|\s*(?:iex|Invoke-Expression)\b/i,
    description: "Ejecución remota no verificada en PowerShell (Invoke-RestMethod | Invoke-Expression)",
  },
  {
    pattern:
      /\b(?:iex|Invoke-Expression)\s*\(\s*(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest|\(?New-Object\s+(?:System\.)?Net\.WebClient\)?)/i,
    description: "Ejecución remota no verificada en PowerShell (Invoke-Expression de un script descargado)",
  },
]

export function scanCommand(command: string): ShieldScanResult {
  const threats: ShieldThreat[] = []
  const trimmed = command.trim()

  for (const item of DESTRUCTIVE_PATTERNS) {
    const match = item.pattern.exec(trimmed)
    if (match) {
      threats.push({
        level: "critical",
        category: "destructive",
        description: item.description,
        matched: match[0],
      })
    }
  }

  for (const item of SECRET_LEAK_PATTERNS) {
    const match = item.pattern.exec(trimmed)
    if (match) {
      threats.push({
        level: "warning",
        category: "secret_leak",
        description: item.description,
        matched: match[0],
      })
    }
  }

  const upload = exfiltration(trimmed)
  if (upload) threats.push({ level: "critical", category: "secret_leak", ...upload })

  for (const item of EXFILTRATION_PATTERNS) {
    const match = item.pattern.exec(trimmed)
    if (match) {
      threats.push({
        level: "critical",
        category: "secret_leak",
        description: item.description,
        matched: match[0],
      })
    }
  }

  for (const item of REMOTE_EXEC_PATTERNS) {
    const match = item.pattern.exec(trimmed)
    if (match) {
      threats.push({
        level: "critical",
        category: "unsafe_remote_exec",
        description: item.description,
        matched: match[0],
      })
    }
  }

  return {
    safe: threats.length === 0,
    threats,
  }
}
