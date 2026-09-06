# Security Suite — Fuentes, Licencias y Atribución (2026-09-06)

La suite de seguridad de Tiancode (skills `pentest-*`/`redteam-*`, agentes nativos `pentest` y `llm-redteam`, presets MCP `pentest-mcp`/`kali-mcp`) está adaptada de proyectos open-source. Todo el material adaptado conserva su licencia original (MIT o Apache-2.0); NO se copió material de proyectos AGPL-3.0 (NyxStrike) — su diseño servía solo como referencia.

## Fuentes y licencias

| Fuente | Proyecto / Repo | Licencia | Material usado |
|---|---|---|---|
| Skills de pentest | [usestrix/strix](https://github.com/usestrix/strix) (v1.6.2, © 2026) | Apache-2.0 | `strix/skills/` → skills `pentest-*` (recon, vulns, tecnologías, análisis, scan modes) — adaptados (removidas referencias al runtime strix) |
| Metodología de agente | [vxcontrol/pentagi](https://github.com/vxcontrol/pentagi) (© 2025) | MIT | `backend/pkg/templates/prompts/pentester.tmpl` (conocimiento de herramientas + protocolo CLI anti-alucinación + reglas msfconsole) → prompt del agente `pentest`; `examples/prompts/base_web_pentest.md` → skill `web-pentest-runbook`; `scope_of_work_pentest.md` → `pentest-engagement-scope` |
| Alcance / ROE | [NoorQureshi/SploitAgent](https://github.com/NoorQureshi/SploitAgent) (© 2026) | MIT (con párrafo de uso autorizado) | `skills/tradecraft/tradecraft-scope-roe/SKILL.md` → `pentest-scope-roe` |
| Red team de agentes LLM | [AISecurityLab/hackagent](https://github.com/AISecurityLab/hackagent) (© 2026, AI4I) | Apache-2.0 | JUECES de `attacks/evaluator/judge_evaluators.py`, attacks PAIR (`techniques/pair/config.py`), escalada `hack_chain` (`agent.py`), catálogo de riesgos (`risks/registry.py`), plantillas estáticas (`attacks/generator/templates.py`, `risks/prompt_injection/templates.py`) → agentes `llm-redteam` y skills `redteam-*` |
| Preset MCP | [DMontgomery40/pentest-mcp](https://github.com/DMontgomery40/pentest-mcp) | MIT | preset Discover `pentest-mcp` (`npx -y pentest-mcp`) |
| Preset MCP | [pabpereza/kali-mcp](https://github.com/pabpereza/kali-mcp) | MIT | preset Discover `kali-mcp` (remoto, `http://localhost:666/mcp`) |

## Notas

- Las skills `redteam-*` y el agente `llm-redteam` son **defensivos**: prueban exclusivamente agentes/sistemas propios del usuario o con permiso escrito explícito, nunca agentes de terceros.
- Los agentes de seguridad exigen alcance/autorización explícitos y nunca prueban fuera de alcance.
- Las notas legales de los proyectos originales ("autorized security work only") se mantienen; esta documentación se distribuye con el repositorio de Tiancode.
