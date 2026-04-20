# Evaluation Methodology

_Phased build plan for the blocker-driven learning engine._
_Written 2026-04-20. Grounds in `docs/LEARNING_ENGINE_AUDIT_2026-04.md` (ConceptualBlocks Inspection)._

This is a methodology commitment, not an exploration. It captures the decisions we've made about how First Principles Engine evaluates Lincoln (10, neurodivergent, speech challenges, ~1st grade reading, motivated by Minecraft and Lego) and how those decisions should ship across four phases.

---

## 1. Evaluation Philosophy

**Three surfaces, three jobs.** Evaluation in this system isn't one thing — it's three surfaces that each measure something the others can't.

- **Daily work (scans + checklist + Shelly's chips)** is the thickest evidence stream. It's what Lincoln actually did on actual curriculum — GATB lessons, math workbook pages, read-alouds. Scans turn a phone photo of today's page into structured signal: what was covered, what was mastered, what was marked "too-hard," what Shelly noted in passing. This is the ground truth of Lincoln's week. Everything else is sampling.
- **Knowledge Mine (the quest)** is spaced diagnostic practice that masquerades as a game. Lincoln thinks he's mining diamonds; the system is quietly sampling phonics, decoding, comprehension, and number sense at calibrated difficulty. Its unique job is to surface gaps that scans can't — the skills Lincoln avoids, the sub-skills nobody has handed him a worksheet for this month, the signals that only appear when content is generated fresh rather than drawn from a textbook.
- **Guided evaluation (Shelly + AI chat)** is the slow, deliberate surface. It's where Shelly sits with Lincoln, asks targeted questions, records findings, and — once enough sessions have accumulated — gets an AI synthesis of cross-session patterns. This is where blockers get named and where disposition gets observed in context.

**Practice not testing.** The quest should feel like mining diamonds. Lincoln should want to play it. That's not decoration — it's the only way spaced assessment works for a kid with speech challenges and a long history of shame around reading tests. Underneath the gameplay, the questions are deliberately diagnostic: each one is generated with a target skill, a difficulty band, and in later phases a specific blocker it's meant to probe. The art is making the probe invisible. If Lincoln ever says "this feels like a test," we've broken something.

**Scans are truth.** Daily curriculum work is the primary evidence stream, not an afterthought. Quest and guided eval both sample. Scans observe. When the scan says Lincoln "got every short-a word right but missed four of five short-i words" on a GATB page, that is not an inference — it is what happened this morning. The engine should treat scan-derived findings as the highest-confidence signal we have, and every other surface should be oriented toward either confirming or refining what scans already showed.

**Identify what's hard, name it, unblock it.** This is the system's actual job. Not "measure Lincoln against grade level." Not "assign a score." The job is to notice that a specific sub-skill keeps tripping him up, put precise words to it ("short vowel i/e discrimination," not "reading struggles"), suggest concrete interventions Shelly can run in five minutes, and track whether the blocker is resolving. The Charter commitment — disposition over content mastery, no shame, AI suggests humans decide — shapes this: the engine names blockers without shaming Lincoln, offers interventions without mandating them, and leaves every judgment call in Shelly's hands.

## 2. Current State Assessment

Today the engine has the right conceptual model and almost none of the plumbing to feed it.

**What exists.** `ConceptualBlock` is defined on `SkillSnapshot` with eight fields: `name`, `affectedSkills[]`, `recommendation` (`ADDRESS_NOW` or `DEFER`), `rationale`, optional `strategies[]`, optional `deferNote`, `detectedAt`, and `evaluationSessionId`. A companion `blocksUpdatedAt` timestamp sits at the snapshot level. Pattern detection runs on the server via `analyzeEvaluationPatterns`, which takes the current session's findings plus the last five completed evaluation sessions (requires at least two historical sessions or it returns empty) and asks Claude Sonnet to produce one to three blocks.

**One writer, three readers.** The only write path is `handleSaveAndApply` in the guided evaluation chat page. It fires when Shelly clicks Save & Apply on a completed session that has enough history behind it. Three surfaces read: the Skill Snapshot page, the Foundations section card component, and — via `loadSkillSnapshotContext` — any AI task whose context bundle includes the skill snapshot slice. The AI injection is filtered: only `ADDRESS_NOW` blocks reach prompts, formatted as one line each. `DEFER` blocks are stored but invisible to every task prompt.

**No lifecycle.** There is no `resolved`, no `status` beyond the `ADDRESS_NOW`/`DEFER` recommendation, no age, no decay, no session-count persistence tracking, no merge. Every Save & Apply replaces the array wholesale. A block detected three weeks ago and still active this week is, from the data's perspective, identical to a block detected for the first time today. There is also no resolution UI — Shelly cannot dismiss a block, mark one resolved, or edit one.

**Starved for data.** The detection path gates on ≥2 prior completed sessions, which means a fresh child has zero blocks until their third evaluation. Lincoln has enough history to produce blocks, but the pipeline only runs when Shelly manually completes a guided eval session and clicks Apply. Quest sessions produce no blocks. Scans produce no blocks. Shelly's "Stuck" chips on the daily checklist produce no blocks. The model is right but it's being fed from a single narrow straw.

**Honest verdict.** The shape of `ConceptualBlock` is correct. What's missing is three more writers, a real lifecycle, and a synthesis pass that turns raw signals into actionable diagnoses Shelly can act on. The next four phases add those in order.
