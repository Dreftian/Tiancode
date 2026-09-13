// Tool de borrado.
//
// Existe por una frustración concreta: «prefiero que si le doy permisos al agente de borrarlo que
// haga lo posible de hacer lo que diga por más de que haya bloqueo de windows». Hasta ahora el
// agente sólo tenía la shell, y la shell devuelve «acceso denegado» y ahí se acaba la conversación.
//
// Un bloqueo de Windows es OBLIGATORIO, no consultivo: mientras un proceso tenga el archivo abierto
// sin FILE_SHARE_DELETE, el borrado se rechaza aunque la ACL sea de control total, y se concede en
// el instante en que ese proceso muere. Así que aquí no hay ninguna política que decir «no»: lo que
// hay es una escalera (backend/tiancode/src/util/force-delete.ts) y, sobre todo, un informe que
// dice QUIÉN lo retiene y QUÉ puede hacer el usuario. Eso es lo que faltaba.
//
// Los controles son dos y los dos son reales: el permiso `delete`, limitado a la ruta pedida, y el
// permiso `process_terminate`, que se pide aparte y una vez por proceso. Matar un proceso del
// usuario para poder borrar un archivo no es una consecuencia de haber aprobado el borrado.

import { Effect, Schema } from "effect"
import path from "path"
import { lstat, readdir } from "node:fs/promises"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import { ForceDelete } from "@/util/force-delete"
import * as Tool from "./tool"
import { assertExternalDirectoryEffect } from "./external-directory"

export const Parameters = Schema.Struct({
  path: Schema.String.annotate({
    description: "Ruta absoluta del archivo o de la carpeta a borrar.",
  }),
  recursive: Schema.optional(Schema.Boolean).annotate({
    description:
      "Obligatorio para borrar una carpeta que no está vacía. Sin esto una carpeta con contenido no se toca.",
  }),
  scheduleOnReboot: Schema.optional(Schema.Boolean).annotate({
    description:
      "Si algo sigue bloqueado, deja lo que quede en la cola de borrado del próximo arranque de Windows (MoveFileEx). Windows guarda esa cola en HKLM, así que exige que Tiancode se esté ejecutando como administrador; si no lo está, la tool lo dice en vez de fallar en silencio. Úsalo sólo si el usuario acepta que el borrado se complete al reiniciar.",
  }),
  terminateHolder: Schema.optional(Schema.Boolean).annotate({
    description:
      "Permite ofrecer el cierre forzado del proceso que retiene el archivo. Nunca se aplica a Tiancode mismo y siempre pide un permiso aparte por cada proceso. Úsalo sólo si el usuario ya sabe qué programa es y ha dicho que se puede cerrar.",
  }),
})

type DeleteMetadata = {
  ok: boolean
  filepath: string
  removed: number
  failures: number
  holders: { pid: number; name: string; self: boolean }[]
  scheduled: number
  terminated: number
}

const STEPS: Record<ForceDelete.Step, string> = {
  remove: "borrado directo",
  retry: "reintentos",
  readonly: "quitar sólo-lectura",
  identify: "identificar al que lo retiene",
  schedule: "cola del próximo arranque",
  terminate: "cerrar el proceso",
}

const MAX_LISTED = 10

function listPaths(paths: readonly string[]): string[] {
  const shown = paths.slice(0, MAX_LISTED).map((item) => `  ${item}`)
  if (paths.length > MAX_LISTED) shown.push(`  … y ${paths.length - MAX_LISTED} más`)
  return shown
}

function describeHolder(holder: ForceDelete.Holder): string {
  const parts = [`  ${holder.name} (PID ${holder.pid})`]
  if (holder.service) parts.push(`servicio ${holder.service}`)
  if (holder.path) parts.push(holder.path)
  return parts.join(" — ")
}

/**
 * El informe que lee el modelo. Se exporta para poder fijarlo en los tests: lo que hace útil esta
 * tool no es el borrado, que es `unlink`, sino que este texto nombre al culpable y diga qué hacer.
 */
export function renderReport(report: ForceDelete.Report): string {
  const lines: string[] = []
  const locked = report.failures.filter((item) => ForceDelete.isLockLike(item.kind))

  if (report.ok) {
    const extra: string[] = []
    if (report.terminated.length > 0) {
      extra.push(`tras cerrar ${report.terminated.map((item) => `${item.name} (PID ${item.pid})`).join(", ")}`)
    }
    lines.push(`Borrado ${report.target} — ${report.removed} entradas${extra.length ? ` (${extra.join("; ")})` : ""}.`)
    if (report.attempts.length > 1) {
      lines.push("")
      lines.push(`Hizo falta escalar: ${report.attempts.map((item) => STEPS[item.step]).join(" → ")}.`)
    }
    return lines.join("\n")
  }

  lines.push(`No se pudo borrar del todo ${report.target}.`)
  lines.push("")
  lines.push(`Borradas ${report.removed} entradas. Quedan ${report.failures.length} sin borrar:`)
  lines.push(...listPaths(report.failures.map((item) => `${item.path} (${item.code})`)))

  lines.push("")
  lines.push(`Escalado: ${report.attempts.map((item) => `${STEPS[item.step]} ${item.ok ? "ok" : "no"}`).join(" → ")}.`)

  if (locked.length > 0 && report.platform === "win32") {
    lines.push("")
    lines.push(
      "Un bloqueo de Windows es obligatorio: mientras el proceso que lo tiene abierto siga vivo, el borrado se rechaza aunque los permisos del archivo sean de control total. No es una política de Tiancode y no hay ningún modo que lo salte.",
    )
  }

  const selfHolders = report.holders.filter((item) => item.self)
  const otherHolders = report.holders.filter((item) => !item.self)

  if (report.holders.length > 0) {
    lines.push("")
    lines.push("Lo retiene:")
    lines.push(...report.holders.map(describeHolder))
  } else if (report.probe === "ok") {
    lines.push("")
    lines.push(
      "El Administrador de reinicio de Windows no señala a nadie, y eso no quiere decir que no lo retenga nadie: sólo ve handles de archivo. Una consola o un programa cuyo directorio actual sea esa carpeta la mantiene viva sin aparecer aquí, y de los procesos de otras cuentas o de los servicios puede no informar.",
    )
  } else if (report.probe === "failed") {
    lines.push("")
    lines.push(`No se pudo consultar quién lo retiene: ${report.probeError ?? "error desconocido"}.`)
  } else if (report.probe === "skipped" && locked.length > 0 && report.platform === "win32") {
    // Sólo quedaron carpetas. Al Administrador de reinicio no se le puede preguntar por una carpeta
    // (documentado: RmGetList devuelve ERROR_ACCESS_DENIED), así que aquí no hay a quién señalar.
    lines.push("")
    lines.push(
      "Lo que queda son carpetas, y por una carpeta no se puede preguntar quién la retiene: el Administrador de reinicio de Windows sólo acepta archivos. Lo habitual es que algún programa o alguna consola tenga ahí su directorio actual.",
    )
  }

  if (report.probeSkipped > 0) {
    lines.push("")
    lines.push(
      `De ${report.probeSkipped} rutas no se pudo preguntar quién las retiene: pasan de 260 caracteres y el Administrador de reinicio de Windows no las acepta ni con el nombre corto 8.3.`,
    )
  }

  if (selfHolders.length > 0) {
    lines.push("")
    lines.push(
      "ES TIANCODE MISMO el que lo retiene. Estás borrando una build de la app desde dentro de la app: ninguna fuerza sirve mientras el proceso viva, ni cambiar permisos, ni cerrar handles, ni ejecutar como administrador.",
    )
  }

  const insideTarget = report.holders.filter((item) => !item.self && item.insideTarget)
  if (insideTarget.length > 0) {
    lines.push("")
    lines.push(
      `Se está ejecutando desde dentro de lo que se quiere borrar: ${insideTarget
        .map((item) => `${item.name} (PID ${item.pid})`)
        .join(
          ", ",
        )}. Mientras ese proceso viva, sus propios archivos no se van, y no hay permiso ni fuerza que lo cambie: hay que cerrarlo.`,
    )
  }

  if (report.scheduled.length > 0) {
    lines.push("")
    lines.push(`En cola para borrarse en el próximo arranque: ${report.scheduled.length} rutas.`)
    lines.push(...listPaths(report.scheduled))
  }
  if (report.scheduleAdminRequired) {
    lines.push("")
    lines.push(
      "La cola del próximo arranque la rechazó Windows con «acceso denegado». Está documentado: MoveFileEx con MOVEFILE_DELAY_UNTIL_REBOOT escribe en HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\PendingFileRenameOperations y sólo funciona si el proceso pertenece al grupo de administradores." +
        (report.elevated === false
          ? " Tiancode no se está ejecutando como administrador: hay que reabrirlo con «Ejecutar como administrador» y repetir."
          : " Tiancode sí se está ejecutando como administrador, así que el rechazo viene de otro sitio (una directiva del sistema o esa clave del registro protegida)."),
    )
  } else if (report.scheduleError) {
    lines.push("")
    lines.push(`La cola del próximo arranque falló: ${report.scheduleError}.`)
  }

  lines.push("")
  lines.push("Qué puede hacer el usuario:")
  if (selfHolders.length > 0) {
    lines.push("  - Cerrar Tiancode y borrar desde fuera (el explorador, o `rmdir /s /q` en una consola).")
    if (report.scheduled.length === 0) {
      lines.push(
        "  - O dejarlo en la cola del próximo arranque con `scheduleOnReboot: true`, que necesita Tiancode ejecutado como administrador.",
      )
    }
  }
  for (const holder of otherHolders) {
    lines.push(`  - Cerrar ${holder.name} (PID ${holder.pid}) y volver a pedir el borrado.`)
  }
  if (otherHolders.length > 0 && report.terminated.length === 0) {
    lines.push(
      "  - O pedir `terminateHolder: true` para que Tiancode ofrezca cerrarlo; lo confirma el usuario proceso a proceso.",
    )
  }
  if (report.holders.length === 0 && report.platform === "win32") {
    lines.push("  - Cerrar el explorador de archivos, el antivirus o el editor que pueda tener la carpeta abierta.")
    lines.push("  - O reintentar el borrado dentro de un momento: muchos bloqueos son pasajeros.")
  }
  if (report.platform !== "win32") {
    lines.push(
      "  - Revisar permisos y propietario de las rutas que quedaron: fuera de Windows no hay bloqueo de archivo.",
    )
  }

  return lines.join("\n")
}

export const DeleteTool = Tool.define<typeof Parameters, DeleteMetadata, never>(
  "delete",
  Effect.succeed({
    description:
      "Borra un archivo o una carpeta y, si Windows lo bloquea, escala en vez de rendirse: reintenta, quita el sólo-lectura, identifica con nombre y PID el proceso que retiene el archivo, y puede dejar lo que quede en la cola de borrado del próximo arranque. La respuesta nunca es «acceso denegado» a secas: dice qué pasos probó, quién lo retiene y qué puede hacer el usuario. Si quien lo retiene es Tiancode mismo lo dice claramente, porque ahí no hay fuerza que valga. Pide permiso para la ruta exacta, y un permiso aparte para cada proceso que se ofrezca cerrar.",
    parameters: Parameters,
    execute: (
      params: { path: string; recursive?: boolean; scheduleOnReboot?: boolean; terminateHolder?: boolean },
      ctx: Tool.Context,
    ) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const filepath = path.isAbsolute(params.path) ? params.path : path.join(instance.directory, params.path)
        const bridge = yield* EffectBridge.make()

        // lstat y no stat: un enlace simbólico roto también se borra, y no se sigue.
        const info = yield* Effect.promise(() => lstat(filepath).catch(() => undefined))
        if (!info) {
          return {
            title: path.basename(filepath),
            output: `No existe: ${filepath}. No hay nada que borrar.`,
            metadata: { ok: true, filepath, removed: 0, failures: 0, holders: [], scheduled: 0, terminated: 0 },
          }
        }

        const directory = info.isDirectory()
        if (directory && !params.recursive) {
          const entries = yield* Effect.promise(() => readdir(filepath).catch(() => [] as string[]))
          if (entries.length > 0) {
            return {
              title: path.basename(filepath),
              output: `${filepath} es una carpeta con ${entries.length} entradas. Vuelve a llamar con \`recursive: true\` si de verdad hay que borrarla entera.`,
              metadata: { ok: false, filepath, removed: 0, failures: 0, holders: [], scheduled: 0, terminated: 0 },
            }
          }
        }

        yield* assertExternalDirectoryEffect(ctx, filepath, { kind: directory ? "directory" : "file" })

        // El patrón es la ruta absoluta, no la relativa al worktree: lo que se borra suele estar
        // fuera del proyecto (carpetas de build), y un `..\..\..` en el diálogo no dice nada.
        // `always` se queda en esa ruta y nunca en `*`: aprobar para siempre este borrado no puede
        // convertirse en aprobar para siempre cualquier borrado.
        yield* ctx.ask({
          permission: "delete",
          patterns: [filepath],
          always: [filepath],
          metadata: { filepath, directory, recursive: params.recursive === true },
        })

        const terminateHolder = params.terminateHolder
          ? async (holder: ForceDelete.Holder) => {
              const pattern = `${holder.name} (PID ${holder.pid})`
              // Un rechazo aquí no tumba la tool: el usuario ha dicho «este proceso no», no
              // «olvida el borrado». El informe sale igual y dice que no se cerró.
              const approved = await bridge
                .promise(
                  ctx.ask({
                    permission: "process_terminate",
                    patterns: [pattern],
                    always: [pattern],
                    metadata: { pid: holder.pid, name: holder.name, executable: holder.path, filepath },
                  }),
                )
                .then(() => true)
                .catch(() => false)
              if (!approved) return false
              const killed = await ForceDelete.terminateProcess(holder.pid, ctx.abort)
              return killed.ok
            }
          : undefined

        const report = yield* Effect.promise(() =>
          ForceDelete.forceDelete({
            target: filepath,
            scheduleOnReboot: params.scheduleOnReboot === true,
            terminateHolder,
            signal: ctx.abort,
          }),
        )

        const relative = path.relative(instance.worktree, filepath)
        return {
          title: relative && !relative.startsWith("..") ? relative : filepath,
          output: renderReport(report),
          metadata: {
            ok: report.ok,
            filepath,
            removed: report.removed,
            failures: report.failures.length,
            holders: report.holders.map((item) => ({ pid: item.pid, name: item.name, self: item.self })),
            scheduled: report.scheduled.length,
            terminated: report.terminated.length,
          } satisfies DeleteMetadata,
        }
      }),
  }),
)
