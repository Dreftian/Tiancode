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
  page("computer-use", "settings.tab.computerUse", ["uso de la pc", "computer use", "navegador", "browser", "ratón"]),
  page("shortcuts", "settings.tab.shortcuts", ["atajos", "teclado", "keybinds", "shortcuts", "keyboard"]),
  page("computer-use", "settings.tab.pairing", ["emparejar", "pairing", "qr", "red local", "pantalla"], "desktop", "pairing"),
  page("server", "settings.tab.server", ["servidor", "server", "servidores", "proyectos", "worktrees"]),
  page("server", "status.popover.tab.servers", ["servidores", "servers", "conexión", "remoto", "wsl"], undefined, "servers"),
  page("server", "settings.tab.projects", ["proyectos", "projects", "carpetas"], undefined, "projects"),
  page("server", "settings.tab.worktrees", ["worktrees", "árbol de trabajo", "disco", "disk"], undefined, "worktrees"),
  page("providers", "settings.providers.title", ["proveedores", "providers", "api key", "clave"]),
  page("models", "settings.models.title", ["modelos", "models"]),
  page("models-hub", "settings.tab.modelsHub", ["modelos locales", "local models", "gguf", "llama", "huggingface"]),
  page("connections", "settings.connections.section.github", ["github", "git", "repositorios", "pull request"], undefined, "github"),
  page("voices", "settings.tab.voices", ["voces", "voices", "tts", "micrófono", "dictado"]),
  page("skills", "settings.tab.skills", ["skills", "habilidades", "ui skills"]),
  page("sub-agents", "settings.tab.subAgents", ["sub-agentes", "subagents", "agentes", "agents"]),
  page("mcp-plugins", "settings.tab.mcpPlugins", ["mcp", "plugins", "extensiones", "extensions"]),
  page("connections", "settings.tab.connections", ["conexiones", "connections", "telegram", "whatsapp", "webhooks"]),
  page("pets", "settings.tab.pets", ["mascotas", "pets"]),
  page("computer-use", "settings.tab.experimental", ["experimental", "beta"], undefined, "experimental"),
  page("about", "settings.tab.about", ["acerca de", "about", "versión", "version", "licencia", "license"]),
]

export const SETTINGS_ROWS: SettingsSearchEntry[] = [
  row("general", "general", "settings.general.row.language.title", "settings-language", ["idioma", "language", "español", "english"]),
  row("general", "general", "settings.workspaces.default.title", "settings-workspace-destination", ["entorno", "environment", "worktree", "nueva sesión", "new session"]),
  row("general", "general", "command.permissions.autoaccept.enable", "settings-auto-accept-permissions", ["permisos", "permissions", "aceptar", "omitir", "skip"]),
  row("general", "general", "settings.general.row.showCustomAgents.title", "settings-show-custom-agents", ["agente", "agent", "build"]),
  row("general", "general", "settings.general.row.followup.title", "settings-follow-up-behavior", ["seguimiento", "follow-up", "cola", "queue", "steer", "dirigir"]),
  row("general", "general", "settings.general.row.shell.title", "settings-shell", ["shell", "terminal", "powershell", "bash"]),
  row("general", "general", "settings.general.row.terminalPlacement.title", "settings-terminal-placement", ["terminal", "posición", "placement", "lateral", "side", "inferior", "bottom"]),
  row("general", "general", "session.review.wrapLines", "settings-diff-wrap", ["ajustar", "wrap", "líneas", "lines", "diff", "cambios"]),
  row("general", "preview", "settings.general.row.previewOnFinish.title", "settings-preview-on-finish", ["vista previa", "preview", "sandbox", "escritorio", "desktop", "navegador"]),
  row("general", "preview", "settings.general.row.previewWhileWorking.title", "settings-preview-auto-open", ["vista previa", "preview", "abrir", "automático", "automatic"]),
  row("general", "titlebar", "settings.general.row.showCapture.title", "settings-show-capture", ["captura", "capture", "screenshot"]),
  row("general", "titlebar", "settings.general.row.showStatus.title", "settings-show-status", ["estado", "status"]),
  row("general", "titlebar", "settings.general.row.showVoice.title", "settings-show-voice", ["voz", "voice"]),
  row("general", "titlebar", "settings.general.row.showComposerMic.title", "settings-show-composer-mic", ["micrófono", "microphone", "dictado"]),
  row("general", "titlebar", "settings.general.row.showTerminal.title", "settings-show-terminal", ["terminal"]),
  row("general", "titlebar", "settings.general.row.showBrowser.title", "settings-show-browser", ["navegador", "browser", "sandbox"]),
  row("general", "titlebar", "settings.general.row.showReview.title", "settings-show-review", ["revisión", "review", "cambios"]),
  row("general", "titlebar", "settings.general.row.showFileTree.title", "settings-show-file-tree", ["archivos", "files", "árbol"]),
  row("general", "titlebar", "settings.general.row.showSearch.title", "settings-show-search", ["buscar", "search"]),
  row("general", "titlebar", "settings.general.row.showNavigation.title", "settings-show-navigation", ["navegación", "navigation"]),
  row("general", "appearance", "settings.general.row.colorScheme.title", "settings-color-scheme", ["oscuro", "claro", "dark", "light", "esquema"]),
  row("general", "appearance", "settings.general.row.theme.title", "settings-theme", ["tema", "theme", "colores"]),
  row("general", "appearance", "settings.general.row.transcriptText.title", "settings-transcript-text", ["texto", "tamaño", "font size"]),
  row("general", "appearance", "settings.general.row.transcriptWidth.title", "settings-transcript-width", ["ancho", "width"]),
  row("general", "timeline", "settings.timeline.detail", "settings-timeline-detail", ["línea de tiempo", "timeline", "detalle", "detail", "razonamiento", "thinking", "vista", "view"]),
  row("general", "appearance", "settings.general.row.uiFont.title", "settings-ui-font", ["fuente", "font", "tipografía"]),
  row("general", "appearance", "settings.general.row.font.title", "settings-code-font", ["fuente", "font", "código", "code"]),
  row("general", "appearance", "settings.general.row.terminalFont.title", "settings-terminal-font", ["fuente", "font", "terminal"]),
  row("general", "updates", "settings.general.row.releaseNotes.title", "settings-release-notes", ["novedades", "release notes", "actualizaciones"], "desktop"),
  row("general", "updates", "settings.updates.row.startup.title", "settings-updates-startup", ["actualizaciones", "updates", "inicio"], "desktop"),
  row("general", "display", "settings.general.row.pinchZoom.title", "settings-pinch-zoom", ["zoom", "pellizcar", "pinch"], "desktop"),
  row("general", "display", "settings.general.row.minimizeToTray.title", "settings-minimize-to-tray", ["bandeja", "tray", "minimizar"], "windows"),
  row("general", "display", "settings.general.row.loginItem.title", "settings-login-item", ["inicio", "windows", "startup", "arranque"], "windows"),
  row("general", "display", "settings.general.row.fileWatcher.title", "settings-file-watcher", ["archivos", "watcher", "vigilar"], "desktop"),
  row("general", "data", "settings.general.row.dataFolder.title", "settings-data-folder", ["carpeta de datos", "data folder", "perfil", "profile", "appdata", "userdata"], "desktop"),
  row("general", "data", "settings.general.row.autoBackup.title", "settings-auto-backup", ["respaldo", "backup", "copia"], "desktop"),
  row("notifications", undefined, "settings.general.notifications.agent.title", "settings-notifications-agent", ["notificación", "notification", "agente", "terminado"]),
  row("notifications", undefined, "settings.general.notifications.permissions.title", "settings-notifications-permissions", ["notificación", "notification", "permisos", "permissions"]),
  row("notifications", undefined, "settings.general.notifications.errors.title", "settings-notifications-errors", ["notificación", "notification", "errores", "errors"]),
  row("notifications", undefined, "settings.general.sounds.agent.title", "settings-sounds-agent", ["sonido", "sound", "agente"]),
  row("notifications", undefined, "settings.general.sounds.permissions.title", "settings-sounds-permissions", ["sonido", "sound", "permisos"]),
  row("notifications", undefined, "settings.general.sounds.errors.title", "settings-sounds-errors", ["sonido", "sound", "errores"]),
  row("computer-use", "pairing", "settings.pairing.connection.title", "settings-pairing-local-network", ["red", "network", "lan", "móvil", "phone", "qr", "wifi"], "desktop"),
  row("computer-use", "pairing", "settings.pairing.screenActive.title", "settings-keep-screen-active", ["pantalla", "screen", "suspender", "sleep", "activa"], "desktop"),
  row("computer-use", "experimental", "settings.experimental.browser.title", "settings-agent-browser", ["navegador", "browser", "agente", "controlar"]),
  row("computer-use", "experimental", "settings.experimental.tabs.title", "settings-tab-layout", ["pestañas", "tabs", "vertical", "horizontal"]),
  row("computer-use", "experimental", "settings.experimental.projectNames.title", "settings-show-project-name", ["proyecto", "project", "nombres", "names"]),
]

// Notifications and sounds share their row labels; the result line names which group it is.
for (const entry of SETTINGS_ROWS) {
  if (entry.target?.startsWith("settings-notifications-")) entry.context = "settings.general.section.notifications"
  if (entry.target?.startsWith("settings-sounds-")) entry.context = "settings.general.section.sounds"
  // Uso de la PC sections are named like their tabs, not like General's sections.
  if (entry.tab === "computer-use" && entry.section === "pairing") entry.context = "settings.tab.pairing"
  if (entry.tab === "computer-use" && entry.section === "experimental") entry.context = "settings.tab.experimental"
}
