/**
 * What the settings search can find. Static metadata only, so searching never mounts a page:
 * `target` is the row's data-action id, `section` the General sub-tab that holds it.
 * Keywords carry Spanish and English synonyms because labels follow the UI language.
 */
export type SettingsSearchEntry = {
  tab: string
  section?: string
  label: string
  target?: string
  keywords: string[]
  available?: "desktop" | "windows"
  // Shown under the label when the label alone is ambiguous ("Agent" is both a notification and a sound).
  context?: string
}

const page = (
  tab: string,
  label: string,
  keywords: string[],
  available?: SettingsSearchEntry["available"],
  section?: string,
) => ({ tab, label, keywords, available, section }) satisfies SettingsSearchEntry

const row = (
  tab: string,
  section: string | undefined,
  label: string,
  target: string,
  keywords: string[],
  available?: SettingsSearchEntry["available"],
) => ({ tab, section, label, target, keywords, available }) satisfies SettingsSearchEntry

export const SETTINGS_PAGES: SettingsSearchEntry[] = [
  page("general", "settings.tab.general", ["preferencias", "preferences", "general"]),
  page("notifications", "settings.tab.notifications", ["notificaciones", "sonidos", "sounds", "alerts", "avisos"]),
  page("intelligence", "settings.tab.intelligence", ["inteligencia", "memoria", "memory", "guardrails"]),
  page("intelligence", "settings.intelligence.tab.decisions", ["decisiones", "laya", "modelo local", "avisos inteligentes", "smart alerts"], undefined, "decisions"),
  page("computer-use", "settings.tab.computerUse", ["uso de la pc", "computer use", "navegador", "browser", "ratón"]),
  page("shortcuts", "settings.tab.shortcuts", ["atajos", "teclado", "keybinds", "shortcuts", "keyboard"]),
  page("computer-use", "settings.computerUse.tab.remote", ["acceso remoto", "emparejar", "pairing", "qr", "red local", "móvil"], "desktop", "remote"),
  page("computer-use", "settings.computerUse.tab.browser", ["navegador", "browser", "sitios", "cookies"], undefined, "browser"),
  page("server", "settings.tab.server", ["servidor", "server", "servidores", "proyectos", "worktrees"]),
  page("server", "status.popover.tab.servers", ["servidores", "servers", "conexión", "remoto", "wsl"], undefined, "servers"),
  page("server", "settings.tab.projects", ["proyectos", "projects", "carpetas"], undefined, "projects"),
  page("server", "settings.tab.worktrees", ["worktrees", "árbol de trabajo", "disco", "disk"], undefined, "worktrees"),
  page("providers", "settings.providers.title", ["proveedores", "providers", "api key", "clave"]),
  page("models", "settings.models.title", ["modelos", "models"]),
  page("models-hub", "settings.tab.modelsHub", ["modelos locales", "local models", "gguf", "llama", "huggingface"]),
  page("connections", "settings.connections.section.github", ["github", "git", "repositorios", "pull request"], undefined, "github"),
  page("voices", "settings.tab.voices", ["voces", "voices", "tts", "micrófono", "dictado", "leer en voz alta", "fish audio", "velocidad"]),
  page("skills", "settings.tab.skills", ["skills", "habilidades", "ui skills"]),
  page("sub-agents", "settings.tab.subAgents", ["sub-agentes", "subagents", "agentes", "agents"]),
  page("mcp-plugins", "settings.tab.mcpPlugins", ["mcp", "plugins", "extensiones", "extensions", "descubrir", "discover", "tienda", "store", "marketplace", "claude code", "codex", "skills"]),
  page("connections", "settings.tab.connections", ["conexiones", "connections"]),
  page("connections", "settings.connections.section.connectors", ["conectores", "connectors", "apps", "gmail", "google drive", "notion", "linear", "slack", "jira", "atlassian", "hubspot", "stripe", "figma", "canva", "asana", "dropbox", "oauth"], undefined, "connectors"),
  page("connections", "settings.connections.section.gateways", ["mensajería", "messaging", "telegram", "discord", "whatsapp", "webhooks"], undefined, "gateways"),
  page("pets", "settings.tab.pets", ["mascotas", "pets"]),
  page("about", "settings.tab.about", ["acerca de", "about", "versión", "version", "licencia", "license", "registros", "logs", "sistema", "system", "electron"]),
]

export const SETTINGS_ROWS: SettingsSearchEntry[] = [
  row("general", "chat", "settings.general.row.language.title", "settings-language", ["idioma", "language", "español", "english"]),
  row("general", "chat", "settings.workspaces.default.title", "settings-workspace-destination", ["entorno", "environment", "worktree", "nueva sesión", "new session"]),
  row("general", "chat", "command.permissions.autoaccept.enable", "settings-auto-accept-permissions", ["permisos", "permissions", "aceptar", "omitir", "skip"]),
  row("general", "chat", "settings.general.row.showCustomAgents.title", "settings-show-custom-agents", ["agente", "agent", "build"]),
  row("general", "chat", "settings.general.row.followup.title", "settings-follow-up-behavior", ["seguimiento", "follow-up", "cola", "queue", "steer", "dirigir"]),
  row("general", "chat", "settings.responses.clear", "settings-clear-responses", ["respuestas", "directas", "breve", "concise", "responses"]),
  row("general", "chat", "design.style.title", "settings-design-style", ["estilo", "diseño", "design", "style", "visual"]),
  row("general", "chat", "settings.general.row.showComposerMic.title", "settings-show-composer-mic", ["micrófono", "microphone", "dictado"]),
  row("general", "workspace", "settings.general.row.shell.title", "settings-shell", ["shell", "terminal", "powershell", "bash"]),
  row("general", "workspace", "settings.general.row.terminalPlacement.title", "settings-terminal-placement", ["terminal", "posición", "placement", "lateral", "side", "inferior", "bottom"]),
  row("general", "workspace", "session.review.wrapLines", "settings-diff-wrap", ["ajustar", "wrap", "líneas", "lines", "diff", "cambios"]),
  row("general", "workspace", "settings.general.row.previewOnFinish.title", "settings-preview-on-finish", ["vista previa", "preview", "sandbox", "escritorio", "desktop", "navegador"]),
  row("general", "workspace", "settings.general.row.previewWhileWorking.title", "settings-preview-auto-open", ["vista previa", "preview", "abrir", "automático", "automatic"]),
  row("general", "workspace", "settings.general.row.showCapture.title", "settings-show-capture", ["captura", "capture", "screenshot", "barra superior"]),
  row("general", "workspace", "settings.general.row.showStatus.title", "settings-show-status", ["estado", "status", "barra superior"]),
  row("general", "workspace", "settings.general.row.showVoice.title", "settings-show-voice", ["voz", "voice", "barra superior"]),
  row("general", "workspace", "settings.general.row.showTerminal.title", "settings-show-terminal", ["terminal", "barra superior"]),
  row("general", "workspace", "settings.general.row.showBrowser.title", "settings-show-browser", ["navegador", "browser", "sandbox", "barra superior"]),
  row("general", "workspace", "settings.general.row.showReview.title", "settings-show-review", ["revisión", "review", "cambios", "barra superior"]),
  row("general", "workspace", "settings.general.row.showFileTree.title", "settings-show-file-tree", ["archivos", "files", "árbol", "barra superior"]),
  row("general", "view", "settings.general.row.colorScheme.title", "settings-color-scheme", ["oscuro", "claro", "dark", "light", "esquema"]),
  row("general", "view", "settings.general.row.theme.title", "settings-theme", ["tema", "theme", "colores"]),
  row("general", "view", "settings.general.row.transcriptText.title", "settings-transcript-text", ["texto", "tamaño", "font size"]),
  row("general", "view", "settings.general.row.transcriptWidth.title", "settings-transcript-width", ["ancho", "width"]),
  row("general", "view", "settings.experimental.tabs.title", "settings-tab-layout", ["pestañas", "tabs", "vertical", "horizontal"]),
  row("general", "view", "settings.experimental.projectNames.title", "settings-show-project-name", ["proyecto", "project", "nombres", "names"]),
  row("general", "view", "settings.timeline.detail", "settings-timeline-detail", ["línea de tiempo", "timeline", "detalle", "detail", "razonamiento", "thinking", "vista", "view"]),
  row("general", "view", "settings.general.row.uiFont.title", "settings-ui-font", ["fuente", "font", "tipografía"]),
  row("general", "view", "settings.general.row.font.title", "settings-code-font", ["fuente", "font", "código", "code"]),
  row("general", "view", "settings.general.row.terminalFont.title", "settings-terminal-font", ["fuente", "font", "terminal"]),
  row("general", "desktop", "settings.general.section.updates", "settings-updates-startup", ["actualizaciones", "updates", "inicio"], "desktop"),
  row("general", "desktop", "settings.general.scale.title", "settings-ui-scale", ["escala", "zoom", "tamaño", "scale"], "desktop"),
  row("general", "desktop", "settings.general.row.pinchZoom.title", "settings-pinch-zoom", ["zoom", "pellizcar", "pinch"], "desktop"),
  row("general", "desktop", "settings.general.row.minimizeToTray.title", "settings-minimize-to-tray", ["bandeja", "tray", "minimizar"], "windows"),
  row("general", "desktop", "settings.general.loginItem.title", "settings-login-item", ["inicio", "windows", "startup", "arranque"], "desktop"),
  row("general", "desktop", "settings.general.row.fileWatcher.title", "settings-file-watcher", ["archivos", "watcher", "vigilar"], "desktop"),
  row("general", "data", "settings.general.row.dataFolder.title", "settings-data-folder", ["carpeta de datos", "data folder", "perfil", "profile", "appdata", "userdata"], "desktop"),
  row("general", "data", "settings.general.row.autoBackup.title", "settings-auto-backup", ["respaldo", "backup", "copia", "restaurar", "restore"], "desktop"),
  row("notifications", undefined, "settings.general.notifications.agent.title", "settings-notifications-agent", ["notificación", "notification", "agente", "terminado"]),
  row("notifications", undefined, "settings.general.notifications.permissions.title", "settings-notifications-permissions", ["notificación", "notification", "permisos", "permissions"]),
  row("notifications", undefined, "settings.general.notifications.errors.title", "settings-notifications-errors", ["notificación", "notification", "errores", "errors"]),
  row("notifications", undefined, "settings.general.sounds.agent.title", "settings-sounds-agent", ["sonido", "sound", "agente"]),
  row("notifications", undefined, "settings.general.sounds.permissions.title", "settings-sounds-permissions", ["sonido", "sound", "permisos"]),
  row("notifications", undefined, "settings.general.sounds.errors.title", "settings-sounds-errors", ["sonido", "sound", "errores"]),
  row("notifications", undefined, "settings.notifications.event.questions", "settings-notifications-questions", ["pregunta", "question", "respuesta", "answer"]),
  row("notifications", undefined, "settings.notifications.mute", "settings-notifications-mute", ["silenciar", "mute", "no molestar", "silencio"]),
  row("notifications", undefined, "settings.notifications.volume", "settings-notifications-volume", ["volumen", "volume", "sonido"]),
  row("notifications", undefined, "settings.notifications.test", "settings-notifications-test", ["probar", "test", "aviso"]),
  row("computer-use", "remote", "settings.pairing.connection.title", "settings-pairing-local-network", ["red", "network", "lan", "móvil", "phone", "qr", "wifi"], "desktop"),
  row("computer-use", "remote", "settings.pairing.screenActive.title", "settings-keep-screen-active", ["pantalla", "screen", "suspender", "sleep", "activa"], "desktop"),
  row("computer-use", "desktop", "settings.computerUse.mouse.title", "settings-computer-use-enabled", ["ratón", "teclado", "mouse", "keyboard", "computer use", "controlar"], "windows"),
  row("computer-use", "desktop", "settings.computerUse.tool.screenshot.title", "settings-computer-use-screenshot", ["captura", "screenshot", "pantalla"], "desktop"),
  row("computer-use", "desktop", "settings.computerUse.tool.clipboard.title", "settings-computer-use-clipboard", ["portapapeles", "clipboard", "copiar"], "desktop"),
  row("computer-use", "browser", "settings.computerUse.browser.agent.title", "settings-agent-browser", ["navegador", "browser", "agente", "vista en vivo", "controlar"]),
  row("computer-use", "browser", "settings.computerUse.browser.default", "settings-browser-permission", ["sitios", "sites", "permiso", "permission"]),
  row("computer-use", "browser", "settings.browser.links", "settings-browser-links", ["enlaces", "links", "abrir", "chrome"]),
  row("computer-use", "browser", "settings.computerUse.browser.cookies", "settings-browser-cookies", ["cookies", "sesiones", "borrar"], "desktop"),
  row("intelligence", "memory", "settings.intelligence.memory.user.title", "settings-intelligence-userMemory", ["memoria", "memory", "user.md", "preferencias"]),
  row("intelligence", "memory", "settings.intelligence.memory.project.title", "settings-intelligence-projectMemory", ["memoria", "memory", "memory.md", "proyecto"]),
  row("intelligence", "memory", "settings.intelligence.skillCreate", "settings-intelligence-skills", ["habilidades", "skills", "skill.md", "aprender"]),
  row("intelligence", "context", "settings.intelligence.compaction.auto", "settings-intelligence-compaction", ["compactación", "compaction", "contexto", "resumen"]),
  row("intelligence", "context", "settings.intelligence.codeGraph", "settings-intelligence-codegraph", ["grafo", "graph", "símbolos", "imports"]),
  row("intelligence", "protection", "settings.intelligence.shellScan", "settings-intelligence-shield", ["agentshield", "comandos", "peligroso", "seguridad", "security"]),
  row("intelligence", "protection", "settings.intelligence.loopBreaker", "settings-intelligence-loop", ["bucle", "loop", "repetir"]),
  row("intelligence", "decisions", "settings.intelligence.smartAlerts", "settings-intelligence-smart-alerts", ["avisos", "alerts", "laya", "notificaciones"]),
]

// Notifications and sounds share their row labels; the result line names which group it is.
for (const entry of SETTINGS_ROWS) {
  if (entry.target?.startsWith("settings-notifications-")) entry.context = "settings.general.section.notifications"
  if (entry.target?.startsWith("settings-sounds-")) entry.context = "settings.general.section.sounds"
  // Sections are named like their tiles.
  if (entry.tab === "general" && entry.target) entry.context = `settings.general.tab.${entry.section}`
  if (entry.tab === "computer-use" && entry.target) entry.context = `settings.computerUse.tab.${entry.section}`
  if (entry.tab === "intelligence" && entry.target) entry.context = `settings.intelligence.tab.${entry.section}`
}
