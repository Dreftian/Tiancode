// Uso del computador: el agente mueve el ratón y teclea en ESTE PC.
//
// Electron sabe fotografiar la pantalla y leer el portapapeles, pero no tiene ninguna API para
// mover el cursor real, mandar una pulsación a otra aplicación o traer al frente la ventana de
// otro proceso. Eso es user32 (SendInput, SetCursorPos, GetForegroundWindow), y aquí se llega por
// donde ya se llega en window-match.ts: PowerShell.
//
// La diferencia con window-match.ts es que aquí no vale un `execFile` por consulta. Arrancar
// powershell.exe cuesta ~310 ms; un clic tiene que costar lo que cuesta un clic. Así que el host
// se arranca UNA vez, declara las firmas P/Invoke con Add-Type y se queda escuchando: una línea
// JSON por comando, una línea JSON por respuesta. El ciclo de vida imita a voices.ts — mapa de
// peticiones pendientes por id y un `exit` que RECHAZA todas las que estuvieran en vuelo, porque
// un host muerto que no contesta deja al agente colgado hasta el timeout de la tool.
//
// Los controles de seguridad viven aquí, en el proceso principal, nunca en el prompt del modelo:
//
// 1. Sólo Windows. En macOS haría falta el consentimiento TCC de Accesibilidad y otro backend; en
//    Linux depende de X11 o Wayland. Se dice claramente en vez de fallar de forma rara.
// 2. Ventana elevada: UIPI descarta la entrada sintética de un proceso no elevado hacia una
//    ventana elevada, y SendInput DEVUELVE ÉXITO igualmente. El agente creería haber hecho clic.
//    Se comprueba la elevación antes de actuar y se rechaza; si no se puede leer, también se
//    rechaza (cerrar en caso de duda).
// 3. Lista de apps permitidas, vacía de partida: la primera acción de cada sesión abre un diálogo
//    que nombra la aplicación y espera un sí explícito del usuario.
// 4. La propia ventana de Tiancode nunca es un objetivo válido: si lo fuera, el agente podría
//    hacer clic en los botones del propio diálogo de permisos.
// 5. Gestores de contraseñas: no se puede inspeccionar el DOM de otra aplicación, así que NO hay
//    forma de saber si el cursor está sobre un campo de contraseña. Lo que sí se puede es
//    reconocer el proceso: si delante hay un gestor de credenciales conocido (o el diálogo de
//    UAC), se rechaza toda la entrada. Es una barrera parcial y se documenta como tal.
// 6. Indicador visible mientras el agente controla, y botón de parada. Sin indicador no hay
//    control: si la ventana no se puede abrir, la sesión no arranca.

import { spawn, type ChildProcess } from "node:child_process"
import { join } from "node:path"

// Nada de `import ... from "electron"`: este módulo se prueba con `bun test`, donde electron no
// existe. Lo que hace falta de Electron entra inyectado en `registerComputerUseIpc`, y los tipos
// vienen del namespace global `Electron` (igual que en capture.ts), que se borra al compilar.
export type ComputerUseHost = {
  ipcMain: Electron.IpcMain
  dialog: Electron.Dialog
  app: Electron.App
  globalShortcut: Electron.GlobalShortcut
  screen: Electron.Screen
  browserWindow: typeof Electron.BrowserWindow
  /** `write` de logging.ts, ya con el scope puesto. */
  log: (message: string, data?: Record<string, unknown>, level?: "info" | "warn" | "error") => void
  /**
   * `nativeT`. Devuelve `undefined` mientras la clave no exista en el paquete nativo, que vive en
   * frontend/app/src/i18n y no se toca desde aquí; hasta entonces se usa FALLBACK_TEXT.
   */
  translate: (key: string, params?: Record<string, string | number>) => string | undefined
}

// ---------------------------------------------------------------------------------------------
// Parte pura (la que cubre computer-use.test.ts)
// ---------------------------------------------------------------------------------------------

export type ComputerActionName = "move" | "click" | "type" | "key" | "scroll" | "cursor_position" | "foreground_window"

export type ComputerRequest = {
  action: ComputerActionName
  x?: number
  y?: number
  button: "left" | "right" | "middle"
  double: boolean
  text?: string
  keys?: string
  direction?: "up" | "down" | "left" | "right"
  amount: number
}

/** Acciones que mandan entrada al escritorio; las otras dos sólo leen. */
const INPUT_ACTIONS = new Set<ComputerActionName>(["move", "click", "type", "key", "scroll"])

export function isInputAction(action: ComputerActionName): boolean {
  return INPUT_ACTIONS.has(action)
}

/** Un `type` es una ráfaga de SendInput: más allá de esto es un script, no una interacción. */
export const MAX_TYPE_CHARS = 2_000

/** Fuera de esto no hay pantalla: coordenadas así sólo salen de un error del modelo. */
const MAX_COORDINATE = 32_000

const VK_MODIFIERS: Record<string, number> = {
  ctrl: 0x11,
  control: 0x11,
  shift: 0x10,
  alt: 0x12,
  option: 0x12,
  win: 0x5b,
  cmd: 0x5b,
  meta: 0x5b,
  super: 0x5b,
}

// Teclas con nombre. Las de puntuación son códigos OEM y dependen de la distribución del teclado
// (en un teclado español ";" no está donde el VK dice), así que para texto se usa `type`, que va
// por Unicode y no depende de la distribución.
const VK_NAMED: Record<string, number> = {
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  esc: 0x1b,
  escape: 0x1b,
  space: 0x20,
  spacebar: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  capslock: 0x14,
  printscreen: 0x2c,
  numlock: 0x90,
  scrolllock: 0x91,
  pause: 0x13,
  menu: 0x5d,
  apps: 0x5d,
  "-": 0xbd,
  "=": 0xbb,
  "[": 0xdb,
  "]": 0xdd,
  ";": 0xba,
  "'": 0xde,
  ",": 0xbc,
  ".": 0xbe,
  "/": 0xbf,
  "`": 0xc0,
  "+": 0xbb,
}

// Teclas extendidas: sin el flag KEYEVENTF_EXTENDEDKEY las aplicaciones que leen el scan code
// confunden las flechas y el bloque de edición con el teclado numérico.
const EXTENDED_VKS = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x2c, 0x90])

export function isExtendedKey(vk: number): boolean {
  return EXTENDED_VKS.has(vk)
}

export type ParsedChord = { modifiers: number[]; key: number; extended: boolean }

/**
 * "ctrl+shift+p" → modificadores + tecla, en códigos virtuales de Windows.
 *
 * Devuelve un error legible en vez de lanzar: lo lee el agente, que tiene que poder corregir el
 * acorde sin que la tool reviente.
 */
export function parseChord(raw: string): { ok: true; chord: ParsedChord } | { ok: false; error: string } {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return { ok: false, error: "El acorde está vacío." }

  // "ctrl++" y "+" se escriben con un "+" final que split() deja como token vacío.
  let tokens = trimmed.split("+").map((token) => token.trim().toLowerCase())
  if (tokens.length > 1 && tokens[tokens.length - 1] === "") {
    tokens = [...tokens.slice(0, -1), "+"]
  }
  tokens = tokens.filter((token, index) => token !== "" || index === tokens.length - 1)
  if (tokens.length === 0 || tokens.some((token) => token === "")) {
    return { ok: false, error: `No entiendo el acorde "${trimmed}".` }
  }
  if (tokens.length > 5) return { ok: false, error: "Demasiadas teclas en el acorde (máximo 5)." }

  const modifiers: number[] = []
  for (const token of tokens.slice(0, -1)) {
    const vk = VK_MODIFIERS[token]
    if (vk === undefined) {
      return { ok: false, error: `"${token}" no es un modificador (ctrl, shift, alt, win).` }
    }
    if (!modifiers.includes(vk)) modifiers.push(vk)
  }

  const last = tokens[tokens.length - 1]!
  const key = resolveKey(last)
  if (key === undefined) return { ok: false, error: `No conozco la tecla "${last}".` }
  return { ok: true, chord: { modifiers, key, extended: isExtendedKey(key) } }
}

function resolveKey(token: string): number | undefined {
  if (token.length === 1) {
    const code = token.charCodeAt(0)
    if (code >= 97 && code <= 122) return code - 32 // a-z → VK_A..VK_Z
    if (code >= 48 && code <= 57) return code // 0-9
  }
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/.exec(token)
  if (fn) return 0x70 + Number(fn[1]) - 1
  const named = VK_NAMED[token]
  if (named !== undefined) return named
  // Un modificador suelto también es una tecla válida ("alt" para abrir el menú).
  return VK_MODIFIERS[token]
}

/** El nombre del ejecutable, en minúsculas, a partir de la ruta completa que da Windows. */
export function processName(fullPath: string): string {
  if (!fullPath) return ""
  const parts = fullPath.split(/[\\/]/)
  return (parts[parts.length - 1] ?? "").toLowerCase()
}

/**
 * Procesos ante los que no se manda entrada NUNCA, ni con la app en la lista de permitidas.
 *
 * No es una garantía de "nunca escribiré una contraseña": un campo de contraseña dentro de un
 * navegador o de cualquier otra app es invisible desde fuera. Es lo único comprobable de verdad.
 */
const CREDENTIAL_PROCESSES = new Set([
  "1password.exe",
  "bitwarden.exe",
  "keepass.exe",
  "keepass2.exe",
  "keepassxc.exe",
  "lastpass.exe",
  "dashlane.exe",
  "enpass.exe",
  "nordpass.exe",
  "roboform.exe",
  "keeper.exe",
  "keeperpasswordmanager.exe",
  "protonpass.exe",
  "passwordsafe.exe",
  // Windows: consentimiento de UAC, pedido de credenciales y pantalla de inicio de sesión.
  "consent.exe",
  "credentialuibroker.exe",
  "cred ui.exe",
  "credui.exe",
  "logonui.exe",
])

export function isCredentialProcess(name: string): boolean {
  return CREDENTIAL_PROCESSES.has(name.toLowerCase())
}

function asFiniteInt(value: unknown): number | undefined {
  const num = typeof value === "string" ? Number(value) : value
  if (typeof num !== "number" || !Number.isFinite(num)) return undefined
  return Math.round(num)
}

/**
 * Normaliza y valida lo que llega del renderer. El comando cruza la red (el puente del agente es
 * HTTP) y lo compone un modelo, así que nada se da por bueno.
 */
export function validateComputerRequest(
  raw: unknown,
): { ok: true; request: ComputerRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "La acción no es un objeto." }
  // El renderer puede reenviar la acción suelta o la acción del puente entera, que la lleva
  // anidada en `computer` (ver PreviewAgentActionSchema). Se aceptan las dos formas: quien
  // reenvía y quien ejecuta son módulos distintos y no merece la pena que se rompan por la forma.
  const outer = raw as Record<string, unknown>
  const nested = outer["computer"]
  const input = (nested && typeof nested === "object" ? nested : outer) as Record<string, unknown>
  const action = input["action"]
  if (typeof action !== "string" || !isComputerActionName(action)) {
    return { ok: false, error: `Acción desconocida: ${String(action)}.` }
  }

  const button = input["button"]
  const request: ComputerRequest = {
    action,
    button: button === "right" || button === "middle" ? button : "left",
    double: input["double"] === true,
    amount: 3,
  }

  if (action === "move" || action === "click") {
    const x = asFiniteInt(input["x"])
    const y = asFiniteInt(input["y"])
    if (action === "move" && (x === undefined || y === undefined)) {
      return { ok: false, error: "`move` necesita `x` e `y`." }
    }
    if ((x === undefined) !== (y === undefined)) {
      return { ok: false, error: "`x` e `y` van juntas o no van." }
    }
    if (x !== undefined && y !== undefined) {
      if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) {
        return { ok: false, error: "Las coordenadas se salen de cualquier pantalla." }
      }
      request.x = x
      request.y = y
    }
  }

  if (action === "type") {
    const text = input["text"]
    if (typeof text !== "string" || text.length === 0) return { ok: false, error: "`type` necesita `text`." }
    if (text.length > MAX_TYPE_CHARS) {
      return { ok: false, error: `El texto pasa de ${MAX_TYPE_CHARS} caracteres; escríbelo por partes.` }
    }
    // Los caracteres de control que no son salto de línea ni tabulador no se pueden teclear.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      return { ok: false, error: "El texto lleva caracteres de control que no se pueden teclear." }
    }
    request.text = text
  }

  if (action === "key") {
    const keys = input["keys"]
    if (typeof keys !== "string") return { ok: false, error: "`key` necesita `keys` (por ejemplo \"ctrl+s\")." }
    const parsed = parseChord(keys)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    request.keys = keys
  }

  if (action === "scroll") {
    const direction = input["direction"]
    if (direction !== "up" && direction !== "down" && direction !== "left" && direction !== "right") {
      return { ok: false, error: "`scroll` necesita `direction`: up, down, left o right." }
    }
    request.direction = direction
    const amount = asFiniteInt(input["amount"])
    request.amount = amount === undefined ? 3 : Math.min(Math.max(amount, 1), 10)
  }

  return { ok: true, request }
}

function isComputerActionName(value: string): value is ComputerActionName {
  return (
    value === "move" ||
    value === "click" ||
    value === "type" ||
    value === "key" ||
    value === "scroll" ||
    value === "cursor_position" ||
    value === "foreground_window"
  )
}

/** Ventana en primer plano, tal y como la ve el host. */
export type ForegroundWindow = {
  pid: number
  /** "yes" | "no" | "unknown": "unknown" es no haber podido abrir el token, y se trata como sí. */
  elevation: string
  /** Si Tiancode corre elevado, una ventana elevada sí acepta la entrada. */
  selfElevated: boolean
  exe: string
  title: string
}

export type GuardDecision = { allow: true } | { allow: false; reason: string }

/**
 * Lo que se puede decidir sólo con la ventana de delante, sin tocar la lista de permitidas ni el
 * diálogo: apuntar a Tiancode, ventana elevada y gestores de credenciales.
 */
export function guardForeground(foreground: ForegroundWindow, ownPid: number): GuardDecision {
  if (foreground.pid === 0) {
    return { allow: false, reason: "No hay ninguna ventana en primer plano a la que dirigir la acción." }
  }
  if (foreground.pid === ownPid) {
    return {
      allow: false,
      reason:
        "La ventana de delante es la propia Tiancode. No me controlo a mí mismo: el usuario tiene que poner en primer plano la aplicación sobre la que quieres actuar.",
    }
  }
  const name = processName(foreground.exe)
  if (isCredentialProcess(name)) {
    return {
      allow: false,
      reason: `En primer plano hay ${name || "un gestor de credenciales"}. No mando teclas ni clics a gestores de contraseñas ni al diálogo de UAC de Windows.`,
    }
  }
  if (foreground.elevation !== "no" && !foreground.selfElevated) {
    const detail =
      foreground.elevation === "unknown"
        ? "no he podido comprobar si la ventana de delante corre elevada"
        : "la ventana de delante corre como administrador"
    return {
      allow: false,
      reason: `No puedo actuar ahí: ${detail}. Windows (UIPI) descarta en silencio la entrada de un proceso normal hacia una ventana elevada, así que el clic parecería funcionar y no haría nada. Pide al usuario que use esa ventana él mismo.`,
    }
  }
  return { allow: true }
}

/** Sustitución {{param}} para los textos de respaldo, mientras la clave no exista en el bundle. */
export function formatFallback(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

/**
 * Inglés de respaldo del indicador y del diálogo de consentimiento.
 *
 * Las claves nativas viven en frontend/app/src/i18n/desktop-native.ts, que este cambio no puede
 * tocar; `host.translate` devuelve la traducción en cuanto las claves entren ahí y hasta entonces
 * se ve este texto. Las frases que lee el AGENTE (no el usuario) van en español y sin clave, como
 * en agent-bridge.ts y en las demás tools.
 */
export const FALLBACK_TEXT: Record<string, string> = {
  "desktop.computerUse.consent.title": "Let Tiancode control your PC?",
  "desktop.computerUse.consent.message": "Tiancode wants to control {{app}}",
  "desktop.computerUse.consent.detail":
    "The agent will move the mouse and type in {{app}} ({{process}}) as if you were doing it. It only applies to this app, only until you stop it, and you can stop it at any time from the indicator.",
  "desktop.computerUse.consent.allow": "Allow for this app",
  "desktop.computerUse.consent.refuse": "Don't allow",
  "desktop.computerUse.indicator.title": "Tiancode is controlling your PC",
  "desktop.computerUse.indicator.app": "Controlling {{app}}",
  "desktop.computerUse.indicator.stop": "Stop",
  "desktop.computerUse.indicator.stopShortcut": "Stop ({{shortcut}})",
}

// ---------------------------------------------------------------------------------------------
// El host de PowerShell
// ---------------------------------------------------------------------------------------------

// Ruta absoluta, no el nombre suelto: la búsqueda de libuv en Windows empieza por el directorio
// actual, así que un powershell.exe plantado al lado de la app ganaría (igual que window-match.ts).
const POWERSHELL = join(
  process.env["SystemRoot"] ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
)

/** Add-Type compila con el compilador de C# la primera vez; eso es segundos, no milisegundos. */
const HOST_READY_TIMEOUT_MS = 20_000
const COMMAND_TIMEOUT_MS = 5_000
/** `type` manda cientos de eventos; se le da más margen que a un clic. */
const TYPE_TIMEOUT_MS = 15_000
/** Sin acciones durante este rato el control caduca solo y hay que volver a autorizar. */
const IDLE_TIMEOUT_MS = 2 * 60_000

// El separador de campos de las respuestas de texto del host: U+001F (Unit Separator) no aparece
// en un título de ventana ni en una ruta.
const FIELD_SEPARATOR = "\u001f"

// El script viaja en -EncodedCommand (UTF-16LE en base64) para no pelearse con el escapado de la
// línea de comandos y para no dejar un .ps1 en disco que alguien pudiera reemplazar. El límite de
// la línea de comandos de Windows son 32 767 caracteres; este script se queda muy por debajo.
const HOST_SCRIPT_SOURCE = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class TcComputer {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }

  const uint INPUT_MOUSE = 0;
  const uint INPUT_KEYBOARD = 1;
  const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;
  const uint MOUSEEVENTF_WHEEL = 0x0800;
  const uint MOUSEEVENTF_HWHEEL = 0x1000;

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll", SetLastError = true)] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageNameW(IntPtr h, uint flags, StringBuilder buf, ref uint size);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr h, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr info, uint len, out uint ret);

  static readonly char SEP = (char)31;

  // Sin conciencia de DPI, Windows miente en las coordenadas: SetCursorPos y GetCursorPos se
  // virtualizan a la escala del monitor principal y el cursor cae donde no es. Las capturas del
  // agente vienen en pixeles fisicos, asi que el host tiene que hablar en pixeles fisicos.
  public static string MakeDpiAware() {
    try { if (SetThreadDpiAwarenessContext(new IntPtr(-4)) != IntPtr.Zero) return "per-monitor-v2"; } catch {}
    try { if (SetProcessDPIAware()) return "system"; } catch {}
    return "none";
  }

  static INPUT Key(ushort vk, bool up, bool extended) {
    INPUT i = new INPUT();
    i.type = INPUT_KEYBOARD;
    i.u.ki.wVk = vk;
    i.u.ki.dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (extended ? KEYEVENTF_EXTENDEDKEY : 0);
    return i;
  }

  static INPUT Unicode(char c, bool up) {
    INPUT i = new INPUT();
    i.type = INPUT_KEYBOARD;
    i.u.ki.wScan = (ushort)c;
    i.u.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
    return i;
  }

  static INPUT Mouse(uint flags, int data) {
    INPUT i = new INPUT();
    i.type = INPUT_MOUSE;
    i.u.mi.dwFlags = flags;
    i.u.mi.mouseData = (uint)data;
    return i;
  }

  // SendInput DEVUELVE EXITO cuando UIPI descarta la entrada hacia una ventana elevada: el unico
  // fallo que se ve aqui es el de la cola llena o el de un bloqueo del sistema.
  static void Send(List<INPUT> batch) {
    if (batch.Count == 0) return;
    INPUT[] arr = batch.ToArray();
    int size = Marshal.SizeOf(typeof(INPUT));
    int offset = 0;
    while (offset < arr.Length) {
      int take = Math.Min(400, arr.Length - offset);
      INPUT[] slice = new INPUT[take];
      Array.Copy(arr, offset, slice, 0, take);
      uint sent = SendInput((uint)take, slice, size);
      if (sent != (uint)take) throw new Exception("SendInput accepted " + sent + " of " + take + " events (win32 " + Marshal.GetLastWin32Error() + ")");
      offset += take;
    }
  }

  public static void MoveTo(int x, int y) {
    if (!SetCursorPos(x, y)) throw new Exception("SetCursorPos failed (win32 " + Marshal.GetLastWin32Error() + ")");
  }

  public static void Click(string button, bool dbl) {
    uint down = 0x0002, up = 0x0004;
    if (button == "right") { down = 0x0008; up = 0x0010; }
    else if (button == "middle") { down = 0x0020; up = 0x0040; }
    List<INPUT> batch = new List<INPUT>();
    int times = dbl ? 2 : 1;
    for (int i = 0; i < times; i++) { batch.Add(Mouse(down, 0)); batch.Add(Mouse(up, 0)); }
    Send(batch);
  }

  public static void Scroll(string direction, int ticks) {
    int delta = ticks * 120;
    if (direction == "down" || direction == "left") delta = -delta;
    uint flags = (direction == "left" || direction == "right") ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL;
    List<INPUT> batch = new List<INPUT>();
    batch.Add(Mouse(flags, delta));
    Send(batch);
  }

  public static int TypeText(string text) {
    List<INPUT> batch = new List<INPUT>();
    foreach (char c in text) {
      if (c == 13) continue;
      if (c == 10) { batch.Add(Key(0x0D, false, false)); batch.Add(Key(0x0D, true, false)); continue; }
      if (c == 9) { batch.Add(Key(0x09, false, false)); batch.Add(Key(0x09, true, false)); continue; }
      batch.Add(Unicode(c, false));
      batch.Add(Unicode(c, true));
    }
    Send(batch);
    return batch.Count / 2;
  }

  // Las sueltas van en un finally: si el batch de bajada falla a medias, un Ctrl o un Alt colgado
  // deja el teclado del usuario inservible hasta que vuelva a pulsarlo.
  public static void Chord(int[] modifiers, int key, bool extended) {
    List<INPUT> down = new List<INPUT>();
    foreach (int m in modifiers) down.Add(Key((ushort)m, false, false));
    down.Add(Key((ushort)key, false, extended));
    try { Send(down); }
    finally {
      List<INPUT> up = new List<INPUT>();
      up.Add(Key((ushort)key, true, extended));
      for (int i = modifiers.Length - 1; i >= 0; i--) up.Add(Key((ushort)modifiers[i], true, false));
      Send(up);
    }
  }

  public static void ReleaseModifiers() {
    List<INPUT> up = new List<INPUT>();
    ushort[] mods = new ushort[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5 };
    foreach (ushort m in mods) up.Add(Key(m, true, false));
    Send(up);
  }

  public static string Cursor() {
    POINT p;
    if (!GetCursorPos(out p)) throw new Exception("GetCursorPos failed (win32 " + Marshal.GetLastWin32Error() + ")");
    return p.X + "" + SEP + p.Y + "" + SEP + GetSystemMetrics(0) + "" + SEP + GetSystemMetrics(1);
  }

  static string Elevation(IntPtr process) {
    IntPtr token;
    if (!OpenProcessToken(process, 0x0008, out token)) return "unknown";
    string result = "unknown";
    IntPtr buffer = Marshal.AllocHGlobal(4);
    try {
      uint returned;
      if (GetTokenInformation(token, 20, buffer, 4, out returned)) result = Marshal.ReadInt32(buffer) != 0 ? "yes" : "no";
    } finally {
      Marshal.FreeHGlobal(buffer);
      CloseHandle(token);
    }
    return result;
  }

  public static string SelfElevated() {
    return Elevation(GetCurrentProcess());
  }

  // pid SEP elevacion SEP elevacionPropia SEP ejecutable SEP titulo
  public static string Foreground() {
    IntPtr window = GetForegroundWindow();
    string self = SelfElevated();
    if (window == IntPtr.Zero) return "0" + SEP + "unknown" + SEP + self + SEP + "" + SEP + "";
    uint pid = 0;
    GetWindowThreadProcessId(window, out pid);
    StringBuilder title = new StringBuilder(512);
    GetWindowTextW(window, title, title.Capacity);
    string exe = "";
    string elevation = "unknown";
    IntPtr process = OpenProcess(0x1000, false, pid);
    if (process != IntPtr.Zero) {
      try {
        StringBuilder path = new StringBuilder(1024);
        uint capacity = (uint)path.Capacity;
        if (QueryFullProcessImageNameW(process, 0, path, ref capacity)) exe = path.ToString();
        elevation = Elevation(process);
      } finally { CloseHandle(process); }
    }
    return pid + "" + SEP + elevation + SEP + self + SEP + exe + SEP + title.ToString();
  }
}
'@
$dpi = [TcComputer]::MakeDpiAware()
$enc = New-Object System.Text.UTF8Encoding($false)
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $enc)
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $enc)
$stdout.AutoFlush = $true
$stdout.WriteLine((ConvertTo-Json -Compress @{ type = 'ready'; dpi = $dpi; pid = $PID }))
while ($null -ne ($line = $stdin.ReadLine())) {
  if ($line.Trim().Length -eq 0) { continue }
  $id = ''
  try {
    $req = $line | ConvertFrom-Json
    $id = [string]$req.id
    $data = ''
    switch ($req.action) {
      'move' { [TcComputer]::MoveTo([int]$req.x, [int]$req.y) }
      'click' { [TcComputer]::Click([string]$req.button, [bool]$req.double) }
      'type' { $data = [string][TcComputer]::TypeText([string]$req.text) }
      'key' { [TcComputer]::Chord([int[]]@($req.modifiers), [int]$req.key, [bool]$req.extended) }
      'scroll' { [TcComputer]::Scroll([string]$req.direction, [int]$req.amount) }
      'cursor' { $data = [TcComputer]::Cursor() }
      'foreground' { $data = [TcComputer]::Foreground() }
      'panic' { [TcComputer]::ReleaseModifiers() }
      'ping' { $data = 'pong' }
      default { throw ('unknown action: ' + [string]$req.action) }
    }
    $stdout.WriteLine((ConvertTo-Json -Compress @{ id = $id; ok = $true; data = $data }))
  } catch {
    $stdout.WriteLine((ConvertTo-Json -Compress @{ id = $id; ok = $false; error = $_.Exception.Message }))
  }
}
`

/**
 * El script se manda por -EncodedCommand y la línea de comandos de Windows admite 32 767
 * caracteres; en UTF-16LE + base64 cada carácter del script cuesta ~2,7. Quitar la indentación y
 * los comentarios antes de codificar deja el margen holgado sin sacrificar la legibilidad de
 * arriba, y ni C# ni PowerShell se enteran.
 */
function compactHostScript(source: string): string {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .join("\n")
}

const HOST_SCRIPT = compactHostScript(HOST_SCRIPT_SOURCE)

/** CreateProcess admite 32 767 caracteres de línea de comandos; se deja margen para los flags. */
const MAX_COMMAND_LINE_CHARS = 30_000

/** Exportada para que el test avise si el script crece hasta no caber en la línea de comandos. */
export function encodedHostCommand(): string {
  return Buffer.from(HOST_SCRIPT, "utf16le").toString("base64")
}

type HostCommand = {
  action: "move" | "click" | "type" | "key" | "scroll" | "cursor" | "foreground" | "panic" | "ping"
  [key: string]: unknown
}

type HostReply = { id: string; ok: boolean; data?: string; error?: string }

type Pending = { resolve: (reply: HostReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

let hostProcess: ChildProcess | undefined
let hostStarting: Promise<ChildProcess> | undefined
let hostStdout = ""
let requestCounter = 0
const pendingRequests = new Map<string, Pending>()

let deps: ComputerUseHost | undefined

function log(message: string, data?: Record<string, unknown>, level?: "info" | "warn" | "error") {
  deps?.log(message, data, level)
}

function failAllPending(error: Error) {
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timer)
    pending.reject(error)
  }
  pendingRequests.clear()
}

function startHost(): Promise<ChildProcess> {
  if (hostProcess && !hostProcess.killed) return Promise.resolve(hostProcess)
  if (hostStarting) return hostStarting

  hostStarting = new Promise<ChildProcess>((resolve, reject) => {
    const encoded = encodedHostCommand()
    if (encoded.length > MAX_COMMAND_LINE_CHARS) {
      // Pasado el límite, CreateProcess falla con un error que no dice nada; mejor decirlo aquí.
      reject(new Error("El script del host de entrada ya no cabe en la línea de comandos de Windows."))
      return
    }
    const child = spawn(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    )

    let settled = false
    const readyTimer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error("El host de PowerShell no arrancó a tiempo."))
    }, HOST_READY_TIMEOUT_MS)

    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      hostStdout += chunk
      let index = hostStdout.indexOf("\n")
      while (index >= 0) {
        const line = hostStdout.slice(0, index).trim()
        hostStdout = hostStdout.slice(index + 1)
        if (line) {
          const message = parseHostLine(line)
          if (message && (message as { type?: string }).type === "ready") {
            if (!settled) {
              settled = true
              clearTimeout(readyTimer)
              hostProcess = child
              log("computer-use host ready", { dpi: (message as { dpi?: string }).dpi })
              resolve(child)
            }
          } else if (message && typeof (message as HostReply).id === "string") {
            dispatchReply(message as HostReply)
          }
        }
        index = hostStdout.indexOf("\n")
      }
    })

    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk: string) => {
      const text = chunk.trim()
      if (text) log("computer-use host stderr", { text: text.slice(0, 500) }, "warn")
    })

    child.on("error", (error) => {
      if (!settled) {
        settled = true
        clearTimeout(readyTimer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })

    // Un host muerto que no contesta cuelga al agente hasta el timeout de la tool: al salir se
    // rechaza TODO lo que estuviera en vuelo (mismo trato que el worker de voices.ts).
    child.on("exit", (code, signal) => {
      clearTimeout(readyTimer)
      hostProcess = undefined
      hostStarting = undefined
      hostStdout = ""
      log("computer-use host exited", { code, signal }, "warn")
      failAllPending(new Error(`El host de entrada de Windows se cerró (código ${code ?? signal ?? "?"}).`))
      if (!settled) {
        settled = true
        reject(new Error(`El host de entrada de Windows se cerró al arrancar (código ${code ?? signal ?? "?"}).`))
      }
    })
  })

  // `hostStarting` sólo existe para que dos acciones simultáneas no arranquen dos hosts; en cuanto
  // el arranque termina (bien o mal) se suelta, y quien mande sea `hostProcess`.
  const starting = hostStarting
  const release = () => {
    if (hostStarting === starting) hostStarting = undefined
  }
  starting.then(release, release)
  return starting
}

function parseHostLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    log("computer-use host wrote a non-JSON line", { line: line.slice(0, 300) }, "warn")
    return undefined
  }
}

function dispatchReply(reply: HostReply) {
  const pending = pendingRequests.get(reply.id)
  if (!pending) return
  pendingRequests.delete(reply.id)
  clearTimeout(pending.timer)
  pending.resolve(reply)
}

async function sendToHost(command: HostCommand, timeoutMs = COMMAND_TIMEOUT_MS): Promise<HostReply> {
  const child = await startHost()
  const id = `c${++requestCounter}`
  return new Promise<HostReply>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error("El host de entrada de Windows no contestó a tiempo."))
    }, timeoutMs)
    pendingRequests.set(id, { resolve, reject, timer })
    const line = `${JSON.stringify({ id, ...command })}\n`
    child.stdin?.write(line, (error) => {
      if (!error) return
      pendingRequests.delete(id)
      clearTimeout(timer)
      reject(error)
    })
  })
}

function killHost() {
  const child = hostProcess
  hostProcess = undefined
  hostStarting = undefined
  hostStdout = ""
  failAllPending(new Error("El control del ordenador se detuvo."))
  if (!child) return
  child.stdin?.end()
  child.kill()
}

// ---------------------------------------------------------------------------------------------
// Sesión de control: consentimiento, indicador y parada
// ---------------------------------------------------------------------------------------------

type ControlSession = {
  /** Ejecutables autorizados por el usuario en esta sesión; empieza vacía en cada sesión. */
  allowed: Set<string>
  actions: number
  idleTimer?: ReturnType<typeof setTimeout>
}

let session: ControlSession | undefined
let indicator: Electron.BrowserWindow | undefined
let registeredShortcut: string | undefined
let consentInFlight: Promise<boolean> | undefined

/** Acelerador del interruptor de parada, por orden de preferencia. */
const STOP_ACCELERATORS = ["Control+Alt+Shift+Escape", "Control+Alt+Shift+F12"]

function text(key: string, params?: Record<string, string | number>): string {
  const translated = deps?.translate(key, params)
  if (translated) return translated
  return formatFallback(FALLBACK_TEXT[key] ?? key, params)
}

function indicatorHtml(): string {
  const stop = registeredShortcut
    ? text("desktop.computerUse.indicator.stopShortcut", { shortcut: registeredShortcut })
    : text("desktop.computerUse.indicator.stop")
  const title = text("desktop.computerUse.indicator.title")
  // Colores fijos y en línea: esta ventana es del proceso principal y no carga la hoja de estilos
  // de la app (mismo planteamiento que la mascota de desktop-pet.ts).
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}
.bar{display:flex;align-items:center;gap:10px;height:40px;padding:0 8px 0 14px;border-radius:20px;background:#1b1d21;color:#f4f4f5;border:1px solid #3f3f46;box-shadow:0 6px 20px rgba(0,0,0,.45);-webkit-app-region:drag}
.dot{width:9px;height:9px;border-radius:50%;background:#ef4444;flex:none;animation:p 1.4s ease-in-out infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.25}}
.txt{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
.sub{font-size:11px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
button{font:inherit;font-size:12px;font-weight:600;color:#fff;background:#dc2626;border:0;border-radius:14px;padding:6px 14px;cursor:pointer;-webkit-app-region:no-drag}
button:hover{background:#b91c1c}
</style></head><body><div class="bar"><span class="dot"></span><span class="txt">${escapeHtml(title)}</span><span class="sub" id="app"></span><button id="stop">${escapeHtml(stop)}</button></div>
<script>document.getElementById('stop').addEventListener('click',function(){window.open('about:blank#tiancode-computer-stop')})</script>
</body></html>`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Abre el indicador. Devuelve false si no se pudo: sin indicador visible no hay control. */
async function openIndicator(): Promise<boolean> {
  if (!deps) return false
  if (indicator && !indicator.isDestroyed()) return true
  try {
    const area = deps.screen.getPrimaryDisplay().workArea
    const width = 520
    const height = 56
    const window = new deps.browserWindow({
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: area.y + 12,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
      show: false,
      type: "toolbar",
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    })
    window.setAlwaysOnTop(true, "screen-saver")
    window.setVisibleOnAllWorkspaces(true)
    // El botón de parada no puede hablar por IPC (esta ventana no tiene preload propio), así que
    // pide un window.open con una URL centinela y se atiende aquí. Nunca se abre nada.
    window.webContents.setWindowOpenHandler((details) => {
      if (details.url.includes("tiancode-computer-stop")) void stopComputerControl("indicator")
      return { action: "deny" }
    })
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) window.showInactive()
    })
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(indicatorHtml())}`)
    indicator = window
    return true
  } catch (error) {
    log("computer-use indicator failed to open", { error: String(error) }, "error")
    return false
  }
}

function updateIndicator(appName: string) {
  if (!indicator || indicator.isDestroyed()) return
  const label = text("desktop.computerUse.indicator.app", { app: appName })
  void indicator.webContents
    .executeJavaScript(`document.getElementById('app').textContent=${JSON.stringify(label)}`)
    .catch(() => {})
}

function closeIndicator() {
  const window = indicator
  indicator = undefined
  if (window && !window.isDestroyed()) window.destroy()
}

function registerStopShortcut() {
  if (!deps || registeredShortcut) return
  for (const accelerator of STOP_ACCELERATORS) {
    try {
      if (deps.globalShortcut.register(accelerator, () => void stopComputerControl("shortcut"))) {
        registeredShortcut = accelerator
        return
      }
    } catch (error) {
      log("computer-use stop shortcut failed", { accelerator, error: String(error) }, "warn")
    }
  }
  // Sin atajo el botón del indicador sigue funcionando; lo que no se hace es prometer un atajo
  // que el sistema no nos ha dado (el indicador sólo enseña la combinación si se registró).
  log("computer-use stop shortcut unavailable", {}, "warn")
}

function unregisterStopShortcut() {
  if (!deps || !registeredShortcut) return
  try {
    deps.globalShortcut.unregister(registeredShortcut)
  } catch (error) {
    log("computer-use stop shortcut release failed", { error: String(error) }, "warn")
  }
  registeredShortcut = undefined
}

function touchSession() {
  if (!session) return
  if (session.idleTimer) clearTimeout(session.idleTimer)
  session.idleTimer = setTimeout(() => void stopComputerControl("idle"), IDLE_TIMEOUT_MS)
}

/**
 * Interruptor de parada. Mata el host (con lo que toda petición en vuelo se rechaza), suelta los
 * modificadores por si alguno quedó pulsado, cierra el indicador y olvida la lista de permitidas:
 * volver a controlar exige volver a autorizar.
 */
export async function stopComputerControl(reason: "user" | "indicator" | "shortcut" | "idle" | "quit"): Promise<void> {
  const wasActive = !!session
  if (session?.idleTimer) clearTimeout(session.idleTimer)
  session = undefined
  unregisterStopShortcut()
  closeIndicator()
  if (hostProcess) {
    // Un acorde interrumpido a medias deja Ctrl o Alt pulsados para el usuario; se intenta
    // soltarlos antes de matar el host, pero sin dejar que eso retrase la parada.
    await Promise.race([
      sendToHost({ action: "panic" }, 400).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ])
  }
  killHost()
  if (wasActive) log("computer-use control stopped", { reason })
}

export function isComputerControlActive(): boolean {
  return !!session
}

async function askConsent(foreground: ForegroundWindow): Promise<boolean> {
  if (!deps) return false
  if (consentInFlight) return consentInFlight
  const name = processName(foreground.exe)
  const appName = foreground.title.trim() || name || "?"
  const parent = deps.browserWindow.getFocusedWindow() ?? deps.browserWindow.getAllWindows()[0]
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    title: text("desktop.computerUse.consent.title"),
    message: text("desktop.computerUse.consent.message", { app: appName }),
    detail: text("desktop.computerUse.consent.detail", { app: appName, process: name || "?" }),
    buttons: [text("desktop.computerUse.consent.allow"), text("desktop.computerUse.consent.refuse")],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  consentInFlight = (
    parent ? deps.dialog.showMessageBox(parent, options) : deps.dialog.showMessageBox(options)
  ).then((result) => result.response === 0)
  try {
    return await consentInFlight
  } finally {
    consentInFlight = undefined
  }
}

// ---------------------------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------------------------

export type ComputerResult = { ok: boolean; output: string }

const UNSUPPORTED_PLATFORM =
  "El uso del computador sólo está implementado en Windows. En macOS haría falta el permiso de Accesibilidad del sistema y otro backend, y en Linux depende de X11 o Wayland. No repitas la acción en esta máquina: dile al usuario lo que tendría que hacer él a mano."

async function readForeground(): Promise<ForegroundWindow> {
  const reply = await sendToHost({ action: "foreground" })
  if (!reply.ok) throw new Error(reply.error || "No se pudo leer la ventana en primer plano.")
  const parts = (reply.data ?? "").split(FIELD_SEPARATOR)
  return {
    pid: Number(parts[0] ?? 0) || 0,
    elevation: parts[1] ?? "unknown",
    selfElevated: parts[2] === "yes",
    exe: parts[3] ?? "",
    title: parts[4] ?? "",
  }
}

function describeForeground(foreground: ForegroundWindow): string {
  const name = processName(foreground.exe) || "?"
  const title = foreground.title.trim()
  return title ? `${name} — "${title}"` : name
}

/**
 * Ejecuta una acción del agente sobre el escritorio real.
 *
 * Nunca lanza: un fallo vuelve como `ok: false` con una frase que el agente puede leer y usar,
 * igual que el resto del puente.
 */
export async function performComputerAction(raw: unknown): Promise<ComputerResult> {
  if (process.platform !== "win32") return { ok: false, output: UNSUPPORTED_PLATFORM }
  if (!deps) return { ok: false, output: "El uso del computador no está inicializado en esta ventana." }

  const validated = validateComputerRequest(raw)
  if (!validated.ok) return { ok: false, output: validated.error }
  const request = validated.request

  try {
    if (request.action === "cursor_position") {
      const reply = await sendToHost({ action: "cursor" })
      if (!reply.ok) return { ok: false, output: reply.error || "No se pudo leer la posición del cursor." }
      const [x, y, width, height] = (reply.data ?? "").split(FIELD_SEPARATOR)
      return {
        ok: true,
        output: `El cursor está en (${x}, ${y}). La pantalla principal mide ${width}×${height} píxeles físicos.`,
      }
    }

    if (request.action === "foreground_window") {
      const foreground = await readForeground()
      const own = foreground.pid === process.pid ? " (es la propia ventana de Tiancode)" : ""
      const elevated = foreground.elevation === "yes" ? " Corre como administrador." : ""
      return { ok: true, output: `Delante está ${describeForeground(foreground)}${own}.${elevated}` }
    }

    // A partir de aquí es entrada real: se mira qué hay delante ANTES de mandar nada.
    const foreground = await readForeground()
    const guard = guardForeground(foreground, process.pid)
    if (!guard.allow) return { ok: false, output: guard.reason }

    const name = processName(foreground.exe)
    if (!session?.allowed.has(name)) {
      const granted = await askConsent(foreground)
      if (!granted) {
        return {
          ok: false,
          output: `El usuario no ha autorizado que controles ${describeForeground(foreground)}. No vuelvas a pedirlo en este turno: sigue por otro camino o pregúntale qué prefiere.`,
        }
      }
      if (!session) {
        // El atajo primero: el indicador sólo enseña la combinación si el sistema la ha dado, y se
        // dibuja una vez.
        registerStopShortcut()
        if (!(await openIndicator())) {
          unregisterStopShortcut()
          return {
            ok: false,
            output:
              "No he podido abrir el indicador que avisa de que estás controlando el ordenador, así que no arranco el control. Díselo al usuario.",
          }
        }
        session = { allowed: new Set(), actions: 0 }
        log("computer-use control started", { process: name })
      }
      session.allowed.add(name)
      updateIndicator(describeForeground(foreground))
      touchSession()

      // El diálogo se lleva el foco, así que la ventana de delante ya puede no ser la autorizada.
      // Mandar la entrada ahora la metería en la ventana equivocada.
      const after = await readForeground()
      if (processName(after.exe) !== name) {
        return {
          ok: false,
          output: `Autorizado: ${name}. Al confirmar, el foco pasó a ${describeForeground(after)}, así que no he ejecutado nada. Pide al usuario que vuelva a poner ${name} delante y repite la acción.`,
        }
      }
    }

    updateIndicator(describeForeground(foreground))
    touchSession()

    switch (request.action) {
      case "move": {
        const reply = await sendToHost({ action: "move", x: request.x, y: request.y })
        if (!reply.ok) return { ok: false, output: reply.error || "No se pudo mover el cursor." }
        if (session) session.actions++
        return { ok: true, output: `Cursor en (${request.x}, ${request.y}).` }
      }
      case "click": {
        if (request.x !== undefined && request.y !== undefined) {
          const moved = await sendToHost({ action: "move", x: request.x, y: request.y })
          if (!moved.ok) return { ok: false, output: moved.error || "No se pudo mover el cursor antes del clic." }
        }
        const reply = await sendToHost({ action: "click", button: request.button, double: request.double })
        if (!reply.ok) return { ok: false, output: reply.error || "No se pudo hacer clic." }
        if (session) session.actions++
        const where = request.x !== undefined ? ` en (${request.x}, ${request.y})` : " donde estaba el cursor"
        return {
          ok: true,
          output: `Clic ${request.double ? "doble " : ""}${request.button}${where} sobre ${describeForeground(foreground)}.`,
        }
      }
      case "type": {
        const reply = await sendToHost({ action: "type", text: request.text }, TYPE_TIMEOUT_MS)
        if (!reply.ok) return { ok: false, output: reply.error || "No se pudo escribir el texto." }
        if (session) session.actions++
        return {
          ok: true,
          output: `Escritos ${request.text!.length} caracteres en ${describeForeground(foreground)}. Comprueba con una captura que han ido donde esperabas.`,
        }
      }
      case "key": {
        const parsed = parseChord(request.keys!)
        if (!parsed.ok) return { ok: false, output: parsed.error }
        const reply = await sendToHost({
          action: "key",
          modifiers: parsed.chord.modifiers,
          key: parsed.chord.key,
          extended: parsed.chord.extended,
        })
        if (!reply.ok) return { ok: false, output: reply.error || "No se pudo pulsar la tecla." }
        if (session) session.actions++
        return { ok: true, output: `Pulsado ${request.keys} en ${describeForeground(foreground)}.` }
      }
      case "scroll": {
        const reply = await sendToHost({ action: "scroll", direction: request.direction, amount: request.amount })
        if (!reply.ok) return { ok: false, output: reply.error || "No se pudo hacer scroll." }
        if (session) session.actions++
        return { ok: true, output: `Scroll ${request.direction} (${request.amount}) en ${describeForeground(foreground)}.` }
      }
    }
    return { ok: false, output: `Acción no soportada: ${request.action}.` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log("computer-use action failed", { action: request.action, error: message }, "error")
    return { ok: false, output: `No se pudo ejecutar la acción en Windows: ${message}` }
  }
}

export type ComputerStatus = {
  supported: boolean
  active: boolean
  allowed: string[]
  actions: number
  stopShortcut: string | null
}

export function computerStatus(): ComputerStatus {
  return {
    supported: process.platform === "win32",
    active: !!session,
    allowed: session ? [...session.allowed] : [],
    actions: session?.actions ?? 0,
    stopShortcut: registeredShortcut ?? null,
  }
}

/** Registra el IPC y el ciclo de vida. Lo llama ipc.ts, que es quien tiene Electron delante. */
export function registerComputerUseIpc(host: ComputerUseHost): void {
  deps = host

  host.ipcMain.handle("computer:perform", (_event, action: unknown) => performComputerAction(action))
  host.ipcMain.handle("computer:stop", async () => {
    await stopComputerControl("user")
    return true
  })
  host.ipcMain.handle("computer:status", () => computerStatus())

  // Un host de PowerShell vivo tras cerrar la app sería un proceso huérfano con derecho a teclear.
  host.app.on("will-quit", () => {
    void stopComputerControl("quit")
  })
}

/** Sólo para los tests: deja el módulo sin estado entre casos. */
export function resetComputerUseForTests(): void {
  if (session?.idleTimer) clearTimeout(session.idleTimer)
  session = undefined
  indicator = undefined
  registeredShortcut = undefined
  deps = undefined
  failAllPending(new Error("reset"))
}
