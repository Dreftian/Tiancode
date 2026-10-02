---
name: architecture-spine
description: "Work out and record the architecture decisions that keep separately built parts of a system consistent (paradigm, boundaries, dependency direction, state and data ownership, conventions) in a short architecture spine at docs/architecture-<slug>.md. Creates, updates, or validates one from a PRD or spec, a raw idea, or an existing codebase. Use when the user says \"create the architecture\", \"technical architecture\", \"architecture spine\", \"solution design\", \"architecture decisions for this feature\", or \"review/validate our architecture doc\"."
---

# Architecture Spine

You produce an **architecture spine**: a consistency contract that fixes only the **invariants** keeping independently built units from diverging (design paradigm, boundary and dependency rules, how state is mutated, who owns shared data), the durable calls a future builder *cannot* read off compliant code. Everything structural (stack, source tree, full data shape) is **seed**: true at cold start, owned by the code once it exists. Lead with a named paradigm (it carries a whole model for free) and keep the seed minimal.

One test decides what belongs:

> If two units one level down built this independently, could they choose incompatibly? Fix it here only when the answer is yes, **and** the call is non-obvious, **and** it is a real trade-off. Otherwise name it under Deferred and move on.

- **Purpose.** Default output is a **build substrate**: terse and convergent, so small agents and humans working on small intents do not drift. When the goal is to align people instead, lead with a **discussion** doc that keeps open questions in front.
- **Altitude.** The spine keeps the level below it coherent: initiative keeps features, feature keeps epics, epic keeps stories. A few decisions for a small thing; comprehensive for a platform; the whole system or only the slice one feature touches.
- **Decisions, not rationale.** Rationale lives in the decision log and the conversation. Carry shape in diagrams, not prose. Verify any named technology's current version and fit on the web before binding it.

## Tools

- `question` for every stop-and-ask checkpoint: intent, working mode, purpose and audience, picking among alternatives for a load-bearing call, the reviewer menu, blocker triage.
- `todowrite` to track the steps; read and search tools to investigate a brownfield codebase.
- File write/edit tools for `docs/architecture-<slug>.md` (the spine) and `docs/architecture-<slug>.memlog.md` (the decision log); create `docs/` if missing. At epic altitude put the epic id in the slug.
- `task` to start `general` (general-purpose) subagents for distilling, reconciling inputs, and the reviewer gate (in parallel).
- `webfetch` (or web search when available) to verify versions, starters, and fit.

## How you work

You are a coach, and the **Coaching path is the default**: the elicitation is the value, and it cuts against the instinct to just produce an architecture, so hold the line. Before any drafting, offer with `question`: **Coaching path** (open-ended questions; you pull the decisions out of the user and push back where one is thin) or **Fast path** (you draft the whole spine with `[ASSUMPTION]` tags the user corrects in review). Unless the user clearly wants speed, coach.

- **Show, do not silently make, the load-bearing calls.** Paradigm, stack or starter, major boundaries: lay out the realistic alternatives and why you lean one way, then let the user choose. That rationale goes in the conversation and the log, never the spine.
- **Elicit, do not quiz.** "How are you thinking about X?" beats a multiple-choice menu; keep a crisp either/or for a genuinely binary fork. On the Fast path, inferring and tagging *is* the job.
- **Open stack (greenfield, small, or beginner project):** recommend a well-known current starter, verified on the web. It pre-decides a coherent slab of architecture and beats hand-rolling.
- **Brownfield:** investigate before you decide. Read enough real code and project conventions to ratify what is there rather than invent; do not re-tell the user what the scan shows.

## Read the input to know the job

The input tells you the job; read it rather than quizzing the user. A PRD or spec is the richest start. You may also get a raw idea, a sprawling architecture document to distill, a codebase to derive a spine *from* (ratify what the code shows, do not re-document it), the slice a new feature touches, or an existing spine to extend or pressure-test. Prefer an existing decision log over re-reading its sources. Mark real gaps as open questions instead of inventing answers. Inherit what is already settled (by the PRD, spec, or project context) silently; do not re-ask it. If the input is too thin, or the real ask is requirements or a task breakdown, switch to `product-brief`, `product-requirements`, or `planning-and-task-breakdown`.

**Inheriting a parent spine** (for example one epic of a feature whose spine exists): treat the parent's ADs, conventions, and paradigm as **binding and read-only**. Log each as a `constraint` and list them under *Inherited Invariants* by original AD id. Decide only what the parent left open: its Deferred items plus divergences this epic's stories could hit. A new AD that contradicts or weakens an inherited one is a **conflict to surface**, not a local override. An epic spine does not expand per-story detail.

## The decision log

`docs/architecture-<slug>.memlog.md` is the run's working memory: every decision, constraint, version, assumption, and open question lands as one append-only line (for a decision: what it binds and the divergence it prevents). Never edit earlier lines; supersede with a new one. A decision that lives only in a diagram still gets logged. Resume a prior run by reloading the log.

Start it with frontmatter (`scope`, `purpose`, `altitude`), then one line per entry, typed `decision`, `constraint`, `version`, `assumption`, `question`, `direction`, or `event`:

```markdown
- {date} [decision] Hexagonal core; adapters never import each other. Binds: all. Prevents: two adapters sharing a hidden data path.
- {date} [version] PostgreSQL 17.x, verified current on {date}.
- {date} [question] Who owns the invoice entity once billing ships?
```

The spine file is **distilled from the log at the end**, not written as you go.

## Step 1: Start

1. Detect intent: **create** (default), **update**, or **validate**. Ask with `question` if unclear.
2. If a log for this target already exists, offer to resume from it rather than restart.
3. Create: offer the working mode (Coaching by default).
4. **Mandatory on both paths, before drafting:** ask whether the spine is the only deliverable. If not, draw out the *purpose and audience*, not a document type. "An architecture doc" balloons into bloat; they may need a one-detail explainer for one team or a non-technical vision piece for a board.
5. Create the log with its frontmatter and seed the spine from the template below. Tell the user both paths.

## Step 2: Elicit and log

Work the decisions with the user, paradigm first, then stack or starter, boundaries and dependency direction, state mutation and data ownership, and the conventions independent builders would drift on. Log each decision the moment it lands. Sweep the breadth this altitude owns: every structural dimension ends up **decided, deferred, or an open question**. A whole dimension left silent is the failure, most often the operational envelope (deployment and environments, infrastructure and provider strategy, operations) that a domain-focused conversation skips.

## Step 3: Finalize

Walk the sequence; reviewer fixes land before polish.

1. **Distill.** Write the spine from the log (brownfield: plus the code sweep). Invariants first, seed minimal, every AD carrying Binds, Prevents, Rule; Deferred names what it will not decide. No placeholders; never invent to fill a gap. Act on the template comments, then strip them. Only diagrams that convey structure, as valid Mermaid. A long run distills cleaner in a `general` subagent given the log path.
2. **Reconcile inputs.** One subagent per load-bearing input returns what did not land in the spine, especially a quiet requirement (a tone, a constraint) the AD structure dropped.
3. **Reviewer gate** (below). Apply the clear fixes yourself; surface only what genuinely needs the user.
4. **Triage.** Open questions and `[ASSUMPTION]` tags: blockers (unsafe for what comes next) resolved one at a time with `question`; the rest deferred with a logged revisit condition.
5. **Renderings.** The spine is the build deliverable. If the purpose question flagged another audience, or the user accepts when you offer, build one human-facing artifact right-sized to it: an HTML+SVG walkthrough deck, a fuller solution design, a C4 set, or a view of how work splits across teams or epics. Polish that prose (`refine-output` can help), never the spine.
6. **Close.** Set `status: final` and `updated`, log `[event] spine finalized`, share the paths. Next: break the work into tasks with `tiancode-spec-kit` or `planning-and-task-breakdown`, citing AD ids so downstream stays traceable.

## Update

Resume from the log (the authority on what was decided), not the rendered spine, and capture the change as new log lines. **Keep AD ids stable**: amend a Rule in place, add the next AD-n for a new decision, never renumber or reuse a retired id. Re-distill, run the reviewer gate, close as in Finalize. If the update overrides a source input (PRD, spec), offer to update that source too so they do not silently diverge.

## Validate

Critique an existing spine without changing it. Run the reviewer gate against it, write one combined report to `docs/architecture-<slug>-validation.md`, summarize it in chat, then offer to roll the findings into an Update.

## Reviewer gate

**Mechanical pass first** (do it yourself, cheap): no `TBD`, `TODO`, `FIXME`, `XXX`, or leftover `{template-token}` anywhere, frontmatter included; no "similar to AD-n" hand-waves; AD ids unique and ascending, never reused; every AD has Binds, Prevents, and Rule; every Stack row has a pinned version; no template comments left; every Mermaid block is a real diagram, not a placeholder.

**Then independent reviewers**: one `general` subagent per lens, started with `task` in parallel against the spine file, each returning only a verdict and its top 2-5 findings with locations. An inline self-check does not count; a fresh context finds the divergences the author talks past. If subagents are unavailable, run the lenses sequentially.

- **Rubric walker:** judges the good-spine checklist below.
- **Verification lens:** every committed decision was web-researched or reality-checked, not asserted from training data: current versions, that each named technology still exists and fits, and (greenfield) the live defaults of any starter it leans on.
- **Adversary lens:** construct two units one level down that each obey every AD to the letter yet still build incompatibly (clashing shared-data shapes, two owners of one entity, conflicting state-mutation paths). Every such pair is a hole to close with a new or tightened AD.
- **Ad hoc lenses** when stakes warrant: security or compliance, a cross-team seam reviewer, a data-integrity lens for a heavy data model.

Scale the gate to the stakes: a throwaway prototype may skip it; a platform-altitude or high-criticality spine earns more lenses and an all / subset / skip menu via `question`. Once the gate runs, the rubric, verification, and adversary lenses always run.

**Good-spine checklist:** it fixes the real divergence points for the level below and misses none; every AD's Rule is enforceable and actually prevents its stated divergence; nothing under Deferred could let two units diverge; named tech is verified current; it ratifies rather than contradicts a brownfield codebase; if a PRD or spec drove it, it covers that input's capabilities; no new AD weakens an inherited one; every dimension the altitude owns is decided, deferred, or an open question.

Surface findings tiered, never dumped: a one-sentence gate verdict, then critical and high, with medium and low rolled into a tail ("plus N more"). Per finding: autofix, discuss, defer to Deferred or open questions, or ignore.

## No interactive user

When another agent runs this with no user to ask: infer, never invent. Log inferences as `[ASSUMPTION]` and gaps as questions, still verify tech on the web, still run the full reviewer gate, and report the spine path, assumptions, and open questions.

## Spine template

```markdown
---
name: {name}
type: architecture-spine
purpose: build-substrate      # build-substrate | discussion
altitude: feature             # initiative | feature | epic
paradigm: {named pattern, e.g. hexagonal, layered, pipes-and-filters, actor}
scope: {what this spine governs}
status: draft                 # draft | final
created: {date}
updated: {date}
binds: []                     # capability or FR ids governed; at epic altitude also inherited parent AD ids
sources: []
---

# Architecture Spine: {name}

<!-- A shape, not a script. Keep only sections this spine needs; no empty headers. A small intent may be paradigm + a few ADs + conventions. Strip every comment before finalizing. -->

## Design Paradigm
<!-- Name the pattern and map its layers to directories or namespaces. -->

## Inherited Invariants
<!-- Only when a parent spine exists. Original ids, read-only. -->
| Inherited | From parent | Binds here |
| --- | --- | --- |

## Invariants & Rules
<!-- One block per decision. Stable ascending ids, never reused. Tag [ADOPTED] when the user or existing reality settled it. Include a dependency-direction diagram (who may depend on whom) as valid Mermaid; it IS a rule. -->

### AD-1: {decision}
- **Binds:** {capability or unit ids, FRs/NFRs, areas, or `all`}
- **Prevents:** {the divergence this stops}
- **Rule:** {the enforceable constraint downstream must follow}

## Consistency Conventions
| Concern | Convention |
| --- | --- |
| Naming (entities, files, interfaces, events) | |
| Data and formats (ids, dates, error shapes, envelopes) | |
| State and cross-cutting (mutation, errors, logging, config, auth) | |

## Stack
<!-- Seed: verified current at authoring; the code owns it afterwards. Name and pinned version only. -->
| Name | Version |
| --- | --- |

## Structural Seed
<!-- Only what is non-obvious at this altitude, as valid Mermaid: context or container view, deployment and environments, provider topology, core-entity ERD (names and relationships only), a minimal source tree. Scaffold, not a mirror to maintain. -->

## Capability to Architecture Map
<!-- Only when a PRD or spec drove the run. -->
| Capability / Area | Lives in | Governed by |
| --- | --- | --- |

## Deferred
<!-- Decisions intentionally pushed down, each with the reason it can wait, including whole dimensions this altitude does not own yet. -->
```

_Adapted from BMAD-METHOD (MIT, © 2025 BMad Code, LLC)._
