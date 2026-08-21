// Built-in engineering workflow skills bundled from https://github.com/addyosmani/agent-skills
// (MIT, (c) 2025 Addy Osmani). See LICENSE-ADDYOSMANI.md.
// Each document is a SKILL.md-style file; frontmatter provides name/description.
import api_and_interface_design from "../../../../../skills/api-and-interface-design.md" with { type: "text" }
import browser_testing_with_devtools from "../../../../../skills/browser-testing-with-devtools.md" with { type: "text" }
import ci_cd_and_automation from "../../../../../skills/ci-cd-and-automation.md" with { type: "text" }
import code_review_and_quality from "../../../../../skills/code-review-and-quality.md" with { type: "text" }
import code_simplification from "../../../../../skills/code-simplification.md" with { type: "text" }
import context_engineering from "../../../../../skills/context-engineering.md" with { type: "text" }
import debugging_and_error_recovery from "../../../../../skills/debugging-and-error-recovery.md" with { type: "text" }
import deprecation_and_migration from "../../../../../skills/deprecation-and-migration.md" with { type: "text" }
import documentation_and_adrs from "../../../../../skills/documentation-and-adrs.md" with { type: "text" }
import doubt_driven_development from "../../../../../skills/doubt-driven-development.md" with { type: "text" }
import frontend_ui_engineering from "../../../../../skills/frontend-ui-engineering.md" with { type: "text" }
import git_workflow_and_versioning from "../../../../../skills/git-workflow-and-versioning.md" with { type: "text" }
import idea_refine from "../../../../../skills/idea-refine.md" with { type: "text" }
import incremental_implementation from "../../../../../skills/incremental-implementation.md" with { type: "text" }
import interview_me from "../../../../../skills/interview-me.md" with { type: "text" }
import observability_and_instrumentation from "../../../../../skills/observability-and-instrumentation.md" with { type: "text" }
import performance_optimization from "../../../../../skills/performance-optimization.md" with { type: "text" }
import planning_and_task_breakdown from "../../../../../skills/planning-and-task-breakdown.md" with { type: "text" }
import security_and_hardening from "../../../../../skills/security-and-hardening.md" with { type: "text" }
import shipping_and_launch from "../../../../../skills/shipping-and-launch.md" with { type: "text" }
import source_driven_development from "../../../../../skills/source-driven-development.md" with { type: "text" }
import spec_driven_development from "../../../../../skills/spec-driven-development.md" with { type: "text" }
import test_driven_development from "../../../../../skills/test-driven-development.md" with { type: "text" }
import using_agent_skills from "../../../../../skills/using-agent-skills.md" with { type: "text" }
import accessibility from "../../../../../skills/accessibility.md" with { type: "text" }
import codebase_design from "../../../../../skills/codebase-design.md" with { type: "text" }
import core_web_vitals from "../../../../../skills/core-web-vitals.md" with { type: "text" }
import deploy_checklist from "../../../../../skills/deploy-checklist.md" with { type: "text" }
import dispatching_parallel_agents from "../../../../../skills/dispatching-parallel-agents.md" with { type: "text" }
import doc_coauthoring from "../../../../../skills/doc-coauthoring.md" with { type: "text" }
import domain_modeling from "../../../../../skills/domain-modeling.md" with { type: "text" }
import finishing_a_development_branch from "../../../../../skills/finishing-a-development-branch.md" with { type: "text" }
import frontend_design from "../../../../../skills/frontend-design.md" with { type: "text" }
import grill_me from "../../../../../skills/grill-me.md" with { type: "text" }
import grill_with_docs from "../../../../../skills/grill-with-docs.md" with { type: "text" }
import handoff from "../../../../../skills/handoff.md" with { type: "text" }
import improve_codebase_architecture from "../../../../../skills/improve-codebase-architecture.md" with { type: "text" }
import incident_response from "../../../../../skills/incident-response.md" with { type: "text" }
import requesting_code_review from "../../../../../skills/requesting-code-review.md" with { type: "text" }
import research from "../../../../../skills/research.md" with { type: "text" }
import resolving_merge_conflicts from "../../../../../skills/resolving-merge-conflicts.md" with { type: "text" }
import skill_creator from "../../../../../skills/skill-creator.md" with { type: "text" }
import sql_queries from "../../../../../skills/sql-queries.md" with { type: "text" }
import system_design from "../../../../../skills/system-design.md" with { type: "text" }
import tech_debt from "../../../../../skills/tech-debt.md" with { type: "text" }
import testing_strategy from "../../../../../skills/testing-strategy.md" with { type: "text" }
import tiancode_spec_kit from "../../../../../skills/tiancode-spec-kit.md" with { type: "text" }
import to_spec from "../../../../../skills/to-spec.md" with { type: "text" }
import using_git_worktrees from "../../../../../skills/using-git-worktrees.md" with { type: "text" }
import verification_before_completion from "../../../../../skills/verification-before-completion.md" with { type: "text" }
import wait_what from "../../../../../skills/wait-what.md" with { type: "text" }
import web_quality_audit from "../../../../../skills/web-quality-audit.md" with { type: "text" }
import writing_plans from "../../../../../skills/writing-plans.md" with { type: "text" }

export const builtinAgentSkills: Record<string, string> = {
  "api-and-interface-design": api_and_interface_design,
  "browser-testing-with-devtools": browser_testing_with_devtools,
  "ci-cd-and-automation": ci_cd_and_automation,
  "code-review-and-quality": code_review_and_quality,
  "code-simplification": code_simplification,
  "context-engineering": context_engineering,
  "debugging-and-error-recovery": debugging_and_error_recovery,
  "deprecation-and-migration": deprecation_and_migration,
  "documentation-and-adrs": documentation_and_adrs,
  "doubt-driven-development": doubt_driven_development,
  "frontend-ui-engineering": frontend_ui_engineering,
  "git-workflow-and-versioning": git_workflow_and_versioning,
  "idea-refine": idea_refine,
  "incremental-implementation": incremental_implementation,
  "interview-me": interview_me,
  "observability-and-instrumentation": observability_and_instrumentation,
  "performance-optimization": performance_optimization,
  "planning-and-task-breakdown": planning_and_task_breakdown,
  "security-and-hardening": security_and_hardening,
  "shipping-and-launch": shipping_and_launch,
  "source-driven-development": source_driven_development,
  "spec-driven-development": spec_driven_development,
  "test-driven-development": test_driven_development,
  "using-agent-skills": using_agent_skills,
  "accessibility": accessibility,
  "codebase-design": codebase_design,
  "core-web-vitals": core_web_vitals,
  "deploy-checklist": deploy_checklist,
  "dispatching-parallel-agents": dispatching_parallel_agents,
  "doc-coauthoring": doc_coauthoring,
  "domain-modeling": domain_modeling,
  "finishing-a-development-branch": finishing_a_development_branch,
  "frontend-design": frontend_design,
  "grill-me": grill_me,
  "grill-with-docs": grill_with_docs,
  "handoff": handoff,
  "improve-codebase-architecture": improve_codebase_architecture,
  "incident-response": incident_response,
  "requesting-code-review": requesting_code_review,
  "research": research,
  "resolving-merge-conflicts": resolving_merge_conflicts,
  "skill-creator": skill_creator,
  "sql-queries": sql_queries,
  "system-design": system_design,
  "tech-debt": tech_debt,
  "testing-strategy": testing_strategy,
  "tiancode-spec-kit": tiancode_spec_kit,
  "to-spec": to_spec,
  "using-git-worktrees": using_git_worktrees,
  "verification-before-completion": verification_before_completion,
  "wait-what": wait_what,
  "web-quality-audit": web_quality_audit,
  "writing-plans": writing_plans,
}
