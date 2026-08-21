import { type Component } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { AstCodeGraphVisualizer } from "@/components/ast-codegraph-visualizer"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const sandboxOptions: ("host" | "docker" | "e2b")[] = ["host", "docker", "e2b"]

export const SettingsIntelligenceV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">
            {language.t("settings.intelligence.title") || "Intelligence & Memory"}
          </h2>
        </div>
        <p class="settings-v2-tab-description">
          {language.t("settings.intelligence.description") ||
            "Configura la memoria a largo plazo (LTM), extracción web inteligente, análisis de grafos y seguridad de ejecución."}
        </p>
      </div>

      <div class="settings-v2-tab-body">
        {/* Section 1: Long-Term Memory */}
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">
            🧠 {language.t("settings.intelligence.section.memory") || "Long-Term Memory (LTM)"}
          </h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.userMemory") || "Memoria de Usuario (USER.md)"}
              description={
                language.t("settings.intelligence.userMemory.desc") ||
                "Recuerda preferencias globales de programación, estilo e idioma a través de todos tus proyectos."
              }
            >
              <Switch
                checked={settings.intelligence.userMemory()}
                onChange={(checked) => settings.intelligence.setUserMemory(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.projectMemory") || "Memoria del Proyecto (MEMORY.md)"}
              description={
                language.t("settings.intelligence.projectMemory.desc") ||
                "Guarda la arquitectura técnica, puertos de red y particularidades de build de este repositorio."
              }
            >
              <Switch
                checked={settings.intelligence.projectMemory()}
                onChange={(checked) => settings.intelligence.setProjectMemory(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.autoSkill") || "Auto-Destilación de Habilidades (/learn)"}
              description={
                language.t("settings.intelligence.autoSkill.desc") ||
                "Sugiere empaquetar flujos complejos exitosos en archivos SKILL.md reutilizables automáticamente."
              }
            >
              <Switch
                checked={settings.intelligence.autoSkillLearn()}
                onChange={(checked) => settings.intelligence.setAutoSkillLearn(checked)}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        {/* Section 2: Code Graph & AST */}
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">
            🔍 {language.t("settings.intelligence.section.codegraph") || "Code Graph & AST"}
          </h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.codeGraph") || "Análisis de Grafo de Código (CodeGraph)"}
              description={
                language.t("settings.intelligence.codeGraph.desc") ||
                "Indexa funciones, clases y dependencias para razonar sobre impactos arquitectónicos antes de editar."
              }
            >
              <Switch
                checked={settings.intelligence.codeGraph()}
                onChange={(checked) => settings.intelligence.setCodeGraph(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.monaco") || "Visor de Diffs Monaco"}
              description={
                language.t("settings.intelligence.monaco.desc") ||
                "Muestra comparaciones visuales lado a lado con resaltado de sintaxis antes de aplicar parches."
              }
            >
              <Switch
                checked={settings.intelligence.monacoDiffs()}
                onChange={(checked) => settings.intelligence.setMonacoDiffs(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title="Compresión Inteligente de Tokens RLM (Auto-Pruning)"
              description="Resume automáticamente salidas gigantescas de terminal y logs para no agotar la ventana de contexto."
            >
              <Switch
                checked={true}
                onChange={() => undefined}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title="Presupuesto de Pensamiento (Thinking Budget)"
              description="Límite máximo de tokens asignados al razonamiento profundo para DeepSeek-R1 y Claude 3.7 Thinking."
            >
              <SelectV2
                appearance="inline"
                options={["4096", "8192", "16384", "32768", "64000"]}
                current="16384"
                placement="bottom-end"
                gutter={6}
                label={(opt) => `${Number(opt).toLocaleString()} tokens`}
                onSelect={() => undefined}
              />
            </SettingsRowV2>
          </SettingsListV2>

          <div class="mt-4">
            <AstCodeGraphVisualizer />
          </div>
        </div>

        {/* Section 3: Web & Execution Safety */}
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">
            🛡️ {language.t("settings.intelligence.section.safety") || "Web & Execution Safety"}
          </h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.cleanWeb") || "Extracción Web Limpia (Firecrawl Engine)"}
              description={
                language.t("settings.intelligence.cleanWeb.desc") ||
                "Descarta scripts, cookies y menús para convertir páginas web en Markdown puro optimizado para LLMs."
              }
            >
              <Switch
                checked={settings.intelligence.cleanWebScraping()}
                onChange={(checked) => settings.intelligence.setCleanWebScraping(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.guardrails") || "Pipeline de Guardrails y Redacción de Secretos"}
              description={
                language.t("settings.intelligence.guardrails.desc") ||
                "Enmascara contraseñas, tokens y claves privadas antes de enviar consultas a proveedores externos."
              }
            >
              <Switch
                checked={settings.intelligence.guardrails()}
                onChange={(checked) => settings.intelligence.setGuardrails(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.sandbox") || "Modo de Ejecución Sandbox"}
              description={
                language.t("settings.intelligence.sandbox.desc") ||
                "Selecciona si los comandos de terminal se ejecutan en el sistema anfitrión o en un contenedor aislado."
              }
            >
              <SelectV2
                appearance="inline"
                options={sandboxOptions}
                current={settings.intelligence.sandboxExecution()}
                placement="bottom-end"
                gutter={6}
                label={(opt) =>
                  opt === "host"
                    ? "Sistema Anfitrión (Host)"
                    : opt === "docker"
                      ? "Contenedor Docker Local"
                      : "Micro-VM Aislada E2B"
                }
                onSelect={(opt) => opt && settings.intelligence.setSandboxExecution(opt)}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
