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

// Repeated runs are bounded ({0,400}, {0,8}, {1,2000}): unbounded, each pattern re-scanned the rest
// of the line from every `rm`, `dd`, `del` or `curl` word, and a long line full of them took seconds.
// The bounds sit far above any real flag group or command, and keep every scan linear.
const DESTRUCTIVE_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern: /\brm\s+-(?:[a-zA-Z]{0,8}r[a-zA-Z]{0,8}f|[a-zA-Z]{0,8}f[a-zA-Z]{0,8}r)\s+[\/\\](?:\s|$|\*)/i,
    description: "Intento de eliminación recursiva forzada de la raíz del sistema de archivos",
  },
  {
    pattern: /\brm\s+-(?:[a-zA-Z]{0,8}r[a-zA-Z]{0,8}f|[a-zA-Z]{0,8}f[a-zA-Z]{0,8}r)\s+~(?:\s|$|\/|\\)/i,
    description: "Intento de eliminación recursiva forzada del directorio de usuario principal (~)",
  },
  {
    pattern: /\brm\s+-(?:[a-zA-Z]{0,8}r[a-zA-Z]{0,8}f|[a-zA-Z]{0,8}f[a-zA-Z]{0,8}r)\s+\.git(?:\s|$|\/|\\)/i,
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
      /\brm\s+-(?:[a-zA-Z]{0,8}r[a-zA-Z]{0,8}f|[a-zA-Z]{0,8}f[a-zA-Z]{0,8}r)\s+(?:"|')?\$(?:HOME|\{HOME\})(?:[\/\\](?:\*|\.\*|\.\[[^\]\s]*\]\*|\{[^}\s]*\}|\.\.)?)?(?=["'\s;&|]|$)/i,
    description: "Intento de eliminación recursiva forzada del directorio de usuario ($HOME)",
  },
  {
    pattern:
      /\b(?:Remove-Item|ri|rm|del|rd|rmdir)\b(?=[^;|&\n]{0,400}-Recurse)[^;|&\n]{0,400}?[\s'"](?:[A-Za-z]:\\?\*?|~[\\\/]?\*?|\$HOME|\$env:USERPROFILE|\$env:SystemRoot|C:\\Windows|C:\\Users(?:\\[^\\\s'"]+)?)(?=['"\s]|$)/i,
    description:
      "Intento de borrado recursivo de una unidad, del perfil de usuario o de Windows (Remove-Item -Recurse)",
  },
  {
    pattern: /\bdd\b[^;|&\n]{0,400}\bof=\/dev\/(?:sd|hd|vd|nvme|disk|mmcblk)/i,
    description: "Escritura directa sobre un disco (dd of=/dev/…)",
  },
  {
    pattern:
      /(?:^|[;&|({"'=]|\bcmd(?:\.exe)?[ \t]+\/[ck]|\b(?:powershell|pwsh)(?:\.exe)?(?:[ \t]+-[\w:]+)*|\bStart-Process\b[^;&|\n]{0,200}?|\bstart|\bsudo)[ \t]*["']?[ \t]*(?:Format-Volume|Clear-Disk|Initialize-Disk|diskpart(?:\.exe)?)\b/im,
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

// A reader command and, later on its line, a secret file. Checked from the first reader word only:
// `reader .* secret` as one pattern restarted at every `type` word and grew with the square of the
// line (a 100 KB line took seconds).
const SECRET_LEAK_PATTERNS: ReadonlyArray<{
  readonly reader: RegExp
  readonly secret: RegExp
  readonly description: string
}> = [
  {
    reader: /\b(?:cat|type|more|less|tail|head)\s+/i,
    secret: /(?:\.env|\.env\.local|\.env\.production|\.env\.prod)\b/i,
    description: "Comando que expone variables de entorno y claves secretas (.env)",
  },
  {
    reader: /\b(?:cat|type|more|less)\s+/i,
    secret: /(?:id_rsa|id_ed25519|id_ecdsa)\b/i,
    description: "Comando que expone claves privadas SSH del sistema",
  },
  {
    reader: /\b(?:cat|type)\s+/i,
    secret: /(?:\.aws[\\\/]credentials|\.azure[\\\/]credentials)\b/i,
    description: "Comando que expone credenciales en la nube (AWS/Azure)",
  },
  {
    reader: /\b(?:cat|type)\s+/i,
    secret: /\.npmrc\b(?=[^\n]{0,1000}_authtoken)/i,
    description: "Comando que expone tokens de autenticación de npm registry",
  },
]

// Sending secrets over the network is critical, not a warning: once uploaded they cannot be recalled.
// Uploads of secret files are found by uploads() below; this is what a single pattern catches.
const EXFILTRATION_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern:
      /\b(?:printenv|env|set|Get-ChildItem\s+env:|gci\s+env:|dir\s+env:)\s*\|\s*(?:curl|wget|nc|ncat|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b/i,
    description: "Envía las variables de entorno (con posibles claves) a la red",
  },
]

// A secret file anywhere after the network command on its line: a wrapper (timeout, cmd /c,
// `if ...; then`) or `$(cat .env)` / `(Get-Content .env)` does not hide it. Not process.env,
// import.meta.env, a .env template or `--exclude .env`. Every alternative starts with a literal.
const SECRET_FILE =
  /(?:(?<!--exclude[= ]['"]?)(?<!process|meta)\.env(?!\.(?:example|sample|template|dist)\b)(?:\.[\w-]+)*(?![\w-])|id_(?:rsa|ed25519|ecdsa|dsa)\b(?!\.pub)|\.aws[\\/]credentials|\.azure[\\/]credentials|\.npmrc|\.netrc|\.pgpass|\.git-credentials|\.ssh(?:[\\/]|(?![\w.-])))/i
const NETWORK_WORD = /\b(?:curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|nc|ncat|scp|sftp|rsync)\b/i
const NETWORK_START = /^\s*(?:curl|wget|nc|ncat|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b/i
const READER_WORD = /\b(?:cat|type|more|less|head|tail|Get-Content|gc)\b/i

/**
 * A network command sending a secret file, or a secret file piped into one. Written as a scan, not
 * one pattern: a pattern restarting at every `curl` or `type` word (a minified JSON body has one per
 * key) went over the rest of the line each time and froze the server for seconds.
 */
function uploads(command: string): { description: string; matched: string } | undefined {
  for (const line of command.split("\n")) {
    const network = NETWORK_WORD.exec(line)
    if (network && SECRET_FILE.test(line.slice(network.index)))
      return {
        description: "Envía a la red archivos con secretos (.env, claves SSH o credenciales)",
        matched: line.slice(network.index, network.index + 200),
      }
    const parts = line.split(/(?<!\|)\|(?!\|)/)
    const piped = parts.findIndex(
      (part, i) =>
        i + 1 < parts.length && READER_WORD.test(part) && SECRET_FILE.test(part) && NETWORK_START.test(parts[i + 1]),
    )
    if (piped !== -1)
      return {
        description: "Pasa archivos con secretos a un comando de red",
        matched: `${parts[piped]}|${parts[piped + 1]}`.trim().slice(0, 200),
      }
  }
}

const REMOTE_EXEC_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern: /\b(?:curl|wget)\s+[^|;]{1,2000}?\|\s*(?:ba)?sh\b/i,
    description: "Ejecución remota no verificada de scripts mediante tubería (curl/wget | sh)",
  },
  {
    pattern: /\biwr\s+[^|;]{1,2000}?\|\s*iex\b/i,
    description: "Ejecución remota no verificada en PowerShell (Invoke-WebRequest | Invoke-Expression)",
  },
  {
    pattern: /\b(?:irm|Invoke-RestMethod|Invoke-WebRequest)\s+[^|;]{1,2000}?\|\s*(?:iex|Invoke-Expression)\b/i,
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
    const matched = readsSecret(trimmed, item.reader, item.secret)
    if (matched) {
      threats.push({
        level: "warning",
        category: "secret_leak",
        description: item.description,
        matched,
      })
    }
  }

  const upload = uploads(trimmed)
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

function readsSecret(command: string, reader: RegExp, secret: RegExp) {
  for (const line of command.split("\n")) {
    const start = reader.exec(line)
    if (!start) continue
    const found = secret.exec(line.slice(start.index + start[0].length))
    if (found) return `${start[0]}${found[0]}`
  }
}
