import { Component, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import { Switch } from "@tiancode-ai/ui/switch"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

export type SkillItem = {
  name: string
  description: string
  path?: string
  scope: "project" | "global" | "builtin"
  enabled: boolean
  content?: string
}

export const SettingsSkillsV2: Component<{ directory?: string }> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const sync = useServerSync()

  const [query, setQuery] = createSignal("")
  const [filter, setFilter] = createSignal<"all" | "project" | "global" | "builtin">("all")
  const [selectedSkill, setSelectedSkill] = createSignal<SkillItem | null>(null)
  const [isCreating, setIsCreating] = createSignal(false)
  const [newName, setNewName] = createSignal("")
  const [newDesc, setNewDesc] = createSignal("")
  const [newContent, setNewContent] = createSignal("")
  const [newScope, setNewScope] = createSignal<"project" | "global">("project")
  const [saving, setSaving] = createSignal(false)

  const [skills, setSkills] = createSignal<SkillItem[]>([
    {
      name: "prime-agent-rlm",
      description: "Ejecución recursiva de sub-agentes en segundo plano con retorno tipado de variables.",
      scope: "builtin",
      enabled: true,
      content: "# Prime Agent RLM\nPermite delegar tareas complejas a sub-agentes hijos en contextos aislados.",
    },
    {
      name: "context-compact-variable",
      description: "Compactador y summarizador de logs de terminal y outputs de gran tamaño.",
      scope: "builtin",
      enabled: true,
      content: "# Context Compaction\nComprime automáticamente salidas masivas de CLI para no agotar la ventana de contexto.",
    },
    {
      name: "auto-test-verifier",
      description: "Ejecución de tests automáticos y corrección autónoma antes de finalizar turnos.",
      scope: "builtin",
      enabled: true,
      content: "# Test Verifier\nEjecuta suites de test locales y reintenta correcciones en caso de excepciones.",
    },
  ])

  const filteredSkills = createMemo(() => {
    const q = query().trim().toLowerCase()
    const f = filter()
    return skills().filter((s) => {
      const matchQuery = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      const matchFilter = f === "all" || s.scope === f
      return matchQuery && matchFilter
    })
  })

  const resetCreateForm = () => {
    setNewName("")
    setNewDesc("")
    setNewContent("")
    setIsCreating(false)
    setSelectedSkill(null)
  }

  const handleSaveNewSkill = async () => {
    const name = newName().trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-")
    const desc = newDesc().trim()
    const body = newContent().trim()

    if (!name || !desc) {
      showToast({ variant: "error", title: "Completa el nombre y la descripción de la habilidad" })
      return
    }

    setSaving(true)
    try {
      const formatted = "---\nname: " + name + "\ndescription: \"" + desc + "\"\n---\n\n# " + name + "\n" + body + "\n"
      const newSkill: SkillItem = {
        name,
        description: desc,
        scope: newScope(),
        enabled: true,
        content: formatted,
      }
      setSkills((prev) => [newSkill, ...prev])
      showToast({ variant: "success", title: `Habilidad creada exitosamente en ${newScope()}` })
      resetCreateForm()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="flex flex-col gap-6 p-6">
      <div class="flex flex-col gap-1">
        <h2 class="text-16-medium text-text-strong">Habilidades y Memoria Continua (Auto-Skills)</h2>
        <p class="text-13-regular text-text-weak">
          Gestiona las habilidades aprendidas por Tiancode, directivas especializadas y módulos de auto-evolución (Harness RLM estilo Prime Agent).
        </p>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2 flex-1 max-w-md">
          <TextInputV2
            type="text"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Buscar habilidades aprendidas..."
          />
        </div>
        <div class="flex items-center gap-2">
          <ButtonV2
            variant="contrast"
            onClick={() => {
              setSelectedSkill(null)
              setIsCreating(true)
            }}
          >
            + Nueva Habilidad
          </ButtonV2>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="flex flex-col gap-3">
          <For each={filteredSkills()}>
            {(skill) => (
              <div
                class={`p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedSkill()?.name === skill.name
                    ? "border-v2-border-focus bg-v2-overlay-simple-overlay-hover shadow-sm"
                    : "border-v2-border-base bg-v2-surface-elevation-1 hover:border-v2-border-hover"
                }`}
                onClick={() => {
                  setIsCreating(false)
                  setSelectedSkill(skill)
                }}
              >
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-13-medium text-text-strong font-mono">{skill.name}</span>
                    <span
                      class={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        skill.scope === "builtin"
                          ? "bg-purple-500/15 text-purple-400"
                          : skill.scope === "project"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {skill.scope}
                    </span>
                  </div>
                  <Switch
                    checked={skill.enabled}
                    onChange={(val) => {
                      setSkills((prev) =>
                        prev.map((s) => (s.name === skill.name ? { ...s, enabled: val } : s)),
                      )
                    }}
                    hideLabel
                  >
                    Activo
                  </Switch>
                </div>
                <p class="text-12-regular text-text-weak line-clamp-2">{skill.description}</p>
              </div>
            )}
          </For>
        </div>

        <div class="flex flex-col rounded-lg border border-v2-border-base bg-v2-surface-elevation-1 p-5">
          <Show
            when={isCreating()}
            fallback={
              <Show
                when={selectedSkill()}
                fallback={
                  <div class="flex flex-col items-center justify-center py-12 text-center text-text-weak">
                    <span class="text-3xl mb-2">🧠</span>
                    <p class="text-13-medium text-text-strong">Selecciona una habilidad para ver detalles</p>
                    <p class="text-12-regular text-text-weak mt-1">
                      O haz clic en '+ Nueva Habilidad' para registrar un nuevo flujo de trabajo aprendido.
                    </p>
                  </div>
                }
              >
                {(skill) => (
                  <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between border-b border-v2-border-base pb-3">
                      <div>
                        <h3 class="text-15-semibold text-text-strong font-mono">{skill().name}</h3>
                        <span class="text-11-regular text-text-weak">Ámbito: {skill().scope}</span>
                      </div>
                      <span
                        class={`text-xs px-2 py-0.5 rounded font-medium ${
                          skill().enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"
                        }`}
                      >
                        {skill().enabled ? "Activa" : "Desactivada"}
                      </span>
                    </div>

                    <div>
                      <span class="text-11-medium uppercase text-text-weak tracking-wider">Descripción / Disparador:</span>
                      <p class="text-13-regular text-text-strong mt-1 p-2 rounded bg-v2-overlay-simple-overlay-hover">
                        {skill().description}
                      </p>
                    </div>

                    <div>
                      <span class="text-11-medium uppercase text-text-weak tracking-wider">Instrucciones & Código:</span>
                      <pre class="text-12-regular font-mono text-text-base mt-1 p-3 rounded bg-v2-overlay-simple-overlay-active overflow-x-auto whitespace-pre-wrap max-h-72">
                        {skill().content || "Sin contenido adicional."}
                      </pre>
                    </div>
                  </div>
                )}
              </Show>
            }
          >
            <div class="flex flex-col gap-4">
              <div class="flex items-center justify-between border-b border-v2-border-base pb-3">
                <h3 class="text-14-medium text-text-strong">Crear Nueva Habilidad Aprendida</h3>
                <ButtonV2 variant="ghost" size="small" onClick={resetCreateForm}>
                  Cancelar
                </ButtonV2>
              </div>

              <SettingsListV2>
                <SettingsRowV2 title="Nombre de la Habilidad" description="Identificador en minúsculas. Ej: nextjs-optimizer">
                  <TextInputV2
                    type="text"
                    value={newName()}
                    onInput={(e) => setNewName(e.currentTarget.value)}
                    placeholder="ej: my-awesome-skill"
                  />
                </SettingsRowV2>

                <SettingsRowV2 title="Descripción y Criterio de Activación" description="Explica qué hace y cuándo debe activarse ('Use when...')">
                  <TextareaV2
                    value={newDesc()}
                    onInput={(e) => setNewDesc(e.currentTarget.value)}
                    placeholder="Use when building or optimizing..."
                    rows={2}
                  />
                </SettingsRowV2>

                <SettingsRowV2 title="Instrucciones Técnicas / Markdown" description="Pasos, reglas de arquitectura y snippets de código.">
                  <TextareaV2
                    value={newContent()}
                    onInput={(e) => setNewContent(e.currentTarget.value)}
                    placeholder={"# Pasos de ejecución\n1. Verificar dependencias..."}
                    rows={6}
                  />
                </SettingsRowV2>
              </SettingsListV2>

              <div class="flex justify-end gap-2 mt-2">
                <ButtonV2 variant="ghost" onClick={resetCreateForm}>
                  Cancelar
                </ButtonV2>
                <ButtonV2 variant="contrast" disabled={saving() || !newName().trim()} onClick={handleSaveNewSkill}>
                  Guardar Habilidad
                </ButtonV2>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
