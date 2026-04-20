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

---

## 3. Phase 1 — Feed Blockers from Everywhere

**Goal.** Every evaluation surface identifies and writes blockers. Not just guided eval.

Today, the only path that produces a `ConceptualBlock` is a completed guided evaluation session with two or more prior sessions behind it. That makes blockers a monthly artifact at best. Phase 1 turns blockers into a live signal that updates whenever Lincoln touches the system.

### New writers

**Quest session end.** When Lincoln gets 2+ wrong answers at the same sub-skill within a single quest session, the session-end handler writes (or reinforces) a `ConceptualBlock` for that sub-skill. The evidence payload includes the specific words he mispronounced, the questions he missed, and the session ID. A miss on "bed" vs "bid" isn't a generic reading failure — it's typed as short-vowel discrimination, and the block carries that specificity. One miss is noise; two at the same sub-skill is a signal.

**Scan analysis.** The scan task already identifies what curriculum a page covers and what level it targets. Phase 1 extends it: when a scan flags content as "too-hard" or identifies a skill Lincoln hasn't mastered, it writes a `ConceptualBlock` linking the curriculum content (e.g., "GATB LA Lesson 27 — /oo/ digraph") to the underlying gap. This is the tightest possible feedback loop — the morning's worksheet becomes an afternoon blocker.

**Shelly's mastery chips.** When Shelly taps "Stuck" on a checklist item during daily work, the chip creates a lightweight block tagged with the item's subject and skill area. These are lower-confidence than quest/scan blocks (they reflect Shelly's in-the-moment read, not a counted error rate) but they are invaluable as the fastest-moving signal in the system. A Stuck chip on Monday that doesn't appear again by Friday is a block that self-resolved.

### Lifecycle additions

- **`RESOLVING`** — triggered when Lincoln gets 3+ correct on a previously-blocked sub-skill across sessions. The block stays in the array but its status changes; it drops out of `ADDRESS_NOW` AI injection and starts appearing as "trending better" in UI.
- **`RESOLVED`** — triggered when Lincoln passes 5+ items on the sub-skill across multiple sessions. The block remains in the record (resolved blockers are valuable history) but no longer drives prompt context or active intervention suggestions.
- **Persistence tracking** — every block carries `firstDetectedAt`, `lastReinforcedAt`, and `sessionCount`. A block that keeps appearing month after month is a different kind of problem from one that flares once and fades. The data has to distinguish them.
- **Merge-not-overwrite** — new detections merge with the existing array rather than replacing it. If pattern analysis surfaces "short vowel i/e" again, it increments `sessionCount` and refreshes `lastReinforcedAt`; it does not write a second duplicate entry or wipe unrelated blocks.

### Data model changes

Add `firstDetectedAt`, `lastReinforcedAt`, `sessionCount`, `resolvedAt` to `ConceptualBlock`. Extend the status domain to include `RESOLVING` and `RESOLVED` alongside `ADDRESS_NOW` and `DEFER`. Replace the wholesale-overwrite in `handleSaveAndApply` with a merge helper — this is a generalization of the Apply fix already identified elsewhere. Quest and scan write paths call the same merge helper via `updateDoc` with `arrayUnion` semantics (or read-modify-write where the merge needs to inspect existing entries).

### Effort estimate: **Small-Medium**

The biggest lift is the merge helper and the status state machine. Writers in quest and scan are mostly prompt changes and a shared utility call. No new collections, no new surfaces.

## 4. Phase 2 — Gap-Targeted Quest Questions

**Goal.** Two to three of every ten quest questions deliberately target known blockers.

Today the quest generates questions at calibrated difficulty for broad skill areas — phonics, decoding, comprehension, number sense. Phase 1 produces a rich blocker list; Phase 2 closes the loop by letting that list steer quest content.

### Prompt change

The quest prompt gains a new section: **"KNOWN BLOCKERS — generate 2-3 questions from this list."** For each `ADDRESS_NOW` or `RESOLVING` block, the prompt includes the specific sub-skill, a handful of example words or question shapes, and what the question is meant to test. The generator decides how to weave them in — Lincoln should not be able to tell which questions are blocker-probes and which are general assessment.

When the session ends, the result handler tracks whether the blocker-targeted questions were answered correctly. That goes back as a structured finding: "Lincoln got 2/2 on short-i-vs-e targeted questions this session." Those signals feed the lifecycle rules from Phase 1 — correct answers across sessions advance a block toward `RESOLVING` and eventually `RESOLVED`.

### Connection to daily work

If today's scans identified specific curriculum content — say, /oo/ digraph from GATB LA Lesson 27 — the quest prompt includes it as **"RECENT CURRICULUM — consider including 1-2 questions that reinforce this."** This is not mandatory. The AI decides the mix based on what data is available. When no scan data exists for the day, quest falls back to blocker-targeting plus general assessment. When no blockers exist yet, quest generates standard calibrated questions.

The point: Lincoln's quest should reflect what his actual week has looked like. A quest in the middle of a unit on short vowels should probe short vowels. A quest on a day he scanned a page full of digraphs should touch digraphs. The generator is doing the same diagnostic job it always did — the data just tells it where to aim.

### Effort estimate: **Small**

Prompt change only. No new data model. The signals it consumes already exist once Phase 1 ships. The hardest part is writing the prompt so the probes stay invisible and Lincoln still feels like he's mining diamonds.

---

## 5. Phase 3 — Synthesized Diagnosis with Interventions

**Goal.** A synthesis pass turns the raw blocker array into a clear, actionable diagnosis Shelly can read in thirty seconds and act on in five minutes.

Phases 1 and 2 produce rich signal but the `ConceptualBlock` array is still raw. It tells you *what* is stuck, but not *how long*, not *why it matters*, not *what to do about it*, and not *what's still safe to push on*. Phase 3 is the synthesis pass that answers those questions.

### What it produces (per active blocker)

- **What's stuck** — specific, named. Not "reading struggles." "Short vowel i/e discrimination in CVC words."
- **How long it's persisted** — weeks since first detected, total session count, trend over the last two weeks.
- **Evidence trail** — which sessions surfaced it, which words tripped him up, which questions he missed, which Stuck chips Shelly tapped. The receipts.
- **Why it matters** — what this blocker gates downstream in the curriculum. "Blocks fluent CVC reading, which blocks transition to CVCe, which GATB introduces in Lesson 34."
- **Suggested intervention** — concrete and time-bounded. "5-min daily minimal pairs, oral not written — bed/bid, pen/pin, bet/bit. Lincoln's speech challenges mean auditory discrimination practice matters more than worksheet drill."
- **Resolution criteria** — measurable. "8/10 correct on 3 consecutive days of targeted practice, or 4+ quest sessions with 80%+ on short-i/e items."
- **What's safe to continue** — the curriculum that doesn't depend on this blocker. Shelly shouldn't feel like a blocker halts the week; she should know exactly which adjacent work is still fair game.

### When it runs

- **Weekly** — alongside or as part of the weekly review, so Shelly sees a fresh diagnosis every Sunday.
- **On-demand via Ask AI** — "what's blocking Lincoln?" returns the synthesized diagnosis, not a raw block dump.
- **After guided evaluation Apply** — the next synthesis runs immediately rather than waiting for the weekly tick, since Apply usually adds or resolves blocks.

### Where it surfaces

- **Learning Profile** — dedicated "Active Blockers" section, always visible, top of the page. Blockers are the most important thing to see on Lincoln's profile; they should not be three taps deep.
- **Weekly Review** — a blockers section with progress-since-last-week. "Short-i/e: still active, session count up 2. Digraph /oo/: now RESOLVING, 4 correct this week."
- **Ask AI** — blocker questions get the synthesized diagnosis rather than a list. Shelly shouldn't have to interpret raw data when she asks the assistant what's going on.

### Storage

Synthesized diagnosis is **separate from `conceptualBlocks`**. The array stays as the raw signal stream — every detection, every reinforcement, every resolution event. The diagnosis is a derived artifact: a structured `blockerDiagnosis` field on the child profile or skill snapshot with per-blocker entries (what's stuck, persistence, evidence, why-it-matters, intervention, resolution criteria, safe-to-continue). It carries its own timestamp for staleness detection — UI should indicate when a diagnosis was last refreshed and offer a regenerate action if Shelly wants one on demand.

Treating the diagnosis as derived (not primary) matters: if the synthesis prompt changes, we can regenerate every diagnosis from the raw array without losing history. If we stored only the diagnosis, we'd have lost all the underlying evidence.

### Effort estimate: **Medium**

New CF task (or extension of weekly review), new storage field, new Learning Profile section, integration into Ask AI's blocker-question path. The hardest part is the prompt — Phase 3's output is only as useful as the synthesis is precise and honest.

## 6. Phase 4 — Blockers Drive Everything Downstream

**Goal.** The planner, the scans, and the skip system all become blocker-aware. Active blockers don't just get reported — they shape what happens next.

Phases 1-3 make blockers a live, named, diagnosed signal. Phase 4 wires that signal into every surface that decides what Lincoln does tomorrow.

### Planner integration

The weekly planner reads active blockers (and their diagnoses) before generating the plan. Concrete effects:

- **Targeted practice lands as checklist items.** A short-i/e blocker with a "5-min daily minimal pairs" intervention appears as a literal checklist item three or four times in the week — not a vague "work on vowels," but the specific minimal-pair drill the diagnosis named.
- **Downstream content gets flagged.** If GATB Lesson 34 depends on fluent CVC reading and Lincoln has an active CVC blocker, the planner flags the lesson rather than quietly scheduling it. Shelly decides whether to push, defer, or substitute.
- **Persistent blockers trigger alternative approaches.** A block that's been active 4+ weeks without advancing toward `RESOLVING` prompts the planner to suggest a different intervention — not the same minimal-pairs drill that hasn't worked, but something structurally different (game-based, Minecraft-themed, oral-only, sibling-led, whatever fits Lincoln's motivators).

### Scan integration

Scans already identify what a page covers. With blocker awareness, the scan recommendation gets richer:

- **Blocker-adjacent content gets flagged.** "This lesson covers short vowel review. Lincoln has an active blocker on short i vs e. Recommendation: do WITH support, focus on the i/e words, skip the a/o/u rows if time-constrained."
- **Blocker-addressing content gets amplified.** "This lesson's word list includes bed/bid/bet/bit — excellent targeted practice for Lincoln's i/e gap. Consider making this the centerpiece of today's reading block."
- **Blocker-independent content stays clean.** The scan doesn't clutter every recommendation with blocker context — only when the content actually intersects an active block.

### Skip system integration

The existing skip system captures when Shelly marks something as "too-hard" or "skip — other." Phase 4 makes it blocker-aware:

- **"Too-hard" skips check against active blockers automatically.** If Lincoln skips a page that aligns with a known blocker, the system doesn't just record the skip — it surfaces the blocker and offers to swap the page for a targeted-practice alternative from the diagnosis.
- **Repeated skips on unrelated content flag a potential new blocker.** Three "too-hard" skips in a week on the same sub-skill that isn't yet blocker-tracked becomes a signal to the pattern detector: investigate, potentially write a new block.

### Effort estimate: **Medium-Large**

This phase touches three distinct surfaces (planner, scan, skip) and each requires both prompt changes and non-trivial read-integration with the blocker diagnosis. It is the phase with the highest leverage — blockers only matter if they change what Lincoln does — but it's also the phase with the most surface area and the most opportunities for regressions. Should be staged: planner first (highest leverage), scan second (tightest daily loop), skip system third (refinement on an existing flow).


