import { Component, For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import {
  CONNECTION_PROVIDERS,
  gatewayState,
  isHttpUrl,
  looksLikeSnowflake,
  looksLikeTelegramToken,
  normalizeStatus,
  providerSettings,
  relativeTime,
  type ConnectionProvider,
  type GatewayStatus,
} from "./connections-logic"
import "./connections.css"

// Settings → Conexiones. Everything here reads from and writes to the server
// (/global/connections): the panel holds no state of its own beyond drafts being typed.
// Secrets are write-only — the server reports whether one is saved, never its value.

type Filter = "all" | ConnectionProvider
const PROVIDER_LABEL: Record<ConnectionProvider, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  webhook: "Webhook",
}
const REFRESH_MS = 10_000
const SAVE_DEBOUNCE_MS = 600

export const SettingsConnectionsV2: Component<{ active?: boolean }> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const t = (key: string, params?: Record<string, string | number>) => language.t(key, params)
  const connections = () => serverSdk().client.global.connections

  const [filter, setFilter] = createSignal<Filter>("all")
  const [testing, setTesting] = createSignal<ConnectionProvider | undefined>()
  const [now, setNow] = createSignal(Date.now())

  const [statuses, { refetch, mutate }] = createResource(async () => {
    const response = await connections().list()
    if (response.error) throw new Error(String((response.error as { message?: string }).message ?? response.error))
    return (response.data?.data ?? []).map(normalizeStatus)
  })

  // Status only moves while someone is looking at it.
  createEffect(() => {
    if (props.active === false) return
    void refetch()
    const timer = setInterval(() => {
      setNow(Date.now())
      void refetch()
    }, REFRESH_MS)
    onCleanup(() => clearInterval(timer))
  })

  const status = (provider: ConnectionProvider) => statuses()?.find((s) => s.provider === provider)

  const apply = (next: GatewayStatus | undefined) => {
    if (!next) return
    mutate((current) => (current ?? []).map((s) => (s.provider === next.provider ? next : s)))
  }

  const failed = (error: unknown) =>
    showToast({
      variant: "error",
      title: t("settings.connections.saveFailed", {
        message: error instanceof Error ? error.message : String(error),
      }),
    })

  const save = async (provider: ConnectionProvider, settings: Record<string, unknown>) => {
    try {
      const response = await connections().update({ provider, connectionsUpdateInput: { settings } })
      if (response.error) throw new Error(String((response.error as { message?: string }).message ?? response.error))
      apply(response.data ? normalizeStatus(response.data) : undefined)
    } catch (error) {
      failed(error)
    }
  }

  const saveSecret = async (provider: ConnectionProvider, secret: string) => {
    try {
      const response = await connections().update({ provider, connectionsUpdateInput: { secret } })
      if (response.error) throw new Error(String((response.error as { message?: string }).message ?? response.error))
      apply(response.data ? normalizeStatus(response.data) : undefined)
      showToast({
        variant: "success",
        title: t(secret ? "settings.connections.secret.savedToast" : "settings.connections.secret.clearedToast"),
      })
      return true
    } catch (error) {
      failed(error)
      return false
    }
  }

  const test = async (provider: ConnectionProvider) => {
    if (testing()) return
    setTesting(provider)
    try {
      const response = await connections().test({ provider })
      const result = response.data
      if (!result) throw new Error(String(response.error ?? "unknown"))
      showToast({
        variant: result.ok ? "success" : "error",
        title: t(result.ok ? "settings.connections.test.ok" : "settings.connections.test.failed", {
          provider: PROVIDER_LABEL[provider],
          message: result.message,
          ms: String(Math.round(Number(result.latencyMs) || 0)),
        }),
      })
      void refetch()
    } catch (error) {
      failed(error)
    } finally {
      setTesting(undefined)
    }
  }

  const disconnect = async (provider: ConnectionProvider) => {
    try {
      const response = await connections().remove({ provider })
      if (response.error) throw new Error(String(response.error))
      apply(response.data ? normalizeStatus(response.data) : undefined)
      showToast({ variant: "success", title: t("settings.connections.disconnected", { provider: PROVIDER_LABEL[provider] }) })
    } catch (error) {
      failed(error)
    }
  }

  const stateLabel = (s: GatewayStatus | undefined) =>
    t(`settings.connections.state.${s ? gatewayState(s) : "off"}`)

  const lastDelivery = (s: GatewayStatus | undefined) => {
    const bucket = relativeTime(s?.lastDeliveryAt, now())
    if (!bucket) return undefined
    return t("settings.connections.lastDelivery", { when: t(`settings.connections.time.${bucket.key}`, { n: bucket.n }) })
  }

  const visible = (provider: ConnectionProvider) => filter() === "all" || filter() === provider

  const telegram = createMemo(() =>
    providerSettings(status("telegram"), {
      enabled: false,
      chatId: "",
      notifyIdle: true,
      notifyError: true,
      inbound: false,
      directory: "",
    }),
  )
  const discord = createMemo(() =>
    providerSettings(status("discord"), {
      enabled: false,
      mode: "webhook" as "webhook" | "bot",
      channelId: "",
      notifyIdle: true,
      notifyError: true,
    }),
  )
  const slack = createMemo(() => providerSettings(status("slack"), { enabled: false, notifyIdle: true, notifyError: true }))
  const webhook = createMemo(() =>
    providerSettings(status("webhook"), { enabled: false, url: "", events: ["session.idle", "session.error"] as string[] }),
  )

  const toggleEvent = (event: string, on: boolean) => {
    const current = webhook().events.filter((e) => e !== event)
    void save("webhook", { events: on ? [...current, event] : current })
  }

  return (
    <div class="settings-v2-connections">
      <div class="settings-v2-tab-header">
        <div class="flex items-center justify-between gap-3">
          <h2 class="settings-v2-tab-title">{t("settings.connections.title")}</h2>
          <Show when={statuses.error}>
            <ButtonV2 variant="ghost" size="small" onClick={() => void refetch()}>
              {t("settings.connections.retry")}
            </ButtonV2>
          </Show>
        </div>
        <p class="settings-v2-tab-description">{t("settings.connections.description")}</p>

        <div class="settings-v2-connections-overview" role="list">
          <For each={CONNECTION_PROVIDERS}>
            {(provider) => (
              <button
                type="button"
                role="listitem"
                class="settings-v2-connections-chip"
                data-state={status(provider) ? gatewayState(status(provider)!) : "off"}
                aria-pressed={filter() === provider}
                onClick={() => setFilter(filter() === provider ? "all" : provider)}
              >
                <span class="settings-v2-connections-dot" aria-hidden="true" />
                <span class="settings-v2-connections-chip-name">{PROVIDER_LABEL[provider]}</span>
                <span class="settings-v2-connections-chip-state">{stateLabel(status(provider))}</span>
              </button>
            )}
          </For>
        </div>

        <div class="mt-3">
          <SegmentedControlV2 value={filter()} onChange={(value) => value && setFilter(value as Filter)}>
            <SegmentedControlItemV2 value="all">{t("settings.connections.filter.all")}</SegmentedControlItemV2>
            <For each={CONNECTION_PROVIDERS}>
              {(provider) => <SegmentedControlItemV2 value={provider}>{PROVIDER_LABEL[provider]}</SegmentedControlItemV2>}
            </For>
          </SegmentedControlV2>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        <Show when={statuses.error}>
          <div class="settings-v2-connections-error" role="alert">
            <Icon name="warning" size="small" />
            <span>{t("settings.connections.loadFailed")}</span>
          </div>
        </Show>

        {/* ---------------------------------------------------------------- Telegram */}
        <Show when={visible("telegram")}>
          <GatewaySection
            provider="telegram"
            title={t("settings.connections.telegram.title")}
            description={t("settings.connections.telegram.desc")}
            status={status("telegram")}
            stateLabel={stateLabel(status("telegram"))}
            lastDelivery={lastDelivery(status("telegram"))}
            testing={testing() === "telegram"}
            onTest={() => void test("telegram")}
            onDisconnect={() => void disconnect("telegram")}
            t={t}
          >
            <SettingsRowV2 title={t("settings.connections.enable")} description={t("settings.connections.enable.desc")}>
              <Switch checked={telegram().enabled} onChange={(checked) => void save("telegram", { enabled: checked })} />
            </SettingsRowV2>
            <SecretRow
              title={t("settings.connections.telegram.token")}
              description={t("settings.connections.telegram.token.desc")}
              placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              hasSecret={status("telegram")?.hasSecret ?? false}
              validate={(value) => (looksLikeTelegramToken(value) ? undefined : t("settings.connections.invalid.telegramToken"))}
              onSave={(secret) => saveSecret("telegram", secret)}
              t={t}
            />
            <TextRow
              title={t("settings.connections.telegram.chatId")}
              description={t("settings.connections.telegram.chatId.desc")}
              placeholder="987654321"
              value={telegram().chatId}
              onSave={(value) => void save("telegram", { chatId: value })}
            />
            <SettingsRowV2 title={t("settings.connections.notifyIdle")} description={t("settings.connections.notifyIdle.desc")}>
              <Switch checked={telegram().notifyIdle} onChange={(checked) => void save("telegram", { notifyIdle: checked })} />
            </SettingsRowV2>
            <SettingsRowV2 title={t("settings.connections.notifyError")} description={t("settings.connections.notifyError.desc")}>
              <Switch checked={telegram().notifyError} onChange={(checked) => void save("telegram", { notifyError: checked })} />
            </SettingsRowV2>
            <SettingsRowV2
              title={t("settings.connections.telegram.inbound")}
              description={
                <span>
                  {t("settings.connections.telegram.inbound.desc")}
                  <Show when={status("telegram")?.inbound}>
                    {(inbound) => (
                      <span class="settings-v2-connections-inbound" data-running={inbound().running}>
                        {inbound().running
                          ? t("settings.connections.telegram.inbound.running", { sessions: inbound().sessions })
                          : t("settings.connections.telegram.inbound.stopped")}
                      </span>
                    )}
                  </Show>
                </span>
              }
            >
              <Switch checked={telegram().inbound} onChange={(checked) => void save("telegram", { inbound: checked })} />
            </SettingsRowV2>
            <Show when={telegram().inbound}>
              <TextRow
                title={t("settings.connections.telegram.directory")}
                description={t("settings.connections.telegram.directory.desc")}
                placeholder="C:\\Users\\yo\\Proyectos\\mi-app"
                value={telegram().directory}
                onSave={(value) => void save("telegram", { directory: value })}
              />
            </Show>
          </GatewaySection>
        </Show>

        {/* ----------------------------------------------------------------- Discord */}
        <Show when={visible("discord")}>
          <GatewaySection
            provider="discord"
            title={t("settings.connections.discord.title")}
            description={t("settings.connections.discord.desc")}
            status={status("discord")}
            stateLabel={stateLabel(status("discord"))}
            lastDelivery={lastDelivery(status("discord"))}
            testing={testing() === "discord"}
            onTest={() => void test("discord")}
            onDisconnect={() => void disconnect("discord")}
            t={t}
          >
            <SettingsRowV2 title={t("settings.connections.enable")} description={t("settings.connections.enable.desc")}>
              <Switch checked={discord().enabled} onChange={(checked) => void save("discord", { enabled: checked })} />
            </SettingsRowV2>
            <SettingsRowV2 title={t("settings.connections.discord.authMode")} description="">
              <SegmentedControlV2
                value={discord().mode}
                onChange={(value) => value && void save("discord", { mode: value })}
              >
                <SegmentedControlItemV2 value="webhook">{t("settings.connections.discord.mode.webhook")}</SegmentedControlItemV2>
                <SegmentedControlItemV2 value="bot">{t("settings.connections.discord.mode.bot")}</SegmentedControlItemV2>
              </SegmentedControlV2>
            </SettingsRowV2>
            <Show
              when={discord().mode === "bot"}
              fallback={
                <SecretRow
                  title={t("settings.connections.discord.webhookUrl")}
                  description={t("settings.connections.discord.webhookUrl.desc")}
                  placeholder="https://discord.com/api/webhooks/…"
                  hasSecret={status("discord")?.hasSecret ?? false}
                  validate={(value) => (isHttpUrl(value) ? undefined : t("settings.connections.invalid.url"))}
                  onSave={(secret) => saveSecret("discord", secret)}
                  t={t}
                />
              }
            >
              <SecretRow
                title={t("settings.connections.discord.botToken")}
                description={t("settings.connections.discord.botToken.desc")}
                placeholder="MTIz…"
                hasSecret={status("discord")?.hasSecret ?? false}
                onSave={(secret) => saveSecret("discord", secret)}
                t={t}
              />
              <TextRow
                title={t("settings.connections.discord.channelId")}
                description={t("settings.connections.discord.channelId.desc")}
                placeholder="1234567890123456789"
                value={discord().channelId}
                validate={(value) => (!value || looksLikeSnowflake(value) ? undefined : t("settings.connections.invalid.snowflake"))}
                onSave={(value) => void save("discord", { channelId: value })}
              />
            </Show>
            <SettingsRowV2 title={t("settings.connections.notifyIdle")} description={t("settings.connections.notifyIdle.desc")}>
              <Switch checked={discord().notifyIdle} onChange={(checked) => void save("discord", { notifyIdle: checked })} />
            </SettingsRowV2>
            <SettingsRowV2 title={t("settings.connections.notifyError")} description={t("settings.connections.notifyError.desc")}>
              <Switch checked={discord().notifyError} onChange={(checked) => void save("discord", { notifyError: checked })} />
            </SettingsRowV2>
          </GatewaySection>
        </Show>

        {/* ------------------------------------------------------------------- Slack */}
        <Show when={visible("slack")}>
          <GatewaySection
            provider="slack"
            title={t("settings.connections.slack.title")}
            description={t("settings.connections.slack.desc")}
            status={status("slack")}
            stateLabel={stateLabel(status("slack"))}
            lastDelivery={lastDelivery(status("slack"))}
            testing={testing() === "slack"}
            onTest={() => void test("slack")}
            onDisconnect={() => void disconnect("slack")}
            t={t}
          >
            <SettingsRowV2 title={t("settings.connections.enable")} description={t("settings.connections.enable.desc")}>
              <Switch checked={slack().enabled} onChange={(checked) => void save("slack", { enabled: checked })} />
            </SettingsRowV2>
            <SecretRow
              title={t("settings.connections.slack.webhook")}
              description={t("settings.connections.slack.webhook.desc")}
              placeholder="https://hooks.slack.com/services/…"
              hasSecret={status("slack")?.hasSecret ?? false}
              validate={(value) => (isHttpUrl(value) ? undefined : t("settings.connections.invalid.url"))}
              onSave={(secret) => saveSecret("slack", secret)}
              t={t}
            />
            <SettingsRowV2 title={t("settings.connections.notifyIdle")} description={t("settings.connections.notifyIdle.desc")}>
              <Switch checked={slack().notifyIdle} onChange={(checked) => void save("slack", { notifyIdle: checked })} />
            </SettingsRowV2>
            <SettingsRowV2 title={t("settings.connections.notifyError")} description={t("settings.connections.notifyError.desc")}>
              <Switch checked={slack().notifyError} onChange={(checked) => void save("slack", { notifyError: checked })} />
            </SettingsRowV2>
          </GatewaySection>
        </Show>

        {/* ----------------------------------------------------------------- Webhook */}
        <Show when={visible("webhook")}>
          <GatewaySection
            provider="webhook"
            title={t("settings.connections.webhooks.title")}
            description={t("settings.connections.webhooks.desc")}
            status={status("webhook")}
            stateLabel={stateLabel(status("webhook"))}
            lastDelivery={lastDelivery(status("webhook"))}
            testing={testing() === "webhook"}
            onTest={() => void test("webhook")}
            onDisconnect={() => void disconnect("webhook")}
            t={t}
          >
            <SettingsRowV2 title={t("settings.connections.enable")} description={t("settings.connections.enable.desc")}>
              <Switch checked={webhook().enabled} onChange={(checked) => void save("webhook", { enabled: checked })} />
            </SettingsRowV2>
            <TextRow
              title={t("settings.connections.webhooks.url")}
              description={t("settings.connections.webhooks.url.desc")}
              placeholder="https://example.com/tiancode"
              value={webhook().url}
              validate={(value) => (!value || isHttpUrl(value) ? undefined : t("settings.connections.invalid.url"))}
              onSave={(value) => void save("webhook", { url: value })}
            />
            <SecretRow
              title={t("settings.connections.webhooks.secret")}
              description={t("settings.connections.webhooks.secret.desc")}
              placeholder="whsec_…"
              hasSecret={status("webhook")?.hasSecret ?? false}
              onSave={(secret) => saveSecret("webhook", secret)}
              t={t}
            />
            <SettingsRowV2 title={t("settings.connections.webhooks.events.idle")} description={t("settings.connections.notifyIdle.desc")}>
              <Switch checked={webhook().events.includes("session.idle")} onChange={(on) => toggleEvent("session.idle", on)} />
            </SettingsRowV2>
            <SettingsRowV2 title={t("settings.connections.webhooks.events.error")} description={t("settings.connections.notifyError.desc")}>
              <Switch checked={webhook().events.includes("session.error")} onChange={(on) => toggleEvent("session.error", on)} />
            </SettingsRowV2>
          </GatewaySection>
        </Show>

        <p class="settings-v2-note settings-v2-connections-note">{t("settings.connections.whatsapp.soon")}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// Parts

type Translate = (key: string, params?: Record<string, string | number>) => string

const GatewaySection: Component<{
  provider: ConnectionProvider
  title: string
  description: string
  status: GatewayStatus | undefined
  stateLabel: string
  lastDelivery: string | undefined
  testing: boolean
  onTest: () => void
  onDisconnect: () => void
  t: Translate
  children: any
}> = (props) => {
  const state = () => (props.status ? gatewayState(props.status) : "off")
  return (
    <section class="settings-v2-section settings-v2-connections-section" data-state={state()}>
      <header class="settings-v2-connections-section-head">
        <div class="settings-v2-connections-section-copy">
          <h3 class="settings-v2-section-title">
            <span class="settings-v2-connections-dot" aria-hidden="true" />
            {props.title}
            <span class="settings-v2-connections-state">{props.stateLabel}</span>
          </h3>
          <p class="settings-v2-connections-section-description">{props.description}</p>
          <Show when={props.status?.lastError}>
            {(error) => (
              <p class="settings-v2-connections-last-error">
                <Icon name="warning" size="small" />
                {error()}
              </p>
            )}
          </Show>
          <Show when={props.lastDelivery}>
            {(when) => <p class="settings-v2-connections-last-delivery">{when()}</p>}
          </Show>
        </div>
        <div class="settings-v2-connections-actions">
          <ButtonV2
            variant="outline"
            size="small"
            disabled={props.testing || !props.status?.configured}
            onClick={props.onTest}
          >
            {props.testing ? props.t("settings.connections.testing") : props.t("settings.connections.test")}
          </ButtonV2>
          <Show when={props.status?.configured || props.status?.enabled}>
            <ButtonV2 variant="ghost-muted" size="small" onClick={props.onDisconnect}>
              {props.t("settings.connections.disconnect")}
            </ButtonV2>
          </Show>
        </div>
      </header>
      <SettingsListV2>{props.children}</SettingsListV2>
    </section>
  )
}

/** Text setting that saves itself a moment after the user stops typing. */
const TextRow: Component<{
  title: string
  description: string
  placeholder?: string
  value: string
  validate?: (value: string) => string | undefined
  onSave: (value: string) => void
}> = (props) => {
  const [draft, setDraft] = createSignal(props.value)
  const [dirty, setDirty] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  // Follow the server while nothing is being typed.
  createEffect(() => {
    const incoming = props.value
    if (!dirty()) setDraft(incoming)
  })
  const problem = createMemo(() => (props.validate ? props.validate(draft()) : undefined))
  const commit = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!dirty()) return
    setDirty(false)
    if (problem()) return
    props.onSave(draft().trim())
  }
  onCleanup(() => timer && clearTimeout(timer))
  return (
    <SettingsRowV2
      title={props.title}
      description={
        <span>
          {props.description}
          <Show when={problem()}>{(text) => <span class="settings-v2-connections-problem">{text()}</span>}</Show>
        </span>
      }
    >
      <TextInputV2
        type="text"
        appearance="base"
        class="settings-v2-connections-input"
        value={draft()}
        placeholder={props.placeholder}
        onInput={(event) => {
          setDraft(event.currentTarget.value)
          setDirty(true)
          if (timer) clearTimeout(timer)
          timer = setTimeout(commit, SAVE_DEBOUNCE_MS)
        }}
        onBlur={commit}
      />
    </SettingsRowV2>
  )
}

/**
 * Write-only credential. The server only ever says whether one is stored; the field starts
 * empty and stays empty after saving, so a token is never displayed back.
 */
const SecretRow: Component<{
  title: string
  description: string
  placeholder?: string
  hasSecret: boolean
  validate?: (value: string) => string | undefined
  onSave: (secret: string) => Promise<boolean>
  t: Translate
}> = (props) => {
  const [draft, setDraft] = createSignal("")
  const [reveal, setReveal] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const problem = createMemo(() => (draft() && props.validate ? props.validate(draft()) : undefined))
  const submit = async (secret: string) => {
    if (saving()) return
    setSaving(true)
    try {
      if (await props.onSave(secret)) {
        setDraft("")
        setReveal(false)
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <SettingsRowV2
      title={
        <span class="settings-v2-connections-secret-title">
          {props.title}
          <Show when={props.hasSecret}>
            <span class="settings-v2-connections-saved">
              <Icon name="circle-check" size="small" />
              {props.t("settings.connections.secret.saved")}
            </span>
          </Show>
        </span>
      }
      description={
        <span>
          {props.description}
          <Show when={problem()}>{(text) => <span class="settings-v2-connections-problem">{text()}</span>}</Show>
        </span>
      }
    >
      <div class="settings-v2-connections-secret">
        <TextInputV2
          type={reveal() ? "text" : "password"}
          appearance="base"
          class="settings-v2-connections-input"
          value={draft()}
          placeholder={props.hasSecret ? "••••••••" : props.placeholder}
          autocomplete="off"
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft() && !problem()) void submit(draft().trim())
          }}
        />
        <ButtonV2
          variant="ghost-muted"
          size="small"
          icon="eye"
          aria-label={props.t(reveal() ? "settings.connections.secret.hide" : "settings.connections.secret.show")}
          onClick={() => setReveal(!reveal())}
        />
        <ButtonV2
          variant="neutral"
          size="small"
          disabled={!draft() || Boolean(problem()) || saving()}
          onClick={() => void submit(draft().trim())}
        >
          {props.t(props.hasSecret ? "settings.connections.secret.replace" : "settings.connections.secret.save")}
        </ButtonV2>
        <Show when={props.hasSecret}>
          <ButtonV2 variant="ghost-muted" size="small" icon="trash" disabled={saving()} onClick={() => void submit("")}>
            {props.t("settings.connections.secret.clear")}
          </ButtonV2>
        </Show>
      </div>
    </SettingsRowV2>
  )
}
