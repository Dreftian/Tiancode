---
name: refine-output
description: "Pressure-tests and improves the most recent output (a draft, plan, section, design or decision) by running elicitation methods the user picks, such as pre-mortem, first principles, red team, Socratic questioning or inversion. Use when the user says \"refine this\", \"push harder\", \"critique this\", \"go deeper\", \"stress-test this\", or names a critique method; other skills can call it at a checkpoint."
---

# Refine Output

## Overview

The target is the most recent output in the conversation (a section, plan, draft, design or decision) unless the user or a calling skill points elsewhere. Offer a short menu of elicitation methods, run the chosen ones against the target, and hand back the improved version. If another skill invoked this one, its flow resumes exactly where it paused. Work in the user's language.

## The Menu

1. Fix the target and say what it is.
2. Pick the 2-4 categories from the catalog below that fit it: risk before a launch, technical for code, collaboration when stakeholders compete, creative when the content is flat. From those, hand-pick **five methods that attack the target from different angles**.
3. Offer them with the `question` tool (`multiple: true`): one option per method (label = method name, description = its one-line how-to), plus **Reshuffle**, **List all** and **Proceed**. If `persona-roundtable` is active in the session, say "The roundtable is active: personas will join in."

Handle the answer:

- **Methods picked:** run them (several: in sequence), then offer the menu again.
- **Reshuffle:** offer five new methods spread across different categories, excluding everything already offered.
- **List all:** show the full catalog table; a pick by name or number runs like a method choice.
- **Proceed:** done. The current enhanced version is final: hand it back as the replacement for the original (to the calling skill, if any). If anything shown was never accepted, confirm what carries over first.
- **Anything else** is direction: apply it to the target and offer the menu again.

## Running a Method

Use the method's how-to as its intent. Scale depth to the target: a paragraph gets a light pass, an architecture decision the full treatment. Each method works on the current enhanced version, so refinements compound.

Show what the method revealed and the concrete changes it proposes, then ask with `question`: **Apply** or **Reject** (free text is further direction). Never change the work unless the user accepts. On reject, drop the proposal entirely.

Methods that cast personas (round tables, panels, debates): reuse the roundtable personas if `persona-roundtable` is active; otherwise draw on its roles (Analyst, Product Manager, Architect, UX Designer, Developer, QA), or invent named viewpoints that suit the content.

## Method Catalog

| # | Method | Category | How |
|---|---|---|---|
| 1 | Tree of Thoughts | advanced | Explore several reasoning paths at once, evaluate them, keep the best |
| 2 | Graph of Thoughts | advanced | Map ideas as a network to expose hidden links and emergent patterns |
| 3 | Thread of Thought | advanced | Keep one coherent reasoning thread across a long context |
| 4 | Self-Consistency Validation | advanced | Solve it several independent ways; trust what agrees |
| 5 | Meta-Prompting Analysis | advanced | Step back and critique the approach itself, then optimize it |
| 6 | Reasoning via Planning | advanced | Model the world and the goal state, then plan a path between them |
| 7 | Chain-of-Thought Scaffolding | advanced | Force explicit intermediate steps before any conclusion |
| 8 | Few-Shot Exemplar Priming | advanced | Work 2-3 examples of the desired pattern first, then apply it |
| 9 | Stakeholder Round Table | collaboration | Several personas give perspectives; synthesize and align |
| 10 | Expert Panel Review | collaboration | Domain experts analyze in depth and converge on recommendations |
| 11 | Debate Club Showdown | collaboration | Two personas argue opposite sides; a moderator scores and synthesizes |
| 12 | User Persona Focus Group | collaboration | Your users react to the proposal: frustrations, concerns, priorities |
| 13 | Time Traveler Council | collaboration | Past and future selves weigh long-term vs short-term effects |
| 14 | Cross-Functional War Room | collaboration | PM, engineer and designer trade off viability, feasibility, desirability |
| 15 | Mentor and Apprentice | collaboration | An expert explains; a novice's naive questions expose assumptions |
| 16 | Good Cop Bad Cop | collaboration | Alternate a supportive and a critical voice: strengths, then weaknesses |
| 17 | Improv Yes-And | collaboration | Personas build on each other's ideas without blocking |
| 18 | Customer Support Theater | collaboration | Angry customer vs support rep: complaint, cause, resolution, prevention |
| 19 | Six Thinking Hats | collaboration | Rotate facts, feelings, caution, optimism, creativity, process |
| 20 | Delphi Method | collaboration | Independent estimates, anonymous reveal, revise, converge |
| 21 | Red Team vs Blue Team | competitive | Defend, attack, harden: find the vulnerabilities |
| 22 | Shark Tank Pitch | competitive | Pitch to skeptical investors; sharpen the value proposition |
| 23 | Code Review Gauntlet | competitive | Reviewers with clashing philosophies review the same code |
| 24 | First Principles Analysis | core | Strip assumptions down to fundamental truths and rebuild |
| 25 | 5 Whys Deep Dive | core | Ask "why" repeatedly until the root cause appears |
| 26 | Socratic Questioning | core | Ask targeted questions that surface hidden assumptions |
| 27 | Critique and Refine | core | List strengths and weaknesses, then improve |
| 28 | Explain Reasoning | core | Walk through the steps and logic behind the conclusion |
| 29 | Expand or Contract for Audience | core | Adjust depth and jargon to the actual reader |
| 30 | Second-Order Thinking | core | Trace the consequences of the consequences before choosing |
| 31 | Inversion Analysis | core | Ask what would guarantee failure, then avoid those paths |
| 32 | Problem Decomposition | core | Split into independent sub-problems, solve each, reassemble |
| 33 | Analogy Mapping | core | Borrow the structure of a well-understood parallel domain |
| 34 | Steelmanning | core | Build the strongest opposing argument, then answer it honestly |
| 35 | SCAMPER Method | creative | Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse |
| 36 | Reverse Engineering | creative | Start from the desired end state and step backwards to a path |
| 37 | What If Scenarios | creative | Explore alternative realities and their implications |
| 38 | Random Input Stimulus | creative | Inject an unrelated concept to force new associations |
| 39 | Exquisite Corpse Brainstorm | creative | Each persona adds to the idea seeing only the previous contribution |
| 40 | Genre Mashup | creative | Combine two unrelated domains into a hybrid approach |
| 41 | Constraint Injection | creative | Add an artificial limit (budget, time, tech), then lift it |
| 42 | Morphological Analysis | creative | Grid the parameters and their options, combine systematically |
| 43 | Subtraction | creative | Improve by removing elements, countering additive bias |
| 44 | Abstraction Laddering | framing | Go up ("why?") for strategy or down ("how?") for detail |
| 45 | Reframe the Question | framing | Check whether the stated problem is the real problem |
| 46 | Stakeholder Lens Rotation | framing | Adopt each stakeholder's view in turn; find who is overlooked |
| 47 | Map Is Not the Territory | framing | Check where the model or diagram diverges from the real system |
| 48 | Feynman Technique | learning | Explain it simply; the gaps show missing understanding |
| 49 | Active Recall Testing | learning | Test understanding without references to find gaps |
| 50 | Deliberate Practice Loop | learning | Isolate a sub-skill, drill with feedback, adjust, repeat |
| 51 | Occam's Razor Application | philosophical | Prefer the simplest sufficient explanation |
| 52 | Trolley Problem Variations | philosophical | Use moral dilemmas to expose values and trade-offs |
| 53 | Literature Review Personas | research | Optimist, skeptic and synthesizer assess the evidence |
| 54 | Thesis Defense Simulation | research | Defend the hypothesis against a committee's challenges |
| 55 | Comparative Analysis Matrix | research | Score options against weighted criteria, then recommend |
| 56 | Source Triangulation | research | Require three independent source types before accepting a claim |
| 57 | Hindsight Reflection | retrospective | Look back from the future to gain perspective |
| 58 | Lessons Learned Extraction | retrospective | Turn experience into takeaways and concrete actions |
| 59 | Pre-mortem Analysis | risk | Assume it failed; work back to the causes and prevent them |
| 60 | Failure Mode Analysis | risk | For each component, list how it can fail and how to prevent it |
| 61 | Challenge from Critical Perspective | risk | Play devil's advocate against every assumption |
| 62 | Identify Potential Risks | risk | Brainstorm risks across all categories, with mitigations |
| 63 | Chaos Monkey Scenarios | risk | Break things on purpose, observe, harden recovery |
| 64 | Assumption Audit | risk | List assumptions, rate confidence and impact, stress-test the weakest |
| 65 | Cascading Failure Simulation | risk | Trace how one failure propagates; find hidden coupling |
| 66 | Architecture Decision Records | technical | Debate options and trade-offs; record decision and rationale |
| 67 | Rubber Duck Debugging Evolved | technical | Explain the code to ever more technical listeners until the bug shows |
| 68 | Algorithm Olympics | technical | Benchmark competing implementations on the same problem |
| 69 | Security Audit Personas | technical | Hacker, defender and auditor apply different threat models |
| 70 | Performance Profiler Panel | technical | DB, frontend and DevOps experts hunt bottlenecks |
| 71 | Boundary & Edge Case Sweep | technical | Test zeros, nulls, maximums and type mismatches |

_Adapted from BMAD-METHOD (MIT, © 2025 BMad Code, LLC)._
