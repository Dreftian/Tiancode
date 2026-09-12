# INFORME DE AUDITORÍA INTEGRAL DE SEGURIDAD, RENDIMIENTO Y ESTABILIDAD
**Proyecto:** Tiancode  
**Rol Auditor:** Lead Security & Performance Auditor (Google Antigravity)  
**Fecha:** 2026-09-02  
**Modo:** Solo lectura y diagnóstico (READ-ONLY)  
**Rama analizada:** `dev` (Commit `d894c11`, versión `v1.2.14`)  
**Ecosistema:** Monorepo (Bun 1.3.14, Turborepo 2.10.2, TypeScript 5.8 / tsgo, Electron 42.3.3, Effect TS 4.0.0-beta.83, SolidJS 1.9, Drizzle ORM SQLite)

---

## 1. Arquitectura y Diagnóstico General

### 1.1 Inventario del Stack Tecnológico
- **Gestor de paquetes y Runtime:** Bun `1.3.14` con `bun.lock` (formato texto v1.3).
- **Orquestador de Monorepo:** Turborepo `2.10.2` ejecutando 27 paquetes y aplicaciones workspace.
- **Lenguajes y Tipado:** TypeScript `5.8.2` y `@typescript/native-preview` (`tsgo`) con verificación estricta.
- **Núcleo y Paradigma Funcional:** Effect TS `4.0.0-beta.83` para concurrencia estructurada, manejo de fibras, servicios contextuales y control de recursos.
- **Frontend & UI:** SolidJS `1.9.10`, `@solidjs/router`, TailwindCSS `v4.1.11`, `@kobalte/core`, Shiki `4.2.0`.
- **Entorno Desktop:** Electron `42.3.3`, `electron-vite 5.x`, `electron-builder 26.15.2`.
- **Inferencia y Audio Local:** `kokoro-js 1.2.1`, `sherpa-onnx 1.13.4`, `onnxruntime-node 1.21.0`, `@huggingface/transformers 3.8.1`.
- **Base de Datos & Almacenamiento:** SQLite embebido gestionado mediante `drizzle-orm 1.0.0-rc.2` y `@effect/sql-sqlite-bun`.

### 1.2 Puntos de Entrada de la Aplicación (Entry Points)
1. **Desktop App (Electron Main):** [`frontend/desktop/src/main/index.ts`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/index.ts) gestiona el ciclo de vida de Electron, bootstrapping del sidecar, handlers IPC y ventanas.
2. **Desktop Preload & Renderer:** [`frontend/desktop/src/preload/index.ts`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/preload/index.ts) y [`frontend/app/src/entry.tsx`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/app/src/entry.tsx).
3. **Tiancode Engine & CLI:** [`backend/tiancode/src/index.ts`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/index.ts) y ejecutable [`backend/cli/bin/lildax.cjs`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/cli/bin/lildax.cjs).
4. **Servidor HTTP / Protocolo HttpApi:** [`backend/tiancode/src/server/server.ts`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/server/server.ts) y [`backend/server/src/server.ts`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/server/src/server.ts) (puerto 4096 / loopback).
5. **Terminal User Interface (TUI):** [`frontend/tui/src/index.ts`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/tui/src/index.ts) sobre OpenTUI.
6. **Web Portal:** [`frontend/web`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/web) (Astro).

### 1.3 Variables de Entorno y Configuraciones Relevantes
- `TIANCODE_SERVER_PASSWORD` y `TIANCODE_SERVER_USERNAME`: Controlan la autenticación Basic en el servidor HTTP local.
- `TIANCODE_CREDENTIAL_KEY`: Clave AES-256 simétrica aprovisionada vía DPAPI/`safeStorage` para cifrar `auth.json`.
- `TIANCODE_AUTH_CONTENT`: Inyección opcional de credenciales JSON en memoria para CI/CD.
- `TIANCODE_PORT`: Forzado opcional del puerto TCP local.
- `TIANCODE_DISABLE_PROJECT_CONFIG`: Bandera para omitir el escaneo recursivo ascendente de `AGENTS.md`.
- `PORTABLE_EXECUTABLE_DIR`: Ruta de datos persistentes cuando se compila en modo portable.

### 1.4 Estado de Salud Diagnóstica
- **Linter (`oxlint`):** `0 errores`, `4.864 advertencias` en 2.991 archivos. Las advertencias corresponden a variables no utilizadas de Effect y SolidJS, casts inseguros y closures.
- **Comprobador de Tipos (`bun turbo typecheck` / `tsgo --noEmit`):** 27/27 paquetes compilan **sin errores de TypeScript**.
- **Tests Automatizados:** Existen fallos preexistentes en tests unitarios dependientes de rutas Windows (`canonicalizes upward discovery boundaries` en `backend/core/test/instruction-context.test.ts` debido a normalización de barras de unidades `C:/` vs `C:\`, y timeouts de 5000ms en `location-layer.test.ts`).

### 1.5 Cuello de Botella Principal del Sistema
El mayor cuello de botella del sistema es la **ejecución síncrona/monohilo de inferencia de voz en el proceso principal de Electron** (`frontend/desktop/src/main/voices.ts`). La síntesis de voz con redes neuronales ONNX (Kokoro-82M) se realiza en la CPU del proceso Node.js principal. Durante la síntesis (1.000 a 3.000 ms), el bucle de eventos (`Event Loop`) de Node.js en Electron se satura, bloqueando el procesamiento de mensajes IPC, la sincronización de ventanas y provocando advertencias de "aplicación no responsiva". Adicionalmente, el inicio de la app ejecuta procesos síncronos (`execFileSync` en `resolvePythonCommand`) que congelan la ventana hasta 5 segundos si el PATH contiene entornos lentos o el instalador stub de Microsoft Store.

---

## 2. Tabla de Problemas Críticos

| Severidad | Categoría | Archivo y Línea | Causa Raíz e Impacto |
|---|---|---|---|
| **Crítico** | Seguridad / RCE | [`frontend/desktop/src/main/desktop-pet.ts:465-470, 427, 107-112`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/desktop-pet.ts#L465-L470) | **RCE vía Prompt Injection en Desktop Pet:** Ventana auxiliar creada con `nodeIntegration: true` y `contextIsolation: false`. Embebe texto del LLM asistente vía `${initial}` sin escapar `</script>`, permitiendo inyectar etiquetas `<script>` y ejecutar código del sistema (`require('child_process')`). |
| **Crítico** | Seguridad / Terminal Hijacking | [`backend/tiancode/src/server/routes/instance/httpapi/handlers/pty.ts:195-201`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/server/routes/instance/httpapi/handlers/pty.ts#L195-L201) y [`backend/server/src/handlers/pty.ts:151-157`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/server/src/handlers/pty.ts#L151-L157) | **Secuestro de PTY vía WebSocket (CSWSH):** La verificación de ticket y origen en `/api/pty/:ptyID/connect` solo se ejecuta si el cliente envía `ticket` (`if (ticket)`). Si el atacante omite el parámetro, el WebSocket se actualiza sin autenticación ni verificación de origen (bypass total). |
| **Crítico** | Seguridad / Credenciales | [`backend/tiancode/src/auth/index.ts:73-109`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/auth/index.ts#L73-L109) | **Filtración y De-cifrado de Claves API a Texto Plano:** `Auth.set()` y `Auth.remove()` descifran todo el almacén con `yield* all()`, pero luego solo re-cifran la clave nueva al escribir en disco. El resto de las claves existentes se sobreescriben en `auth.json` en texto claro, destruyendo el cifrado AES-GCM en reposo. |
| **Alto** | Seguridad / File Deletion | [`frontend/desktop/src/main/ipc.ts:488-564`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/ipc.ts#L488-L564) | **Eliminación Arbitraria de Archivos y Carpetas del Sistema:** El handler IPC `model-hub-delete-file` ejecuta `rm(target.destPath, { recursive: true, force: true })` sin validar que la ruta resida dentro del directorio de modelos, permitiendo borrar cualquier archivo o carpeta del usuario. |
| **Alto** | Seguridad / CORS | [`backend/server/src/cors.ts:8-14`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/server/src/cors.ts#L8-L14) | **Orígenes Externos Upstream en Lista Blanca:** `allowedSiteOrigins` incluye `https://opencode.ai` y `https://app.opencode.ai`. Sitios web bajo el dominio del upstream original pueden hacer peticiones cross-origin al servidor local de Tiancode. |
| **Alto** | Rendimiento / UI Freeze | [`frontend/desktop/src/main/voices.ts:164-173, 268-274`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/voices.ts#L164-L173) | **Inferencia Neuronal Bloqueante en Proceso Principal de Electron:** Kokoro TTS corre en CPU en el hilo principal de Node.js, bloqueando el event loop de Electron durante 1-3 segundos en cada locución. |
| **Medio** | Seguridad / Code Eval | [`backend/tiancode/src/cli/cmd/debug/agent.handler.ts:110`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/cli/cmd/debug/agent.handler.ts#L110) | **Evaluación Insegura vía `new Function`:** En el comando de depuración de agentes, si `JSON.parse` falla, evalúa `new Function(\`return (${trimmed})\`)()`, posibilitando inyección de código si los parámetros provienen de flujos automatizados. |
| **Medio** | Rendimiento / Startup | [`frontend/desktop/src/main/mcp-bundle.ts:67`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/mcp-bundle.ts#L67) | **Llamadas Síncronas `execFileSync` al Inicio:** La detección del intérprete de Python ejecuta procesos síncronos con timeout de 5 segundos en el hilo principal durante el arranque de la app. |
| **Medio** | Estabilidad / Red | [`frontend/desktop/src/main/index.ts:389-404`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/index.ts#L389-L404) | **Condición de Carrera en Reserva de Puerto:** Asigna el puerto abriendo un socket en puerto `0`, cerrándolo e intentando enlazarlo después en el proceso hijo, arriesgando colisiones en puertos efímeros ocupados en TIME_WAIT. |
| **Medio** | Estabilidad / HTTP | [`frontend/desktop/src/main/windows.ts:295-299`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/windows.ts#L295-L299) | **Cabecera Invalida en Peticiones Salientes:** Modifica `onBeforeSendHeaders` inyectando `Access-Control-Allow-Origin: *` como cabecera de solicitud en vez de cabecera de respuesta. |
| **Bajo** | Código Muerto / Basura | Múltiples ubicaciones | **Archivos Huérfanos y Dependencias Fantasma:** `frontend/storybook/debug-storybook.log` (29.324 bytes log de desarrollo ajeno), `backend/tiancode/git` (archivo de 0 bytes rastreado), librerías sin importaciones (`heap-snapshot-toolkit`, `@aws-sdk/client-s3`, `sury`). |

---

## 3. Desglose de Hallazgos

### 3.1 [CRÍTICO] Remote Code Execution (RCE) vía Prompt Injection en Desktop Companion Pet
- **Ubicación:** [`frontend/desktop/src/main/desktop-pet.ts:465-470, 427, 107-112`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/desktop-pet.ts#L465-L470)
- **Cadena de Explotación:**
  1. El componente [`frontend/app/src/components/pet-companion.tsx:60-68`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/app/src/components/pet-companion.tsx#L60-L68) extrae el texto del mensaje del asistente generado por el modelo (`announcementText`).
  2. Mediante un `createEffect`, envía el texto vía IPC a `api.pet.update({ text })`.
  3. `desktop-pet.ts` genera el documento HTML usando interpolación de cadenas:
     ```ts
     const initial = JSON.stringify({ kind: state.kind, status: state.status, text: state.text, petted: state.petted ?? false })
     return `... applyState(${initial}) </script> </body> </html>`
     ```
  4. La ventana `petWindow` está configurada con:
     ```ts
     webPreferences: {
       nodeIntegration: true,
       contextIsolation: false,
       backgroundThrottling: false,
     }
     ```
  5. `JSON.stringify` **no escapa** caracteres `</script>`. Si el LLM o un archivo del proyecto induce una respuesta que contenga `</script><script>require('child_process').exec('...')</script>`, el parser HTML del motor Chromium cierra inmediatamente el tag `<script>` y evalúa el script siguiente con acceso total a Node.js (`require('child_process')`).

```ts
// CÓDIGO VULNERABLE ACTUAL:
// frontend/desktop/src/main/desktop-pet.ts
petWindow = new BrowserWindow({
  width, height, frame: false, transparent: true,
  webPreferences: {
    nodeIntegration: true,      // 🔴 Vulnerable
    contextIsolation: false,    // 🔴 Vulnerable
    backgroundThrottling: false,
  },
})

// ...
applyState(${initial}) // 🔴 initial no escapa </script>
</script>
```

```ts
// CÓDIGO REFACTORIZADO RECOMENDADO:
// frontend/desktop/src/main/desktop-pet.ts
// 1. Aislar el contexto y eliminar nodeIntegration
petWindow = new BrowserWindow({
  width, height, frame: false, transparent: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: join(__dirname, "../preload/pet.js"), // Preload mínimo con ipcRenderer.send/on
    backgroundThrottling: false,
  },
})

// 2. Escapar de forma segura cualquier contenido JSON embebido en script tags
function serializeForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
}
// applyState(${serializeForScript(initial)})
```

---

### 3.2 [CRÍTICO] Secuestro de PTY y Ejecución de Comandos vía WebSocket (CSWSH)
- **Ubicación:** [`backend/tiancode/src/server/routes/instance/httpapi/handlers/pty.ts:195-201`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/server/routes/instance/httpapi/handlers/pty.ts#L195-L201) y [`backend/server/src/handlers/pty.ts:151-157`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/server/src/handlers/pty.ts#L151-L157)
- **Causa Raíz:** En la ruta WebSocket `/api/pty/:ptyID/connect`, el handler comprueba el ticket únicamente dentro de un bloque condicional `if (ticket)`:
  ```ts
  const ticket = new URL(ctx.request.url, "http://localhost").searchParams.get(PTY_CONNECT_TICKET_QUERY)
  if (ticket) {
    const valid = validOrigin(ctx.request, cors)
      ? yield* tickets.consume({ ticket, ptyID: ctx.params.ptyID, ...(yield* ticketScope) })
      : false
    if (!valid) return HttpServerResponse.empty({ status: 403 })
  }
  // Continúa directamente al upgrade si ticket es null/undefined
  const socket = yield* Effect.orDie(ctx.request.upgrade)
  ```
- **Impacto:** En instalaciones locales (donde `TIANCODE_SERVER_PASSWORD` no está definido por defecto), cualquier página web navegada por el usuario o script local puede abrir una conexión WebSocket a `ws://127.0.0.1:4096/api/pty/<ptyID>/connect` **sin ticket** y sin restricciones CORS (los WebSockets en navegadores no aplican Same-Origin Policy). La conexión se actualiza con éxito, otorgando acceso bidireccional al pseudoterminal para inyectar comandos de consola y leer la salida de archivos.

```ts
// CÓDIGO REFACTORIZADO RECOMENDADO:
// backend/tiancode/src/server/routes/instance/httpapi/handlers/pty.ts
const ticket = new URL(ctx.request.url, "http://localhost").searchParams.get(PTY_CONNECT_TICKET_QUERY)

// 🔒 El ticket DEBE ser estrictamente obligatorio
if (!ticket) {
  return HttpServerResponse.empty({ status: 403 })
}

const originAllowed = validOrigin(ctx.request, cors)
const ticketValid = originAllowed
  ? yield* tickets.consume({ ticket, ptyID: ctx.params.ptyID, ...(yield* ticketScope) })
  : false

if (!ticketValid) {
  return HttpServerResponse.empty({ status: 403 })
}
```

---

### 3.3 [CRÍTICO] De-cifrado Silencioso y Filtración de Claves API de Proveedores a Texto Plano
- **Ubicación:** [`backend/tiancode/src/auth/index.ts:73-109`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/tiancode/src/auth/index.ts#L73-L109)
- **Causa Raíz:** `Auth.all()` lee `auth.json` y descifra todos los registros sellados (`decodeStored`). Cuando el usuario o la aplicación invoca `Auth.set()` o `Auth.remove()`:
  ```ts
  const set = Effect.fn("Auth.set")(function* (key: string, info: Info) {
    const norm = key.replace(/\/+$/, "")
    const data = yield* all() // 🔴 data contiene todos los registros descifrados en memoria
    if (norm !== key) delete data[key]
    delete data[norm + "/"]
    yield* fsys
      .writeJson(file, { ...data, [norm]: encode(info) }, 0o600) // 🔴 Solo [norm] se cifra, el resto de data se guarda en TEXTO PLANO
      .pipe(Effect.mapError(fail("Failed to write auth data")))
  })
  ```
  En `Auth.remove()`, escribe `data` directamente sin cifrar ninguna de las claves restantes:
  ```ts
  const remove = Effect.fn("Auth.remove")(function* (key: string) {
    const norm = key.replace(/\/+$/, "")
    const data = yield* all() // 🔴 data descifrada
    delete data[key]
    delete data[norm]
    yield* fsys.writeJson(file, data, 0o600).pipe(Effect.mapError(fail("Failed to write auth data"))) // 🔴 Todo en texto plano
  })
  ```
- **Impacto:** Rompe el mandato de seguridad de almacenamiento en reposo. En cuanto se añade o elimina un proveedor, todas las demás claves previamente cifradas con AES-GCM pasan a guardarse en texto plano en `~/.tiancode/auth.json`.

```ts
// CÓDIGO REFACTORIZADO RECOMENDADO:
// backend/tiancode/src/auth/index.ts
// Leer el archivo crudo en disco sin descifrar masivamente los otros valores:
const set = Effect.fn("Auth.set")(function* (key: string, info: Info) {
  const norm = key.replace(/\/+$/, "")
  const rawData = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})))) as Record<string, unknown>
  delete rawData[key]
  delete rawData[norm + "/"]
  rawData[norm] = encode(info)
  yield* fsys.writeJson(file, rawData, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")))
})

const remove = Effect.fn("Auth.remove")(function* (key: string) {
  const norm = key.replace(/\/+$/, "")
  const rawData = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})))) as Record<string, unknown>
  delete rawData[key]
  delete rawData[norm]
  delete rawData[norm + "/"]
  yield* fsys.writeJson(file, rawData, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")))
})
```

---

### 3.4 [ALTO] Eliminación Arbitraria de Archivos vía Handler IPC `model-hub-delete-file`
- **Ubicación:** [`frontend/desktop/src/main/ipc.ts:488-564`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/ipc.ts#L488-L564)
- **Causa Raíz:** En la línea 556:
  ```ts
  if (target.destPath) {
    try {
      await rm(target.destPath, { recursive: true, force: true }).catch(() => {})
      await rm(`${target.destPath}.part`, { recursive: true, force: true }).catch(() => {})
    } catch {}
  }
  ```
  No existe ninguna verificación de contención (`path.relative` o verificación de subcarpeta) que asegure que `target.destPath` resida dentro de los directorios de modelos autorizados (`candidateDirs`).
- **Impacto:** Una invocación IPC con `destPath: "C:\\Windows"` o directorios de usuario borraría silenciosamente y de forma recursiva los archivos del sistema.

```ts
// CÓDIGO REFACTORIZADO RECOMENDADO:
// frontend/desktop/src/main/ipc.ts
function isInsideAllowedDir(filePath: string, allowedDirs: string[]): boolean {
  const resolved = resolve(filePath)
  return allowedDirs.some((dir) => {
    const rel = relative(resolve(dir), resolved)
    return !rel.startsWith("..") && !isAbsolute(rel)
  })
}

if (target.destPath) {
  if (isInsideAllowedDir(target.destPath, candidateDirs)) {
    await rm(target.destPath, { recursive: true, force: true }).catch(() => {})
    await rm(`${target.destPath}.part`, { recursive: true, force: true }).catch(() => {})
  } else {
    getLogger()?.warn("Blocked unauthorized file deletion attempt", { path: target.destPath })
  }
}
```

---

### 3.5 [ALTO] Dominios Externos Upstream en la Lista Blanca de CORS
- **Ubicación:** [`backend/server/src/cors.ts:8-14`](file:///c:/Users/Dreitz/Desktop/Tiancode/backend/server/src/cors.ts#L8-L14)
- **Causa Raíz:**
  ```ts
  const allowedSiteOrigins = new Set([
    "https://opencode.ai",
    "https://app.opencode.ai",
    "https://tiancode.vercel.app",
    "https://tiancode.ai",
    "https://app.tiancode.ai",
  ])
  ```
  Los dominios `opencode.ai` y `app.opencode.ai` pertenecen a una entidad externa (upstream previo al fork). Al figurar en `allowedSiteOrigins`, cualquier script en esos dominios puede realizar peticiones cross-origin con credenciales al servidor local de Tiancode.
- **Impacto:** Exposición no intencional de la API local a servidores web ajenos al proyecto Tiancode.

```ts
// CÓDIGO REFACTORIZADO RECOMENDADO:
// backend/server/src/cors.ts
const allowedSiteOrigins = new Set([
  "https://tiancode.vercel.app",
  "https://tiancode.ai",
  "https://app.tiancode.ai",
])
```

---

### 3.6 [ALTO] Inferencia Neuronal (ONNX Kokoro-82M) Bloqueante en el Event Loop de Electron
- **Ubicación:** [`frontend/desktop/src/main/voices.ts:164-173, 268-274`](file:///c:/Users/Dreitz/Desktop/Tiancode/frontend/desktop/src/main/voices.ts#L164-L173)
- **Causa Raíz:** `KokoroTTS.from_pretrained` y `tts.generate(text, ...)` se ejecutan directamente en el hilo principal del proceso Electron (`main`). La síntesis de 200 a 1.000 caracteres en CPU mediante ONNX demanda entre 1 y 3 segundos de cómputo intensivo, durante los cuales el Event Loop no puede procesar eventos de ventana, repintado, ni mensajes IPC.
- **Impacto:** Congelamiento perceptible de la interfaz, demoras en el envío/recepción de streaming de chat y activación del sampler de ventana no responsiva.
- **Solución Recomendada:** Mover la carga e inferencia de `kokoro-js`, `sherpa-onnx` y `@huggingface/transformers` a un proceso independiente mediante `utilityProcess.fork()` de Electron o un `Worker` de Node.js.

---

## 4. Plan de Limpieza

### 4.1 Archivos y Carpetas Huérfanas a Eliminar
1. **`frontend/storybook/debug-storybook.log` (29.324 bytes):** Archivo de registro de desarrollo ajeno rastreado por error en el repositorio con rutas de usuario externas (`/Users/davidhill/...`).
2. **`backend/tiancode/git` (0 bytes):** Archivo vacío sin extensión en la raíz del backend rastreado accidentalmente en git.
3. **`backend/cli/bin/lildax.cjs` y binario `lildax` en `backend/cli/package.json`:** Nombres remanentes de fork anterior; deben consolidarse bajo el nombre oficial `tiancode`.

### 4.2 Dependencias a Desinstalar o Reemplazar
1. **`heap-snapshot-toolkit` (`package.json` raíz):**
   - *Justificación:* Paquete de 1.1.3 añadido para profiling temporal; no tiene ninguna importación en el código fuente.
2. **`@aws-sdk/client-s3` (`package.json` raíz):**
   - *Justificación:* El monorepo utiliza SST y Effect para operaciones de despliegue; el cliente directo de S3 en la raíz no está referenciado en ningún módulo.
3. **`sury` (`frontend/desktop/package.json` devDependencies):**
   - *Justificación:* Versión alpha (`11.0.0-alpha.4`) no utilizada en el empaquetado ni en los scripts de Electron.
4. **`dompurify` (Duplicación de versiones):**
   - *Justificación:* Centralizar su versión en el `catalog:` de root para evitar discrepancias entre `frontend/app` y `frontend/desktop`.

---

## 5. Hoja de Ruta de Refactorización (3 Fases)

```mermaid
graph TD
    subgraph Fase 1: Remediación Crítica de Seguridad
        F1_1[Aislar Desktop Pet y deshabilitar nodeIntegration] --> F1_2[Exigir Ticket Obligatorio en WebSocket PTY]
        F1_2 --> F1_3[Corregir persistencia cifrada en Auth.set/remove]
        F1_3 --> F1_4[Restringir model-hub-delete-file e IPC paths]
        F1_4 --> F1_5[Remover dominios opencode.ai de CORS]
    end

    subgraph Fase 2: Rendimiento y Desacoplamiento
        F2_1[Migrar Kokoro TTS y Piper a Electron utilityProcess] --> F2_2[Convertir execFileSync de mcp-bundle en asíncrono]
        F2_2 --> F2_3[Sustituir reserva por socket cero por asignación atómica]
        F2_3 --> F2_4[Mover Access-Control-Allow-Origin a onHeadersReceived]
    end

    subgraph Fase 3: Modernización e Higiene del Repositorio
        F3_1[Purgar archivos huérfanos y dependencias muertas] --> F3_2[Normalizar rutas en tests para compatibilidad Windows]
        F3_2 --> F3_3[Reducir backlog de 4800 warnings en oxlint]
    end

    Fase 1 --> Fase 2 --> Fase 3
```

### Fase 1: Remediación Inmediata de Seguridad (Prioridad P0 - Hotfix)
1. **Desktop Pet:** Configurar `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` y escapar caracteres `<>` en `serializeForScript()`.
2. **PTY WebSocket Endpoint:** Hacer que el parámetro `ticket` sea **estrictamente obligatorio** en `/api/pty/:ptyID/connect`. Denegar la conexión (HTTP 403) si el ticket no existe o si no supera `validOrigin`.
3. **Persistencia Cifrada de Credenciales:** Reescribir `Auth.set` y `Auth.remove` para manipular el JSON crudo en disco sin convertir las claves restantes a texto plano.
4. **IPC Path Traversal:** Aplicar verificación estricta de rutas (`isInsideAllowedDir`) en el handler `model-hub-delete-file`.
5. **CORS:** Purgar `https://opencode.ai` y `https://app.opencode.ai` de `allowedSiteOrigins`.

### Fase 2: Estabilización de Rendimiento y Concurrencia (Prioridad P1)
1. **Utility Process para Síntesis de Voz:** Extraer el motor ONNX / Kokoro / Piper a un `utilityProcess` de Electron conectado vía MessagePort. El hilo principal de Electron debe delegar la síntesis sin bloquear el ciclo de eventos.
2. **Arranque No Bloqueante de MCPs:** Refactorizar `resolvePythonCommand()` para usar `execFile` asíncrono en lugar de `execFileSync`.
3. **Robustez de Red:** Eliminar el patrón de reserva previa de puerto en socket cero (`createServer`) y permitir que el sidecar enlace directamente o use un mecanismo de retry con exclusión mutua.
4. **Corrección de Headers HTTP:** Mover la cabecera `Access-Control-Allow-Origin` de `onBeforeSendHeaders` a `onHeadersReceived` en `windows.ts`.

### Fase 3: Higiene, Deuda Técnica y Normalización Multiplataforma (Prioridad P2)
1. **Limpieza de Código Muerto:** Eliminar `frontend/storybook/debug-storybook.log`, `backend/tiancode/git` y desinstalar `heap-snapshot-toolkit`, `@aws-sdk/client-s3` y `sury`.
2. **Corrección de Tests en Windows:** Normalizar las barras diagonales y mayúsculas de unidades en `FSUtil.resolve` y `AbsolutePath` dentro de `backend/core/test/instruction-context.test.ts`.
3. **Limpieza de Warnings en Linters:** Abstraer o prefijar con `_` las variables no utilizadas de Effect señaladas en el backlog de `oxlint`.
