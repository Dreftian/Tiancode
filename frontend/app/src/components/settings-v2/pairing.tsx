import { Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { renderSVG } from "uqr"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@tiancode-ai/ui/v2/dialog-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform, type PairingInfo } from "@/context/platform"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"
import "./parts/kit.css"

/** Settings › Uso de la PC › Acceso remoto: open Tiancode from a phone or another computer on the local network. */
export const SettingsPairingSection: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const [keepAwake, { mutate }] = createResource(
    () => !!platform.getKeepScreenActive,
    () => platform.getKeepScreenActive?.() ?? Promise.resolve(false),
    { initialValue: false },
  )
  const [pending, setPending] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const [pairing, pairingActions] = createResource(
    () => platform.pairing,
    (source) => source.info(),
  )
  const [switching, setSwitching] = createSignal(false)

  const onKeepAwake = (checked: boolean) => {
    if (!platform.setKeepScreenActive || pending()) return
    setPending(true)
    setFailed(false)
    mutate(checked)
    void platform
      .setKeepScreenActive(checked)
      .then((applied) => {
        mutate(applied)
        if (checked && !applied) setFailed(true)
      })
      .catch(() => {
        mutate(!checked)
        setFailed(true)
      })
      .finally(() => setPending(false))
  }

  const onLocalNetwork = (enabled: boolean) => {
    const source = platform.pairing
    if (!source || switching()) return
    setSwitching(true)
    void source
      .setEnabled(enabled)
      .then((info) => pairingActions.mutate(info))
      .catch(() => showToast({ variant: "error", description: language.t("settings.pairing.error") }))
      .finally(() => setSwitching(false))
  }

  const state = () => {
    const info = pairing.latest
    if (!info) return { tone: undefined, label: language.t("settings.pairing.state.off") }
    if (info.restartRequired) return { tone: "warn", label: language.t("settings.pairing.state.restart") }
    if (!info.enabled) return { tone: undefined, label: language.t("settings.pairing.state.off") }
    if (info.urls.length === 0) return { tone: "warn", label: language.t("settings.pairing.state.noNetwork") }
    return { tone: "ok", label: language.t("settings.pairing.state.on", { count: info.urls.length }) }
  }

  return (
    <>
      <Show when={platform.pairing}>
        <div class="settings-v2-kit-hero" data-active={pairing.latest?.enabled ? "" : undefined} data-action="settings-pairing-local-network">
          <span class="settings-v2-kit-hero-icon" aria-hidden="true">
            <Icon name="share" />
          </span>
          <div class="settings-v2-kit-hero-copy">
            <span class="settings-v2-kit-hero-title">
              {language.t("settings.pairing.connection.title")}
              <span class="settings-v2-kit-pill" data-tone={state().tone}>
                {state().label}
              </span>
            </span>
            <span class="settings-v2-kit-hero-description">{language.t("settings.pairing.connection.description")}</span>
            <Show when={pairing.latest?.enabled && !pairing.latest?.restartRequired && pairing.latest.urls.length > 0}>
              <div class="settings-v2-kit-chips">
                <For each={pairing.latest?.urls ?? []}>
                  {(url) => (
                    <span class="settings-v2-kit-chip" data-muted>
                      <bdi dir="ltr">{url}</bdi>
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
          <div class="settings-v2-kit-actions">
            <Show when={pairing.latest?.restartRequired}>
              <ButtonV2 type="button" size="small" variant="contrast" onClick={() => void platform.restart()}>
                {language.t("settings.pairing.restart.action")}
              </ButtonV2>
            </Show>
            <Show when={pairing.latest?.enabled && !pairing.latest?.restartRequired}>
              <ButtonV2
                type="button"
                size="small"
                variant="outline"
                data-action="settings-pairing-details"
                disabled={(pairing.latest?.urls.length ?? 0) === 0 || !pairing.latest?.password}
                onClick={() => {
                  const info = pairing.latest
                  if (info) void dialog.push(() => <DialogPairing info={info} />)
                }}
              >
                {language.t("settings.pairing.details.open")}
              </ButtonV2>
            </Show>
            <Switch
              checked={pairing.latest?.enabled ?? false}
              disabled={switching() || pairing.loading}
              onChange={onLocalNetwork}
              hideLabel
            >
              {language.t("settings.pairing.connection.title")}
            </Switch>
          </div>
        </div>
        <p class="settings-v2-kit-note">{language.t("settings.pairing.description")}</p>
      </Show>
      <Show when={platform.setKeepScreenActive}>
        <SettingsListV2 density="compact">
          <SettingsRowV2
            title={language.t("settings.pairing.screenActive.title")}
            description={
              <>
                {language.t("settings.pairing.screenActive.description")}
                <Show when={failed()}>
                  <span class="block text-v2-state-fg-danger">{language.t("settings.pairing.screenActive.error")}</span>
                </Show>
              </>
            }
          >
            <div data-action="settings-keep-screen-active">
              <Switch checked={keepAwake.latest} disabled={pending()} onChange={onKeepAwake} hideLabel>
                {language.t("settings.pairing.screenActive.title")}
              </Switch>
            </div>
          </SettingsRowV2>
        </SettingsListV2>
      </Show>
    </>
  )
}

/** The QR code opens Tiancode signed in; the address and credentials are there for typing by hand. */
function DialogPairing(props: { info: PairingInfo }) {
  const language = useLanguage()
  const [selected, setSelected] = createSignal(props.info.urls[0] ?? "")
  const [copied, setCopied] = createSignal<string>()
  const link = createMemo(() => {
    const url = new URL(selected())
    url.searchParams.set("auth_token", btoa(`${props.info.username}:${props.info.password ?? ""}`))
    return url.href
  })
  const qr = createMemo(() => renderSVG(link(), { border: 2, blackColor: "currentColor", whiteColor: "transparent" }))
  const copy = (key: string, value: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied((current) => (current === key ? undefined : current)), 2000)
      })
      .catch(() => showToast({ variant: "error", description: language.t("settings.pairing.copy.error") }))
  }
  const field = (key: string, label: string, value: string) => (
    <div class="flex min-w-0 items-center gap-2 rounded-[6px] bg-v2-background-bg-layer-01 px-3 py-2">
      <span class="w-24 shrink-0 text-[12px] text-v2-text-text-muted">{label}</span>
      <bdi dir="ltr" class="min-w-0 flex-1 truncate font-mono text-[12px] text-v2-text-text-base" title={value}>
        {value}
      </bdi>
      <ButtonV2 type="button" size="small" variant="ghost" onClick={() => copy(key, value)}>
        {copied() === key ? language.t("common.copied") : language.t("settings.pairing.copy")}
      </ButtonV2>
    </div>
  )

  return (
    <Dialog fit containerClass="max-w-[min(420px,calc(100vw-32px))]">
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("settings.pairing.connection.title")}
          description={language.t("settings.pairing.dialog.description")}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-3 px-4 pb-4">
        <div
          data-slot="pairing-qr"
          class="mx-auto aspect-square w-full max-w-64 rounded-[8px] bg-white p-3 text-black [&>svg]:size-full"
          role="img"
          aria-label={language.t("settings.pairing.qr")}
          innerHTML={qr()}
        />
        <Show when={props.info.urls.length > 1}>
          <div class="flex flex-wrap justify-center gap-1.5">
            <For each={props.info.urls}>
              {(url) => (
                <ButtonV2
                  type="button"
                  size="small"
                  variant={url === selected() ? "contrast" : "neutral"}
                  onClick={() => setSelected(url)}
                >
                  {new URL(url).hostname}
                </ButtonV2>
              )}
            </For>
          </div>
        </Show>
        {field("url", language.t("settings.pairing.field.address"), selected())}
        {field("username", language.t("settings.pairing.field.username"), props.info.username)}
        {field("password", language.t("settings.pairing.field.password"), props.info.password ?? "")}
        <p class="text-[12px] leading-5 text-v2-text-text-muted">{language.t("settings.pairing.dialog.hint")}</p>
      </DialogBody>
    </Dialog>
  )
}
