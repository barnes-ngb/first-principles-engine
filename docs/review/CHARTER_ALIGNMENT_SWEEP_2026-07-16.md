# Charter Alignment Sweep — 2026-07-16

> **Scope:** Whole-system audit of the app against the **Barnes Family Learning Charter v2** (Drive: `BARNES_FAMILY_LEARNING_CHARTER_V2.md`, Mar 2026). Not a code-quality/architecture audit — this asks one question per charter commitment: *does the build embody the charter, and where does it drift?*
> **Ground truth:** Fresh clone of `barnes-ngb/first-principles-engine` @ `945758b` (PR #1532 / FEAT-72 merged, 2026-07-16). Four parallel read-only code audits (kid-facing ethos; the learning engine; governance + rituals; London readiness).
> **Method:** Charter commitments → concrete code evidence (file:line) → ALIGNED / PARTIAL / DRIFT + severity. No code changed by this audit.
> **Companion:** `LOOP_CLOSING_REVIEW_2026-07-15.md` (the engine half). This sweep is broader and folds that review's open items in.

---

## TL;DR

The app is **strongly charter-aligned** where it matters most: no-grades and no-shame are enforced (test-guarded) across nearly every kid surface; formation-first is the literal first block of every day; MVD is framed as real school; creating logs real compliance hours; the "AI assists, humans decide" propose→confirm model is real; conundrums are genuinely no-score and per-child. The adaptive engine the charter promises — *synthesize where each child is, compute the next foundational move, feed it back to Shelly, re-test what he struggled with* — is **nearly closed** and now has a first-class parent surface (Foundations tab).

The drift is concentrated and mostly small. Two **charter-critical, low-effort** kid-facing leaks (a literal `%` and a red ❌ a child can see) contradict no-grades/no-shame directly. One **high-value, designed-but-unbuilt** gap: teach-back — the charter's "most powerful tool / richest artifacts" — is the *least*-connected signal in the engine (it feeds XP, not the learner model). A named charter ritual (the family **Weekly Retro**) has no implementation. London is intentionally minimal, but two of his charter commitments (a unified voice-first daily flow; his questions driving family curiosity) are genuinely unbuilt rather than merely deferred.

Nothing here is alarming. This is a mature system that has drifted at the edges, not at the core.

---

## Findings by charter commitment

### A. No grades — **DRIFT (MED, charter-critical)**
Enforced almost everywhere: quest shows "8 diamonds mined!" not percentages (`QuestSummary.tsx:141`), `MineRecapCard` *refuses* correct/total and is test-guarded (`MineRecapCard.test.tsx:34-35`), Foundations review strips band numbers/percentages (`foundationsView.ts:47-59`).
- **Leak:** `SightWordDashboard.tsx:147` renders `"{masteredPct}% mastered ({total} words tracked)"` — a literal percentage — and its route `/books/sight-words` is **not** wrapped in `RequireParent` (`router.tsx:65` vs the gated `/weekly-review` at `:53-57`), so it is kid-reachable.

### B. No shame — **DRIFT (MED, charter-critical)**
Wrong-answer feedback is warm ("🧱 Almost! … Keep mining!", `ReadingQuest.tsx:119-164`; `BuildWordQuestion.tsx:51` "never 'wrong'"). No-shame rails are baked into AI prompts (`contextSlices.ts:129`, `chat.ts:572,707`).
- **Leak:** `QuestSummary.tsx:31` `findingStatusIcon` returns a red ❌ for `'not-yet'` skills, rendered in the kid-facing "Skills Found" list (`:353`). A child ends a quest — a celebration surface — seeing fail iconography next to unmastered skills.

### C. MVD / rest by design — **ALIGNED** (one LOW)
MVD defined as "the smallest set of items that count as a real day" (`dailyPlanTemplates.ts:13`); kid copy is positive ("Light day today. Just these N!", `KidTodayView.tsx:685`); energy selector maps low/overwhelmed→MVD (`TodayPage.tsx:449-450`).
- LOW: the parent-facing MVD plan-type chip uses `color="warning"` (amber) (`TodayPage.tsx:947`), subtly coding a designed rest-day as a warning state.

### D. Formation first — **ALIGNED**
`DayBlockType.Formation` is the **first** block for both children (`dailyPlanTemplates.ts:30,49,97,111`), MVD arrays lead with Gratitude/Scripture (`:81,:136`), the MVD planner prompt leads with Prayer/Scripture (`plannerPrompts.ts:272`). Armor of God is devotional, not decorative (`getDailyArmorSession.ts:23` "devotional ritual (Ephesians 6:11)", per-piece scripture in `xp.ts:125`) and is kept distinct from the gamified voxel-armor XP tiers.

### E. Extra time counts / kid-initiated logging (all taps) — **ALIGNED**
`KidExtraLogger.tsx` "I Did More Mining!" self-logs via chip taps for activity and duration with a single "Log It!" button, **no text input anywhere** (`:124-172`); awards diamonds/XP (`:66-82`). Honors Lincoln's no-typing constraint.

### F. Portfolio over grades — **ALIGNED**
Monthly-organized, evidence-based: `MonthlyReviewPage.tsx:29,62`, photo artifacts (`MonthlyPhoto.tsx`), audio narration (`useBook.ts:128`), portfolio route `/records/portfolio`.

### G. Five dispositions ARE the report card — **PARTIAL (MED)**
Closed: Foundations is **tab index 0** and absorbs the former Learning Profile; `DispositionProfile` is embedded (`ProgressPage.tsx:26-33`, `FoundationsTab.tsx:94-96`); HelpStrip says "No grades." Concept vocabulary is deficit-free (`learnerModel.ts:20-27`) and a `§14` scrub strips band/level/percent from rendered strings (`foundationsView.ts:47-59`).
- Drift: grades/scores still coexist as load-bearing signals — `disposition.ts` ingests `gradeResults` (`:66,302,314-315`); the Skill Snapshot tab persists; and the **ladder is not actually deprecated** — `ladderRef` is still threaded through planner and teach helper (`PlannerChatPage.tsx:1817,1906,2220`; `TeachHelperDialog.tsx:175`). Dispositions are the primary *growth* surface, but scores/ladder run alongside rather than being retired.

### H. The Loop (Wonder→Build→Explain→Reflect→Share) — **PARTIAL (LOW)**
Modeled in data (`EngineStage` tags artifacts by stage) and celebrated on graduation via the loop-confirmation beat (`foundationsView.ts:198-212`, `FoundationsTab.tsx:262-279`). The rhythm exists; the *Explain* stage leaks into the engine (see I).

### I. Lincoln teaches London as first-class evidence — **DRIFT (HIGH, designed-but-unbuilt)**
Capture exists twice — `TeachBackSection.tsx` (text) and richer `KidTeachBack.tsx` (audio, "Lincoln's primary input") — both writing `EngineStage.Explain` / `domain:'speech'` artifacts.
- **Dead-ends into the engine.** `EvidenceKind` has **no `teachback` kind** (`learnerModel.ts:36-52`); grep for teach-back across `src/core/foundations/**` returns nothing. Teach-back becomes XP/diamonds and a `teachBackDone` boolean — never a `ConceptStateEntry`, never a re-test seed.
- This is *designed*: `LEARNER_MODEL_DESIGN.md:126` lists `teachback` as an evidence kind, `:203` as a model input, `§8 (:282-287)` specs a cross-child `TeachBackSuggestion` (A solid where B forming). None is built. The charter's "most powerful tool / richest artifacts" is currently the least-connected signal.

### J. Engine feeds back to Shelly + whatMattersNext + struggle→re-test — **ALIGNED** (PARTIAL edge)
`whatMattersNext` is real, deterministic-frontier-first, wired to the Sunday beat (`learnerSynthesis.ts:16-22`, `evaluate.ts:1049-1051`), rendered as the top of the Foundations tab and tapped through from the planner (`FoundationsFocusLine.tsx`). Struggle→re-test is closed for the stuck-chip path (`TodayChecklist.tsx:290-310` → `stuckRetestQueue.ts:56-104` → `dailySignalTargeting.ts:148-160`, upgrade-only, marks synthesis stale).
- Open edges (MED): the **grade note is not wired** (only the stuck chip / `engagement:'struggled'` seed re-tests, not `gradeResult`); the tag→concept bridge is honestly curation-gated so `writing.*`/`regulation.*` and untagged LLM items resolve to nothing (`tagConceptBridge.ts:58-94`) — coverage is thin, by design. FEAT-72/73 raise tag coverage on the planner side.

### K. AI assists, humans decide (propose→confirm, invariants) — **PARTIAL (MED-HIGH)**
Intent is real and enforced in app code: the invariant list matches the charter (`CLAUDE.md:24-27`); the Shelly-portal write path only stages, writing on tap through the central writer (`useShellyChatActions.ts:139-251`); the AI backend only proposes `<action>` blocks and is told never to claim a change is done (`shellyChat.ts:282-344`); `skillSnapshotWrites.ts` is a real additive-only, never-downgrade single writer.
- **Where "humans decide" could be violated:** (1) enforcement is **code convention, not the DB** — `firestore.rules` is coarse (`allow read, write: if request.auth.uid == familyId` grants any authenticated client full write to `skillSnapshots`/`xpLedger`/`hours`); the guarantee lives entirely in app code. (2) The single-writer is **aspirational** — `skillSnapshotWrites.ts:35-37` (ARCH-12) admits three inline writers (`EvaluateChatPage`, `useQuestSession`, `SkillSnapshotPage`) still bypass the seam, so "write only via skillSnapshotWrites.ts" is not yet true.

### L. Conundrums — **ALIGNED**
Weekly, no right answer (`conundrum.ts:99-118`), tied to theme/virtue/scripture/heartQuestion (`:39-45,131`), per-child depth (Lincoln audio "explain WHY" vs London drawing/voice, `:129-132`; UI branches at `KidConundrumResponse.tsx:202,312`), saved as a `Wonder` artifact with no score field. Minor: a flat participation reward (5 XP + 5 diamonds, deduped by date, identical regardless of answer) lightly gamifies a no-grades ritual — consistent with charter, worth a glance.

### M. Weekly Retro (family check-in) — **DRIFT (MED, named ritual unbuilt)**
The charter's ritual is a *15-minute family* check-in: "what gave life, what created friction, one tweak for next week." No such artifact exists (grep for the phrases returns nothing). `weekly-review/` is an AI-synthesized **per-child** report on a Sunday cron — a different thing (AI reporting on the child, not humans reflecting on energy/friction/one tweak). The nearest friction capture is Shelly-chat's *silent* `<friction>` feature-request logging — invisible plumbing, not a retro.

### N. London commitments — **PARTIAL / mostly deferred**
Per-child plumbing is sound (`PER_CHILD_DELINEATION_AUDIT.md`: 8/8 domains per child; London has his own `londonDefaults.ts` K-floor model, selected by grade/age band, never by name). Creating-is-core is genuinely honored (books/workshop log real compliance hours to core buckets; there is no "enrichment" bucket). App-talks (TTS-out) is wired into his Conundrum.
- Real gaps (not just deferral): **voice-first daily flow** — the Whisper-backed `<VoiceInput>` defaults Lincoln-on/London-opt-in and is wired only into Settings + Books, **not** Kid Today or the extra logger (`KidTodayView.tsx` has no VoiceInput/TTS import); **own level unwalked** — London is auto-created with `id`+`name` only, no `birthdate`/`grade` (ARCH-15), so his rails exist but aren't activated, and `londonDefaults` maps counting→`math.placeValue` with a TODO (no K math `SkillTag`); **wonder engine** — no mechanism propagates London's questions to the family.

---

## Prioritized gap list (proposed ledger items)

IDs are **placeholders** — assign `max(id)+1` against `origin/main` at build, one branch + PR each, human merges. Bands per existing ledger convention (1 = tiny/surgical, 2 = feature-ish, 3 = larger).

| Prio | Proposed | Band | Closes | The move | Why now |
|------|----------|------|--------|----------|---------|
| **P0** | FEAT-75 | 1 | A, B | **Seal the two kid-facing grade/shame leaks.** Parent-gate `/books/sight-words` (or drop the `%` string at `SightWordDashboard.tsx:147`); replace the `'not-yet'` red ❌ at `QuestSummary.tsx:31` with a neutral/growth glyph (reuse the ⛏️/🧱 "keep mining" language). Add a test asserting no `%`/❌ on kid surfaces. | Charter-critical, ~1 file each, invisible-to-kid-behavior otherwise. Highest ratio of charter-fidelity to effort in the whole sweep. |
| **P1** | FEAT-76 | 2-3 | I, H | **Teach-back becomes model evidence.** Add `teachback` to `EvidenceKind`; write a `ConceptStateEntry` from `KidTeachBack`/`TeachBackSection` (merge-only, upgrade-only, fire-and-forget — mirror the FEAT-54/69 re-test pipeline, do **not** touch `skillSnapshots`). Optionally the §8 cross-child `TeachBackSuggestion` (A solid where B forming). | The charter's single richest signal is currently the least connected. Turns "Lincoln explained it" into engine truth. Governed pattern already exists. |
| **P2** | FEAT-77 | 2 | M | **Family Weekly Retro.** A real 3-prompt human ritual (gave-life / friction / one-tweak) attached to the weekly beat — captured, not scored, feeds nothing automatically (pure reflection artifact), optionally surfaces last week's "one tweak" next week. | A named charter ritual with zero implementation. Small, high-morale, protects the "rest by design / weekly retro" rhythm. |
| **P3** | FEAT-78 | 2 | J | **Grade-note → re-test.** Parse the free-text grade note ("missed #4") to the concept behind the item and enqueue an `openQuestion{routedTo:'quest'}` — extend the FEAT-68/69 daily-signal path to the one struggle signal it doesn't yet consume. | Completes "he struggled today → re-test this next" for the most common signal Shelly actually leaves. |
| **P4** | FEAT-79 | 2 | N | **Activate London's own level (no new rails).** Seed his `children` doc `birthdate`/`grade` (ARCH-15), apply `londonDefaults` + run the eval to open Knowledge Mine, add a K math `SkillTag` to kill the `math.placeValue` TODO. | Turns intentional-deferral into a walkable path without violating Lincoln-first. Data + config, minimal code. |
| **P5** | ARCH | 2-3 | K | **Close the propose→confirm seam.** Route the three inline snapshot writers (ARCH-12) through `skillSnapshotWrites.ts`; tighten `firestore.rules` so invariant collections can't take arbitrary client writes. | The "humans decide" guarantee currently lives only in app convention. This is the belt-and-suspenders that makes it structural. Larger; sequence after P0-P3. |

**Sequencing:** P0 first (charter-critical, trivial). P1 next (deepest fidelity win, governed pattern ready). P2/P3 are small and independent. P4 is Lincoln-first-safe. P5 is the architectural hardening — real but not urgent, and it touches an invariant path so it wants care.

## Governance notes
- Every item = a branch + PR; **human merges from a phone**. Design chat writes self-contained run-prompts naming the ledger row.
- **Invariants are propose-and-confirm** (`hours`, `xpLedger`, `skillSnapshots` via `skillSnapshotWrites.ts`, charter preamble, `firestore.rules`). P1/P3 stay learner-model-only, merge-only, never touch the snapshot write path.
- **Lincoln-first, gate on capability not name.** P4 activates London without changing the Lincoln-first posture.

## Open questions for Nathan
1. P0 is the obvious first cut — build it standalone, or fold both leaks into the next planner/quest run?
2. P1 teach-back: model-evidence only for v1, or include the §8 cross-child suggestion in the same run?
3. P2 Weekly Retro: a new lightweight surface, or a section grafted onto the existing Weekly Review page?
