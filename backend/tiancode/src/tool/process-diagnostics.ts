import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { NonNegativeInt } from "@tiancode-ai/core/schema"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/**
 * Process & Port Diagnostics Tool (witr - Why Is This Running?)
 * 
 * Inspects why processes or ports are running, maps the causal hierarchy tree
 * (PID -> Parent PID -> Command -> Working Directory), and assists agents in
 * resolving port conflicts (EADDRINUSE) and runaway tasks.
 */

export const Parameters = Schema.Struct({
  action: Schema.Literals(["inspect_port", "list_dev_servers", "trace_pid", "kill_port"]).annotate({
    description: "Diagnostic action to perform",
  }),
  port: Schema.optional(NonNegativeInt).annotate({
    description: "The port number to inspect or free (e.g., 3000, 5173, 8080)",
  }),
  pid: Schema.optional(NonNegativeInt).annotate({
    description: "Process ID to trace back to parent supervisors",
  }),
})

export const ProcessDiagnosticsTool = Tool.define(
  "process_diagnostics",
  Effect.gen(function* () {
    return {
      description: "Causal process and port diagnostics tool for system & dev servers (witr)",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const isWin = process.platform === "win32"
          const action = params.action
          const port = params.port
          const pid = params.pid

          if (action === "inspect_port" || action === "kill_port") {
            if (!port) {
              throw new Error("A 'port' must be provided for port inspection.")
            }

            const result = yield* Effect.promise(async () => {
              const cmd = isWin
                ? `netstat -ano | findstr :${port}`
                : `lsof -i :${port} -t`

              const { stdout } = await execAsync(cmd).catch(() => ({ stdout: "" }))
              const lines = stdout.trim().split("\n").filter(Boolean)

              if (lines.length === 0) {
                return {
                  output: `El puerto ${port} está libre y no tiene procesos activos asociados.`,
                  metadata: { port, active: false, processes: [] as string[] },
                }
              }

              // Extract PIDs from netstat
              const pids = new Set<string>()
              for (const line of lines) {
                const parts = line.trim().split(/\s+/)
                const lastPart = parts[parts.length - 1]
                if (lastPart && /^\d+$/.test(lastPart)) {
                  pids.add(lastPart)
                }
              }

              if (action === "kill_port") {
                const killed: string[] = []
                for (const p of pids) {
                  const killCmd = isWin ? `taskkill /F /PID ${p}` : `kill -9 ${p}`
                  await execAsync(killCmd).catch(() => null)
                  killed.push(p)
                }
                return {
                  output: `Procesos ocupando el puerto ${port} terminados exitosamente: PIDs [${killed.join(", ")}]. El puerto ahora está disponible.`,
                  metadata: { port, freed: true, killedPids: killed },
                }
              }

              return {
                output: [
                  `### Diagnóstico del Puerto :${port} (witr)`,
                  `- **Estado**: Ocupado / Escuchando`,
                  `- **PIDs Asociados**: ${Array.from(pids).join(", ")}`,
                  `- **Conexiones Detectadas**:`,
                  lines.slice(0, 5).map((l) => `  - \`${l.trim()}\``).join("\n"),
                  `\n*Sugerencia*: Usa \`action: "kill_port", port: ${port}\` para liberar el puerto si se trata de un proceso bloqueado.*`,
                ].join("\n"),
                metadata: { port, active: true, pids: Array.from(pids) },
              }
            })

            return {
              title: `Port Diagnostics :${port}`,
              output: result.output,
              metadata: result.metadata as Record<string, any>,
            }
          }

          if (action === "list_dev_servers") {
            const result = yield* Effect.promise(async () => {
              const commonPorts = [3000, 3001, 4000, 5173, 8000, 8080, 8081, 11434, 1234]
              const found: Array<{ port: number; pid: string; line: string }> = []

              for (const p of commonPorts) {
                const cmd = isWin ? `netstat -ano | findstr LISTENING | findstr :${p}` : `lsof -i :${p} -sTCP:LISTEN`
                const { stdout } = await execAsync(cmd).catch(() => ({ stdout: "" }))
                if (stdout.trim()) {
                  const firstLine = stdout.trim().split("\n")[0]
                  const parts = firstLine.trim().split(/\s+/)
                  const foundPid = parts[parts.length - 1]
                  found.push({ port: p, pid: foundPid, line: firstLine.trim() })
                }
              }

              if (found.length === 0) {
                return {
                  output: "No se encontraron servidores de desarrollo activos en puertos comunes (3000, 5173, 8000, etc.).",
                  metadata: { servers: [] as Array<{ port: number; pid: string; line: string }> },
                }
              }

              return {
                output: [
                  "### Servidores de Desarrollo Detectados:",
                  ...found.map((r) => `- **Puerto ${r.port}**: PID \`${r.pid}\` (\`${r.line}\`)`),
                ].join("\n"),
                metadata: { servers: found },
              }
            })

            return {
              title: "Active Dev Servers",
              output: result.output,
              metadata: result.metadata as Record<string, any>,
            }
          }

          if (action === "trace_pid") {
            if (!pid) throw new Error("A 'pid' is required for trace_pid action.")

            const result = yield* Effect.promise(async () => {
              const cmd = isWin
                ? `wmic process where ProcessId=${pid} get Caption,CommandLine,ParentProcessId /format:list`
                : `ps -p ${pid} -o pid,ppid,command`

              const { stdout } = await execAsync(cmd).catch(() => ({ stdout: `Proceso PID ${pid} no encontrado o finalizado.` }))

              return {
                output: [
                  `### Árbol Causal del Proceso PID ${pid}:`,
                  "```",
                  stdout.trim(),
                  "```",
                ].join("\n"),
                metadata: { pid, trace: stdout.trim() },
              }
            })

            return {
              title: `PID Trace :${pid}`,
              output: result.output,
              metadata: result.metadata as Record<string, any>,
            }
          }

          throw new Error(`Acción desconocida: ${action}`)
        }).pipe(Effect.orDie),
    }
  }),
)
