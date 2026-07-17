# Adaptive Loop-Closing — Code Review & Design (2026-07-15)

> Design-layer output for review. Grounded in a fresh clone of `barnes-ngb/first-principles-engine` @ `cc2ea7d` (PR #1525), **not** the stale MASTER_OUTLINE v14 (Mar 31). Two focused code audits (loop mechanics + Shelly-feedback path) plus the Learner Model design (`docs/LEARNER_MODEL_DESIGN.md`, FEAT-46→63) and `docs/PROCESS_OVERVIEW.md`.
>
> **Goal this session targeted:** "the learning engine that feeds back to Shelly and accelerates Lincoln." Focus chosen: **adaptive loop closing**.

---

## TL;DR

The loop is much closer to closed than the outline suggests. The **Learner Model** (`learnerModels/{childId}`) is the "central brain" the outline said didn't exist yet — it synthesizes Lincoln's per-concept frontier (`solid/forming/frontier/not-yet`), computes `whatMattersNext`, and already closes one full re-test loop through Knowledge Mine. Phase 3a shipped (FEAT-57).

The engine already **computes the precise next move and already writes quest outcomes back into the model.** What's missing is the connective tissue on two ends:

1. **Feed back to Shelly** — the best "what to do next" artifact (`whatMattersNext`) has **no first-class parent surface**; it's buried in chat context and a `?diag=1` panel. This is the design's own named-but-unbuilt **Phase 3b**.
2. **Accelerate Lincoln** — the automatic re-test queue is seeded **only by a manual parent chat**. Lincoln's *daily* struggle signals (the "stuck" chip, a bad grade note, a fumbled teach-back) do **not** auto-enqueue a re-test, so "he struggled today" doesn't deterministically become "re-test this next."

Three proposed ledger items below close both ends. All slot into the existing governance model (branch+PR, propose→confirm, `skillSnapshotWrites.ts` single-writer, Lincoln-first).

---

## What is ALREADY closed (do not rebuild)

- **Quest → both stores → plan.** `useQuestSession.endSession` writes priority skills, working levels, conceptual blocks, quest-activity, the skill map, word progress **and** the learner model (`syncQuestResultsToModel`), then marks synthesis stale so the Sunday beat regenerates `whatMattersNext`. Fully automatic.
- **"Stuck" mastery chip → snapshot block → planner.** `TodayChecklist` `handleMasteryChip` "stuck" writes a new `ADDRESS_NOW` conceptual block (`masteryBlocker.ts:buildStuckBlock`); "got it" nudges a matching block toward `RESOLVING`. The planner reads these. This is a real daily→plan closed loop (surprisingly complete).
- **Manual Foundations Review → openQuestions → quest → resolve.** FEAT-51/53/54: the parent's review chat queues `openQuestion{routedTo:'quest'}`; `selectQuestTargets` feeds them into Lincoln's next Mine session as *preferred concepts*; `applyQuestResultsToModel` folds results back (upgrade-only, no-shame) and resolves the ask. A genuine closed re-test sub-loop — the infrastructure to "decide what to re-test after teaching" **exists**.
- **Weekly beat.** `weeklyReview` cron (Sun 19:00 CT) piggybacks `synthesizeIfStale` → regenerates `whatMattersNext` + narrative + `openQuestionsSummary`.
- **Shelly Portal ("Ask AI", `/chat`).** Live in nav. Richest context surface in the app (16 slices incl. the learner model); can stage snapshot edits and next-week plan changes, and silently files feature requests to GitHub. If Shelly *asks*, she gets the frontier-grounded next move.

## Where the loop is still OPEN

| # | Gap | Evidence | Which goal |
|---|-----|----------|-----------|
| G1 | **`whatMattersNext` has no first-class parent surface.** Only reachable via chat or `?diag=1`. Dedicated Foundations tab + one-line planner surface are unbuilt. | `ProgressPage.tsx:66` flag-gate; `LEARNER_MODEL_DESIGN.md:3` ("Next: Phase 3b — the Foundations tab + the one-line planner surface"). Slices 3 & 7 unbuilt. | Feedback to Shelly |
| G2 | **Daily teaching-failure signals don't seed the re-test queue.** "Stuck" chip writes a snapshot block but **not** an `openQuestion{routedTo:'quest'}`; a bad grade note and a weak teach-back write nothing to the model. Only the manual Review Chat fills the queue. | Loop audit §6.6; `masteryBlocker.ts`, `TeachBackSection.tsx` (dead-end), `handleSaveGradeNote` (free text, unparsed). | Accelerate Lincoln |
| G3 | **No loop-confirmation to Shelly.** The `changeFeed` records "long vowels moved forming→solid," but nothing shows Shelly *"last week's focus worked — here's the evidence."* | `changeFeed` written but only narrated if she asks the chat. | Feedback to Shelly |
| G4 | **Two actionable systems, one unshared brain.** Weekly Review grounds on `skillSnapshot` + eval history, **not** the learner-model frontier, so its pace-adjustments/recommendations can diverge from `whatMattersNext`. | `evaluate.ts:525` WEEKLY_REVIEW_ADDENDUM. | Both |
| G5 | **Guided eval → snapshot is manual; the eval `frontier` string is dropped.** Findings persist only if the parent taps "Apply to Skill Snapshot"; the explicit `<complete>.frontier` is displayed but never persisted. **✅ Addressed by FEAT-75 + FEAT-76 (2026-07-16):** the `frontier` is retained on the session record + surfaced read-only, and on Apply the findings now project onto the learner-model `conceptStates` — calibrated up/down, targeted, attestation-frozen, no-shame — so a guided eval moves `whatMattersNext`. | `EvaluateChatPage.tsx:1101`, `:89`. | Accelerate Lincoln |

---

## Proposed sequence (next ledger items — IDs are placeholders, `max(id)+1` at build)

**FEAT-64 — Phase 3b: surface the brain to Shelly (closes G1, G3).** The design's own named next step. Build slice 3 (Foundations tab absorbing Learning Profile; terrain map + `whatMattersNext` + modality calibration + `changeFeed` "what moved" + open questions; tap-a-concept → evidence + attestation override) and slice 7 (the one-line planner surface: *"This week's foundation focus: {X}, because {Y}"* sourced from `whatMattersNext[0]`, tap-through to Foundations). Add a **loop-confirmation card** (G3): render the `changeFeed` as "Last focus → evidence it moved." Highest feedback-to-Shelly leverage; UI-only over data that already exists.

**FEAT-65 — Daily signals auto-seed the re-test queue (closes G2).** Wire Lincoln's daily struggle signals into `openQuestion{routedTo:'quest'}` (the FEAT-54 pipeline already consumes them). Sources: "stuck" mastery chip (already writes a snapshot block — additionally enqueue a learner-model re-test for the mapped concept); a parsed grade note ("missed #4" → the concept behind item #4); optionally a low-confidence teach-back. **Learner-model-only, merge-only, fire-and-forget** — mirror FEAT-54/63; do **not** touch the invariant-protected `skillSnapshots` write path. This is the piece that makes "he struggled today" deterministically become "re-test this next," without waiting for a manual Review Chat.

**FEAT-66 — Weekly Review shares the brain (closes G4); optional G5 auto-apply-with-confirm.** Point the weekly-review context at the `learnerModel` slice so pace-adjustments/recommendations agree with `whatMattersNext`; and persist the guided-eval `frontier` string on Apply (or stage it via propose→confirm) so the single most explicit eval output stops getting dropped.

### Sequencing rationale
FEAT-64 first: pure feed-back-to-Shelly, no new write paths, unblocks the owner *seeing* the loop. FEAT-65 second: the deepest "accelerate Lincoln" win, but it's a write path so it wants the surfaces (64) live to make its effects visible. FEAT-66 last: alignment + cleanup.

## Governance notes (from PROCESS_OVERVIEW / CLAUDE.md)
- Every item = a branch + PR; **human merges from phone**. Design chat writes self-contained run-prompts naming the ledger row.
- **Invariants are propose-and-confirm**: never silently change `hours`, `xpLedger`, `skillSnapshots` (write only via `skillSnapshotWrites.ts`), charter preamble, or `firestore.rules`.
- **Lincoln-first, gate on capability not name.** London minimal until tuned.
- Serialize ledger-touching runs; `max(id)+1` against `origin/main`.

## Open questions for Nathan
1. Confirm the **64 → 65 → 66** order (surface first, then auto-seed, then align).
2. For G5, preference: auto-apply eval findings, or keep the Apply tap but stop dropping `frontier`?
3. Should FEAT-65 include the teach-back signal, or start with just stuck-chip + grade-note?

---

> **Historical note (filed 2026-07-16):** the proposed sequence above shipped/opened as FEAT-64 (Mathseeds/TGTB bridges), FEAT-65 (Foundations tab, Phase 3b, PR #1529), FEAT-68/69 (daily struggle-signal → re-test queue + skillTag→concept bridge), and FEAT-72 (AI-planner catalog-tag backfill). The follow-on charter-wide audit is `CHARTER_ALIGNMENT_SWEEP_2026-07-16.md`.
