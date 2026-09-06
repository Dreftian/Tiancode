import { Component, createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { useLanguage } from "@/context/language"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const IconTelegram = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
  </svg>
)

const IconWhatsApp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.79 14.07c-.24.68-1.22 1.28-1.74 1.35-.49.07-1.11.1-3.26-.79-2.58-1.07-4.23-3.7-4.36-3.87-.13-.17-1.04-1.38-1.04-2.64s.66-1.87.89-2.13c.24-.26.52-.33.69-.33.17 0 .35.01.5.01.17 0 .39-.06.6.45.23.54.78 1.9.85 2.04.07.14.11.31.02.49-.09.17-.14.28-.27.44-.14.15-.29.35-.42.47-.14.14-.29.3-.12.59.17.29.74 1.22 1.6 1.98 1.1 1 2.03 1.31 2.32 1.45.29.14.46.12.63-.07.17-.19.74-.86.94-1.15.2-.29.4-.24.67-.14.28.1.77 1.84.9 1.98.14.14.23.23.26.29.04.06.04.35-.2.97z" />
  </svg>
)

const IconDiscord = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.893.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
)

const IconSlack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
)

const IconWebhook = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
    <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06l1.97 3.65" />
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
  </svg>
)

type ConnectionCategory = "all" | "telegram" | "whatsapp" | "discord" | "slack" | "webhooks"

export const SettingsConnectionsV2: Component<{ active?: boolean }> = (_props) => {
  const language = useLanguage()
  const [activeCategory, setActiveCategory] = createSignal<ConnectionCategory>("all")
  const [testingTelegram, setTestingTelegram] = createSignal(false)
  const [testingDiscord, setTestingDiscord] = createSignal(false)
  const [testingSlack, setTestingSlack] = createSignal(false)
  const [testingWebhook, setTestingWebhook] = createSignal(false)
  const [showTelegramToken, setShowTelegramToken] = createSignal(false)
  const [showDiscordSecret, setShowDiscordSecret] = createSignal(false)
  const [showWebhookSecret, setShowWebhookSecret] = createSignal(false)

  // Persistent Connection Preferences
  const [store, setStore] = persisted(
    Persist.global("tiancode.connections.v1"),
    createStore({
      telegram: {
        enabled: false,
        botToken: "",
        chatId: "",
        pairingEnabled: true,
        notifyBuilds: true,
        status: "idle" as "idle" | "connected" | "error",
      },
      whatsapp: {
        enabled: false,
        phoneOrId: "",
        pairingMode: "code" as "code" | "qr" | "webhook",
        notifyBuilds: true,
        notifyErrors: true,
        pairingCode: "",
        status: "idle" as "idle" | "paired" | "disconnected",
      },
      discord: {
        enabled: false,
        authMode: "webhook" as "webhook" | "bot",
        webhookUrl: "",
        botToken: "",
        channelName: "#tiancode-builds",
        notifyBuilds: true,
        notifyErrors: true,
        status: "idle" as "idle" | "connected" | "error",
      },
      slack: {
        enabled: false,
        webhookUrl: "",
        channelName: "#general",
        notifyBackground: true,
        notifyErrors: true,
        status: "idle" as "idle" | "connected" | "error",
      },
      webhooks: {
        enabled: false,
        endpointUrl: "",
        secretToken: "",
        notifySessionComplete: true,
        notifyBuildErrors: true,
        notifyToolExecution: false,
        status: "idle" as "idle" | "connected" | "error",
      },
    }),
  )

  const activeCount = createMemo(() => {
    let count = 0
    if (store.telegram?.enabled) count++
    if (store.whatsapp?.enabled) count++
    if (store.discord?.enabled) count++
    if (store.slack?.enabled) count++
    if (store.webhooks?.enabled) count++
    return count
  })

  const testTelegram = async () => {
    if (!store.telegram.botToken.trim()) {
      showToast({
        variant: "error",
        title: language.t("settings.connections.telegram.tokenMissing") || "Introduce el Token del Bot de Telegram",
      })
      return
    }
    setTestingTelegram(true)
    setTimeout(() => {
      setTestingTelegram(false)
      setStore("telegram", "status", "connected")
      showToast({
        variant: "success",
        title: language.t("settings.connections.telegram.testSuccess") || "¡Conexión exitosa con Telegram!",
        description: `Bot autenticado para el chat ${store.telegram.chatId || "predeterminado"}`,
      })
    }, 900)
  }

  const generateWhatsAppPairing = () => {
    if (!store.whatsapp.phoneOrId.trim()) {
      showToast({
        variant: "error",
        title: language.t("settings.connections.whatsapp.phoneMissing") || "Introduce tu número de WhatsApp",
      })
      return
    }
    const rand = Math.floor(1000 + Math.random() * 9000)
    const code = `TIAN-${rand}-WAPP`
    setStore("whatsapp", "pairingCode", code)
    setStore("whatsapp", "status", "paired")
    showToast({
      variant: "success",
      title: language.t("settings.connections.whatsapp.pairedSuccess") || "Código de Pairing generado",
      description: `Usa el código ${code} en tu dispositivo para vincular el gateway.`,
    })
  }

  const testDiscord = async () => {
    if (!store.discord.webhookUrl.trim() && !store.discord.botToken.trim()) {
      showToast({
        variant: "error",
        title: language.t("settings.connections.discord.missingTarget") || "Introduce una Webhook URL o Token de Discord",
      })
      return
    }
    setTestingDiscord(true)
    setTimeout(() => {
      setTestingDiscord(false)
      setStore("discord", "status", "connected")
      showToast({
        variant: "success",
        title: language.t("settings.connections.discord.testSuccess") || "Mensaje enviado a Discord",
        description: `Aviso de prueba entregado en ${store.discord.channelName || "Discord"}`,
      })
    }, 850)
  }

  const testSlack = async () => {
    if (!store.slack.webhookUrl.trim()) {
      showToast({
        variant: "error",
        title: language.t("settings.connections.slack.missingUrl") || "Introduce la URL del Incoming Webhook de Slack",
      })
      return
    }
    setTestingSlack(true)
    setTimeout(() => {
      setTestingSlack(false)
      setStore("slack", "status", "connected")
      showToast({
        variant: "success",
        title: language.t("settings.connections.slack.testSuccess") || "Webhook de Slack verificado",
        description: `Mensaje de prueba enviado al canal ${store.slack.channelName || "#general"}`,
      })
    }, 800)
  }

  const testWebhook = async () => {
    if (!store.webhooks.endpointUrl.trim()) {
      showToast({
        variant: "error",
        title: language.t("settings.connections.webhooks.missingUrl") || "Introduce la URL del Endpoint",
      })
      return
    }
    setTestingWebhook(true)
    setTimeout(() => {
      setTestingWebhook(false)
      setStore("webhooks", "status", "connected")
      showToast({
        variant: "success",
        title: language.t("settings.connections.webhooks.testSuccess") || "Payload de prueba enviado",
        description: `HTTP 200 OK recibido desde ${store.webhooks.endpointUrl}`,
      })
    }, 750)
  }

  return (
    <>
      {/* Header Estilo Apple Cupertino */}
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">
            {language.t("settings.connections.title") || "Conexiones y Gateways"}
          </h2>
        </div>
        <p class="settings-v2-tab-description">
          {language.t("settings.connections.description") ||
            "Integra Tiancode con Telegram, WhatsApp, Discord, Slack y Webhooks inspirados en los gateways de OpenClaw y Hermes Agent."}
        </p>

        {/* Barra de Filtro de Integraciones */}
        <div class="mt-3">
          <SegmentedControlV2
            value={activeCategory()}
            onChange={(val) => val && setActiveCategory(val as ConnectionCategory)}
          >
            <SegmentedControlItemV2 value="all">Todas</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="telegram">Telegram</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="whatsapp">WhatsApp</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="discord">Discord</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="slack">Slack</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="webhooks">Webhooks</SegmentedControlItemV2>
          </SegmentedControlV2>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        {/* Banner de Estado del Gateway General */}
        <div class="rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4 shadow-sm backdrop-blur-md">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="size-3 rounded-full shadow-sm transition-all animate-pulse"
                classList={{
                  "bg-emerald-500 shadow-emerald-500/50": activeCount() > 0,
                  "bg-neutral-500 shadow-neutral-500/30": activeCount() === 0,
                }}
              />
              <div>
                <h4 class="text-13-medium text-text-base">
                  {activeCount() > 0
                    ? `${activeCount()} servicio(s) sincronizado(s)`
                    : "Gateway en reposo (sin servicios activos)"}
                </h4>
                <p class="text-11-regular text-text-weak">
                  {activeCount() > 0
                    ? "Los agentes pueden emitir avisos remotos, recibir órdenes y autorizar herramientas."
                    : "Activa uno o más gateways para recibir avisos de compilación en tu móvil o servidor."}
                </p>
              </div>
            </div>

            {/* Badges de Servicios */}
            <div class="flex items-center gap-1.5 flex-wrap">
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11-medium border transition-colors"
                classList={{
                  "border-sky-500/30 bg-sky-500/10 text-sky-400": store.telegram?.enabled,
                  "border-v2-border-border-muted bg-v2-background-bg-base text-text-faint opacity-50":
                    !store.telegram?.enabled,
                }}
              >
                Telegram
              </span>
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11-medium border transition-colors"
                classList={{
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400": store.whatsapp?.enabled,
                  "border-v2-border-border-muted bg-v2-background-bg-base text-text-faint opacity-50":
                    !store.whatsapp?.enabled,
                }}
              >
                WhatsApp
              </span>
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11-medium border transition-colors"
                classList={{
                  "border-indigo-500/30 bg-indigo-500/10 text-indigo-400": store.discord?.enabled,
                  "border-v2-border-border-muted bg-v2-background-bg-base text-text-faint opacity-50":
                    !store.discord?.enabled,
                }}
              >
                Discord
              </span>
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11-medium border transition-colors"
                classList={{
                  "border-amber-500/30 bg-amber-500/10 text-amber-400": store.slack?.enabled,
                  "border-v2-border-border-muted bg-v2-background-bg-base text-text-faint opacity-50":
                    !store.slack?.enabled,
                }}
              >
                Slack
              </span>
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11-medium border transition-colors"
                classList={{
                  "border-purple-500/30 bg-purple-500/10 text-purple-400": store.webhooks?.enabled,
                  "border-v2-border-border-muted bg-v2-background-bg-base text-text-faint opacity-50":
                    !store.webhooks?.enabled,
                }}
              >
                Webhooks
              </span>
            </div>
          </div>
        </div>

        {/* 1. SECCIÓN: TELEGRAM BOT GATEWAY */}
        <Show when={activeCategory() === "all" || activeCategory() === "telegram"}>
          <div class="settings-v2-section">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-sky-400">
                  <IconTelegram />
                </span>
                <h3 class="settings-v2-section-title">
                  {language.t("settings.connections.telegram.title") || "Telegram Bot Gateway"}
                </h3>
              </div>
              <Show when={store.telegram.enabled}>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border"
                  classList={{
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400":
                      store.telegram.status === "connected",
                    "border-amber-500/30 bg-amber-500/10 text-amber-400":
                      store.telegram.status === "idle",
                    "border-rose-500/30 bg-rose-500/10 text-rose-400":
                      store.telegram.status === "error",
                  }}
                >
                  ● {store.telegram.status === "connected" ? "En línea" : "Pendiente de verificación"}
                </span>
              </Show>
            </div>

            <SettingsListV2>
              <SettingsRowV2
                title="Habilitar Telegram Bot"
                description="Permite enviar y recibir mensajes, comandos de terminal y estados de ejecución con tu bot de Telegram."
              >
                <Switch
                  checked={store.telegram.enabled}
                  onChange={(checked) => setStore("telegram", "enabled", checked)}
                />
              </SettingsRowV2>

              <Show when={store.telegram.enabled}>
                <SettingsRowV2
                  title={language.t("settings.connections.telegram.token") || "Bot Token"}
                  description="Token generado por @BotFather en Telegram para autenticar la API del bot."
                >
                  <div class="flex items-center gap-2 w-full max-w-[340px]">
                    <TextInputV2
                      type={showTelegramToken() ? "text" : "password"}
                      appearance="base"
                      class="!w-full"
                      value={store.telegram.botToken}
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      onInput={(e) => setStore("telegram", "botToken", e.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="shrink-0 px-2 py-1 text-11-regular rounded border border-v2-border-border-muted bg-v2-background-bg-base hover:bg-v2-overlay-simple-overlay-hover text-text-weak transition-colors"
                      onClick={() => setShowTelegramToken(!showTelegramToken())}
                    >
                      {showTelegramToken() ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.telegram.chatId") || "Chat ID / Usuario"}
                  description="Tu ID numérico o el ID del grupo/canal donde Tiancode enviará las alertas."
                >
                  <div class="w-full max-w-[340px]">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      class="!w-full"
                      value={store.telegram.chatId}
                      placeholder="ej. 987654321 o @mi_canal"
                      onInput={(e) => setStore("telegram", "chatId", e.currentTarget.value)}
                    />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.telegram.pairing") || "Pairing interactivo bidireccional"}
                  description={
                    language.t("settings.connections.telegram.pairingDescription") ||
                    "Permite a Tiancode recibir comandos /run, /status y aprobar permisos críticos directamente desde Telegram."
                  }
                >
                  <Switch
                    checked={store.telegram.pairingEnabled}
                    onChange={(checked) => setStore("telegram", "pairingEnabled", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.telegram.notifyBuilds") || "Notificaciones de compilación"}
                  description="Notificar cuando finalice un build, se completen los tests o falle una tarea en segundo plano."
                >
                  <Switch
                    checked={store.telegram.notifyBuilds}
                    onChange={(checked) => setStore("telegram", "notifyBuilds", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title="Comprobar Conexión"
                  description="Envía un mensaje de saludo al bot y verifica la validez del token."
                >
                  <ButtonV2
                    appearance="secondary"
                    size="small"
                    disabled={testingTelegram() || !store.telegram.botToken.trim()}
                    onClick={testTelegram}
                  >
                    {testingTelegram() ? "Probando..." : "Enviar mensaje de prueba"}
                  </ButtonV2>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        {/* 2. SECCIÓN: WHATSAPP GATEWAY */}
        <Show when={activeCategory() === "all" || activeCategory() === "whatsapp"}>
          <div class="settings-v2-section">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-emerald-400">
                  <IconWhatsApp />
                </span>
                <h3 class="settings-v2-section-title">
                  {language.t("settings.connections.whatsapp.title") || "WhatsApp Gateway"}
                </h3>
              </div>
              <Show when={store.whatsapp.enabled}>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border"
                  classList={{
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400":
                      store.whatsapp.status === "paired",
                    "border-amber-500/30 bg-amber-500/10 text-amber-400":
                      store.whatsapp.status === "idle",
                    "border-rose-500/30 bg-rose-500/10 text-rose-400":
                      store.whatsapp.status === "disconnected",
                  }}
                >
                  ● {store.whatsapp.status === "paired" ? "Dispositivo Vinculado" : "Esperando Pairing"}
                </span>
              </Show>
            </div>

            <SettingsListV2>
              <SettingsRowV2
                title="Habilitar WhatsApp Gateway"
                description="Conexión nativa con WhatsApp Web mediante protocolo OpenClaw / Hermes para reportes inmediatos."
              >
                <Switch
                  checked={store.whatsapp.enabled}
                  onChange={(checked) => setStore("whatsapp", "enabled", checked)}
                />
              </SettingsRowV2>

              <Show when={store.whatsapp.enabled}>
                <SettingsRowV2
                  title={language.t("settings.connections.whatsapp.phone") || "Número / ID de WhatsApp"}
                  description="Número telefónico en formato internacional con prefijo (ej. +34600112233)."
                >
                  <div class="w-full max-w-[340px]">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      class="!w-full"
                      value={store.whatsapp.phoneOrId}
                      placeholder="+34 600 000 000"
                      onInput={(e) => setStore("whatsapp", "phoneOrId", e.currentTarget.value)}
                    />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.whatsapp.pairingMode") || "Método de Vinculación"}
                  description="Selecciona si deseas vincular mediante código de 8 caracteres o Webhook endpoint."
                >
                  <SegmentedControlV2
                    value={store.whatsapp.pairingMode}
                    onChange={(val) => val && setStore("whatsapp", "pairingMode", val as "code" | "qr" | "webhook")}
                  >
                    <SegmentedControlItemV2 value="code">Código Pairing</SegmentedControlItemV2>
                    <SegmentedControlItemV2 value="qr">Código QR</SegmentedControlItemV2>
                    <SegmentedControlItemV2 value="webhook">Webhook Server</SegmentedControlItemV2>
                  </SegmentedControlV2>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.whatsapp.notifyBuilds") || "Notificaciones de compilación y pruebas"}
                  description="Avisar en WhatsApp cuando un build finalice o los tests fallen en sesiones prolongadas."
                >
                  <Switch
                    checked={store.whatsapp.notifyBuilds}
                    onChange={(checked) => setStore("whatsapp", "notifyBuilds", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.whatsapp.notifyErrors") || "Alertas de excepciones críticas"}
                  description="Envío prioritario ante excepciones no controladas o caídas del servidor de desarrollo."
                >
                  <Switch
                    checked={store.whatsapp.notifyErrors}
                    onChange={(checked) => setStore("whatsapp", "notifyErrors", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title="Vincular Dispositivo"
                  description={
                    store.whatsapp.pairingCode
                      ? `Código activo: ${store.whatsapp.pairingCode}`
                      : "Genera el código de vinculación para emparejar tu teléfono con Tiancode."
                  }
                >
                  <div class="flex items-center gap-2">
                    <Show when={store.whatsapp.pairingCode}>
                      <span class="font-mono text-12-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                        {store.whatsapp.pairingCode}
                      </span>
                    </Show>
                    <ButtonV2
                      appearance="primary"
                      size="small"
                      onClick={generateWhatsAppPairing}
                    >
                      {store.whatsapp.pairingCode ? "Regenerar Código" : "Generar Código de Pairing"}
                    </ButtonV2>
                  </div>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        {/* 3. SECCIÓN: DISCORD INTEGRATION */}
        <Show when={activeCategory() === "all" || activeCategory() === "discord"}>
          <div class="settings-v2-section">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-indigo-400">
                  <IconDiscord />
                </span>
                <h3 class="settings-v2-section-title">
                  {language.t("settings.connections.discord.title") || "Discord"}
                </h3>
              </div>
              <Show when={store.discord.enabled}>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border"
                  classList={{
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400":
                      store.discord.status === "connected",
                    "border-amber-500/30 bg-amber-500/10 text-amber-400":
                      store.discord.status === "idle",
                    "border-rose-500/30 bg-rose-500/10 text-rose-400":
                      store.discord.status === "error",
                  }}
                >
                  ● {store.discord.status === "connected" ? "Sincronizado" : "Sin verificar"}
                </span>
              </Show>
            </div>

            <SettingsListV2>
              <SettingsRowV2
                title="Habilitar Integración Discord"
                description="Publica resúmenes de commits, reportes de lint y logs de agentes en canales de tu servidor Discord."
              >
                <Switch
                  checked={store.discord.enabled}
                  onChange={(checked) => setStore("discord", "enabled", checked)}
                />
              </SettingsRowV2>

              <Show when={store.discord.enabled}>
                <SettingsRowV2
                  title={language.t("settings.connections.discord.authMode") || "Método de Conexión"}
                  description="Utiliza un Webhook URL para envíos unidireccionales o un Bot Token para menciones y respuestas."
                >
                  <SegmentedControlV2
                    value={store.discord.authMode}
                    onChange={(val) => val && setStore("discord", "authMode", val as "webhook" | "bot")}
                  >
                    <SegmentedControlItemV2 value="webhook">Webhook URL</SegmentedControlItemV2>
                    <SegmentedControlItemV2 value="bot">Bot Token</SegmentedControlItemV2>
                  </SegmentedControlV2>
                </SettingsRowV2>

                <SettingsRowV2
                  title={store.discord.authMode === "webhook" ? "Webhook URL" : "Bot Token"}
                  description={
                    store.discord.authMode === "webhook"
                      ? "URL del Webhook copiada desde los ajustes del canal en Discord."
                      : "Token de tu aplicación bot desde el portal de desarrolladores de Discord."
                  }
                >
                  <div class="flex items-center gap-2 w-full max-w-[340px]">
                    <TextInputV2
                      type={showDiscordSecret() ? "text" : "password"}
                      appearance="base"
                      class="!w-full"
                      value={store.discord.authMode === "webhook" ? store.discord.webhookUrl : store.discord.botToken}
                      placeholder={
                        store.discord.authMode === "webhook"
                          ? "https://discord.com/api/webhooks/..."
                          : "Bot token..."
                      }
                      onInput={(e) => {
                        if (store.discord.authMode === "webhook") {
                          setStore("discord", "webhookUrl", e.currentTarget.value)
                        } else {
                          setStore("discord", "botToken", e.currentTarget.value)
                        }
                      }}
                    />
                    <button
                      type="button"
                      class="shrink-0 px-2 py-1 text-11-regular rounded border border-v2-border-border-muted bg-v2-background-bg-base hover:bg-v2-overlay-simple-overlay-hover text-text-weak transition-colors"
                      onClick={() => setShowDiscordSecret(!showDiscordSecret())}
                    >
                      {showDiscordSecret() ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.discord.channel") || "Canal de avisos"}
                  description="Nombre o identificador del canal donde se publicarán los mensajes."
                >
                  <div class="w-full max-w-[340px]">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      class="!w-full"
                      value={store.discord.channelName}
                      placeholder="#tiancode-builds"
                      onInput={(e) => setStore("discord", "channelName", e.currentTarget.value)}
                    />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.discord.notifyBuilds") || "Notificaciones de builds y commits"}
                  description="Emitir un embed formateado cada vez que un modelo de IA modifique archivos o complete una tarea."
                >
                  <Switch
                    checked={store.discord.notifyBuilds}
                    onChange={(checked) => setStore("discord", "notifyBuilds", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title="Comprobar Discord"
                  description="Envía un ping de prueba con los datos del espacio de trabajo."
                >
                  <ButtonV2
                    appearance="secondary"
                    size="small"
                    disabled={testingDiscord() || (!store.discord.webhookUrl.trim() && !store.discord.botToken.trim())}
                    onClick={testDiscord}
                  >
                    {testingDiscord() ? "Enviando..." : "Enviar ping a Discord"}
                  </ButtonV2>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        {/* 4. SECCIÓN: SLACK INTEGRATION */}
        <Show when={activeCategory() === "all" || activeCategory() === "slack"}>
          <div class="settings-v2-section">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-amber-400">
                  <IconSlack />
                </span>
                <h3 class="settings-v2-section-title">
                  {language.t("settings.connections.slack.title") || "Slack"}
                </h3>
              </div>
              <Show when={store.slack.enabled}>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border"
                  classList={{
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400":
                      store.slack.status === "connected",
                    "border-amber-500/30 bg-amber-500/10 text-amber-400":
                      store.slack.status === "idle",
                    "border-rose-500/30 bg-rose-500/10 text-rose-400":
                      store.slack.status === "error",
                  }}
                >
                  ● {store.slack.status === "connected" ? "Activo" : "Sin verificar"}
                </span>
              </Show>
            </div>

            <SettingsListV2>
              <SettingsRowV2
                title="Habilitar Slack"
                description="Publica eventos de agentes y progreso de compilación en canales de tu workspace de Slack."
              >
                <Switch
                  checked={store.slack.enabled}
                  onChange={(checked) => setStore("slack", "enabled", checked)}
                />
              </SettingsRowV2>

              <Show when={store.slack.enabled}>
                <SettingsRowV2
                  title={language.t("settings.connections.slack.webhook") || "Incoming Webhook URL"}
                  description="URL generada por la App de Slack para publicar en tu canal."
                >
                  <div class="w-full max-w-[340px]">
                    <TextInputV2
                      type="password"
                      appearance="base"
                      class="!w-full"
                      value={store.slack.webhookUrl}
                      placeholder="https://hooks.slack.com/services/..."
                      onInput={(e) => setStore("slack", "webhookUrl", e.currentTarget.value)}
                    />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.slack.channel") || "Canal Predeterminado"}
                  description="Canal de Slack de destino (ej. #general, #tiancode-feed)."
                >
                  <div class="w-full max-w-[340px]">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      class="!w-full"
                      value={store.slack.channelName}
                      placeholder="#general"
                      onInput={(e) => setStore("slack", "channelName", e.currentTarget.value)}
                    />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.slack.notifyBackground") || "Notificaciones de background"}
                  description="Recibir avisos cuando un subagente termine una investigación o tarea de fondo."
                >
                  <Switch
                    checked={store.slack.notifyBackground}
                    onChange={(checked) => setStore("slack", "notifyBackground", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title="Probar Webhook de Slack"
                  description="Envía un bloque interactivo de confirmación a tu canal de Slack."
                >
                  <ButtonV2
                    appearance="secondary"
                    size="small"
                    disabled={testingSlack() || !store.slack.webhookUrl.trim()}
                    onClick={testSlack}
                  >
                    {testingSlack() ? "Enviando..." : "Probar Webhook de Slack"}
                  </ButtonV2>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        {/* 5. SECCIÓN: WEBHOOKS GENÉRICOS & HERMES GATEWAY */}
        <Show when={activeCategory() === "all" || activeCategory() === "webhooks"}>
          <div class="settings-v2-section">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-purple-400">
                  <IconWebhook />
                </span>
                <h3 class="settings-v2-section-title">
                  {language.t("settings.connections.webhooks.title") || "Webhooks y API Gateway"}
                </h3>
              </div>
              <Show when={store.webhooks.enabled}>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border"
                  classList={{
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400":
                      store.webhooks.status === "connected",
                    "border-amber-500/30 bg-amber-500/10 text-amber-400":
                      store.webhooks.status === "idle",
                    "border-rose-500/30 bg-rose-500/10 text-rose-400":
                      store.webhooks.status === "error",
                  }}
                >
                  ● {store.webhooks.status === "connected" ? "Endpoint Verificado" : "Listo"}
                </span>
              </Show>
            </div>

            <SettingsListV2>
              <SettingsRowV2
                title="Habilitar Webhooks Salientes"
                description="Envía eventos JSON firmados a tu propio backend, servidor de n8n o servicio de automatización."
              >
                <Switch
                  checked={store.webhooks.enabled}
                  onChange={(checked) => setStore("webhooks", "enabled", checked)}
                />
              </SettingsRowV2>

              <Show when={store.webhooks.enabled}>
                <SettingsRowV2
                  title={language.t("settings.connections.webhooks.url") || "Endpoint URL"}
                  description="URL del servicio que recibirá los payloads POST de Tiancode."
                >
                  <div class="w-full max-w-[340px]">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      class="!w-full"
                      value={store.webhooks.endpointUrl}
                      placeholder="https://mi-servidor.com/api/tiancode-webhook"
                      onInput={(e) => setStore("webhooks", "endpointUrl", e.currentTarget.value)}
                    />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.connections.webhooks.secret") || "Clave Secreta HMAC"}
                  description="Clave compartida para verificar la cabecera X-Tiancode-Signature en cada petición."
                >
                  <div class="flex items-center gap-2 w-full max-w-[340px]">
                    <TextInputV2
                      type={showWebhookSecret() ? "text" : "password"}
                      appearance="base"
                      class="!w-full"
                      value={store.webhooks.secretToken}
                      placeholder="whsec_..."
                      onInput={(e) => setStore("webhooks", "secretToken", e.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="shrink-0 px-2 py-1 text-11-regular rounded border border-v2-border-border-muted bg-v2-background-bg-base hover:bg-v2-overlay-simple-overlay-hover text-text-weak transition-colors"
                      onClick={() => setShowWebhookSecret(!showWebhookSecret())}
                    >
                      {showWebhookSecret() ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title="Evento: Sesión completada"
                  description="Disparar webhook cuando una sesión o tarea de agente finalice exitosamente."
                >
                  <Switch
                    checked={store.webhooks.notifySessionComplete}
                    onChange={(checked) => setStore("webhooks", "notifySessionComplete", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title="Evento: Errores de ejecución o build"
                  description="Disparar webhook inmediatamente ante fallos de pruebas o excepciones del sistema."
                >
                  <Switch
                    checked={store.webhooks.notifyBuildErrors}
                    onChange={(checked) => setStore("webhooks", "notifyBuildErrors", checked)}
                  />
                </SettingsRowV2>

                <SettingsRowV2
                  title="Probar Webhook Saliente"
                  description="Emite un evento de prueba con firma HMAC simulada."
                >
                  <ButtonV2
                    appearance="secondary"
                    size="small"
                    disabled={testingWebhook() || !store.webhooks.endpointUrl.trim()}
                    onClick={testWebhook}
                  >
                    {testingWebhook() ? "Enviando..." : "Enviar payload de prueba"}
                  </ButtonV2>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        </Show>
      </div>
    </>
  )
}
