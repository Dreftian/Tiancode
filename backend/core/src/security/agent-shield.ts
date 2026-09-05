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

const REMOTE_EXEC_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly description: string }> = [
  {
    pattern: /\b(?:curl|wget)\s+[^|;]+?\|\s*(?:ba)?sh\b/i,
    description: "Ejecución remota no verificada de scripts mediante tubería (curl/wget | sh)",
  },
  {
    pattern: /\biwr\s+[^|;]+?\|\s*iex\b/i,
    description: "Ejecución remota no verificada en PowerShell (Invoke-WebRequest | Invoke-Expression)",
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
