# Working Levels & Evaluation Hours Inspection

**Date:** 2026-04-09 (investigation), 2026-04-14 (written)
**Status:** READ-ONLY investigation. No code changes.

---

## Investigation 1 -- Is workingLevels actually firing in production?

### A -- Git History

| Commit | Date | Message |
|--------|------|---------|
| `19ea414` | 2026-04-09 | `feat: add workingLevels data model for Knowledge Mine progression` |
| `a375b0e` | 2026-04-09 04:41 UTC | `feat: add workingLevels read/write paths for quest sessions` |
| `37f272c` | 2026-04-09 04:41 UTC | `feat: wire evaluation and curriculum scan write paths to workingLevels` |
| `c30c1ea` | 2026-04-09 | `Merge pull request #970` (merged to `main`) |

- **Created:** 2026-04-09 as part of PR #970.
- **Last modified:** 2026-04-09 (only touched in the initial implementation).
- **Branch:** `barnes-ngb/claude/workinglevels-data-model-rEueB`, merged to `main`.
- **On main:** Yes. No separate `deploy` branch exists in this repo -- `main` IS production.

**Verdict:** Code has been on production since April 9. It is relatively new (5 days old at time of investigation).

---

### B -- Read Path Verification (Quest Starting Level)

**File:** `src/features/quest/useQuestSession.ts`

The `startQuest` function (line 392) does the following:

1. **Line 404:** Loads `skillSnapshot` from Firestore via `getDoc(doc(skillSnapshotsCollection(familyId), activeChildId))` -- this is a real Firestore read, not a placeholder.

2. **Line 406-408:** If the snapshot exists, it's assigned to `snapshot` (typed as `Partial<SkillSnapshot>`).

3. **Line 472:** Calls `computeStartLevel(snapshot, questMode, curriculumHint)` with the actual snapshot.

**Data flow is correct.** `computeStartLevel` (workingLevels.ts:44) reads `snapshot?.workingLevels?.[modeKey]` and uses it as the authoritative starting level. The fallback chain is:
1. `workingLevels[questMode].level` (if present)
2. `curriculumHint.level` (from activityConfigs, reading domain only)
3. Default = 2

**HOWEVER:** There is a critical nuance. The `curriculumHint` fallback (lines 414-469) only runs for `domain === 'reading'`. For math quests, if `workingLevels.math` is empty, the start level is always 2. This is by design but worth noting.

**Error handling:** Line 409-411 catches snapshot load failures with `console.warn` and continues with `snapshot = null`, falling back to default level 2. This means a Firestore permissions error or network issue would silently start at level 2.

---

### C -- Write Path Verification (Quest Session End)

**File:** `src/features/quest/useQuestSession.ts`, lines 870-900

After `endSession` completes:

1. **Line 831:** Loads fresh `skillSnapshot` from Firestore.
2. **Line 870-872:** Calls `computeWorkingLevelFromSession(questions, finalState.currentLevel, questMode)` with actual session data.
3. **Line 876:** Guards: only updates if `newWorkingLevel` is non-null AND `questMode` is defined AND `questMode !== 'fluency'`.
4. **Line 878-881:** Checks `canOverwriteWorkingLevel(currentLevel)` -- respects 48hr manual override window.
5. **Line 892:** Includes `workingLevels: mergedWorkingLevels` in the updated snapshot.
6. **Line 896:** Writes via `setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)))`.

**The write path is correctly wired.** The `setDoc` uses the full snapshot object (not a merge), which means it overwrites the entire document -- this is the pattern used throughout the codebase.

**Error handling:** Line 897-900 catches write failures with `console.warn` ("Don't block session save if snapshot update fails"). This means a Firestore write failure would be **silently swallowed** -- the quest session would save successfully but the working level would not update. No retry logic, no user notification.

**Potential issue:** `computeWorkingLevelFromSession` returns `null` if fewer than 5 questions were answered (line 94 of workingLevels.ts). Short sessions (e.g., abandoned early, or Lincoln getting frustrated and stopping) produce no working level update. This is intentional but could mean the working level never gets set if Lincoln's sessions are consistently short.

---

### D -- Evaluation Write Path

**File:** `src/features/evaluate/EvaluateChatPage.tsx`, lines 452-588

The `handleSaveAndApply` callback (triggered by "Apply to Skill Snapshot" button at line 1031):

1. **Line 525:** Initializes `mergedWorkingLevels` from existing snapshot.
2. **Lines 526-537:** For `domain === 'reading'`:
   - **Line 528:** Calls `deriveWorkingLevelFromEvaluation(findings, 'phonics')`
   - **Line 529:** Checks `canOverwriteWorkingLevel` before writing
   - **Line 533:** Calls `deriveWorkingLevelFromEvaluation(findings, 'comprehension')`
   - **Line 534:** Same override protection
3. **Lines 539-541:** For `domain === 'math'`: **TODO comment only** -- `// TODO: Add math skill->level mapping when math evaluations produce findings`. Math evaluations do NOT update workingLevels.
4. **Line 550:** Includes `workingLevels: mergedWorkingLevels` in the updated snapshot.
5. **Line 559:** Writes via `setDoc`.

**The evaluation write path IS wired for reading domain.** But there's a critical dependency:

**Will `deriveWorkingLevelFromEvaluation` ever return non-null in practice?**

The function (workingLevels.ts:196) matches finding skill names against `PHONICS_SKILL_LEVEL_MAP` keys using `skillLower.includes(key)`. The evaluation prompt (functions/src/ai/chat.ts:575-576) instructs AI to output findings like:
- `"skill": "phonics.cvc.short-a"` -- matches `cvc` -> level 2
- `"skill": "phonics.cvce"` -- matches `cvce` -> level 5
- `"skill": "phonics.vowel-team"` -- matches `vowel-team` -> level 6
- `"skill": "phonics.letter-sounds.consonants"` -- matches `letter-sounds` -> level 1

**These should match.** The `includes` check is intentionally fuzzy to handle the dotted skill naming convention. The mapping should produce correct levels for most AI-generated findings.

**However:** The derivation ONLY considers `mastered` findings. If Lincoln's evaluation shows all skills as `emerging` or `not-yet`, `deriveWorkingLevelFromEvaluation` returns `null` and workingLevels is NOT updated from the evaluation. This is by design but has the consequence that a below-level evaluation does not lower the working level.

**No integration test exists.** The test file `workingLevels.test.ts` (388 lines) thoroughly tests the pure helper functions but does NOT test the Firestore wiring in `EvaluateChatPage.tsx` or `useQuestSession.ts`. There are no mock-Firestore integration tests for the write paths.

---

### E -- Math Scan Write Path

**File:** `src/core/hooks/useScanToActivityConfig.ts`, lines 80-83 and 121-124

The `syncScanToConfig` function fires `updateMathWorkingLevel` in two places:
1. **Line 82:** When updating an existing activity config (if `subject === SubjectBucket.Math`)
2. **Line 123:** When creating a new activity config

`updateMathWorkingLevel` (lines 139-166):
1. **Line 146:** Calls `deriveMathWorkingLevelFromScan(lessonNumber, curriculumName)`
2. **Line 149-151:** Loads existing skillSnapshot
3. **Line 155-156:** Checks `canOverwriteWorkingLevel(currentMath)` -- respects manual override
4. **Line 159:** Writes via `updateDoc` (partial update, not full `setDoc`)

**This path IS correctly wired.** However, it only fires when Nathan/Shelly scans a math worksheet. The lesson-to-level mapping (workingLevels.ts:250-279) maps GATB Math lessons to levels 1-6.

**Note:** This uses `updateDoc` (partial update) while the quest and evaluation paths use `setDoc` (full overwrite). This inconsistency is safe for the `workingLevels` field but worth noting -- if quest/eval `setDoc` runs after a scan `updateDoc`, it would preserve the math level because it reads the full snapshot first.

---

### F -- Live Firestore Check

**Cannot verify directly from code.** Nathan needs to check Lincoln's `skillSnapshot` document in Firestore console at:

```
families/{familyId}/skillSnapshots/{lincolnChildId}
```

Look for:
- Does `workingLevels` field exist?
- If yes, which modes are populated? (`phonics`, `comprehension`, `math`)
- What are the `level`, `source`, `updatedAt`, and `evidence` values?

**If `workingLevels` is missing entirely:** The write paths are failing silently (the `console.warn` catch blocks would log errors but no user would see them).

**If `workingLevels` exists but levels are low:** The system is working as designed -- Lincoln's actual performance determines the level, and evaluations only update from `mastered` findings.

---

### Verdict: workingLevels

**Code is correctly wired end-to-end.** The implementation was merged to `main` on 2026-04-09. All three write paths (quest, evaluation, scan) and the read path (quest start level) are properly connected.

**But there are several reasons Lincoln's quest level might be lower than expected:**

1. **Recency:** The system is only 5 days old. If Lincoln hasn't run a quest session since April 9, there's been no opportunity for the quest write path to fire. The `workingLevels` field may not exist in Firestore yet.

2. **Minimum questions threshold:** `computeWorkingLevelFromSession` requires >= 5 answered questions. If Lincoln's sessions are short (frustration, abandonment), no level update occurs.

3. **Evaluation only counts mastered skills:** `deriveWorkingLevelFromEvaluation` ignores `emerging` and `not-yet` findings. If Lincoln's reading evaluation showed CVC as `emerging` (not `mastered`), the phonics working level would not be set from the evaluation. The evaluation would need explicit `mastered` findings with skill tags matching the PHONICS_SKILL_LEVEL_MAP keys.

4. **Shelly must tap "Apply to Skill Snapshot":** The evaluation working level only writes when `handleSaveAndApply` is called. If Shelly runs the evaluation but doesn't tap the button, nothing writes.

5. **Default is level 2:** Without a working level set, `computeStartLevel` defaults to level 2. If curriculumHint provides a higher level (from activityConfigs), that's used instead, but only for reading domain.

6. **Silent error swallowing:** Both quest (line 899) and evaluation (line 585) catch write errors with `console.warn`/`console.error`. If Firestore permissions or network issues prevent writes, there's no user-visible feedback.

**Most likely hypothesis for Lincoln's low level:** The workingLevels field does not yet exist in Firestore (system is new), so the quest starts at the default level 2, unless curriculumHint raises it. If Lincoln's activityConfigs don't indicate mastered skills, level 2 is the starting point regardless of what previous evaluations showed.

---

## Investigation 2 -- Evaluation Hours Gap

### A -- Does Evaluation Track Duration?

**No.** The `EvaluationSession` type (src/core/types/evaluation.ts:105-116) has these fields:

```ts
interface EvaluationSession {
  id?: string
  childId: string
  domain: EvaluationDomain
  status: 'in-progress' | 'complete' | 'resumed' | 'abandoned'
  messages: ChatMessage[]
  findings: EvaluationFinding[]
  recommendations: EvaluationRecommendation[]
  summary?: string
  evaluatedAt: string          // single timestamp, not start/end
  nextEvalDate?: string
}
```

There is **no `startedAt`, `endedAt`, or `durationMinutes` field**. The `evaluatedAt` field is a single ISO timestamp set when the session is persisted (EvaluateChatPage.tsx:267), not a duration.

By contrast, quest sessions DO track timing:
- `QuestState.startedAt` (questTypes.ts:74)
- `completedAt` (useQuestSession.ts:1017)

Evaluation sessions have **no timing data at all**.

### B -- Does Evaluation Write to Hours?

**No.** There is zero connection between evaluation sessions and the hours system.

Evidence:
- `EvaluateChatPage.tsx` does not import `hoursCollection`, `HoursEntry`, or any hours-related code (grep confirms: no matches).
- `computeHoursSummary` in `records.logic.ts` (lines 52-157) reads from exactly three sources:
  1. `HoursEntry` documents (manual entries, Dad Lab)
  2. `DayLog` blocks with `actualMinutes`
  3. `HoursAdjustment` documents
- None of these sources include evaluation sessions.
- Quest sessions also do NOT write hours entries (`src/features/quest` has zero references to hoursCollection).

**Evaluation time is entirely uncounted toward MO compliance hours.**

### C -- Manual Workaround

**Yes, Shelly could manually log evaluation time** via:
1. Adding a `HoursEntry` document (the Records page has manual hour entry)
2. Adding a `HoursAdjustment` document

But this requires Shelly to remember to do it after every evaluation session, know the duration, and categorize it correctly (Reading, LanguageArts, etc.). This is friction that defeats the "frictionless daily use" principle.

### Evaluation Hours Verdict

**Evaluation time is entirely uncounted.** No duration is tracked in the EvaluationSession schema, no hours entry is created, and no code path exists to flow evaluation time into the compliance hours system. A 20-40 minute evaluation session with Lincoln produces zero hours credit.

This also applies to Knowledge Mine (quest) sessions -- they track `startedAt`/`completedAt` but don't write hours entries either.

---

## Summary of Findings

| Item | Status | Evidence |
|------|--------|----------|
| workingLevels code exists | YES | `src/features/quest/workingLevels.ts`, merged 2026-04-09 |
| Quest read path wired | YES | `useQuestSession.ts:472` calls `computeStartLevel` with real Firestore data |
| Quest write path wired | YES | `useQuestSession.ts:870-896` computes and writes after session end |
| Evaluation write path wired | YES (reading only) | `EvaluateChatPage.tsx:525-550` derives and writes on "Apply to Skill Snapshot" |
| Math scan write path wired | YES | `useScanToActivityConfig.ts:82,123` fires `updateMathWorkingLevel` |
| Unit tests exist | YES | `workingLevels.test.ts` (388 lines, 22 test cases) |
| Integration tests exist | NO | No mock-Firestore tests for the wiring |
| Eval duration tracked | NO | `EvaluationSession` type has no start/end/duration fields |
| Eval hours counted | NO | Zero code path from evaluations to hours system |
| Quest hours counted | NO | Zero code path from quest sessions to hours system |

---

## Proposed Fixes (Not Implemented)

### Fix 1: Bootstrap workingLevels from existing data

Lincoln likely has evaluation findings already in Firestore from sessions before April 9. A one-time backfill script could:
- Read existing `evaluationSessions` for each child
- Run `deriveWorkingLevelFromEvaluation` on the most recent complete session's findings
- Write the resulting `workingLevels` to the skillSnapshot
- This would give Lincoln an immediate working level without waiting for a new quest/eval session

### Fix 2: Add duration tracking to EvaluationSession

Add `startedAt` and `completedAt` fields to the `EvaluationSession` type:
- Set `startedAt` when the session is first created/loaded (line 198)
- Set `completedAt` when status becomes `complete`
- Compute `durationMinutes` from the difference

### Fix 3: Auto-create hours entries from evaluation sessions

When `handleSaveAndApply` fires (or when status becomes `complete`):
- Compute duration from `startedAt`/`completedAt`
- Create a `HoursEntry` with `subjectBucket` based on the evaluation domain:
  - `reading` -> `Reading`
  - `math` -> `Math`
  - `speech` -> could map to `LanguageArts` or a new bucket
- Set `location` to `Home`
- Set `blockType` to `'evaluation'` or similar

### Fix 4: Auto-create hours entries from quest sessions

Quest sessions already track `startedAt` and `completedAt`. After session end:
- Compute `durationMinutes` from timestamps
- Create a `HoursEntry` with `subjectBucket` based on quest domain/mode
- This would capture the 5-15 minutes per quest session

### Fix 5: Add user-visible error reporting for workingLevels writes

Replace `console.warn` with a snackbar or toast when working level writes fail, so Shelly knows if something went wrong.

### Fix 6: Consider lowering the MIN_QUESTIONS_FOR_UPDATE threshold

Currently set to 5 (workingLevels.ts:77). If Lincoln's sessions average 4-5 questions before frustration, many sessions produce no level update. Consider lowering to 3, or adding a "session count" based approach (after N sessions at a level, even without 5 questions each, accumulate data).

### Priority Order

1. **Fix 1** (backfill) -- Immediate impact, no schema change
2. **Fix 2 + Fix 3** (eval hours) -- Captures 20-40 min/session of lost instructional time
3. **Fix 4** (quest hours) -- Captures additional 5-15 min/session
4. **Fix 5** (error visibility) -- Debugging aid
5. **Fix 6** (threshold) -- Needs discussion; lower threshold = noisier signal
