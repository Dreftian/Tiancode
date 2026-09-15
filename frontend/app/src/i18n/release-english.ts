// English fallback for new controls until a reviewed locale translation is available.
import { SUBAGENT_CATALOG_ENGLISH } from "./subagent-catalog"

export const RELEASE_ENGLISH = {
  ...SUBAGENT_CATALOG_ENGLISH,
  "chat.mic.holdToRecord": "Hold to record",
  "chat.mic.preparing": "Preparing microphone…",
  "chat.mic.browserDevice": "Web dictation uses the microphone selected in your browser settings.",
  "composer.mode.title": "Mode",
  "composer.mode.auto": "Auto",
  "composer.mode.manual": "Manual",
  "composer.mode.accept-edits": "Accept edits",
  "composer.mode.plan": "Plan",
  "composer.mode.skip": "Skip permissions",
  "composer.mode.auto.description": "Use the configured permissions and ask when a rule requires approval.",
  "composer.mode.manual.description": "Ask before running tools, including file edits and commands.",
  "composer.mode.accept-edits.description": "Allow file reads and edits. Ask before commands and other actions.",
  "composer.mode.plan.description": "Explore and plan with read tools. File changes and commands are blocked.",
  "composer.mode.skip.description": "Approve requests automatically. Explicit denials remain in effect.",
  "composer.mode.failed": "Could not update the session's permission mode",
  "composer.mode.v2Unavailable": "This V2 server does not support session permission modes yet.",
  "settings.subAgents.list.loadFailed": "Could not load the subagent catalog. Retry the server connection.",
  "settings.subAgents.list.retry": "Retry",
  "composer.fast.label": "Fast",
  "composer.fast.enable": "Enable fast mode",
  "composer.fast.disable": "Disable fast mode",
  "composer.fast.description":
    "Requests Anthropic fast inference at the same reasoning effort. Requires fast-mode API access and costs more. Speed depends on availability.",
  "composer.fast.unavailable":
    "Available with every model: reduces preambles and repeated work, batches independent actions and preserves effort and validation. Speed depends on the model and provider.",
  "composer.ultracode.label": "Ultracode",
  "composer.ultracode.description":
    "Plans, implements and verifies complex tasks, using xhigh or the strongest supported effort. Tiancode workflow; provider capabilities still apply.",
  "liveView.activity.title": "Live activity",
  "liveView.activity.pending": "Pending",
  "liveView.activity.running": "Running",
  "liveView.activity.completed": "Completed",
  "liveView.activity.error": "Failed",
}
