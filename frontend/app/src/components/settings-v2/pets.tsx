import { For, Show, createEffect, createMemo, createSignal, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { petKinds, petPositions, useSettings, type PetKind, type PetPosition } from "@/context/settings"
import { Pet3DIcon } from "@/components/pet-3d-icons"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { SettingsPagerV2 } from "./parts/pager"

const petPositionLabels = {
  "bottom-right": "settings.pets.position.bottomRight",
  "bottom-left": "settings.pets.position.bottomLeft",
  "top-right": "settings.pets.position.topRight",
  "top-left": "settings.pets.position.topLeft",
} as const

const PET_TRAITS: Record<PetKind, { species: string; trait: string }> = {
  dewey: { species: "Gota de Rocío", trait: "Mantiene el flujo de código fresco y sin bloqueos" },
  fireball: { species: "Llama Dinámica", trait: "Acelera compilaciones y tareas de alto rendimiento" },
  hoots: { species: "Búho Nocturno", trait: "Visión analítica para arquitectura y refactorización" },
  rocky: { species: "Roca Inamovible", trait: "Estabilidad inquebrantable ante errores y caídas" },
  seedy: { species: "Semilla Germinante", trait: "Crecimiento continuo para proyectos nuevos y prototipos" },
  stacky: { species: "Pila Recursiva", trait: "Especialista en rastrear llamadas y desbordamientos" },
  bsod: { species: "Pantalla Azul Retro", trait: "Guardián de excepciones críticas y depuración a bajo nivel" },
  nullsignal: { species: "Espectro Cuántico", trait: "Detección temprana de punteros nulos y condiciones de carrera" },
  cat: { species: "Felino Curioso", trait: "Ronronea en builds exitosos y acompaña en silencio" },
  dog: { species: "Canino Fiel", trait: "Celebra tus commits y te anima en sesiones largas" },
  rabbit: { species: "Conejo Veloz", trait: "Máxima agilidad en sprints de desarrollo ágil" },
  panda: { species: "Panda Zen", trait: "Paz mental inquebrantable en refactorizaciones complejas" },
  fox: { species: "Zorro Astuto", trait: "Agudo en debugging y detección de errores de sintaxis" },
}

export const SettingsPetsV2: Component<{ active?: boolean }> = (_props) => {
  const language = useLanguage()
  const settings = useSettings()

  const PAGE_SIZE = 10
  const [page, setPage] = createSignal(1)
  const allKinds = () => [...petKinds]
  const totalPages = () => Math.max(1, Math.ceil(allKinds().length / PAGE_SIZE))
  const pageKinds = createMemo(() => {
    const p = Math.min(page(), totalPages())
    const start = (p - 1) * PAGE_SIZE
    return allKinds().slice(start, start + PAGE_SIZE)
  })

  createEffect(() => {
    if (page() > totalPages()) setPage(totalPages())
  })

  const selectPet = (kind: PetKind) => {
    settings.general.setPetKind(kind)
    settings.general.setPetEnabled(true)
    const api = (window as unknown as { api?: { pet?: { update: (data: { kind: string }) => Promise<unknown> } } })?.api
    if (api?.pet?.update) {
      void api.pet.update({ kind })
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.pets.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.pets.description")}</p>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.pets.section.companion")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.pets.enabled")}
              description={language.t("settings.pets.enabled.description")}
            >
              <Switch
                checked={settings.general.petEnabled()}
                onChange={(checked) => settings.general.setPetEnabled(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.pets.position")}
              description={language.t("settings.pets.position.description")}
            >
              <SelectV2
                appearance="inline"
                data-action="settings-pet-position"
                options={[...petPositions]}
                current={settings.general.petPosition()}
                placement="bottom-end"
                gutter={6}
                label={(option) => language.t(petPositionLabels[option])}
                onSelect={(option) => option && settings.general.setPetPosition(option)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.pets.desktop.float.title") ?? "Mascota Flotante en Escritorio"}
              description={language.t("settings.pets.desktop.float.desc") ?? "Muestra un compañero interactivo flotante en tu escritorio de Windows con diseño 3D interactivo."}
            >
              <div class="flex items-center gap-2" data-action="settings-pet-desktop">
                <Switch
                  checked={settings.general.petDesktop()}
                  onChange={(checked) => {
                    settings.general.setPetDesktop(checked)
                    const api = (window as unknown as { api?: { pet?: { toggle: () => Promise<boolean> } } })?.api
                    if (api?.pet) void api.pet.toggle()
                  }}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title="Probar Reacción / Acariciar"
              description="Envía un pulso de interacción y cariño a tu mascota activa en tiempo real."
            >
              <ButtonV2
                type="button"
                variant="outline"
                size="small"
                onClick={() => {
                  const api = (window as unknown as { api?: { pet?: { update: (data: unknown) => Promise<unknown> } } })?.api
                  if (api?.pet?.update) {
                    void api.pet.update({ petted: true, text: "¡Hola! Estoy listo para ayudarte a programar." })
                    setTimeout(() => void api.pet?.update({ petted: false }), 1200)
                  }
                }}
              >
                Acariciar 💖
              </ButtonV2>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        {/* Catálogo de Mascotas en Lista Detallada con Paginación 10x10 */}
        <div class="settings-v2-section mt-6">
          <div class="flex items-center justify-between mb-2.5">
            <h3 class="settings-v2-section-title">{language.t("settings.pets.kind")}</h3>
            <span class="text-xs text-slate-400">Total: {allKinds().length} compañeros 3D interactivos</span>
          </div>

          <div class="w-full rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md overflow-hidden mb-3">
            {/* Thead */}
            <div class="grid grid-cols-[2fr_1.8fr_3.2fr_1.2fr_1.5fr] items-center px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">
              <div>Mascota</div>
              <div>Especie / Rol</div>
              <div>Habilidad & Personalidad</div>
              <div>Estado</div>
              <div class="text-right">Acción</div>
            </div>

            {/* Rows */}
            <div class="divide-y divide-white/[0.04]">
              <For each={pageKinds()}>
                {(kind) => {
                  const selected = () => settings.general.petKind() === kind
                  const trait = () => PET_TRAITS[kind] || { species: "Compañero 3D", trait: "Interactúa en tu editor" }

                  return (
                    <div
                      class="grid grid-cols-[2fr_1.8fr_3.2fr_1.2fr_1.5fr] items-center px-4 py-3 transition-colors hover:bg-white/[0.035]"
                      classList={{
                        "bg-sky-500/[0.08] border-l-2 border-sky-400": selected(),
                      }}
                    >
                      {/* 1. Mascota */}
                      <div class="flex items-center gap-3.5 min-w-0 pr-2">
                        <div
                          class="size-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md transition-all duration-300 hover:scale-110"
                          classList={{
                            "bg-gradient-to-br from-sky-500/20 to-sky-600/10 border-2 border-sky-400/60 shadow-sky-500/25 shadow-lg": selected(),
                            "bg-white/[0.05] border border-white/10 hover:border-white/20 hover:bg-white/[0.08]": !selected(),
                          }}
                        >
                          <Pet3DIcon kind={kind} size={44} />
                        </div>
                        <div class="flex flex-col min-w-0">
                          <span class="text-sm font-semibold text-slate-100 truncate">
                            {language.t(`settings.pets.kind.${kind}`)}
                          </span>
                          <span class="text-[10px] font-mono text-slate-400 truncate">
                            ID: {kind}
                          </span>
                        </div>
                      </div>

                      {/* 2. Especie / Rol */}
                      <div class="flex items-center pr-2">
                        <span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-slate-300">
                          {trait().species}
                        </span>
                      </div>

                      {/* 3. Habilidad & Personalidad */}
                      <div class="flex flex-col pr-3">
                        <span class="text-xs text-slate-300 leading-snug">
                          {trait().trait}
                        </span>
                        <span class="text-[10.5px] text-slate-500 mt-0.5 line-clamp-1">
                          {language.t(`settings.pets.kind.${kind}.description`)}
                        </span>
                      </div>

                      {/* 4. Estado */}
                      <div class="flex items-center">
                        <Show
                          when={selected()}
                          fallback={
                            <span class="text-[10.5px] text-slate-500 font-medium">
                              Disponible
                            </span>
                          }
                        >
                          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10.5px] font-semibold">
                            <span class="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Activa
                          </span>
                        </Show>
                      </div>

                      {/* 5. Acción */}
                      <div class="flex items-center justify-end">
                        <Show
                          when={!selected()}
                          fallback={
                            <span class="text-xs text-sky-400 font-semibold px-2">
                              ✓ En pantalla
                            </span>
                          }
                        >
                          <ButtonV2
                            type="button"
                            variant="outline"
                            size="small"
                            onClick={() => selectPet(kind)}
                          >
                            Seleccionar
                          </ButtonV2>
                        </Show>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>

          <Show when={totalPages() > 1}>
            <SettingsPagerV2
              page={page()}
              totalPages={totalPages()}
              onPage={setPage}
            />
          </Show>
        </div>
      </div>
    </>
  )
}

