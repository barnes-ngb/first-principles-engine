# Evaluation System Full Sweep — May 2026

**Date:** 2026-05-16
**Lens:** Is the evaluation engine actually adapting to Lincoln, or only claiming to?
**Scope:** Read-only. Evidence-first. File:line citations required for every claim.
**Method:** Trace writes to reads to behaviors. A write without a read is phantom adaptation.

## Sources read
- docs/KNOWLEDGE_MINE_AUDIT_2026-04.md
- docs/LEARNING_ENGINE_AUDIT_2026-04.md
- docs/EVALUATION_METHODOLOGY_2026-04.md
- docs/FINDINGS_PIPELINE.md (if exists)
- docs/MASTER_OUTLINE.md (sprint history)

## Verdict
TBD — fill in after Chunk 6.

## Table of contents
- Chunk 1: R1-R6 verification (do the May 13 fixes actually fire?)
- Chunk 2: Three closed-loop journey traces
- Chunk 3: Open gaps re-sweep (G4, G5, G6, G20, G34, methodology M1-M5)
- Chunk 4: Quest types, UX, and the tappable-words check
- Chunk 5: London + cross-domain + conceptualBlocks lifecycle
- Chunk 6: Phantom adaptation inventory + verdict + ranked fixes

## Chunk 0 — Orientation

### What R1-R6 claim to have done
(LEARNING_ENGINE_AUDIT_2026-04.md §Recommendations, lines 1262-1302. Note discrepancy: the prompt frames these as "May 13 fixes" but every R is stamped Apr 16-21 in the source doc. No "May 13" landing date appears in MASTER_OUTLINE — flagging for Chunk 1 verification.)
- **R1 — Feed `workingLevels` to the quest CF (DONE Apr 16):** added `workingLevels` to `SnapshotData` and `chat.ts` loader; `loadSkillSnapshotContext` formats it; `quest.ts` reads `workingLevels[questMode]` as authoritative starting level with curriculum fallback, capped at `QUEST_MODE_LEVEL_CAP`. Closes G9, G12 (partial), G19, G29, G40 (LEARNING_ENGINE_AUDIT lines 1266-1270).
- **R2 — Per-domain `recentEval` depth > 1 (DONE Apr 16):** new `loadRecentEvalHistoryByDomain` in `chatTypes.ts` queries each of phonics/comprehension/math/fluency at depth 3; new `recentHistoryByDomain` slice replaces cross-domain `limit(1)` for quest task; legacy `recentEval` preserved for plan/scan/shellyChat. Closes G16, G30, G41 (lines 1272-1276).
- **R3 — Wire disposition to shared slices (DONE):** added `recentHistoryByDomain`, `skillSnapshot`, `wordMastery` to disposition `TASK_CONTEXT`; removed bespoke `loadRecentEvaluations`; prompt now cites structured per-domain scores/levels/findings. Closes G25, G31, G32 (lines 1278-1282).
- **R4 — Fix `setDoc` data loss in eval Apply (DONE):** added `{ merge: true }` to three sites — `EvaluateChatPage.tsx:598`, `useQuestSession.ts:921`, `backfillWorkingLevels.ts:235`. Closes G27 (lines 1284-1290).
- **R5 — Surface scan recommendations + bridge non-math scans to `workingLevels`:** `loadRecentScansContext` now extracts `recommendation` + `effectiveRecommendation` (respecting `parentOverride`), plus subject/pageType + skip-summary; `derivePhonicsWorkingLevelFromScan` / `deriveReadingWorkingLevelFromScan` added and wired via generalized `updateWorkingLevelFromScan`. Closes G35, G36, G37, G39 (lines 1292-1296).
- **R6 — Wire shellyChat to adaptive context (DONE Apr 19):** added 5 slices to `shellyChat` — `skillSnapshot`, `recentHistoryByDomain` (no domain filter, all 4 domains depth 3), `recentScans`, plus new `dayToday` (checklist with engagement/mastery/skip state) and `dadLabReports` (last 3 with kid prediction/explanation). No removals (lines 1298-1302).

### `conceptualBlocks` lifecycle per methodology
(EVALUATION_METHODOLOGY_2026-04.md §3, lines 40-79.)
- **Four writers (Phase 1 landed 2026-04-21):** (1) guided-eval pattern analysis merges via `mergeBlock` instead of overwriting; (2) `detectBlockersFromSession` on quest end — 2+ wrong at same sub-skill in ≥5-question session; (3) `detectBlockersFromScan` — too-hard/skip/modify or behind-aligned skills; (4) Shelly's "Stuck"/"Got it" mastery chips via `buildStuckBlock` / `buildGotItReinforcement`. Source field is `evaluation` | `quest` | `scan` | `parent`.
- **Status machine:** `ADDRESS_NOW` (active probe) → `RESOLVING` at ≥3 cumulative correct → `RESOLVED` at ≥5 correct across ≥2 sessions with no new wrong; any new wrong regresses RESOLVING → ADDRESS_NOW. `DEFER` and `RESOLVED` are static. Logic in `src/core/utils/blockerLifecycle.ts` `updateBlockerLifecycle`.
- **Persistence fields:** `id` (slugified skill, stable), `firstDetectedAt`, `lastReinforcedAt`, `sessionCount`, `resolvedAt`, `source` / `lastSource`, plus evidence fields (`specificWords`, `specificQuestions`, `correctAttempts`, `totalAttempts`). All legacy fields (`name`, `affectedSkills`, `recommendation`, `rationale`, `strategies?`, `deferNote?`, `detectedAt`, `evaluationSessionId`) preserved for backward compat.
- **Merge-not-overwrite:** all writers route through `mergeBlock` + `updateDoc` (no more wholesale array replacement); `arrayUnion`-style semantics protect blocks from other writers.
- **AI injection (Phase 1 + 2):** `formatConceptualBlocks` emits three sections — ADDRESS_NOW, RESOLVING ("trending better, keep probing gently"), DEFER ("do NOT push"). RESOLVED kept in array but omitted from prompts. Quest prompt (Phase 2, Apr 21) adds `buildKnownBlockersSection` (ADDRESS_NOW + RESOLVING with example words + 0/1/2+ distribution rule) and `buildRecentCurriculumSection`. Response schema includes `targetedBlockerId` so AI can tag deliberate probes.
- **Targeted evidence weighting:** `sessionEvidenceFromQuestions` produces `targetedCorrect`/`targetedTotal` subcounts attributed via `targetedBlockerId`; `updateBlockerLifecycle` weights targeted correct/total by `TARGETED_EVIDENCE_WEIGHT = 2` toward RESOLVING/RESOLVED thresholds.
- **Phase 3 (synthesis pass) and Phase 4 (planner/scan/skip blocker-awareness) are NOT shipped** — only Phases 1-2 have landed per MASTER_OUTLINE.md:179,181. Phase 3's `blockerDiagnosis` derived field and Phase 4's planner integration are still backlog.

### Gaps explicitly marked CLOSED
(LEARNING_ENGINE_AUDIT_2026-04.md gap tables and KNOWLEDGE_MINE_AUDIT_2026-04.md post-audit fixes.)
- **R1 cluster:** G9, G12 (partial), G19, G29, G40 — `workingLevels` plumbing to quest CF + AI prompt (lines 203, 206, 549, 867, 1134).
- **R2 cluster:** G16, G30, G41 — per-domain quest history depth 3 (lines 546, 868, 1142).
- **R3 cluster:** G25, G31, G32 — disposition wired to shared slices (lines 681, 869, 870).
- **R4:** G27 — `setDoc { merge: true }` fix across three write sites (line 771).
- **R5 cluster:** G35, G36, G37, G39 — scan recommendations + non-math scan→workingLevels bridge (lines 1035-1039).
- **R6:** shellyChat "Ask AI knows nothing" gap (Chat Task Context Inspection §, lines 1195-1232).
- **G20:** Working Levels UI on Skill Snapshot tab (line 676, MASTER_OUTLINE Apr 20).
- **G27 also:** wholesale-overwrite of `conceptualBlocks` array (closed by Phase 1 merge helper, EVALUATION_METHODOLOGY §3 landed 2026-04-21).
- **Weekly review bugs (lines 1410-1412):** doc ID mismatch (0% completion artifact) and weekly review context poverty — both closed Apr 20.
- **KNOWLEDGE_MINE post-audit:** P1-6 (math has no starting-level boost), Open Questions 3/5/8 — closed by `workingLevels` data model (Apr 9, lines 636-651).
- **KNOWLEDGE_MINE P1-3:** comprehension prompt restructured to mirror phonics (Apr 20, line 595).

### Gaps explicitly OPEN
(Pulled from LEARNING_ENGINE_AUDIT_2026-04.md gap tables — those without strike-through or FIXED markers.)
- **G1, G2, G3** — Skill-Snapshot mastery edits do not update `workingLevels`; quest starting level ignores `prioritySkills.level`; no parent UI for `masteryGate` (lines 195-197).
- **G4, G5, G6 (skip-advisor dead-code triangle):** `evaluateSkipEligibility` ignores `getEffectiveMasteryGate` fallback; skip advisor logic is dead code (no UI imports); `masteryGate` not formatted into AI prompt (lines 198-200). Reiterated in §Coherence Verdict line 1243-1245 as one of the top three data-flow gaps.
- **G7, G8, G10, G11** — disposition lacks mastery-progression signal; full-overwrite `setDoc` race risk; math quest gets no AI starting-level injection in prompt; `applySnapshotSuggestions` ignores mastery gates (lines 201-205).
- **G13, G14, G15** — `workingLevels` not written if <5 questions answered; cumulative XP doc written twice per session; hours not logged if <5 min active (lines 374-376).
- **G17, G18** — `stableCeiling` not persisted (debug/analytics blind); AI prompt has no per-question history from prior session (lines 547-548).
- **G21, G22, G23, G24** — disposition lacks quest performance metrics; quest hours have no UI callout in Records; portfolio has zero quest visibility; compliance exports exclude session-level quest data (lines 677-680).
- **G26** — math working levels not derived from guided evaluation (TODO at `EvaluateChatPage.tsx:579`, line 770).
- **G28** — hours logged on eval complete, not on apply (line 772).
- **G33, G34** — curriculum view has no eval skip guidance display; "Accept & advance" doesn't call `autoCompleteBypassedItems` (lines 1034-1035).
- **G38** — no Cloud Function trigger on scan writes; failed `syncScanToConfig`/`updateMathWorkingLevel` silently swallowed (line 1038).
- **G42** — no engagement or disposition signal in quest prompt (lines 1150-1154).
- **Methodology backlog M1-M5** (EVALUATION_METHODOLOGY §7, lines 188-194): production assessment (voice/oral); cadence guidance; disposition measurement depth (time-per-question, retry willingness); adaptive sophistication (per-sub-skill level instead of one-per-domain); cross-domain connection.
- **KNOWLEDGE_MINE remaining:** P0-2 Level 1 frustration trap; P1-1 comprehension/math level cap; P1-2 stale "Levels 1-6" UI text; P1-4 phonics L9-10 domain mismatch; P1-5 duplicate starting-level logic; P2-1..P2-6 (lines 587-609).
- **Phantom-write tier (LEARNING_ENGINE_AUDIT §Where does data go to die, lines 1248-1250):** `dispositionCache` + `dispositionOverrides` written by DispositionProfile but read by no CF; scan `parentOverride` written on Accept & advance but read by no AI loader; `masteryGate` written but functionally dead per G4/G5/G6.
- **FINDINGS_PIPELINE §Known Limitations + "Does NOT do" checklist (lines 130-166):** `recentEval` still `limit(1)` for non-quest tasks; practice-story loop doesn't close (reading a generated book produces no findings); scan-derived findings bypass `evaluationSessions` and never reach `recentEval` slice; no finding expiry/re-test schedule; math working-level derivation from eval findings still TODO.

### Discrepancies between existing audits and code shipped since
- **"May 13 fixes" framing in this audit's prompt vs source dates.** The prompt asks whether the "May 13 fixes" fire, but every R1-R6 entry in LEARNING_ENGINE_AUDIT carries Apr 16-21 dates (lines 1270, 1276, 1290, 1302) and MASTER_OUTLINE confirms the same landing dates (lines 169-181). No "May 13" landing entry exists in either doc as of 2026-05-16. **Discrepancy date: 2026-05-16** — Chunk 1 must verify whether additional fixes shipped on/around May 13 that weren't documented, or whether the prompt's date is approximate.
- **`conceptualBlocks` lifecycle: methodology says "no lifecycle" vs Phase 1 ships full lifecycle (same doc).** EVALUATION_METHODOLOGY §2 "Current State Assessment" (lines 32-34) states flatly "No lifecycle. There is no `resolved`, no `status` beyond ADDRESS_NOW/DEFER..." — but §3 "Landed 2026-04-21" (lines 70-78) and MASTER_OUTLINE line 181 confirm RESOLVING/RESOLVED states + merge helper shipped. The §2 "Current State" snapshot is now stale within its own document. **Discrepancy date: 2026-04-21.**
- **LEARNING_ENGINE_AUDIT data-flow table on `conceptualBlocks` write (line 1179) still says "overwritten not merged"** but Phase 1 shipped the merge fix on the same day (Apr 21, MASTER_OUTLINE line 181). The audit's data-flow table is the stale row. **Discrepancy date: 2026-04-21.**
- **FINDINGS_PIPELINE.md (Phase 1 ship date Apr 21) still describes pattern-analysis as the only writer (line 117-119) and lists conceptualBlocks under "What Pipeline Does NOT Do" implicitly** by not listing the four new writers. The doc was not refreshed when Phase 1 / Phase 2 shipped. **Discrepancy date: 2026-04-21.**
- **LEARNING_ENGINE_AUDIT §Coherence Verdict line 1244 says scan `recommendation` gap is FIXED but G36 elsewhere in the same doc** is marked as FIXED too — consistent — though the table at line 1186-1187 still describes `parentOverride` as "Not read by any AI loader or CF" while R5 (line 1294) claims `effectiveRecommendation` respects `parentOverride`. Need to verify whether `parentOverride` is read by `loadRecentScansContext` directly or only via the derived `effectiveRecommendation` field. **Discrepancy date: 2026-04-21** — flagged for Chunk 3 verification.
- **KNOWLEDGE_MINE_AUDIT P0-1 ("Back to mine" confirmation) marked "Fixed: Resume now restores full state"** (line 586) — but the prompt for the fix was "add confirmation dialog," and the actual fix described is for *resume*, not *confirmation*. The original UX hazard (accidental tap mid-quest) may not be addressed — only the regression on Continue. **Discrepancy date: KNOWLEDGE_MINE_AUDIT P0-1, unverified post-fix** — flagged for Chunk 4.

## Chunk 1 — R1-R6 Verification

R1-R6 shipped Apr 16-21, 2026 (per LEARNING_ENGINE_AUDIT_2026-04.md:1270, 1276, 1290, 1302 and MASTER_OUTLINE.md:169-181). As of 2026-05-16, that is ~25-30 days in production. Each fix below is traced end-to-end: write → context slice → handler → prompt template → behavioral signature.

### R1 — workingLevels fed to quest CF
- Write source: `src/features/quest/useQuestSession.ts:915-941` (`computeWorkingLevelFromSession` → `setDoc(snapshotRef, ..., { merge: true })`); also `src/features/evaluate/EvaluateChatPage.tsx:605`; also `src/core/hooks/useScanToActivityConfig.ts:175-203` (`updateWorkingLevelFromScan` → `updateDoc`).
- Context slice that loads it: `functions/src/ai/contextSlices.ts:847,884-893` (`loadSkillSnapshotContext` formats `workingLevels` into `SKILL SNAPSHOT` text as `- Phonics: Level 5 (source: quest, May 10 — evidence)`).
- Quest task handler that receives it: `functions/src/ai/tasks/quest.ts:60-66,131-135` (reads `snapshotData.workingLevels[modeKey]` → caps at `QUEST_MODE_LEVEL_CAP` → passes as `suggestedStartLevel`).
- Prompt template line where workingLevels appears in the AI input: `functions/src/ai/chat.ts:1228-1239` (phonics: `STARTING LEVEL: This child has demonstrated mastery through Level N ...`); `functions/src/ai/chat.ts:803-814` (comprehension: `STARTING LEVEL: Start the quest at Level N`); **`functions/src/ai/chat.ts:1474-1500` (math: MISSING — `buildQuestPrompt`'s math branch never references `startingLevel` argument; the parameter is silently dropped, see G10 line 204).**
- Behavioral signature: A child whose `workingLevels.phonics = 6` should see the quest open at Level 6 on the tablet AND see Level-6-appropriate questions on Q1 (no warm-up at Level 2). For math, only the implicit skill-snapshot text carries the signal — the prompt has no explicit `STARTING LEVEL` directive.

Verdict: **PARTIAL** — phonics + comprehension are fully wired; math relies on the AI inferring the level from the skill-snapshot text without an explicit directive (G10 still open).

### R2 — Per-domain recentEval depth > 1
- Write source: `src/features/quest/useQuestSession.ts:786` (full session record to `evaluationSessions/{docId}` with `domain`, `status: 'complete'`, `evaluatedAt`); `src/features/evaluate/EvaluateChatPage.tsx:273-279` (guided eval same).
- Context slice that loads it: `functions/src/ai/chatTypes.ts:231-314` (`loadRecentEvalHistoryByDomain` — per-domain queries depth 3, defaults to all four domains; respects `filterDomain`).
- Quest task handler that receives it: `functions/src/ai/tasks/quest.ts:39-44` (sets `evalDomain = questMode ?? 'phonics'` and passes as `ctx.domain` to `buildContextForTask`); `functions/src/ai/contextSlices.ts:364-371` (`buildContextForTask` passes `ctx.domain` as `filterDomain`).
- Prompt template line where workingLevels appears in the AI input: `functions/src/ai/contextSlices.ts:567-571` (`formatEvalHistoryByDomain` emits `Recent Phonics history (last N sessions): - May 10 (quest, L5): 4/6 correct, ended at L5` and includes first session's findings); injected via `buildContextForTask` return.
- Behavioral signature: A phonics quest after three prior phonics sessions should see the AI avoid retesting already-mastered sub-skills cited in findings and reference observable trends ("Lincoln has hit ceiling at Level 5 twice").

Verdict: **WIRED**.

### R3 — Disposition wired to shared context slices
- Write source: Disposition consumes — no new writes needed. Reads existing `evaluationSessions`, `skillSnapshots/{childId}`, `children/{childId}/wordProgress`.
- Context slice that loads it: `functions/src/ai/contextSlices.ts:60-63` (`disposition` TASK_CONTEXT: `charter`, `childProfile`, `engagement`, `gradeResults`, `recentHistoryByDomain`, `skillSnapshot`, `wordMastery`).
- Quest task handler that receives it: `functions/src/ai/tasks/disposition.ts:262-269` (handler calls `buildContextForTask('disposition', ...)` and assembles `familyContext` from sections).
- Prompt template line where workingLevels appears in the AI input: `functions/src/ai/tasks/disposition.ts:302` ("Use evaluation history to cite specific evidence — e.g. 'got 4/6 correct at Level 5 in phonics quest on Apr 8' ... Reference working levels and level progression across sessions"); `:313-317` (USE THE STRUCTURED DATA PROVIDED block names `Evaluation History by Domain`, `Skill Snapshot`, `Word Mastery`); `:351` ("cite actual data from evaluations, quest sessions, and skill snapshots ... Name dates, levels, scores, and domain").
- Behavioral signature: Disposition narrative output should cite specific session dates, numeric levels, and per-domain scores rather than only generic engagement phrases ("Lincoln moved from Phonics Level 3 to Level 5 across the Apr 8 and Apr 15 sessions" instead of "Lincoln is engaged with reading").

Verdict: **WIRED**.

### R4 — setDoc data-loss fix in eval Apply
- Write source: `src/features/evaluate/EvaluateChatPage.tsx:605` (`setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)), { merge: true })`); `src/features/quest/useQuestSession.ts:941` (same); `src/features/settings/backfillWorkingLevels.ts:235` (same).
- Context slice that loads it: N/A — write-side fix. The downstream consumer is `loadSkillSnapshotContext` at `functions/src/ai/contextSlices.ts:780+`, which now sees fields that previously would have been erased (`completedPrograms`, `workingLevels` written by concurrent quest, `createdAt`, etc.).
- Quest task handler that receives it: `functions/src/ai/tasks/quest.ts:60` (consumes `snapshotData.workingLevels` — would have been `undefined` after a concurrent eval Apply under the old code).
- Prompt template line where workingLevels appears in the AI input: `functions/src/ai/contextSlices.ts:884-893` (workingLevels formatted into SKILL SNAPSHOT block) + `:896-904` (completedPrograms block) — both fields now survive eval Apply.
- Behavioral signature: After eval Apply runs concurrently with a quest endSession, the next quest's prompt should still contain the eval's `workingLevels` AND the quest's `completedPrograms` and `prioritySkills`. Under the pre-fix bug, fields not rebuilt by `handleSaveAndApply` would silently disappear.

Verdict: **WIRED**.

### R5 — Scan recommendations + non-math scan → workingLevels
- Write source: scan recommendation field — `src/core/hooks/useScan.ts:135` (writes `scans/{id}` with `results.recommendation`); parent override — `src/features/today/TodayPage.tsx:704` (`scans/{id}.parentOverride`). Non-math workingLevels — `src/core/hooks/useScanToActivityConfig.ts:159-167,175-203` (calls `derivePhonicsWorkingLevelFromScan` / `deriveReadingWorkingLevelFromScan` then `updateDoc(snapshotRef, { workingLevels: merged })`).
- Context slice that loads it: `functions/src/ai/contextSlices.ts:1058-1130` (`loadRecentScansContext` extracts `recommendation`, `effectiveRecommendation` via `getEffectiveRec` which respects `parentOverride.recommendation`, `subject`, `pageType`, `hasParentOverride`). `recentScans` added to quest TASK_CONTEXT at line 55 and plan/shellyChat at line 50/68. For non-math workingLevels: read path is the same as R1 — `quest.ts:60` reads `snapshotData.workingLevels[modeKey]`.
- Quest task handler that receives it: `functions/src/ai/tasks/quest.ts:41-44` (loads `recentScans` via `buildContextForTask`); also detects `hasRecentScans` at `:202-204` for the Phase-2 reinforcement section.
- Prompt template line where workingLevels appears in the AI input: `functions/src/ai/contextSlices.ts:1135-1164` (`RECENT WORKBOOK SCANS` block with `- workbook: lesson/page N, subject (topics) on DATE — recommendation: skip` plus `SCAN RECOMMENDATION SUMMARY` and usage guidance "'skip' = child has mastered this content, advance past it"); `functions/src/ai/chat.ts:1185-1198` (`buildRecentCurriculumSection` injected into quest prompt when `hasRecentScans` is true).
- Behavioral signature: Three consecutive `skip` scans on GATB phonics lessons should (a) appear in the planner prompt as `SCAN RECOMMENDATION SUMMARY: 3 scan(s) recommended SKIP`, (b) bump `workingLevels.phonics` upward via `derivePhonicsWorkingLevelFromScan` so the next phonics quest starts at the advanced level, and (c) appear as the `RECENT CURRICULUM` reinforcement hint in the quest prompt.

Verdict: **WIRED**.

### R6 — shellyChat wired to adaptive context
- Write source: All upstream writes already exist (skillSnapshot, evaluationSessions, scans, days, dadLabReports collections).
- Context slice that loads it: `functions/src/ai/contextSlices.ts:65-70` (shellyChat TASK_CONTEXT adds `skillSnapshot`, `recentHistoryByDomain`, `recentScans`, `dayToday`, `dadLabReports` on top of the prior nine). New loaders: `loadTodayDayLogContext` at `:1188`, `loadRecentDadLabReportsContext` at `:1282`. Note: `recentHistoryByDomain` is invoked with no `filterDomain` since shellyChat is cross-domain (line 367-369 reads `ctx.domain`, which shellyChat does not pass).
- Quest task handler that receives it: `functions/src/ai/tasks/shellyChat.ts:28-35` (calls `buildContextForTask('shellyChat', ...)` and stitches into `sharedContext`); supplemental queries at `:37+` preserved.
- Prompt template line where workingLevels appears in the AI input: `functions/src/ai/contextSlices.ts:884-893` (workingLevels in SKILL SNAPSHOT block reaches shellyChat); `:567-571` (recentHistoryByDomain text); `:616-624` (`dayToday` and `dadLabReports` sections appended). System prompt "you DO have access to records" claim in `shellyChat.ts:239-277` is now backed by the data.
- Behavioral signature: Asking "what level is Lincoln at in phonics?" should produce a specific numeric answer with source/date ("Level 5, set by quest on May 10"); asking "what's on Lincoln's plan today?" should describe completed/remaining checklist items; asking "should we skip the next math lesson?" should reference recent scan recommendations.

Verdict: **WIRED**.

---

**5 WIRED, 1 PARTIAL, 0 PHANTOM out of 6.**

Notable: R1's PARTIAL is the math-quest prompt branch at `chat.ts:1474-1500` silently dropping the `startingLevel` argument. WorkingLevels does reach math quests via the skill-snapshot text body, but the explicit `STARTING LEVEL:` directive that phonics and comprehension receive is absent for math. This is the pre-existing G10 gap, never closed — R1's "AI prompt's STARTING LEVEL directive reflects the same value the client uses" claim (LEARNING_ENGINE_AUDIT line 549) is true only for two of the three quest modes.

## Chunk 2 — Closed-Loop Journey Traces

Three end-to-end traces. Each step is a file:line citation or a GAP marker.

### Journey A — Lincoln misses two short-i words in a quest

1. Quest UI captures the wrong answer at: `src/features/quest/ReadingQuest.tsx:833` (`onAnswer(option)` on option tap) → `src/features/quest/useQuestSession.ts:1108-1130` (`submitAnswer` callback builds `SessionQuestion` with `correct`, `childAnswer`, `targetedBlockerId`).
2. The session document is updated with the answer at: `src/features/quest/useQuestSession.ts:1132-1133` (`setAnsweredQuestions([...answeredQuestions, sessionQ])` in local state); persisted to Firestore at `:805-806` (`setDoc(ref, JSON.parse(JSON.stringify(session)))` to `evaluationSessions/{docId}` on `endSession` — session-level write, not per-answer).
3. `computeWorkingLevelFromSession` reads the session and produces a level at: `src/features/quest/useQuestSession.ts:915-917` (called inside `endSession` snapshot-update block).
4. `workingLevels.phonics` is written to skillSnapshot at: `src/features/quest/useQuestSession.ts:919-927` (merges via `canOverwriteWorkingLevel` guard) → `:941` (`setDoc(snapshotRef, ..., { merge: true })`).
5. `conceptualBlocks` is updated with the short-i pattern at: `src/features/quest/useQuestSession.ts:943-965` (`detectBlockersFromSession(questions, questMode, { sessionId })` at `:945` → `mergeBlock` at `:949` → `updateBlockerLifecycle(merged, sessionEvidenceFromQuestions(questions))` at `:953-954` → `updateDoc(snapshotRef, { conceptualBlocks })` at `:961-964`). Detection rule (`detectBlockers.ts`, per methodology Phase 1): "2+ wrong at the same sub-skill in a ≥5-question session" — so two short-i misses fire only if both are tagged the same `skill` value by the AI, in a session with ≥5 total questions. **GAP — partial:** if Lincoln misses two short-i words in a 3-question session that times out early, no block is detected (`detectBlockers.ts` enforces the ≥5 floor); fluency mode is also skipped.
6. Next quest reads workingLevels at: `src/features/quest/useQuestSession.ts:421-427` (loads snapshot doc) → `:491` (`computeStartLevel(snapshot, questMode, curriculumHint)`); client-side computation at `src/features/quest/workingLevels.ts:44-53`. Server-side: `functions/src/ai/tasks/quest.ts:60-66` (`snapshotData.workingLevels[modeKey]`).
7. AI prompt uses the new level in question selection at: `functions/src/ai/tasks/quest.ts:208-212` (passes `suggestedStartLevel` to `buildQuestPrompt`) → `functions/src/ai/chat.ts:1228-1239` (phonics `STARTING LEVEL` block injected). The new `conceptualBlocks` flow into the prompt via `functions/src/ai/tasks/quest.ts:183-197` (filter to ADDRESS_NOW + RESOLVING) → `functions/src/ai/chat.ts:1207-1214` (`buildKnownBlockersSection` injected before RESPONSE FORMAT).
8. Observable behavior the next session: The next phonics quest opens at the same or lower level (depending on how the two misses interacted with the adaptive engine) AND includes 1-2 deliberate short-i probe questions tagged with `targetedBlockerId` matching the slugified short-i block id; correct answers on those probes are weighted ×2 toward RESOLVING (Phase 2 — `TARGETED_EVIDENCE_WEIGHT`).

Verdict: **ADAPTS** — the loop closes end-to-end for phonics (and comprehension). The only soft gap is the ≥5-question floor in `detectBlockersFromSession`, which is intentional per methodology but means short timeout sessions don't produce blocks.

### Journey B — Shelly Applies a guided evaluation

1. `<complete>` block parsed at: `src/features/evaluate/EvaluateChatPage.tsx:97` (`/<complete>([\s\S]*?)<\/complete>/g` regex inside the message handler).
2. Findings extracted and stored at: `src/features/evaluate/EvaluateChatPage.tsx:64-78` (`extractFindings` scans `<finding>` tags); stored in local `findings` state via `:381` and `:456` (receive + send flows); session-level persist to `evaluationSessions` at `:273-279`.
3. Apply button handler at: `src/features/evaluate/EvaluateChatPage.tsx:492` (`handleSaveAndApply` definition); button wires at `:1086`.
4. `workingLevels.phonics` written at: `src/features/evaluate/EvaluateChatPage.tsx:567-571` (`deriveWorkingLevelFromEvaluation(findings, 'phonics')` → merged with `canOverwriteWorkingLevel` guard) → `:601` packed into `updated.workingLevels` → `:605` `setDoc(snapshotRef, ..., { merge: true })` (R4 fix confirmed: `{ merge: true }` present on line 605, not a wholesale overwrite).
5. `workingLevels.comprehension` written at: `src/features/evaluate/EvaluateChatPage.tsx:572-576` (same pattern, `'comprehension'` mode key).
6. `workingLevels.math` written at: **GAP** — `src/features/evaluate/EvaluateChatPage.tsx:578-581` is a stub: `if (domain === 'math') { // TODO: Add math skill→level mapping when math evaluations produce findings }`. G26 confirmed still open; no math working level is derived from guided evaluation findings. (Math working level is updated only by quest sessions and math scans.)
7. `conceptualBlocks` written at: `src/features/evaluate/EvaluateChatPage.tsx:585-592` (loop merges each block via `mergeBlock`) → `:607-612` (`updateDoc(snapshotRef, { conceptualBlocks, blocksUpdatedAt })`). Pattern detection runs separately via `triggerPatternAnalysis` at `:324`. Note: the apply path uses `updateDoc` for blocks (not `setDoc merge`), so blocks from quest/scan/parent writers survive.
8. Next planner generation reads findings at: `functions/src/ai/contextSlices.ts:361-362` (planner has `recentEval` slice — cross-domain `limit(1)`, still uses legacy loader); `loadRecentEvalContext` at `functions/src/ai/chatTypes.ts:333+` (audit calls this "deprecated, prefer loadRecentEvalHistoryByDomain"). Planner's `skillSnapshot` slice at `contextSlices.ts:50,780+` also surfaces the merged `prioritySkills`, `supports`, `stopRules`, `workingLevels`.
9. Next quest reads workingLevels at: `functions/src/ai/tasks/quest.ts:60-66` (same R1 read path as Journey A step 6).
10. Disposition generation cites findings at: `functions/src/ai/contextSlices.ts:60-63` (disposition TASK_CONTEXT has `recentHistoryByDomain` + `skillSnapshot` + `wordMastery`) → `functions/src/ai/tasks/disposition.ts:262-269` (`buildContextForTask('disposition', ...)`) → prompt text references at `:302,313-317,351` (R3 wiring confirmed).
11. Observable behavior on next plan/quest: Next phonics quest opens at the eval-derived level (e.g. Level 5 if findings showed mastery of CVCe). Next planner output reflects new ADDRESS_NOW blocks as targeted activities and skips skills marked `Secure`. Disposition narrative cites specific eval findings ("In yesterday's reading evaluation, Lincoln mastered short-a words..."). Math quest still opens at quest-derived level only (G26 — eval doesn't move math).

Verdict: **PARTIAL** — phonics and comprehension fully close the loop (R1+R4+R3 wired); math is GAP at step 6 (G26 stub TODO). Three of three downstream consumers (planner, quest, disposition) read the writes.

### Journey C — Shelly scans a math worksheet

1. Scan upload at: `src/core/hooks/useScan.ts:59-83` (`scan` callback compresses image at `:67-71`, uploads to Storage at `:80-82`).
2. Cloud Function analyzes scan at: `src/core/hooks/useScan.ts:92-102` (client posts via `chat({ taskType: TaskType.Scan, messages })`) → server: `functions/src/ai/tasks/scan.ts:129+` (`handleScan` parses image base64 + calls Claude); dispatched via `functions/src/ai/tasks/index.ts:30` and `functions/src/ai/chat.ts:69`.
3. Scan recommendations written at: `src/core/hooks/useScan.ts:125-143` (record built with `results.recommendation`, `action: 'pending'` → `addDoc(scansCollection, ...)` at `:135-143`). Parent override path: `src/features/today/TodayPage.tsx:704` (handleAcceptSkip writes `scans/{id}.parentOverride`).
4. `syncScanToConfig` fires at: `src/features/today/useUnifiedCapture.ts:95` (call site) → `src/features/today/TodayPage.tsx:560` (alternative call site) → `src/core/hooks/useScanToActivityConfig.ts:62-86` (UPDATE existing config — bumps `currentPosition` at `:67-69`) → `:96-125` (CREATE new config if no match). Both branches end with `void updateWorkingLevelFromScan(...)` at `:86` and `:125`.
5. `workingLevels.math` updated from scan at: `src/core/hooks/useScanToActivityConfig.ts:144-153` (`deriveLevelForSubject` switch — `SubjectBucket.Math → deriveMathWorkingLevelFromScan(lessonNumber, curriculumName)`) → `:175-203` (`updateWorkingLevelFromScan` reads existing snapshot, `canOverwriteWorkingLevel` guard at `:193`, writes via `updateDoc` at `:196-199`). For non-math: `:154-169` (Reading bucket → phonics or comprehension; LA bucket → phonics). R5 confirmed wired for all three subjects.
6. Planner reads scan recommendations at: `functions/src/ai/contextSlices.ts:50,391` (planner TASK_CONTEXT includes `recentScans`; loader registered) → `:1058-1130` (`loadRecentScansContext` extracts `recommendation` + `effectiveRecommendation` via `getEffectiveRec` at `:1072-1078`, plus `parentOverride` precedence at `:1076`) → `:1135-1164` (`RECENT WORKBOOK SCANS` block + `SCAN RECOMMENDATION SUMMARY` + usage guidance injected into prompt).
7. Quest task receives scan recommendations at: `functions/src/ai/contextSlices.ts:55` (quest TASK_CONTEXT includes `recentScans`) → `functions/src/ai/tasks/quest.ts:202-204` (`hasRecentScans = sections.some(s => s.includes('RECENT WORKBOOK SCANS'))`) → `:208-212` (passed into `buildQuestPrompt` extras) → `functions/src/ai/chat.ts:1185-1198` (`buildRecentCurriculumSection` injects "RECENT CURRICULUM — consider 1-2 reinforcement questions" when true).
8. Observable behavior on next plan/quest: A math scan on GATB Lesson 27 with `recommendation: 'skip'` (a) advances `activityConfigs.{mathConfigId}.currentPosition` to 27, (b) bumps `workingLevels.math` to the corresponding mapped level via `deriveMathWorkingLevelFromScan`, (c) makes the next planner prompt include "1 scan recommended SKIP — child may be ahead of this material," and (d) the next math quest sees `RECENT CURRICULUM` reinforcement hint plus a higher starting level **in the SKILL SNAPSHOT text** — but **not** an explicit `STARTING LEVEL:` directive (R1's math gap, see Chunk 1).

Verdict: **ADAPTS** — full chain present for math scans. The R1 math-prompt PARTIAL from Chunk 1 is the only soft spot: the math working level reaches the prompt as text, but without the same directive emphasis phonics gets.

---

**2 journeys ADAPT, 1 PARTIAL, 0 PHANTOM out of 3.**

Journey B is PARTIAL because of the G26 math-working-level-from-eval stub at `EvaluateChatPage.tsx:578-581`. Guided evaluations are a write-source for phonics and comprehension working levels but not for math — a Shelly-conducted math evaluation produces findings that flow to `evaluationSessions`, `skillSnapshot.prioritySkills`, and `childSkillMaps`, but does NOT move `workingLevels.math`. The next math quest's starting level depends entirely on prior quest sessions or math curriculum scans.
