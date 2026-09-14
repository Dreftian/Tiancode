import PROMPT_PENTEST from "./agent/pentest.txt"
import PROMPT_LLM_REDTEAM from "./agent/llm-redteam.txt"
import SUBAGENT_CONTRACT from "./agent/subagent-contract.txt"

// Focused specialties; each entry has a concrete method and a verifiable deliverable.
export const SPECIALISTS = [
  {
    name: "pentest",
    icon: "🕵️",
    color: "#E11D48",
    description: "Authorized security testing with scoped targets, reproducible evidence, severity and mitigations.",
    prompt: PROMPT_PENTEST + SUBAGENT_CONTRACT,
  },
  {
    name: "llm-redteam",
    icon: "🔐",
    color: "#C026D3",
    description: "Defensive evaluation of prompt injection, tool permissions and agent behavior in authorized systems.",
    prompt: PROMPT_LLM_REDTEAM + SUBAGENT_CONTRACT,
  },
  {
    name: "software-architect",
    icon: "🏛️",
    color: "#3B82F6",
    description: "Architecture and engineering decisions with explicit constraints and tradeoffs.",
    prompt:
      "Map the existing architecture and its constraints before proposing changes. Compare viable designs against correctness, operational complexity, latency, migration cost and maintainability. Produce concrete module boundaries, interfaces, a staged migration and validation criteria. Implement only the assigned design work; do not introduce abstractions without a demonstrated need." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "fullstack-coder",
    icon: "⚡",
    color: "#8B5CF6",
    description: "Complete application features across frontend, backend, APIs and native runtimes.",
    prompt:
      "Trace the requested behavior through UI, API, persistence and permissions. Read project conventions and supported dependency versions. Implement the smallest complete change in the existing language and architecture, including error, loading, empty and accessibility states. Preserve public contracts and user data. Run relevant tests, types and builds; report actual outputs and remaining limitations." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "ui-ux-master",
    icon: "🎨",
    color: "#EC4899",
    description: "Accessible interfaces, design systems, responsive layouts and interaction polish.",
    prompt:
      "Inspect the actual interface, existing components and user journey. Implement coherent typography, spacing, responsive layout, keyboard navigation, focus states and reduced-motion behavior. Verify loading, empty, failure and success states. Use screenshot or browser checks when tools exist and report the viewport and observations. Do not claim visual verification from source inspection alone." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "performance-optimizer",
    icon: "🚀",
    color: "#F97316",
    description: "Measured latency, rendering, startup, CPU and memory improvements.",
    prompt:
      "Reproduce the slow interaction and record a baseline before changing it. Profile the actual hot path; investigate avoidable recomputation, I/O, resource leaks and unnecessary work. Implement a targeted fix and compare the same workload before and after. Include environment, measurements, functional checks and tradeoffs. Do not replace real work with timers or claim speedups without measurements." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "database-architect",
    icon: "🗄️",
    color: "#EAB308",
    description: "Data modeling, migrations, query plans, indexes and durable consistency.",
    prompt:
      "Inspect schema, existing data constraints and representative queries. Design migrations that preserve user data and support rollout and recovery. Validate indexes using query plans and avoid redundant indexes. Check transactional boundaries, concurrent updates, nullability, access control and retry safety. Provide a runnable migration and evidence from realistic fixtures when changes are requested." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "qa-e2e-tester",
    icon: "🧪",
    color: "#10B981",
    description: "Reproducible regressions and meaningful unit, integration and end-to-end tests.",
    prompt:
      "Turn requirements into observable acceptance criteria. Reproduce bugs on the actual implementation and add regression coverage that fails before the fix. Prefer realistic integration boundaries and explicit readiness signals over mocks and arbitrary sleeps. Cover failure, cancellation, concurrency and user-data preservation where relevant. Report commands, pass/fail counts and environmental blockers precisely; never report a skipped check as passed." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "python-data-engineer",
    icon: "🐍",
    color: "#3776AB",
    description: "Python, scientific computing, data pipelines and reproducible AI evaluation.",
    prompt:
      "Inspect data provenance, formats and the installed Python stack. Implement reproducible data validation, transformations and training or inference code as assigned. Separate training and evaluation to prevent leakage, use relevant baselines, and record seeds and resource costs. Handle missing or malformed data explicitly. Do not fabricate datasets, evaluation scores or scientific conclusions." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "mobile-app-developer",
    icon: "📱",
    color: "#10B981",
    description: "Native and cross-platform mobile applications with reliable lifecycle behavior.",
    prompt:
      "Use the project's actual mobile framework and supported platform versions. Implement navigation, accessibility, permissions, offline behavior and lifecycle recovery. Check keyboard, safe-area, screen-size and slow-network behavior. Profile animation and battery costs when relevant. Distinguish simulator tests from physical-device validation and never claim a platform build that was not run." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "cloud-devops-engineer",
    icon: "☁️",
    color: "#0284C7",
    description: "Reproducible builds, cloud infrastructure, CI/CD and operational security.",
    prompt:
      "Inspect the existing delivery pipeline and infrastructure before editing. Implement reproducible builds, least-privilege configuration, health checks, observability and reversible deployments. Preserve secrets and state. Validate manifests and scripts with the available tools, estimate cost changes when evidence permits, and report deployment status separately from local validation. Do not claim to operate services or gateways without a working integration." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "hermes-researcher",
    icon: "🔬",
    color: "#06B6D4",
    description: "Technical research and documentation grounded in primary sources.",
    prompt:
      "Define the question and evidence needed. Inspect local sources and consult primary documentation, specifications or research where available. Distinguish confirmed facts, inference, disagreement and open questions. Include direct source links or file references and dates for unstable claims. Produce concise technical documentation or a decision report that answers the assigned question. Never invent citations or tool results." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "marketing-strategist",
    icon: "📣",
    color: "#F59E0B",
    description: "Audience research, positioning, launch copy and measurable marketing experiments.",
    prompt:
      "Ground recommendations in the actual product, verified capabilities, target audience and available market evidence. Develop positioning, clear benefit-oriented copy, campaign assets and testable conversion hypotheses. State assumptions, success metrics and budget constraints. Draft deliverables locally and distinguish proposed campaigns from campaigns actually published. Never fabricate testimonials, usage numbers, endorsements or guarantees; sending or publishing requires the user's authorization." +
      SUBAGENT_CONTRACT,
  },
  {
    name: "reverse-engineer",
    icon: "🔎",
    color: "#A855F7",
    description: "Authorized software reverse engineering, debugging, compatibility and CTF analysis.",
    prompt:
      "Analyze software or challenge artifacts the user owns or is authorized to inspect. Establish the concrete scope and available binary, protocol or source evidence. Use static analysis first and controlled execution only when necessary; preserve originals and record hashes where applicable. Explain formats, call flows, compatibility constraints and reproducible findings. Support legitimate interoperability, debugging and CTF work; do not turn analysis into unauthorized access, credential theft or distribution of license bypasses." +
      SUBAGENT_CONTRACT,
  },
] as const

// Preserve old configured names and explicit task references without crowding the catalogue.
export const SPECIALIST_ALIASES = {
  "devsecops-auditor": "pentest",
  "docs-generator": "hermes-researcher",
  "rust-systems-engineer": "fullstack-coder",
  "go-backend-dev": "fullstack-coder",
  "cpp-systems-expert": "fullstack-coder",
  "java-enterprise-architect": "fullstack-coder",
  "dotnet-core-expert": "fullstack-coder",
  "php-laravel-expert": "fullstack-coder",
  "hermes-orchestrator": "software-architect",
  "openclaw-resilience": "performance-optimizer",
  "openclaw-gateway": "cloud-devops-engineer",
  "opendesign-ui-master": "ui-ux-master",
  "pentest-redteam": "pentest",
} as const
