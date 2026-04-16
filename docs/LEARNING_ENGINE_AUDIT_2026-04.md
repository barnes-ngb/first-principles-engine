# Learning Engine Audit — April 2026

## Journey 1: Shelly Marks Mastery on Skill Snapshot

**Trace:** Shelly opens Progress > Skill Snapshot, changes a skill's level to "secure" (the closest UI action to "marks mastery").

---

### 1. What function handles the edit? File + line.

**`handleUpdateSkill`** at `src/features/evaluation/SkillSnapshotPage.tsx:150-158`.

```ts
const handleUpdateSkill = useCallback(
  (index: number, field: keyof PrioritySkill, value: string) => {
    if (!snapshot) return
    const updated = snapshot.prioritySkills.map((s, i) =>
      i === index ? { ...s, [field]: value } : s,
    )
    void persist({ ...snapshot, prioritySkills: updated })
  },
  [snapshot, persist],
)
```

The UI dropdown that triggers it is a `<TextField select>` at line 357-368, calling `handleUpdateSkill(index, 'level', e.target.value)` on change. The `level` field is a `SkillLevel` enum (`emerging | developing | supported | practice | secure`).

There is also **`handleQuickLevelUpdate`** at line 225-234, called from the `QuickCheckPanel` (`src/features/evaluation/QuickCheckPanel.tsx:83-89`), which provides a 1-tap level update shortcut. Both routes converge on the same `persist` function.

**Note:** The UI has **no direct `masteryGate` control**. The dropdown only sets `level`. The `masteryGate` field is only set explicitly to `MasteryGate.NotYet` when a new skill is added (line 145), or written by the quest session end flow (`useQuestSession.ts:890-917`). There is no way for Shelly to set `masteryGate` from the Skill Snapshot page.

---

### 2. What fields are written to Firestore?

**`persist`** at `src/features/evaluation/SkillSnapshotPage.tsx:111-124` calls `setDoc` (full overwrite, not merge):

```ts
await setDoc(snapshotRef, { ...updated, updatedAt: new Date().toISOString() })
```

**Collection path:** `families/{familyId}/skillSnapshots/{childId}`
(Collection helper at `src/core/firebase/firestore.ts:204-209`)

**Document shape** (type at `src/core/types/evaluation.ts:84-99`):

| Field | Type | Written on mastery edit? |
|---|---|---|
| `childId` | `string` | Yes (full doc overwrite) |
| `prioritySkills[]` | `PrioritySkill[]` | Yes — the edited skill's `level` changes |
| `prioritySkills[n].tag` | `SkillTag` | Unchanged |
| `prioritySkills[n].label` | `string` | Unchanged |
| `prioritySkills[n].level` | `SkillLevel` | **Changed** (e.g. to `'secure'`) |
| `prioritySkills[n].notes` | `string?` | Unchanged |
| `prioritySkills[n].masteryGate` | `MasteryGate?` | Unchanged (stays at previous value or undefined) |
| `supports[]` | `SupportDefault[]` | Yes (unchanged, re-persisted) |
| `stopRules[]` | `StopRule[]` | Yes (unchanged, re-persisted) |
| `evidenceDefinitions[]` | `EvidenceDefinition[]` | Yes (unchanged, re-persisted) |
| `conceptualBlocks[]` | `ConceptualBlock[]?` | Yes (unchanged, re-persisted) |
| `completedPrograms[]` | `string[]?` | Yes (unchanged, re-persisted) |
| `workingLevels` | `WorkingLevels?` | Yes (unchanged, re-persisted) |
| `updatedAt` | `string` | **Changed** (fresh ISO timestamp) |

---

### 3. Does this update workingLevels?

**No.** Changing a skill's `level` on the Skill Snapshot page does **not** write to `workingLevels`.

`workingLevels` is a separate field on the same document (type at `src/core/types/evaluation.ts:76-82`) that is only written by three code paths:

| Write path | File | Lines |
|---|---|---|
| Quest session end | `src/features/quest/useQuestSession.ts` | 894-907 |
| Evaluation derivation | `src/features/quest/workingLevels.ts` | 196-240 |
| Curriculum scan derivation | `src/features/quest/workingLevels.ts` | 250-280 |
| Backfill utility | `src/features/settings/backfillWorkingLevels.ts` | (one-time migration) |

**Gap:** Changing a skill to `secure` is a strong mastery signal from the parent, but it has zero effect on `workingLevels`. This means the parent's mastery judgment and the quest system's working level can diverge silently.

---

### 4. Does this affect the next quest's starting level?

**No, not directly.** The quest starting level is computed by `computeStartLevel()` at `src/features/quest/workingLevels.ts:44-72`, which reads **only** `workingLevels` (not `prioritySkills.level`):

```ts
const workingLevel = modeKey ? skillSnapshot?.workingLevels?.[modeKey] : undefined
if (workingLevel) {
  startLevel = workingLevel.level
}
```

Fallback chain: `workingLevels[mode]` > curriculum hint from `activityConfigs` > default (2).

Called from `useQuestSession.ts:477`:
```ts
const startLevel = computeStartLevel(snapshot, questMode, curriculumHint)
```

**However**, the skill snapshot data (including `prioritySkills` with the updated `level`) IS included in the AI context for quest question generation via `buildContextForTask("quest", ...)` (`functions/src/ai/contextSlices.ts:51`). The `loadSkillSnapshotContext` function formats skill levels into the prompt (line 676) and includes planning guidance: "Skills at 'Secure' level -> SKIP" (line 724). So the AI model generating quest questions **can see** the mastery signal and may adjust question content, but the **numeric starting level** is unaffected.

**Gap:** A skill marked `secure` does not bump `workingLevels`, so the quest can start at a level below what the parent considers mastered.

---

### 5. Does this inform AI question generation (contextSlices.ts)?

**Yes, and here's how.** The `skillSnapshot` context slice is included for three task types (`functions/src/ai/contextSlices.ts:41-62`):

| Task | Includes `skillSnapshot`? |
|---|---|
| `plan` | Yes (line 46) |
| `quest` | Yes (line 51) |
| `scan` | Yes (line 57) |
| All others | No |

The `loadSkillSnapshotContext` function (`functions/src/ai/contextSlices.ts:643-731`) formats priority skills as:
```
- {label} ({tag}): {level} — {notes}
```
(line 676)

And appends planning guidance (lines 721-729):
```
- Skills at 'Secure' level -> SKIP. Do not create activities for these.
- Skills at 'Emerging' -> include short daily practice (5-10 min)
```

**Note:** `masteryGate` is loaded (line 656) but **not formatted into the prompt text** — only `level` and `notes` appear. This means the AI sees `secure` but not the granular mastery gate evidence level.

Additionally, the `childProfile` slice (used by many more tasks including `disposition` and `shellyChat`) includes priority skills via `formatChildProfile()` (lines 255-280, called at line 313), formatting them as `- {label} ({tag}): {level}` — but without notes, mastery gate, or skip guidance.

---

### 6. Does this appear in Learning Profile disposition narrative?

**Indirectly, and weakly.** The disposition task context is `["charter", "childProfile", "engagement", "gradeResults"]` (`functions/src/ai/contextSlices.ts:56`). It does **not** include the `skillSnapshot` slice.

However, the `childProfile` slice IS included, and it injects `snapshotData.prioritySkills` into the prompt via `formatChildProfile()` (line 313-318). So the disposition AI sees:
```
Priority skills:
- {label} ({tag}): secure
```

But it does **not** see:
- The `masteryGate` field
- Stop rules (in the childProfile format)
- Conceptual blocks
- The "SKIP secure skills" planning guidance

The disposition task (`functions/src/ai/tasks/disposition.ts`) loads day logs, evaluation sessions, chapter responses, and lab reports to generate narratives. It focuses on engagement patterns and dispositions (curiosity, persistence, articulation, self-awareness, ownership) — not skill mastery levels.

**Gap:** A skill moving to `secure` is visible to the disposition AI only as a label in the child profile. There is no narrative prompt like "celebrate this mastery" or "note this progression." The disposition system cannot distinguish between a skill that was always `secure` and one that just changed.

---

### 7. Does this affect the planner's skip guidance?

**In theory yes, but the wiring is incomplete.**

The skip advisor logic exists at `src/features/planner-chat/skipAdvisor.logic.ts:23-82`. The `evaluateSkipEligibility()` function checks `masteryGate` on matched priority skills:

- `masteryGate === 3` (IndependentConsistent) -> `skip` (lines 42-52)
- `masteryGate === 2` (MostlyIndependent) -> `modify` (lines 55-65)
- `masteryGate <= 1` -> `keep` (lines 78-81)

A helper `getEffectiveMasteryGate()` (line 154-157) exists to fall back from `masteryGate` to `level` when `masteryGate` is undefined (`secure` -> gate 3, `practice` -> gate 2, etc.).

**Three gaps exist:**

1. **`evaluateSkipEligibility` does NOT call `getEffectiveMasteryGate`.** It checks `s.masteryGate` directly (lines 43, 56). If `masteryGate` is `undefined` (the common case when Shelly edits `level` via the UI, since the UI never writes `masteryGate`), the fallback conversion never fires and the skill is treated as `keep`. The helper function is defined but **dead code** in the evaluation path.

2. **The skip advisor is not wired into any UI component.** `batchEvaluateSkip` and `evaluateSkipEligibility` are only referenced in `skipAdvisor.logic.ts` and `skipAdvisor.logic.test.ts` — no `.tsx` file imports them. The logic is built and tested but not integrated into the `PlannerChatPage`.

3. **The AI-side skip guidance works independently.** The `loadSkillSnapshotContext` prompt text (contextSlices.ts:724) tells the AI "Skills at 'Secure' level -> SKIP" based on the `level` field. This IS informed by Shelly's edit and IS wired into the `plan` task. So the AI planner will see the secure level and may skip the skill in generated plans — but the client-side skip advisor badge/recommendation system is disconnected.

---

### Summary of Gaps

| # | Gap | Severity | Notes |
|---|---|---|---|
| G1 | Changing `level` to `secure` does not update `workingLevels` | Medium | Parent mastery judgment and quest progression diverge |
| G2 | Quest starting level ignores `prioritySkills.level` | Medium | Child may repeat mastered content at lower levels |
| G3 | `masteryGate` has no UI control on Skill Snapshot | Medium | Only quest sessions auto-set it; parent cannot express gate level |
| G4 | `evaluateSkipEligibility` checks raw `masteryGate`, ignoring `getEffectiveMasteryGate` fallback | High | `level: secure` with `masteryGate: undefined` = no skip recommendation |
| G5 | Skip advisor logic is not wired into PlannerChatPage UI | High | Logic + tests exist but no component imports them |
| G6 | `masteryGate` not formatted into AI prompt text | Low | AI sees `level` but not the granular gate evidence |
| G7 | Disposition narrative has no mastery progression signal | Low | Cannot distinguish newly-mastered from always-secure |
| G8 | `setDoc` (full overwrite) on every field edit | Low | Risk of race condition if two tabs edit simultaneously |
| G9 | ~~Client vs server starting-level divergence~~ | ~~Medium~~ | **FIXED** (R1). Server quest.ts now reads `workingLevels[questMode]` from `snapshotData` as authoritative source, falling back to activityConfigs curriculum data only if absent. Matches client-side `computeStartLevel` fallback chain. |
| G10 | Math quests have no AI starting-level injection | Low | `buildQuestPrompt` only injects `STARTING LEVEL:` for reading domain modes; math gets no level directive in the prompt |
| G11 | `applySnapshotSuggestions` ignores mastery gates | Medium | `src/features/planner-chat/chatPlanner.logic.ts` plan generation uses stop rules + duration heuristics, not `evaluateSkipEligibility` — the code-driven skip path is fully bypassed |
| G12 | ~~`workingLevels` not included in AI context text~~ | ~~Low~~ | **FIXED** (R1, partial). `loadSkillSnapshotContext` now formats `workingLevels` with level, source, date, and evidence. All tasks receiving `skillSnapshot` slice see quest progression levels. |

---

## Journey 2 (Part A): Quest End Writes

**Trace:** Lincoln finishes a Phonics Quest, 3 correct at Level 5, session ends at Level 5.

All writes fire from the `endSession()` callback in `src/features/quest/useQuestSession.ts` (lines 669–925).

---

### 1. workingLevels.phonics

**Written? Conditionally yes.**

The write path:

1. `computeWorkingLevelFromSession(questions, finalState.currentLevel, questMode)` — `src/features/quest/workingLevels.ts:85-140`
2. `canOverwriteWorkingLevel(currentLevel)` guard — `src/features/quest/workingLevels.ts:22-27`
3. Merged into snapshot, written via `setDoc(snapshotRef, ...)` — `src/features/quest/useQuestSession.ts:921`

**Collection:** `families/{familyId}/skillSnapshots/{childId}`

**Critical threshold:** `MIN_QUESTIONS_FOR_UPDATE = 5` (`workingLevels.ts:77`). If fewer than 5 non-skipped, non-flagged questions were answered, `computeWorkingLevelFromSession` returns `null` and **no workingLevel update occurs**.

**Assuming ≥ 5 answered questions with 3 correct at Level 5:**

- `STABLE_CORRECT_THRESHOLD = 2` (`workingLevels.ts:79`). 3 correct at Level 5 ≥ 2, so `stableCeiling = 5`.
- `sessionEndLevel (5) >= stableCeiling (5)` → `newLevel = 5`.
- Phonics level cap = 8 (`QUEST_MODE_LEVEL_CAP`), no clamping.
- Result: `{ level: 5, source: 'quest', evidence: "Session ended at Level 5 with 3/N correct" }`.
- `canOverwriteWorkingLevel`: passes unless a `source: 'manual'` override was set within the last 48 hours (`workingLevels.ts:16`).
- Written to `skillSnapshots/{childId}.workingLevels.phonics` at `useQuestSession.ts:921`.

**Gap:** If Lincoln answered only 3 questions total (< 5 threshold), no workingLevel is written despite completing the session. The level stays stale. The 8-minute timer timeout path sets `timedOut: true` on the session record but does not bypass the 5-question minimum.

---

### 2. XP / Diamonds

**Written? Yes.** Three separate writes fire sequentially at `useQuestSession.ts:812-851`:

| What | Event Type | Amount | Dedup Key | Write Call | File:Line |
|---|---|---|---|---|---|
| Quest completion bonus | `QUEST_COMPLETE` | 15 XP | `quest-complete_{docId}` | `addXpEvent(...)` | `useQuestSession.ts:812-819` |
| Diamond XP bonus | `QUEST_DIAMOND` | 3 × 2 = 6 XP | `quest_{docId}` | `addXpEvent(...)` | `useQuestSession.ts:827-839` |
| Diamonds earned | `QUEST_COMPLETE` (diamond) | 3 diamonds | `quest-complete_{docId}-diamond` | `addDiamondEvent(...)` | `useQuestSession.ts:844-851` |

**Total XP:** 21 (15 + 6). **Total Diamonds:** 3.

Each `addXpEvent` call (`src/core/xp/addXpEvent.ts:61-147`) produces multiple Firestore writes:

| Doc | Collection | Write | File:Line |
|---|---|---|---|
| Per-event XP entry | `xpLedger/{childId}_{dedupKey}` | `setDoc(eventRef, ...)` | `addXpEvent.ts:74` |
| Cumulative XP total | `xpLedger/{childId}` | `setDoc(ledgerRef, ...)` | `addXpEvent.ts:116` |
| Avatar profile (totalXp cache) | `avatarProfiles/{childId}` | `setDoc(profileRef, ...)` | `addXpEvent.ts:137` |
| Armor unlock check | (conditional) | `checkAndUnlockArmor(...)` | `addXpEvent.ts:144` |

For diamond entries (`addDiamondEvent` at `src/core/xp/addDiamondEvent.ts:56-64`), the path diverges:

| Doc | Collection | Write | File:Line |
|---|---|---|---|
| Per-event diamond entry | `xpLedger/{childId}_{dedupKey}` | `setDoc(eventRef, ...)` (currencyType: `'diamond'`) | `addXpEvent.ts:74` |
| Diamond balance increment | `avatarProfiles/{childId}` | `updateDoc(profileRef, { diamondBalance: increment(3) })` | `addXpEvent.ts:99-100` |

Diamond entries skip the cumulative XP doc and armor check (`addXpEvent.ts:95-104`).

---

### 3. Session Record (evaluationSessions)

**Written? Yes.** `useQuestSession.ts:785-786`:

```ts
const ref = doc(evaluationSessionsCollection(familyId), docId)
await setDoc(ref, JSON.parse(JSON.stringify(session)))
```

**Collection:** `families/{familyId}/evaluationSessions/{docId}`
**Doc ID format:** `interactive_{childId}_{Date.now()}` (`useQuestSession.ts:755`)

**Document shape** (for this scenario):

| Field | Value |
|---|---|
| `childId` | Lincoln's ID |
| `domain` | `'reading'` |
| `status` | `'complete'` |
| `sessionType` | `'interactive'` |
| `questMode` | `'phonics'` |
| `questions` | `SessionQuestion[]` — each with level, skill, prompt, correctAnswer, childAnswer, correct, responseTimeMs |
| `findings` | `EvaluationFinding[]` — AI-extracted skill observations |
| `recommendations` | `EvaluationRecommendation[]` — AI-generated or fallback next steps |
| `summary` | AI-generated session summary string |
| `finalLevel` | `5` |
| `totalCorrect` | `3` |
| `totalQuestions` | total answered (excludes skipped) |
| `diamondsMined` | `3` (equals totalCorrect) |
| `streakDays` | current quest streak |
| `timedOut` | `false` (assuming normal completion) |
| `evaluatedAt` | ISO timestamp |
| `skippedCount` | number or undefined |
| `flaggedErrorCount` | number or undefined |

---

### 4. Hours

**Written? Yes (recently shipped).** `useQuestSession.ts:792-808`:

```ts
if (!hoursLoggedRef.current) {
  hoursLoggedRef.current = true
  const activeSeconds = sessionTimer.stop()
  const minutes = Math.ceil(activeSeconds / 60 / 5) * 5
  if (minutes >= 5) {
    addDoc(hoursCollection(familyId), { ... })
  }
}
```

**Collection:** `families/{familyId}/hours` (via `hoursCollection`, `src/core/firebase/firestore.ts`)
**Write call:** `addDoc(hoursCollection(familyId), {...})` at `useQuestSession.ts:798`

**Document shape:**

| Field | Value |
|---|---|
| `childId` | Lincoln's ID |
| `date` | `todayKey()` (YYYY-MM-DD) |
| `minutes` | active time rounded up to nearest 5 min |
| `subjectBucket` | `domainToSubjectBucket('reading')` (likely `'Reading'`) |
| `quickCapture` | `true` |
| `notes` | `'phonics quest session'` |
| `source` | `'quest-session'` |

**Conditions:**
- Uses an **idle-aware timer** (`useSessionTimer` from `src/core/utils/sessionTimer.ts`) — excludes idle periods of 60+ seconds.
- Only logs if active time ≥ 5 minutes. A fast 3-question session may fall below this threshold.
- `hoursLoggedRef.current` guard prevents duplicate logging on re-renders.

**Confirmed wired.** The hours entry will appear in compliance records with `source: 'quest-session'` for audit trail.

---

### Summary: All Writes for Phonics Quest End (3 correct, Level 5)

| Write | Collection | Doc | File:Line | Status |
|---|---|---|---|---|
| workingLevels.phonics | `skillSnapshots/{childId}` | `{childId}` | `useQuestSession.ts:921` | **Yes** (if ≥ 5 answered questions and no 48hr manual lock) |
| Priority skills update | `skillSnapshots/{childId}` | `{childId}` | `useQuestSession.ts:921` | Yes (same setDoc) |
| Session record | `evaluationSessions/{docId}` | `interactive_{childId}_{ts}` | `useQuestSession.ts:786` | **Yes** |
| XP: completion bonus | `xpLedger/{childId}_quest-complete_{docId}` | per-event | `addXpEvent.ts:74` | **Yes** (15 XP) |
| XP: diamond bonus | `xpLedger/{childId}_quest_{docId}` | per-event | `addXpEvent.ts:74` | **Yes** (6 XP) |
| XP: cumulative total | `xpLedger/{childId}` | cumulative | `addXpEvent.ts:116` | **Yes** (updated twice, net +21) |
| Avatar totalXp cache | `avatarProfiles/{childId}` | profile | `addXpEvent.ts:137` | **Yes** (updated twice) |
| Diamonds | `xpLedger/{childId}_quest-complete_{docId}-diamond` | per-event | `addXpEvent.ts:74` | **Yes** (3 diamonds) |
| Diamond balance | `avatarProfiles/{childId}` | profile | `addXpEvent.ts:99-100` | **Yes** (+3 increment) |
| Hours | `hours/{auto-id}` | new doc | `useQuestSession.ts:798` | **Yes** (if active time ≥ 5 min) |

**Total Firestore writes per quest end:** ~10 (session + snapshot + 3 xpLedger events + 2 cumulative XP + 2 avatar profile + 1 hours). Plus conditional armor unlock check.

### Gaps Identified

| # | Gap | Severity | Notes |
|---|---|---|---|
| G13 | workingLevels not written if < 5 answered questions | Medium | Short sessions (timeout after 3 questions, or quick child) produce no level signal despite real performance data |
| G14 | Cumulative XP doc written twice per session | Low | Once for QUEST_COMPLETE, once for QUEST_DIAMOND — race-safe because sequential, but two full `setDoc` overwrites where one could suffice |
| G15 | Hours not logged if active time < 5 minutes | Low | By design for compliance accuracy, but a valid 3-minute session leaves no hours trace |

---

## Journey 2 (Part B): Quest Start Reads

**Trace:** Lincoln finishes a Phonics Quest session. Later, he starts the NEXT Phonics Quest. What carries over?

---

### 1. Does the new starting level reflect `workingLevels.phonics` from the prior session?

**Yes (client-side). No (server-side).**

**Client-side read path:**

When `startQuest()` fires (`src/features/quest/useQuestSession.ts:397`), it:

1. **Loads the skill snapshot** from Firestore (`useQuestSession.ts:409-412`):
   ```
   const snapshotRef = doc(skillSnapshotsCollection(familyId), activeChildId)
   const snapshotSnap = await getDoc(snapshotRef)
   ```
2. **Calls `computeStartLevel(snapshot, questMode, curriculumHint)`** (`useQuestSession.ts:477`).
3. **`computeStartLevel`** (`src/features/quest/workingLevels.ts:44-72`) uses a fallback chain:
   - `workingLevels[questMode].level` if present → **authoritative** (line 53-56)
   - `curriculumHint.level` from `activityConfigs` if no working level (line 58-60)
   - Default `2` (line 49)
   - Capped at `QUEST_MODE_LEVEL_CAP[phonics] = 8` (line 63-66)
   - Floored at `1` (line 69)

The prior session's `endSession()` wrote `workingLevels.phonics` to Firestore (`useQuestSession.ts:894-907`), so the new session reads it back. The chain works.

**Server-side (Cloud Function) divergence:**

The quest task handler (`functions/src/ai/tasks/quest.ts:28-89`) computes `suggestedStartLevel` from **`activityConfigs` curriculum data only** — it never reads `workingLevels` from the skill snapshot. The `loadSkillSnapshotContext` function (`functions/src/ai/contextSlices.ts:643-732`) also omits `workingLevels` from the formatted text. The AI prompt receives `STARTING LEVEL:` only from curriculum completion evidence, not from the prior quest session's computed level.

**Result:** The client correctly starts at the prior session's working level. The AI prompt may receive a different (or no) starting level directive. This is pre-existing gap G9 + G12 from Journey 1.

| Verdict | Detail |
|---|---|
| **Client** | **Yes** — `computeStartLevel` reads `workingLevels.phonics.level` written by prior session (`workingLevels.ts:53-56`, `useQuestSession.ts:477`) |
| **Server** | **Gap** — `quest.ts:28-89` only reads `activityConfigs`, never `workingLevels`; AI may get stale or no starting level |

---

### 2. Does the AI quest prompt include the previous session's data?

**Partially. One prior session summary, but no question-level history.**

The quest task assembles context via `buildContextForTask("quest", ...)` (`functions/src/ai/contextSlices.ts:51`):

```
quest: ["childProfile", "sightWords", "recentEval", "wordMastery", "skillSnapshot", "workbookPaces"]
```

The **`recentEval`** slice (`functions/src/ai/chatTypes.ts:188-258`) loads the most recent `complete` evaluation session:

```
db.collection(`families/${familyId}/evaluationSessions`)
  .where("childId", "==", childId)
  .where("status", "==", "complete")
  .orderBy("evaluatedAt", "desc")
  .limit(1)
```

If the prior session was a Phonics Quest (sessionType `interactive`), the AI receives (`chatTypes.ts:226-250`):

| Data included | Line | Example |
|---|---|---|
| Domain | 231 | `Domain: reading` |
| Date | 232 | `Date: 2026-04-14T...` |
| Final Level + Score | 233-234 | `Final Level: 4, Score: 7/10` |
| Summary | 236 | AI-generated narrative |
| Findings (skill + status + evidence) | 237-241 | `- CVC blending: secure — ...` |
| Recommendations | 243-249 | `- Priority 1: vowel teams — ...` |

**What is NOT included:**

| Missing data | Impact |
|---|---|
| Individual questions from prior session | AI cannot avoid repeating the same questions |
| `stableCeiling` | AI doesn't know the proven-stable level (only `finalLevel`, which may have been post-crash) |
| `workingLevels.phonics` numeric value | AI doesn't see the computed working level (G12) |
| Session duration / engagement | AI cannot adjust pacing based on prior stamina |
| Word-level progress per question | Partially covered by separate `wordMastery` + `wordProgress` slices |

**Note:** The `recentEval` query loads `limit(1)` — only the single most recent session across ALL domains and session types. If a comprehension evaluation happened after the phonics quest, the phonics quest data is eclipsed entirely.

| Verdict | Detail |
|---|---|
| **Partial** | `recentEval` includes prior session's `finalLevel`, findings, recommendations (`chatTypes.ts:202-250`). Omits question history, `stableCeiling`, and `workingLevels` numeric value. Only 1 session loaded — can be eclipsed by a newer non-phonics session. |

---

### 3. Does the new quest see the diamonds/XP from the prior session?

**Yes — cumulative totals are persisted; per-session counts reset to zero.**

When the prior session ends (`useQuestSession.ts:810-852`), three reward writes fire:

| Reward | Call site | Persistence |
|---|---|---|
| Quest completion XP (15 flat) | `useQuestSession.ts:812-819` → `addXpEvent()` | Cumulative in `xpLedger/{childId}` and `avatarProfiles/{childId}.totalXp` |
| Diamond XP (2 × correct) | `useQuestSession.ts:827-839` → `addXpEvent()` | Same cumulative stores |
| Diamonds (1 × correct) | `useQuestSession.ts:843-851` → `addDiamondEvent()` | Cumulative in `avatarProfiles/{childId}.diamondBalance` via Firestore `increment()` |

All three use `dedupKey` to prevent double-writes on retry.

When the **new** session starts (`useQuestSession.ts:480-489`), session-local counters reset:

```ts
const initialState: QuestState = {
  totalQuestions: 0,
  totalCorrect: 0,     // diamonds this session start at 0
  consecutiveCorrect: 0,
  ...
}
```

The **cumulative** diamond balance and XP total are read reactively via `useDiamondBalance` and `useXpLedger` hooks, which stream from Firestore docs — these reflect all prior sessions.

| Verdict | Detail |
|---|---|
| **Yes (cumulative)** | XP and diamonds from prior sessions are committed to `xpLedger` + `avatarProfiles` before the new session starts. UI hooks stream cumulative totals. Per-session counters reset to zero — no confusion between session-local and global. |

---

### 4. Does the new quest know the previous session's stable ceiling?

**No. `stableCeiling` is ephemeral — only its derivative (`workingLevels.level`) persists.**

**Computation:** `computeWorkingLevelFromSession()` (`src/features/quest/workingLevels.ts:85-140`) calculates `stableCeiling` as the highest level with ≥2 correct answers (line 105-112, threshold at line 79). It then derives `newLevel`:

```ts
// workingLevels.ts:114-121
if (stableCeiling !== null) {
  newLevel = sessionEndLevel >= stableCeiling ? stableCeiling : sessionEndLevel
} else {
  newLevel = sessionEndLevel - 1  // gentle downstep
}
```

**Storage:** The function returns a `WorkingLevel` object with `level: newLevel` (line 134-139). The raw `stableCeiling` value is **not** in the return type and is **not** stored anywhere.

**Persistence chain:**

| Step | What | Where | Persistent? |
|---|---|---|---|
| 1 | `stableCeiling` computed | `workingLevels.ts:105-112` (local variable) | No |
| 2 | `newLevel` derived from it | `workingLevels.ts:114-121` | No (local) |
| 3 | `WorkingLevel.level = newLevel` | `workingLevels.ts:134` | Returned |
| 4 | Written to Firestore | `useQuestSession.ts:904-906` → `skillSnapshots/{childId}.workingLevels.phonics` | **Yes** |
| 5 | New session reads it back | `useQuestSession.ts:409-412` → `computeStartLevel` → line 53-56 | **Yes** |

**What is lost:** If Session 1 ended at Level 6 but `stableCeiling` was 4 (crashed above 4), `newLevel = 4` is stored. Session 2 starts at Level 4 — correct behavior. But Session 2 cannot see *why* Level 4 was chosen (crash vs. stable performance vs. gentle downstep). The evidence string (`workingLevels.ts:138`) gives a hint (`"Session ended at Level 6 with 7/10 correct"`) but not the ceiling itself.

**Reconstruction possible but not done:** The prior session's full `questions[]` array is stored in the `evaluationSessions` document (`questTypes.ts:128-148`, field `questions: SessionQuestion[]`). Theoretically, `stableCeiling` could be recomputed from that data — but no code does this.

| Verdict | Detail |
|---|---|
| **No (raw value)** | `stableCeiling` is a local variable in `computeWorkingLevelFromSession` (`workingLevels.ts:105`), never persisted. Only its derivative `newLevel` is stored as `workingLevels.phonics.level`. |
| **Yes (effect)** | The *effect* of `stableCeiling` carries forward via the stored `newLevel` → next session's `startLevel`. The causal chain works, but the raw ceiling is lost. |

---

### Summary of New Gaps

| # | Gap | Severity | Notes |
|---|---|---|---|
| G16 | ~~`recentEval` loads only 1 session across all domains~~ | ~~Medium~~ | **FIXED** (R2). Quest now uses `recentHistoryByDomain` slice — queries per-domain (3 sessions each) so cross-domain evals never eclipse domain-specific history. |
| G17 | `stableCeiling` not persisted | Low | The derived `newLevel` captures the effect, but debugging/analytics cannot see why a level was chosen. Reconstructable from stored `questions[]` if needed. |
| G18 | AI prompt has no per-question history from prior session | Medium | AI may repeat the same question types/words. `wordMastery` slice partially mitigates for word-level data, but question format/style repetition is unchecked. |
| G19 | ~~Prior session's `workingLevels` not in AI prompt (server)~~ | ~~Medium~~ | **FIXED** (R1). Server now reads `workingLevels[questMode]` as authoritative starting level; AI prompt's `STARTING LEVEL:` directive reflects the same value the client uses. |

---

## Journey 2 (Part C): Quest Visibility Downstream

**Trace:** After Lincoln finishes a Knowledge Mine quest, where can Shelly see the results? For each downstream surface: does it reflect quest data, how, and what's missing?

---

### 1. Skill Snapshot — does it reflect quest-derived workingLevels?

**Partially. Data is stored but not displayed.**

The quest end flow writes `workingLevels` to the skill snapshot document (`src/features/quest/useQuestSession.ts:894-921`). The write path:

1. `computeWorkingLevelFromSession()` returns a `WorkingLevel` with `source: 'quest'` (`src/features/quest/workingLevels.ts:85-140`).
2. Merged into existing `workingLevels` map on the snapshot (`useQuestSession.ts:904-906`).
3. Written via `setDoc(snapshotRef, ...)` (`useQuestSession.ts:921`).

Quest findings also update `prioritySkills` on the same document (`useQuestSession.ts:863-887`): emerging/not-yet findings → `SkillLevel.Emerging`, mastered findings → `SkillLevel.Secure`.

**However, the Skill Snapshot UI (`src/features/evaluation/SkillSnapshotPage.tsx`) does not render `workingLevels` anywhere.** A grep for `workingLevel` in that file returns zero matches. Shelly can see the updated `prioritySkills[].level` values (displayed in the skill table at line 357-368), but she cannot see:

- The numeric working level (e.g., "Phonics Level 5")
- The source (`'quest'` vs `'evaluation'` vs `'manual'`)
- The evidence string (e.g., "Session ended at Level 5 with 7/10 correct")
- When the level was last updated

| Verdict | **Gap** — `workingLevels` stored but invisible in UI. Priority skills reflect quest findings (yes), but the numeric progression level that drives the next quest is hidden from Shelly. |
|---|---|

---

### 2. Learning Profile (disposition narrative) — does it cite quest performance?

**Weakly. Sees evaluation session findings text, but not structured quest data.**

The disposition task context slices are `["charter", "childProfile", "engagement", "gradeResults"]` (`functions/src/ai/contextSlices.ts:56`). Notably absent: `recentEval`, `skillSnapshot`, `wordMastery`, `sightWords`.

However, the disposition task handler (`functions/src/ai/tasks/disposition.ts:280-410`) runs its own data loaders beyond the shared context system. One of these is `loadRecentEvaluations()` (line 82-106), which:

1. Queries `evaluationSessions` where `status == 'complete'`, `limit(3)` (line 87-93).
2. Extracts `findings[].text` from each session (line 100-101).
3. Injects into the AI user message as `RECENT EVALUATION SESSIONS:` (line 380-381).

Since Knowledge Mine quest sessions are stored as `evaluationSessions` with `status: 'complete'`, they **do** appear here — but only as a flat text summary of findings (e.g., `"reading (2026-04-15): CVC blending secure; vowel teams emerging"`).

**What the disposition AI does NOT see from quests:**

| Missing | Why |
|---|---|
| Accuracy / score (e.g., 7/10) | `loadRecentEvaluations` extracts only `findings[].text`, not `totalCorrect` / `totalQuestions` |
| Level progression (e.g., Level 3 → 5) | `workingLevels` not loaded; `finalLevel` not extracted |
| Word mastery trends | `wordMastery` slice not in disposition context |
| Session duration / engagement | Not extracted from session record |
| Quest mode (phonics vs comprehension) | Domain included but mode is not |

**Additionally:** The `childProfile` slice (included for disposition) formats `prioritySkills` as `- {label} ({tag}): {level}` (`contextSlices.ts:255-280`). This means the disposition AI sees skill levels that quest sessions updated — but without knowing they came from a quest.

| Verdict | **Gap** — quest findings appear as flat text in 3-session window. No performance metrics, no level data, no quest-specific attribution. The disposition narrative cannot say "Lincoln jumped two levels in phonics this week" because it never sees the level numbers. |
|---|---|

---

### 3. Records / Portfolio — does the session show up?

**Hours: Yes. Evaluation History tab: Yes. Portfolio: No. Compliance exports: Partial.**

#### 3a. Hours (compliance tracking)

Quest sessions write hours entries to `families/{familyId}/hours` (`src/features/quest/useQuestSession.ts:798-806`) with `source: 'quest-session'`. These entries flow into the Records page hours aggregation at `src/features/records/records.logic.ts:72-82` with no source-based filtering — quest hours count toward compliance totals.

**Gap:** Unlike `creative-timer` entries (which get a UI callout at `RecordsPage.tsx:677-681`), `quest-session` entries have no special display. They blend silently into totals. Shelly cannot filter or identify quest time in the hours view.

#### 3b. Evaluation History tab

The Records page renders `EvaluationHistoryTab` at tab index 1 (`src/features/records/RecordsPage.tsx:117`). This component queries `evaluationSessionsCollection` directly (`src/features/records/EvaluationHistoryTab.tsx:485`) and displays quest sessions with:

- Session type badge (`⛏️ Phonics Quest` etc.) via `questModeLabel()` (line 50-52)
- Question count, final level, score (line 117)
- Per-question breakdown with correct/incorrect (line 215-228)
- Struggling words extracted from missed questions (line 94-106)

**This is the richest quest visibility surface for Shelly.** Full session detail including individual questions.

#### 3c. Portfolio

Portfolio queries only `artifactsCollection` (`src/features/records/PortfolioPage.tsx:144-159`). Quest sessions do not create artifacts. A grep for `evaluationSession`, `quest`, and `Knowledge Mine` in `PortfolioPage.tsx` returns zero matches.

| Verdict | **No** — quest sessions are invisible in portfolio. |
|---|---|

#### 3d. Compliance exports

The compliance pack (`records.logic.ts:409-419`) includes `hoursEntries` (which contain quest-session hours) but not `evaluationSessions`. The generated CSVs and HTML report include quest time in hour totals but contain no quest session detail.

| Component | Quest visible? | File:Line |
|---|---|---|
| Hours totals | **Yes** (silent) | `useQuestSession.ts:798-806` → `records.logic.ts:72-82` |
| Hours UI callout | **No** | `RecordsPage.tsx:677-681` (only `creative-timer` called out) |
| Evaluation History tab | **Yes** (full detail) | `EvaluationHistoryTab.tsx:485, 50-52, 117` |
| Portfolio page | **No** | `PortfolioPage.tsx:144-159` (artifacts only) |
| Compliance CSV/HTML | **Partial** (hours only) | `records.logic.ts:164, 476` |

---

### 4. Progress page tabs — which surface quest data, which don't?

The Progress page has 5 tabs (`src/features/progress/ProgressPage.tsx:39-43`):

| Tab | Index | Component | Quest data? | Detail |
|---|---|---|---|---|
| Learning Profile | 0 | `DispositionProfile` | **Weak** | Sees evaluation findings text only (see §2 above). `DispositionProfile.tsx` has zero references to `evaluationSession`, `quest`, or `workingLevel`. |
| Learning Map | 1 | `LearningMap` | **Yes** | `useSkillMap` hook reads `childSkillMaps` collection. Initialization backfills from all `evaluationSessions` via `initializeSkillMapFromHistory()` (`src/core/curriculum/updateSkillMapFromFindings.ts:102-129`, query at line 112-116). Quest end also calls `updateSkillMapFromFindings()` directly (`useQuestSession.ts:927-930`). Skill nodes reflect quest findings. |
| Curriculum | 2 | `CurriculumTab` | **Indirect** | Does not query quest data directly. When a curriculum scan runs, it calls `updateSkillMapFromFindings()` (`CurriculumTab.tsx:253`) which feeds the Learning Map. No direct quest display. |
| Skill Snapshot | 3 | `SkillSnapshotPage` | **Partial** | Priority skill levels reflect quest findings (updated at quest end). `workingLevels` stored but not rendered (see §1 above). |
| Word Wall | 4 | `WordWall` | **Yes** | Data sourced entirely from quest sessions. `useWordWall` reads `children/{childId}/wordProgress` subcollection (`src/features/progress/useWordWall.ts:42`), written by quest end flow (`useQuestSession.ts:940-984`). `WordDetail` shows `questSessions.length` per word (line 67). Empty state: "Complete a Knowledge Mine quest to start tracking words!" (`WordWall.tsx:125`). |

**Not rendered but exists:** `ArmorTab` (`src/features/progress/ArmorTab.tsx`) references `QUEST_DIAMOND` and `QUEST_COMPLETE` XP events (line 67-98) in the ledger history display. This tab is not currently wired into `ProgressPage.tsx`.

---

### Summary of New Gaps

| # | Gap | Severity | Notes |
|---|---|---|---|
| G20 | `workingLevels` not displayed in Skill Snapshot UI | Medium | Data written by quest but invisible to Shelly; she cannot see the child's current level or how it was derived |
| G21 | Disposition narrative lacks quest performance metrics | Medium | Sees findings text but not accuracy, level progression, or word mastery trends; cannot generate growth narratives from quest data |
| G22 | Quest hours have no UI callout in Records | Low | `source: 'quest-session'` entries blend silently into totals; `creative-timer` gets a callout but quest does not |
| G23 | Portfolio has zero quest visibility | Low | Quest sessions create no artifacts; portfolio queries only artifacts collection |
| G24 | Compliance exports exclude session-level quest data | Low | Quest hours counted in totals but session findings, scores, and level progression not included in CSV/HTML exports |
| G25 | Learning Profile tab has no direct quest data path | Medium | The `disposition` context slices omit `recentEval`, `skillSnapshot`, `wordMastery`; quest performance enters only through the handler's own `loadRecentEvaluations()` (3-session, findings-text-only) |

## Journey 3 (Part A): Guided Eval Write Paths

**Trace:** Shelly completes a reading evaluation chat, then taps "Apply to Skill Snapshot".

---

### 1. What function handles the button? File:line.

**`handleSaveAndApply`** at `src/features/evaluate/EvaluateChatPage.tsx:491`. The button is at line 1072.

---

### 2. What gets written to `skillSnapshots`? Which fields?

**Yes.** `setDoc` at `src/features/evaluate/EvaluateChatPage.tsx:598` writes to `skillSnapshots/{childId}` with these fields:

| Field | Source |
|---|---|
| `childId` | Active child |
| `prioritySkills` | Merged: existing skills (not covered by new findings) + new skills from findings (emerging/not-yet → `SkillLevel.Emerging`, mastered → `SkillLevel.Secure`) + recommendations as priority skills |
| `supports` | From `completeData.supports` (AI-generated), or existing |
| `stopRules` | From `completeData.stopRules` (AI-generated), or existing |
| `evidenceDefinitions` | From `completeData.evidenceDefinitions` (AI-generated), or existing |
| `workingLevels` | Merged (see §3 below) |
| `updatedAt` | ISO timestamp |
| `conceptualBlocks` | From pattern analysis (see §4 below), only if non-empty |
| `blocksUpdatedAt` | ISO timestamp, only if conceptualBlocks present |

**Note:** This is a full `setDoc` (line 598), not `setDoc(..., { merge: true })`. Any fields on the existing document not listed above (e.g. `completedPrograms`) are **erased**.

---

### 3. `workingLevels` updated? File:line.

**Yes, conditionally — reading domain only.** `src/features/evaluate/EvaluateChatPage.tsx:564-576`.

- **Phonics:** `deriveWorkingLevelFromEvaluation(findings, 'phonics')` at line 567, guarded by `canOverwriteWorkingLevel` at line 568. Both helpers live in `src/features/quest/workingLevels.ts:196` and `:22`.
- **Comprehension:** Same pattern at lines 572-575.
- **Math:** Stubbed with a TODO at line 579 — **not implemented** (gap G26).

`deriveWorkingLevelFromEvaluation` only returns a level when the findings contain `mastered` skills matching its internal skill→level map. If the eval shows only `emerging`/`not-yet`, working levels are **not updated**.

---

### 4. Conceptual blocks updated? File:line.

**Yes, conditionally.** `src/features/evaluate/EvaluateChatPage.tsx:592-595`. If `conceptualBlocks.length > 0`, both `conceptualBlocks` and `blocksUpdatedAt` are spread into the snapshot document. Conceptual blocks are populated by `triggerPatternAnalysis` (fires the `analyzeEvaluationPatterns` Cloud Function) and stored in component state at line 186. They are **overwritten** (not merged) on each apply.

---

### 5. Hours logged for eval time? File:line.

**Yes, but not inside `handleSaveAndApply`.** Hours are logged by `logSessionHours` at `src/features/evaluate/EvaluateChatPage.tsx:199-219`, which is called when the AI returns a `<complete>` tag (line 410 and line 478) — i.e., when the evaluation **finishes**, not when Shelly taps "Apply". The write is an `addDoc` to `hoursCollection(familyId)` at line 208 with fields: `childId`, `date`, `minutes` (rounded up to nearest 5), `subjectBucket`, `quickCapture: true`, `notes`, `source: 'evaluation-session'`.

Hours logging is **decoupled from the apply action**. If Shelly never taps "Apply to Skill Snapshot", hours are still logged. Conversely, if the eval completes but `logSessionHours` fails silently, the apply still succeeds.

---

### 6. Additional writes (XP, diamonds, learning map)

Inside `handleSaveAndApply`, after the snapshot write:

- **XP:** `addXpEvent` at line 607 — writes 25 XP to `xpLedger` with dedup key `eval_{sessionDocId}`. Source: `src/core/xp/addXpEvent.ts:53`.
- **Diamonds:** `addDiamondEvent` at line 615 — writes 5 diamonds with dedup key `eval_{sessionDocId}-diamond`. Source: `src/core/xp/addDiamondEvent.ts:27`.
- **Learning Map:** `updateSkillMapFromFindings` at line 602 — fire-and-forget write to `childSkillMaps/{childId}` via `setDoc(..., { merge: true })`. Source: `src/core/curriculum/updateSkillMapFromFindings.ts:75-95`.

All three are conditional on `sessionDocId` being truthy (XP/diamonds) or fire-and-forget with `.catch` (learning map).

---

### Summary of Writes

| Write | Collection | Trigger | File:line |
|---|---|---|---|
| Skill snapshot (full overwrite) | `skillSnapshots/{childId}` | "Apply" button | `EvaluateChatPage.tsx:598` |
| workingLevels (phonics) | merged into snapshot | "Apply" button, reading domain, mastered findings only | `EvaluateChatPage.tsx:567-569` |
| workingLevels (comprehension) | merged into snapshot | "Apply" button, reading domain, mastered findings only | `EvaluateChatPage.tsx:572-575` |
| conceptualBlocks | merged into snapshot | "Apply" button, if pattern analysis returned blocks | `EvaluateChatPage.tsx:592-595` |
| Hours | `hours` | Eval completion (AI `<complete>` tag) | `EvaluateChatPage.tsx:208` |
| XP (25) | `xpLedger` | "Apply" button, if sessionDocId | `EvaluateChatPage.tsx:607-613` |
| Diamonds (5) | `xpLedger` | "Apply" button, if sessionDocId | `EvaluateChatPage.tsx:615-622` |
| Learning Map | `childSkillMaps/{childId}` | "Apply" button, fire-and-forget | `EvaluateChatPage.tsx:602-603` |

### Gaps Identified

| # | Gap | Severity | Notes |
|---|---|---|---|
| G26 | Math working levels not derived from evaluation | Medium | TODO at `EvaluateChatPage.tsx:579` — math evaluations don't update `workingLevels.math` |
| G27 | ~~`setDoc` without `merge` erases unlisted fields~~ | ~~High~~ ✅ FIXED | Fixed: added `{ merge: true }` to `setDoc` calls in `EvaluateChatPage.tsx:598`, `useQuestSession.ts:921`, and `backfillWorkingLevels.ts:235`. Unlisted fields (e.g. `completedPrograms`, `createdAt`) are now preserved. |
| G28 | Hours logged on eval complete, not on apply | Low | By design, but if Shelly never taps "Apply", hours are still counted without any snapshot update — the hours exist without a corresponding skill record |

## Journey 3 (Part B): Eval Findings Downstream

**Trace:** After Shelly taps "Apply to Skill Snapshot", what downstream systems read the eval findings on their next run?

---

### 1. Does the next planner generation use eval findings?

**Yes — two paths.**

The `plan` task context includes both `recentEval` and `skillSnapshot` (`functions/src/ai/contextSlices.ts:42-47`).

**Path A — `recentEval` slice.** `loadRecentEvalContext` (`functions/src/ai/chatTypes.ts:188-258`) queries `evaluationSessions` for the single most recent `complete` session (`limit(1)`, line 199). The guided eval session record (written at eval completion, before Apply) contains the AI-generated `findings[]` and `recommendations[]`. These are formatted into the prompt as:
- `Findings:` → `- {skill}: {status} — {evidence}` (`chatTypes.ts:238-241`)
- `Recommendations:` → `- Priority {n}: {skill} — {action} ({frequency}, {duration})` (`chatTypes.ts:244-249`)

**Path B — `skillSnapshot` slice.** `loadSkillSnapshotContext` (`functions/src/ai/contextSlices.ts:642-732`) reads the snapshot document that Apply just wrote. The planner AI sees:
- Updated `prioritySkills` with levels set from findings (`contextSlices.ts:674-677`)
- `stopRules` — topics to exclude from plans (`contextSlices.ts:682-686`)
- `supports` — learning accommodations (`contextSlices.ts:692-695`)
- `conceptualBlocks` (ADDRESS_NOW only) with strategies (`contextSlices.ts:700-706`)
- Planning guidance: "Skills at 'Secure' → SKIP", "Emerging → short daily practice", etc. (`contextSlices.ts:723-728`)
- `completedPrograms` exclusion list (`contextSlices.ts:710-717`)

| Verdict | **Yes** — planner sees eval findings via both `recentEval` (raw findings/recommendations from session record, `chatTypes.ts:237-249`) and `skillSnapshot` (applied priority skills + stop rules + conceptual blocks + skip guidance, `contextSlices.ts:669-729`). |
|---|---|

---

### 2. Does the next quest avoid or test shaky areas?

**Partially. Sees findings text but not structured skip/focus directives.**

The `quest` task context is `["childProfile", "sightWords", "recentEval", "wordMastery", "skillSnapshot", "workbookPaces"]` (`functions/src/ai/contextSlices.ts:51`).

- **`recentEval`**: Same `limit(1)` session query as planner — findings + recommendations are in the prompt (`chatTypes.ts:237-249`). The AI sees which skills are `emerging`/`not-yet`/`secure`.
- **`skillSnapshot`**: Priority skills with updated levels, stop rules, supports, conceptual blocks, and the same "Secure → SKIP" guidance (`contextSlices.ts:723-728`).

**However**, the quest task handler (`functions/src/ai/tasks/quest.ts:15-89`) computes `suggestedStartLevel` solely from `activityConfigs` curriculum completion data (lines 28-88) — it **never reads** `workingLevels` or `prioritySkills` from the snapshot for level selection. The AI prompt text includes the skill snapshot context (so the model can see shaky areas), but no structured directive forces avoidance or targeting.

~~**Also**: `recentEval` loads only 1 session across all domains (`limit(1)`, `chatTypes.ts:199`). If a math eval happened after the reading eval, the reading findings are eclipsed — the quest AI sees no reading-specific findings (pre-existing G16).~~ **FIXED** (R2) — quest now uses `recentHistoryByDomain` with per-domain queries and depth 3.

| Verdict | **Partial** — AI prompt includes findings and "Secure → SKIP" guidance from `skillSnapshot` (`contextSlices.ts:723-728`) + raw findings from `recentEval` (`chatTypes.ts:237-241`). But starting level is derived only from curriculum data (`quest.ts:28-88`), not from eval findings or `workingLevels`. No structured "focus on shaky skill X" directive exists. |
|---|---|

---

### 3. Does Learning Profile reflect the eval findings?

**Weakly. Sees findings text but not the applied snapshot data.**

The `disposition` task context is `["charter", "childProfile", "engagement", "gradeResults"]` (`functions/src/ai/contextSlices.ts:56`). Notably: **no `recentEval`, no `skillSnapshot`**.

Instead, the disposition task handler runs its own `loadRecentEvaluations()` (`functions/src/ai/tasks/disposition.ts:82-106`), which:
- Queries `evaluationSessions` where `status == 'complete'`, `limit(3)` (line 87-93)
- Extracts only `findings[].text` — a single string per finding (line 100-101)
- Formats as: `{domain} ({evaluatedAt}): {findings joined by "; "}` (line 103)
- Injected as `RECENT EVALUATION SESSIONS:` into the user message (line 380-381)

**What the disposition AI sees from eval findings:**
- Flat text summaries of up to 3 recent sessions' findings

**What it does NOT see:**
- Applied priority skill levels (no `skillSnapshot` slice)
- Structured `skill`/`status`/`evidence` fields (only `text` is extracted)
- Stop rules, supports, or conceptual blocks
- Recommendations (not extracted by `loadRecentEvaluations`)
- `workingLevels` numeric progression

The `childProfile` slice IS included, and it formats `prioritySkills` as `- {label} ({tag}): {level}` — so the disposition AI sees updated levels (e.g., `emerging`) but without attribution to the eval session.

| Verdict | **Weak** — sees `findings[].text` from up to 3 sessions via handler's own loader (`disposition.ts:100-103`), not via shared context system. Does not see structured findings, stop rules, conceptual blocks, or recommendations. Cannot attribute skill level changes to the eval. |
|---|---|

---

### 4. Does the curriculum view show eval-derived skip guidance?

**No.** The skip advisor logic (`src/features/planner-chat/skipAdvisor.logic.ts`) is not imported by any UI component — it is only referenced in its own file and test file (`skipAdvisor.logic.test.ts`). Pre-existing G5.

The Curriculum tab (`src/features/progress/CurriculumTab.tsx`) has no references to `conceptualBlock`, `skipGuid`, `evalFinding`, `finding`, or `skipAdvisor` (grep returns zero matches). It calls `updateSkillMapFromFindings` (line 253) only on **scan** events, not to display eval-derived guidance.

The Learning Map (`src/features/progress/learning-map/`) also has no references to findings, conceptual blocks, or skip guidance (grep returns zero matches). It renders skill nodes from `childSkillMaps`, which are updated by eval findings via `updateSkillMapFromFindings` (`EvaluateChatPage.tsx:602`), but the rendering does not surface skip/focus recommendations.

| Verdict | **No** — skip advisor logic is dead code (G5). Curriculum tab and Learning Map render skill status nodes (updated from findings) but display no skip guidance, conceptual blocks, or focus recommendations from evals. |
|---|---|

---

### Summary of Gaps

| # | Gap | Severity | Notes |
|---|---|---|---|
| G29 | ~~Quest starting level ignores eval-derived `workingLevels`~~ | ~~Medium~~ | **FIXED** (R1). `quest.ts` now reads `snapshotData.workingLevels[questMode]` as primary starting level source. Eval-derived, quest-derived, and scan-derived workingLevels all flow through. |
| G30 | ~~`recentEval` eclipses cross-domain for quest~~ | ~~Medium~~ | **FIXED** (R2). Quest switched from `recentEval` to `recentHistoryByDomain` with per-domain querying. A math eval no longer hides phonics data from the next phonics quest. |
| G31 | Disposition sees only `findings[].text`, not structured findings | Medium | `loadRecentEvaluations` at `disposition.ts:100-101` extracts `.text` only; loses `skill`, `status`, `evidence` structure; cannot generate targeted growth narratives |
| G32 | Disposition omits `skillSnapshot` and `recentEval` shared slices | Medium | Context config at `contextSlices.ts:56` lacks both; handler rolls its own weaker loader instead |
| G33 | Curriculum view has no eval skip guidance display | Low | Skip advisor logic exists but is dead code (G5); no UI surface shows "skip this" or "focus here" from eval findings |

## Journey 4: Scan Returns 'Skip' Recommendation

**Trace:** Shelly scans a workbook page, AI recommends skip.

---

### 1. Scan saved to `scans` collection?

**Yes.** `src/core/hooks/useScan.ts:135-143`.

`addDoc(scansCollection(familyId), {...})` fires immediately after the AI vision response is parsed, regardless of recommendation. The document is saved with `action: 'pending'` (line 130) — the skip recommendation lives inside `results.recommendation` on the document, not in the top-level `action` field.

When Shelly later explicitly dismisses the scan (the "Skip" button in ScanResultsPanel), `recordAction` at `useScan.ts:159-168` updates the document: `updateDoc(docRef, { action: 'skipped' })`. This marks the *user's disposition* of the scan — separate from the AI's recommendation.

When Shelly accepts the AI skip via "Accept & advance", `handleAcceptSkip` at `TodayPage.tsx:704-712` writes a `parentOverride` field onto the scan document with `recommendation: 'skip'` and `overriddenAt` timestamp.

| Step | Written? | File:Line |
|---|---|---|
| Initial scan doc (action: `'pending'`) | **Yes** | `useScan.ts:135-143` |
| User dismisses ("Skip" button) | **Yes** — action → `'skipped'` | `useScan.ts:164-165` |
| User accepts ("Accept & advance") | **Yes** — parentOverride added | `TodayPage.tsx:704-712` |

---

### 2. `syncScanToConfig` advances `currentPosition`?

**Conditionally — only on the "Accept & advance" path.**

There are two distinct skip paths, and they differ:

**Path A — Post-completion capture (useUnifiedCapture).** When Shelly captures a photo after completing a checklist item, `useUnifiedCapture.ts:93` calls `syncScanToConfig(childId, record.results)` with the **detected** lesson number. `syncScanToConfig` (`useScanToActivityConfig.ts:60-64`) only advances `currentPosition` if `lessonNumber > current`. If the AI recommended skip, the detected lesson number is the *current* lesson — it won't exceed `currentPosition`, so **no advancement occurs** through this path alone.

**Path B — Explicit "Accept & advance" (handleAcceptSkip).** `TodayPage.tsx:699-702`:

```ts
await syncScanToConfig(selectedChildId, {
  ...results,
  curriculumDetected: { ...curriculum, lessonNumber: curriculum.lessonNumber + 1 },
})
```

The caller **manually increments** `lessonNumber + 1` before passing to `syncScanToConfig`. Inside `syncScanToConfig` at `useScanToActivityConfig.ts:60-64`, the `+1` value exceeds `currentPosition`, so `updates.currentPosition = lessonNumber` fires.

**Path C — "Skip to Next" button (handleSkipToNext).** `TodayPage.tsx:658-678` — user specifies a target lesson number. Same mechanism: caller passes the desired lesson number, `syncScanToConfig` writes it if it exceeds current.

| Path | Advances position? | File:Line |
|---|---|---|
| Post-completion capture | **No** — detected lesson ≤ current | `useUnifiedCapture.ts:93` → `useScanToActivityConfig.ts:60-64` |
| "Accept & advance" button | **Yes** — `lessonNumber + 1` forced | `TodayPage.tsx:699-702` → `useScanToActivityConfig.ts:62-63` |
| "Skip to Next" button | **Yes** — user-specified target | `TodayPage.tsx:668-671` → `useScanToActivityConfig.ts:62-63` |

---

### 3. Auto-completes bypassed checklist items?

**Yes, but only on the post-completion capture path. NOT on the "Accept & advance" path.**

`autoCompleteBypassedItems` (`scanAdvance.ts:9-43`) marks checklist items sharing the same `activityConfigId` as `completed: true` with `gradeResult: "Scanned via lesson {N}"`. When `recommendation === 'skip'`, it additionally sets `skipReason: 'ai-recommended'` (line 18, 37).

**Called from:** `useUnifiedCapture.ts:130-143` — fires after `syncScanToConfig` returns, gated on `configResult.position != null`.

**NOT called from:** `handleAcceptSkip` (`TodayPage.tsx:681-723`). This handler manually builds its own checklist update at line 692-695: it sets `skipped: true` + `skipReason: SkipReason.AiRecommended` on the single scanned item only. Other items sharing the same `activityConfigId` are **not** auto-completed.

| Path | Auto-completes? | What happens | File:Line |
|---|---|---|---|
| Post-completion capture | **Yes** — all items with same `activityConfigId` | `completed: true`, `skipReason: 'ai-recommended'` | `scanAdvance.ts:18-39`, called from `useUnifiedCapture.ts:133-142` |
| "Accept & advance" | **No** — only the scanned item | `skipped: true`, `skipReason: 'ai-recommended'` on single item | `TodayPage.tsx:692-695` |

**Gap:** The "Accept & advance" path does not call `autoCompleteBypassedItems`. If multiple checklist items reference the same workbook config, the other items remain uncompleted even though the position has advanced past them.

---

### 4. Updates `workingLevels` for that mode?

**Only for math curricula. Not for reading or other subjects.**

`syncScanToConfig` fires `updateMathWorkingLevel` as a fire-and-forget side effect (`useScanToActivityConfig.ts:81-83` for existing configs, lines 122-124 for new configs):

```ts
if (subject === SubjectBucket.Math) {
  void updateMathWorkingLevel(familyId, childId, lessonNumber, curriculumName)
}
```

`updateMathWorkingLevel` (`useScanToActivityConfig.ts:139-166`):
1. Calls `deriveMathWorkingLevelFromScan(lessonNumber, curriculumName)` to map lesson ranges to quest levels.
2. Reads the existing `skillSnapshots/{childId}` document (line 150).
3. Guards with `canOverwriteWorkingLevel(currentMath)` — respects 48-hour manual override lock (line 156).
4. Merges into `workingLevels.math` via `updateDoc` (line 159).

**This logic is recommendation-agnostic.** It fires on any scan that hits a math curriculum, whether the recommendation is `'do'`, `'skip'`, `'quick-review'`, or `'modify'`. The skip recommendation itself has no effect on the level derivation — only the lesson number matters.

| Subject | Updates `workingLevels`? | File:Line |
|---|---|---|
| Math | **Yes** — `deriveMathWorkingLevelFromScan` maps lesson → quest level | `useScanToActivityConfig.ts:81-83, 139-166` |
| Reading / Phonics | **No** — no equivalent `updateReadingWorkingLevel` exists | — |
| Language Arts / Other | **No** | — |

**Gap:** Reading/phonics scans never update `workingLevels`. A child advancing through a phonics workbook via scans produces no working level signal for the quest system. Only math scans bridge this gap.

---

### 5. Updates Skill Snapshot?

**Only the `workingLevels.math` field (via §4 above). No other Skill Snapshot fields are written.**

The scan flow does NOT update:
- `prioritySkills` — no mastery gate or level changes from scans
- `supports`, `stopRules`, `evidenceDefinitions` — untouched
- `conceptualBlocks` — untouched
- `completedPrograms` — untouched

The scan flow DOES write:
- `workingLevels.math` via `updateDoc(snapshotRef, { workingLevels: merged, updatedAt })` at `useScanToActivityConfig.ts:159-162` — math only, fire-and-forget

Additionally, `useUnifiedCapture.ts:107-119` feeds scan skills into the **Learning Map** (`childSkillMaps` collection) via `updateSkillMapFromFindings`, mapping scanned skills to mastered/emerging findings. This is a **separate** collection from `skillSnapshots` — it updates the curriculum knowledge graph, not the Skill Snapshot document.

| Snapshot field | Updated? | File:Line |
|---|---|---|
| `workingLevels.math` | **Yes** (math curricula only) | `useScanToActivityConfig.ts:159-162` |
| `workingLevels.phonics` | **No** | — |
| `workingLevels.comprehension` | **No** | — |
| `prioritySkills` | **No** | — |
| Learning Map (`childSkillMaps`) | **Yes** (separate collection) | `useUnifiedCapture.ts:110-119` |

---

### 6. Triggers any downstream AI reaction in quest or planner?

**No immediate trigger. Context available on next plan generation only.**

**Planner (next plan generation):** The `plan` task context includes `recentScans` (`contextSlices.ts:46`). `loadRecentScansContext` (`contextSlices.ts:869-914`) loads the 10 most recent scans per child, groups by workbook (most recent per workbook), and formats as:

```
RECENT WORKBOOK SCANS (where the child left off):
- GATB Math: Last at lesson/page 53 (multisyllable words) on 4/16/2026
Use this to know what lesson to assign next. Cross-reference with Skill Snapshot to determine skip guidance.
```

The loader does **not** include the `recommendation` or `action` fields — it only extracts `lessonNumber` and `specificTopic`. The planner AI cannot see that the scan recommended "skip."

**Quest (next quest session):** The `quest` task context does **NOT** include `recentScans` (`contextSlices.ts:51`). Quest sessions have no awareness of scan data. Working levels (§4) bridge math scans to quest starting levels, but nothing bridges reading/phonics scans.

**Cloud Function triggers:** No Firestore triggers exist on the `scans` collection (`functions/src/index.ts` — zero `onWrite`/`onCreate`/`onUpdate` handlers for scans). All scan processing is client-driven.

**Weekly review:** The `weeklyReview` Cloud Function (`functions/src/ai/evaluate.ts`) does not load scans. Its context includes day logs and evaluation sessions but not scan records.

| Downstream system | Reads scan data? | Sees skip recommendation? | File:Line |
|---|---|---|---|
| Planner (next `plan` generation) | **Yes** — lesson position only | **No** — `recommendation` field not extracted | `contextSlices.ts:869-914` |
| Quest (next session) | **No** — `recentScans` not in quest context | **No** | `contextSlices.ts:51` |
| Weekly review | **No** | **No** | — |
| Shelly Chat | **No** — `recentScans` not in shellyChat context | **No** | `contextSlices.ts:58-61` |
| Cloud Function triggers | **None exist** on `scans` collection | N/A | `functions/src/index.ts` |

---

### Summary of Gaps

| # | Gap | Severity | Notes |
|---|---|---|---|
| G34 | "Accept & advance" does not call `autoCompleteBypassedItems` | Medium | Other checklist items sharing the same `activityConfigId` remain uncompleted after position advances past them (`TodayPage.tsx:681-723` vs `useUnifiedCapture.ts:133-142`) |
| G35 | Reading/phonics scans never update `workingLevels` | Medium | Only math scans bridge to quest levels via `deriveMathWorkingLevelFromScan`; a child advancing through a phonics workbook produces no quest-level signal (`useScanToActivityConfig.ts:81-83`) |
| G36 | Planner does not see scan `recommendation` field | Medium | `loadRecentScansContext` extracts only `lessonNumber` and `specificTopic` — the AI planner cannot distinguish "do" from "skip" scans (`contextSlices.ts:886-903`) |
| G37 | Quest context has no scan awareness | Low | `recentScans` not in quest task context (`contextSlices.ts:51`); quest starting level depends on `workingLevels` (math only) or `activityConfigs` — scan position changes are invisible to quest for reading |
| G38 | No Cloud Function trigger on scan writes | Low | All scan-to-config processing is client-side and fire-and-forget; a failed `syncScanToConfig` or `updateMathWorkingLevel` is silently swallowed (`useScanToActivityConfig.ts:82, 123`) |
| G39 | Scan skip has no skill snapshot signal for non-math | Medium | A "skip" recommendation implies mastery, but for reading/LA/other subjects, no `prioritySkills` level, `masteryGate`, or `workingLevels` update occurs — the mastery signal is lost |

## Journey 5 (Part A): Quest AI Prompt — What's Included

**Trace:** The quest task handler assembles its system prompt from shared context slices + quest-specific data loaders + the static quest prompt template. This table lists every piece of data the AI receives.

Context slices for quest (`contextSlices.ts:51`): `["childProfile", "sightWords", "recentEval", "wordMastery", "skillSnapshot", "workbookPaces"]`

### Shared context slices (via `buildContextForTask`)

| Field / Data | Source Collection | Assembled At |
|---|---|---|
| **Child name** | `children/{childId}` | `contextSlices.ts:314` (via `formatChildProfile`) |
| **Child grade** | `children/{childId}` | `contextSlices.ts:315` (via `formatChildProfile`) |
| **Priority skills** (tag, label, level) | `skillSnapshots/{childId}` | `contextSlices.ts:316` (via `formatChildProfile`, from pre-loaded `snapshotData`) |
| **Supports** (label, description) | `skillSnapshots/{childId}` | `contextSlices.ts:317` (via `formatChildProfile`, from pre-loaded `snapshotData`) |
| **Stop rules** (label, trigger, action) | `skillSnapshots/{childId}` | `contextSlices.ts:318` (via `formatChildProfile`, from pre-loaded `snapshotData`) |
| **Sight word progress** (mastered/familiar/practicing/new counts, weak words, mastered words) | `sightWordProgress` | `chat.ts:1425-1462` (via `loadSightWordSummary`) |
| **Recent evaluation** — domain, date, summary | `evaluationSessions` (limit 1, most recent `complete`) | `chatTypes.ts:231-236` (via `loadRecentEvalContext`) |
| **Recent evaluation** — final level, score | `evaluationSessions` (same doc, interactive only) | `chatTypes.ts:233-234` |
| **Recent evaluation** — findings (skill, status, evidence) | `evaluationSessions` (same doc) | `chatTypes.ts:237-241` |
| **Recent evaluation** — recommendations (priority, skill, action, frequency, duration) | `evaluationSessions` (same doc) | `chatTypes.ts:243-249` |
| **Word mastery summary** (total words, counts by mastery level) | `children/{childId}/wordProgress` | `chat.ts:340-367` (via `loadWordMasterySummary`) |
| **Struggling patterns** (words grouped by phonics pattern) | `children/{childId}/wordProgress` (filtered `struggling`/`not-yet`) | `chat.ts:370-393` (via `loadWordMasterySummary`) |
| **Skill snapshot — priority skills** (tag, label, level, notes) | `skillSnapshots/{childId}` | `contextSlices.ts:674-677` (via `loadSkillSnapshotContext`) |
| **Skill snapshot — stop rules** | `skillSnapshots/{childId}` | `contextSlices.ts:682-686` (via `loadSkillSnapshotContext`) |
| **Skill snapshot — supports** | `skillSnapshots/{childId}` | `contextSlices.ts:692-695` (via `loadSkillSnapshotContext`) |
| **Skill snapshot — conceptual blocks** (ADDRESS_NOW only, with strategies) | `skillSnapshots/{childId}` | `contextSlices.ts:700-706` (via `loadSkillSnapshotContext`) |
| **Skill snapshot — completed programs** | `skillSnapshots/{childId}` | `contextSlices.ts:710-717` (via `loadSkillSnapshotContext`) |
| **Skill snapshot — planning guidance** (static text: Secure→SKIP, Emerging→practice, etc.) | n/a (static) | `contextSlices.ts:721-729` (via `loadSkillSnapshotContext`) |
| **Curriculum coverage** — name, unit label, currentPosition, totalUnits per workbook | `activityConfigs` (where `type == 'workbook'`, filtered not-completed) | `chat.ts:154-183` (via `loadWorkbookPaces`), formatted at `contextSlices.ts:392-449` |
| **Curriculum metadata** — provider, level, lastMilestone, milestoneDate, masteredSkills, activeSkills | `activityConfigs` (same docs, `.curriculumMeta` field) | `contextSlices.ts:417-430` |
| **GATB scope-and-sequence** — covered skills, current unit topic, upcoming units | Static data (`gatbCurriculum.ts`) keyed by curriculum position | `contextSlices.ts:433-447` (via `getGatbProgress`) |

### Quest-specific data loaders (in `quest.ts`)

| Field / Data | Source Collection | Assembled At |
|---|---|---|
| **Suggested start level** (from curriculum completion/mastered skills) | `activityConfigs` (where `type == 'workbook'`, Reading/LanguageArts) | `quest.ts:31-88` |
| **Struggling words** (word, pattern, correct/total ratio; top 15 by wrongCount) | `children/{childId}/wordProgress` (where `masteryLevel` in `struggling`/`not-yet`) | `quest.ts:97-113` |
| **Known words** (word list; top 30) | `children/{childId}/wordProgress` (where `masteryLevel == 'known'`) | `quest.ts:117-127` |
| **Quest mode** (phonics/comprehension/fluency) | Client message payload (first message JSON) | `quest.ts:134-142` |
| **Conversation messages** (action, answer, session state, recentQuestionTypes, bonusRound) | Client-side `messages` array passed to CF | `quest.ts:158` (passed to `callClaude`) |

### Static prompt template (via `buildQuestPrompt`)

| Field / Data | Source | Assembled At |
|---|---|---|
| **Quest role & interaction format** | Static text (Minecraft-themed quest master) | `chat.ts:933-939` (reading), `chat.ts:1169-1176` (math) |
| **Starting level directive** (if `suggestedStartLevel` set) | Derived from `activityConfigs` in `quest.ts:29-88` | `chat.ts:929-931` (reading phonics), `chat.ts:774` (comprehension) |
| **Skill progression ladder** (level → skill descriptions) | Static text | `chat.ts:941-952` (reading L1-10), `chat.ts:1178-1184` (math L1-6) |
| **Question format rules** | Static text | `chat.ts:953-959` (reading), `chat.ts:1186-1191` (math) |
| **Kid-friendly language rules** (banned terms, good/bad phrasing) | Static text | `chat.ts:961-986` (reading only) |
| **Answer validity rules** | Static text | `chat.ts:988-1005` |
| **Question type variety by level** (types to rotate through per level) | Static text | `chat.ts:1007-1055` (reading), `chat.ts:1193-1234` (math) |
| **Stimulus field rules** | Static text | `chat.ts:1057-1062` (reading only) |
| **Phoneme display rules** | Static text | `chat.ts:1064-1068` (reading only) |
| **Answer matching rules** | Static text | `chat.ts:1070-1074` |
| **Adaptive start / skill snapshot interpretation** | Static text | `chat.ts:1096-1103` |
| **Adaptive behavior (level up/down rules)** | Static text | `chat.ts:1109-1114` |
| **Bonus round rules** | Static text | `chat.ts:1116-1117` |
| **Finding generation format** | Static text | `chat.ts:1119-1122` |
| **Response JSON format** | Static text | `chat.ts:1124-1138` |
| **Session summary format** | Static text | `chat.ts:1140-1166` |

---

## Journey 5 (Part B-i): Missing from Quest Prompt — Structured Data

| Field | In Firestore? | In Quest Prompt? |
|---|---|---|
| `workingLevels` on `skillSnapshots/{childId}` | Yes — `src/core/types/evaluation.ts:98` | No — absent from `functions/src/ai/` entirely |
| `conceptualBlocks` on `skillSnapshots/{childId}` | Yes — `src/core/types/evaluation.ts:93` | Yes — `functions/src/ai/contextSlices.ts:659-704` (ADDRESS_NOW blocks injected via `skillSnapshot` slice) |
| `dispositionCache` on `children/{childId}` | Yes — written at `src/features/progress/DispositionProfile.tsx:179`; typed `src/core/types/disposition.ts:42-45` | No — absent from `functions/src/ai/` entirely |
| `parentOverride` on scans | Yes — `src/core/types/planning.ts:755` | No — absent from `functions/src/ai/` entirely |
| `parentOverride` on dispositions (`dispositionOverrides` on `children/{childId}`) | Yes — `src/core/types/disposition.ts:37-39`; written at `src/features/progress/DispositionProfile.tsx:221` | No — absent from `functions/src/ai/` entirely |

---

## Journey 5 (Part B-ii): Missing from Quest Prompt — History and Engagement

| Data source | In Firestore? | In Quest Prompt? |
|---|---|---|
| Recent scan recommendations (`scans` collection — `recommendation` field) | Yes — `src/core/types/planning.ts:696` (`recommendation` on scan results); loaded by `recentScans` slice at `functions/src/ai/contextSlices.ts:868-914` | No — `recentScans` is not in quest's slice list (`contextSlices.ts:51`); only used by `plan` and `scan` tasks |
| Engagement emoji data from day logs (`days` — `engagement` field on checklist items) | Yes — `src/core/types/planning.ts:288` (`engagement` on `ChecklistItem`) | No — `engagement` slice is not in quest's slice list (`contextSlices.ts:51`); only used by `plan`, `disposition`, `shellyChat` |
| Quest session history beyond the single most recent eval (multiple `evaluationSessions`) | Yes — `evaluationSessions` collection holds all completed sessions | No — `loadRecentEvalContext` at `functions/src/ai/chatTypes.ts:188-200` uses `.limit(1)`, returning only the single most recent session |
| Word mastery progression over time (`wordProgress` subcollection — trend, not just current) | Yes — `children/{childId}/wordProgress` stores per-word `correctCount`, `wrongCount`, `skippedCount` | No — `functions/src/ai/tasks/quest.ts:92-131` loads current counts only; no timestamps, no deltas, no trend |
| Hours/time data (`hours` collection — time per subject) | Yes — `hours` + `hoursAdjustments` collections; loaded by `hoursProgress` slice at `contextSlices.ts:332-333` | No — `hoursProgress` is not in quest's slice list (`contextSlices.ts:51`); only used by `plan` |

---

## Journey 5 (Part C): Quest AI — Top 3 Context Gaps

Based on Parts A and B, these are the three missing context items with the highest impact on question quality.

### G40 — ~~`workingLevels` not in AI prompt~~ **FIXED**

**FIXED** (R1). `workingLevels` is now loaded and formatted by both `loadSkillSnapshotContext` (for all tasks receiving the `skillSnapshot` slice) and read directly by `quest.ts` for starting-level computation. The `SnapshotData` type and `chat.ts` loader now include `workingLevels`. The quest task handler reads `workingLevels[questMode]` as the authoritative starting level, falling back to curriculum data only when absent, and caps at the same `QUEST_MODE_LEVEL_CAP` values as the client.

~~**What's missing:** The `workingLevels` map on `skillSnapshots/{childId}` — the authoritative numeric progression level computed from prior quest sessions — is never loaded or formatted by any Cloud Function code.~~

~~**Why it matters:** The client uses `workingLevels.phonics` to set the session's numeric starting level, but the AI generating questions never sees this number.~~

### G41 — Quest history limited to single most-recent cross-domain session

**FIXED** (R2). `loadRecentEvalHistoryByDomain` (`chatTypes.ts`) replaces the cross-domain `limit(1)` query with per-domain queries of 3 sessions each. Quest now receives a `recentHistoryByDomain` context slice filtered to the active quest mode's domain. The AI can see multi-session trends (e.g. "consistently misses vowel teams at Level 5") and session type (quest vs guided eval).

~~**What's missing:** `loadRecentEvalContext` (`chatTypes.ts:188-200`) queries `evaluationSessions` with `.limit(1)` across all domains and session types. No domain filter, no mode filter. The quest AI sees at most one prior session's findings and recommendations — and if a comprehension eval or math eval happened after the last phonics quest, the phonics data is completely eclipsed.~~

~~**Why it matters:** Without domain-filtered history, the AI generating a phonics quest cannot see what phonics skills were tested last time, what patterns the child struggled with, or what level the prior phonics session reached. It cannot avoid repeating question types or target known weak spots. The `wordMastery` slice partially compensates for word-level repetition, but question format, skill focus, and difficulty trajectory across sessions are invisible. This compounds the single-session limit: even when the most recent session IS phonics, the AI sees only one session — it cannot detect multi-session trends like "consistently misses vowel teams at Level 5."~~

### G42 — No engagement or disposition signal

**What's missing:** Neither the `engagement` context slice (day-log emoji data from checklist items) nor `dispositionCache`/`dispositionOverrides` (parent-confirmed or parent-edited disposition narratives on `children/{childId}`) are included in the quest context. The quest slice list (`contextSlices.ts:51`) omits `engagement` entirely; disposition data has no loader in Cloud Functions at all.

**Why it matters:** The quest AI generates questions in a fixed adaptive pattern (level up after 2 correct, level down after 2 wrong) with no awareness of the child's current energy, motivation, or disposition profile. For Lincoln — whose engagement varies significantly with energy mode and who has speech + neurodivergence accommodations — a "low energy" signal should bias toward shorter prompts, familiar formats, and more scaffolding. A "high engagement" signal could allow the AI to introduce harder question types or unfamiliar patterns. Without this data, the AI treats every session identically regardless of the child's state, missing the disposition-over-content-mastery principle that is the project's pedagogical north star.

## Data Flow Summary

| Write Source | What It Writes | Collection/Field | Who Reads It | Gap? |
|---|---|---|---|---|
| `persist` (SkillSnapshotPage.tsx:111) | `prioritySkills[n].level`, `updatedAt` (full doc overwrite via `setDoc`) | `skillSnapshots/{childId}` | Skill Snapshot UI (SkillSnapshotPage.tsx:357), AI `childProfile` slice (contextSlices.ts:316), AI `skillSnapshot` slice (contextSlices.ts:674), disposition handler via `childProfile` (contextSlices.ts:313) | — |
| `handleQuickLevelUpdate` (SkillSnapshotPage.tsx:225) | `prioritySkills[n].level` (converges on `persist`) | `skillSnapshots/{childId}` | Same as `persist` above | — |
| `endSession` (useQuestSession.ts:786) | Full session record (`questions`, `findings`, `recommendations`, `summary`, `finalLevel`, `totalCorrect`, `diamondsMined`, `streakDays`, etc.) | `evaluationSessions/{docId}` | EvaluationHistoryTab (EvaluationHistoryTab.tsx:485), `recentEval` slice for plan/scan (chatTypes.ts), `recentHistoryByDomain` slice for quest (chatTypes.ts), disposition `loadRecentEvaluations` (disposition.ts:87), Learning Map init (updateSkillMapFromFindings.ts:112) | ~~G16~~ FIXED — quest now uses per-domain history with depth 3 |
| `endSession` → `computeWorkingLevelFromSession` (useQuestSession.ts:921) | `workingLevels.{mode}` (level, source, evidence) | `skillSnapshots/{childId}.workingLevels` | Client `computeStartLevel` (workingLevels.ts:53); Server `quest.ts` starting level + `loadSkillSnapshotContext` AI prompt | G20 — not displayed in Skill Snapshot UI; ~~G40~~ FIXED |
| `endSession` (useQuestSession.ts:863–887) | `prioritySkills[n].level` (from quest findings: emerging→Emerging, mastered→Secure) | `skillSnapshots/{childId}.prioritySkills` | Same readers as `persist` above | — |
| `endSession` (useQuestSession.ts:890–917) | `prioritySkills[n].masteryGate` | `skillSnapshots/{childId}.prioritySkills[n].masteryGate` | `evaluateSkipEligibility` in skip advisor (dead code — G5); `loadSkillSnapshotContext` loads but does not format into prompt (G6) | G4, G5, G6 — functionally unread; skip advisor not wired to UI, AI prompt ignores it |
| `addXpEvent` (useQuestSession.ts:812) | QUEST_COMPLETE XP event (15 XP) | `xpLedger/{childId}_{dedupKey}` | XP ledger hooks, ArmorTab (ArmorTab.tsx:67) | — |
| `addXpEvent` (useQuestSession.ts:827) | QUEST_DIAMOND XP event (diamondCount × 2 XP) | `xpLedger/{childId}_{dedupKey}` | XP ledger hooks, ArmorTab (ArmorTab.tsx:98) | — |
| `addXpEvent` (addXpEvent.ts:116) | Cumulative XP total | `xpLedger/{childId}` (cumulative doc) | `useXpLedger` hooks | G14 — written twice per quest session (sequential, not racy, but redundant) |
| `addXpEvent` (addXpEvent.ts:137) | `totalXp` cache | `avatarProfiles/{childId}.totalXp` | Avatar UI, armor unlock logic (addXpEvent.ts:144) | — |
| `addDiamondEvent` (useQuestSession.ts:844) | Diamond event (1 × correct) | `xpLedger/{childId}_{dedupKey}` (currencyType: `'diamond'`) | XP ledger hooks | — |
| `addDiamondEvent` (addXpEvent.ts:99) | `diamondBalance` increment | `avatarProfiles/{childId}.diamondBalance` | `useDiamondBalance` hooks, avatar UI | — |
| `endSession` (useQuestSession.ts:798) | Hours entry (`source: 'quest-session'`, rounded to nearest 5 min) | `hours/{auto-id}` | Records hours aggregation (records.logic.ts:72), compliance exports (records.logic.ts:476) | G22 — no UI callout (unlike `creative-timer`); G15 — not logged if < 5 min active |
| `endSession` (useQuestSession.ts:940–984) | Per-word progress (correctCount, wrongCount, masteryLevel) | `children/{childId}/wordProgress` | Word Wall (useWordWall.ts:42), quest `wordMastery` loader (chat.ts:340), quest struggling words loader (quest.ts:97) | — |
| `endSession` → `updateSkillMapFromFindings` (useQuestSession.ts:927) | Curriculum knowledge map nodes | `childSkillMaps/{childId}` | Learning Map UI (learning-map/) | — |
| `handleSaveAndApply` (EvaluateChatPage.tsx:598) | Merge-write (`prioritySkills`, `supports`, `stopRules`, `evidenceDefinitions`, `updatedAt`) | `skillSnapshots/{childId}` | AI `skillSnapshot` slice (contextSlices.ts:674–717), Skill Snapshot UI, AI `childProfile` slice (contextSlices.ts:316) | ~~G27~~ ✅ FIXED — uses `setDoc` with `{ merge: true }`, unlisted fields preserved |
| `handleSaveAndApply` (EvaluateChatPage.tsx:567) | `workingLevels.phonics` (from eval findings, mastered skills only) | `skillSnapshots/{childId}.workingLevels.phonics` | Client `computeStartLevel` (workingLevels.ts:53) | ~~G40~~ FIXED — now read by server quest.ts + loadSkillSnapshotContext |
| `handleSaveAndApply` (EvaluateChatPage.tsx:572) | `workingLevels.comprehension` (from eval findings, mastered skills only) | `skillSnapshots/{childId}.workingLevels.comprehension` | Client `computeStartLevel` (workingLevels.ts:53) | ~~G40~~ FIXED — now read by server quest.ts + loadSkillSnapshotContext |
| `handleSaveAndApply` (EvaluateChatPage.tsx:579) | `workingLevels.math` (stubbed TODO) | `skillSnapshots/{childId}.workingLevels.math` | — | G26 — not implemented; math evals produce no workingLevel |
| `handleSaveAndApply` (EvaluateChatPage.tsx:592) | `conceptualBlocks` + `blocksUpdatedAt` (from pattern analysis, overwritten not merged) | `skillSnapshots/{childId}.conceptualBlocks` | AI `skillSnapshot` slice — ADDRESS_NOW blocks only (contextSlices.ts:700) | — |
| `logSessionHours` (EvaluateChatPage.tsx:208) | Hours entry (`source: 'evaluation-session'`, on AI `<complete>` tag) | `hours/{auto-id}` | Records hours aggregation (records.logic.ts:72), compliance exports | G28 — logged on eval complete, not on apply; hours exist without snapshot update if Apply never tapped |
| `handleSaveAndApply` → `addXpEvent` (EvaluateChatPage.tsx:607) | Eval XP event (25 XP) | `xpLedger/{childId}_{dedupKey}` | XP ledger hooks | — |
| `handleSaveAndApply` → `addDiamondEvent` (EvaluateChatPage.tsx:615) | Eval diamond event (5 diamonds) | `xpLedger/{childId}_{dedupKey}` | Diamond hooks | — |
| `handleSaveAndApply` → `updateSkillMapFromFindings` (EvaluateChatPage.tsx:602) | Curriculum knowledge map nodes (fire-and-forget) | `childSkillMaps/{childId}` | Learning Map UI (learning-map/) | — |
| `useScan` (useScan.ts:135) | Scan doc (`action: 'pending'`, `results.recommendation`, image, curriculum detected) | `scans/{auto-id}` | `recentScans` slice for plan/scan tasks (contextSlices.ts:869) | G37 — not in quest context; G36 — `recommendation` field not extracted by planner |
| `recordAction` (useScan.ts:164) | `action` → `'skipped'` | `scans/{docId}.action` | `recentScans` slice (position only) | G36 — `action` field not extracted by any AI loader |
| `handleAcceptSkip` (TodayPage.tsx:704) | `parentOverride` (`recommendation: 'skip'`, `overriddenAt`) | `scans/{docId}.parentOverride` | Not read by any AI loader or CF | Written but never read (server-side) — G36 |
| `syncScanToConfig` (useScanToActivityConfig.ts:62) | `currentPosition` advance | `activityConfigs/{configId}.currentPosition` | Planner `workbookPaces` slice (contextSlices.ts:392), quest `suggestedStartLevel` (quest.ts:31), `recentScans` slice (contextSlices.ts:886) | — |
| `autoCompleteBypassedItems` (scanAdvance.ts:18) | Checklist items `completed: true`, `gradeResult`, `skipReason` (all items sharing activityConfigId) | `days/{dayId}.checklist[n]` | Today UI, `engagement` slice (contextSlices.ts — plan/disposition/shellyChat) | — |
| `handleAcceptSkip` (TodayPage.tsx:692) | Single checklist item `skipped: true`, `skipReason: 'ai-recommended'` | `days/{dayId}.checklist[n]` | Today UI | G34 — other items with same activityConfigId NOT auto-completed |
| `updateMathWorkingLevel` (useScanToActivityConfig.ts:159) | `workingLevels.math` (derived from lesson→level map) | `skillSnapshots/{childId}.workingLevels.math` | Client `computeStartLevel` (workingLevels.ts:53) | G40 — not read by server quest.ts; G35 — no reading/phonics equivalent |
| `useUnifiedCapture` → `updateSkillMapFromFindings` (useUnifiedCapture.ts:110) | Curriculum knowledge map nodes from scan skills | `childSkillMaps/{childId}` | Learning Map UI (learning-map/) | — |
| DispositionProfile (DispositionProfile.tsx:179) | `dispositionCache` (AI-generated disposition narratives) | `children/{childId}.dispositionCache` | DispositionProfile UI (client-side cache) | Written but never read by any CF or AI prompt |
| DispositionProfile (DispositionProfile.tsx:221) | `dispositionOverrides` (parent inline edits/reverts per disposition) | `children/{childId}.dispositionOverrides` | DispositionProfile UI (client-side display) | Written but never read by any CF or AI prompt |

## Coherence Verdict

### 1. Does the system function as a coherent learning engine today?

Not yet. The capture layer is strong — quests, evals, scans, and daily logs all reliably write structured data to Firestore. But the feedback loops that would make it an *engine* are broken. Data flows forward (capture → store) but rarely flows back (store → adapt → generate). The quest, planner, and disposition systems each assemble their own partial, incompatible view of the child (G9, G32, G40). The result is a well-instrumented notebook, not a closed-loop engine.

### 2. Top 3 data flow gaps (evidence captured but unused downstream)

1. **`workingLevels`** — the authoritative quest progression level, written by quest sessions, evals, and math scans, is never read by any Cloud Function (G40). The client and server disagree on starting level, which is the single most impactful adaptive signal.
2. **`masteryGate`** — written by quest end flow, but the skip advisor that reads it is dead code (G5), `getEffectiveMasteryGate` is never called (G4), and the AI prompt ignores the field entirely (G6). Three layers of wiring exist; none are connected.
3. **Scan `recommendation`** — the AI's skip/do/modify verdict is stored on every scan but the planner extracts only lesson position, not the recommendation (G36), and the quest context has no scan awareness at all (G37). Mastery signals from scans are lost for all non-math subjects (G35, G39).

### 3. Where does Lincoln's data go to die (written but never read)?

- **`dispositionCache` and `dispositionOverrides`** on `children/{childId}` — Shelly's parent-edited disposition narratives are written by DispositionProfile but never read by any Cloud Function or AI prompt. The parent's voice on Lincoln's growth profile is invisible to every AI task.
- **`parentOverride`** on scans — written on "Accept & advance" (`TodayPage.tsx:704`) but never loaded by any AI context slice or CF. The parent's explicit curriculum judgment is silently discarded.
- **`masteryGate`** on priority skills — written by quest sessions (`useQuestSession.ts:890-917`) but functionally dead: skip advisor unwired (G5), fallback helper uncalled (G4), AI prompt omits it (G6).

### 4. Where does the AI operate with incomplete info the system actually has?

- **Quest AI** is the worst case: ~~no `workingLevels` (G40)~~ FIXED, ~~only 1 cross-domain session history (G41)~~ FIXED, no engagement emoji or disposition signal (G42), no scan data (G37). It generates questions blind to ~~Lincoln's proven stable level, prior session patterns,~~ current energy, and workbook progress — all of which exist in Firestore.
- **Disposition AI** omits the `skillSnapshot` and `recentEval` shared context slices (G32), rolling its own weaker loader that extracts only `findings[].text` from 3 sessions (G31). It cannot say "Lincoln jumped two phonics levels this week" because it never sees the numbers.
- **Planner AI** sees scan positions but not scan recommendations (G36), so it cannot honor a skip verdict. It receives skill snapshot data including "Secure → SKIP" guidance, but the client-side skip advisor that could enforce this structurally is dead code (G5, G11).

### 5. Is Learning Profile the right unified view surface?

Yes — it is the only surface that attempts to synthesize across domains into a narrative, which aligns with the "disposition over content mastery" north star. But it is currently the *weakest* data consumer in the system (G25, G31, G32). It should aggregate quest performance metrics, eval findings, scan progression, parent overrides, and workingLevels into a coherent growth picture. Today it sees almost none of this structured data. The fix is not a new surface — it is wiring Learning Profile's disposition task to the same rich context the planner already receives (`skillSnapshot`, `recentEval`, `recentScans`) plus the parent signals (`dispositionOverrides`, `parentOverride`) that currently go to die.

## Recommendations

Ordered by impact-per-effort. Each closes the gaps most responsible for the "well-instrumented notebook, not a closed-loop engine" verdict.

### R1. Feed `workingLevels` to the quest Cloud Function — **DONE**

**Closes:** G9, G12 (partial), G19, G29, G40
**Effort:** S
**Status:** Implemented 2026-04-16. `workingLevels` added to `SnapshotData` type and `chat.ts` loader. `loadSkillSnapshotContext` now formats working levels with level/source/date/evidence. `quest.ts` reads `workingLevels[questMode]` as authoritative starting level, falls back to curriculum data, caps at `QUEST_MODE_LEVEL_CAP`. Client and server now use the same source of truth.

### R2. Per-domain `recentEval` with depth > 1 ✅ FIXED

**Closes:** G16, G30, G41
**Effort:** S
**Status:** Implemented 2026-04-16. Added `loadRecentEvalHistoryByDomain` in `chatTypes.ts` — queries per-domain (phonics, comprehension, math, fluency) with configurable depth (default 3 sessions). New `recentHistoryByDomain` context slice added to `contextSlices.ts`, used by quest task instead of the old cross-domain `recentEval`. Quest passes `questMode` as domain filter so phonics quest sees phonics history only. Existing `recentEval` slice preserved for plan/scan/shellyChat backward compatibility. Output format includes session type (quest vs guided), level, score, and most-recent findings.

### R3. Wire disposition task to shared context slices

**Closes:** G25, G31, G32
**Effort:** S
Add `skillSnapshot` and `recentEval` to the disposition task's slice list in `contextSlices.ts:56` and remove (or supplement) the handler's bespoke `loadRecentEvaluations` loader. Learning Profile becomes the first surface to synthesize structured quest metrics, eval findings, and skill levels into a growth narrative — matching the "disposition over content mastery" north star.

### R4. Fix `setDoc` data loss in eval Apply ✅ FIXED

**Closes:** G27
**Effort:** S
~~Replace the bare `setDoc` at `EvaluateChatPage.tsx:598` with `setDoc(..., { merge: true })` or a read-modify-write pattern. Currently, tapping Apply silently erases any snapshot fields not rebuilt by `handleSaveAndApply` (e.g. `completedPrograms`, `workingLevels` written by a concurrent quest). This is the only High-severity data-loss bug in the audit.~~

**Resolution:** Added `{ merge: true }` to all three bare `setDoc` calls on `skillSnapshots`: `EvaluateChatPage.tsx:598` (eval Apply), `useQuestSession.ts:921` (quest endSession), and `backfillWorkingLevels.ts:235` (admin backfill). Fields not included in the write payload (e.g. `completedPrograms`, `createdAt`) are now preserved.

### R5. Surface scan recommendations to planner and bridge non-math scans to `workingLevels`

**Closes:** G35, G36, G37, G39
**Effort:** M
Extract the `recommendation` field (skip/do/modify) in `loadRecentScansContext` so the planner can honor skip verdicts. Add a reading/phonics equivalent of `deriveMathWorkingLevelFromScan` so workbook progression for non-math subjects feeds back into quest starting levels. Completes the scan→adapt feedback loop that currently works only for math.

## Open Questions

1. **Single source of truth for starting level.** Should the server adopt `workingLevels` as authoritative (matching the client), or should it blend `workingLevels` with curriculum position into a composite signal? If blended, which wins on conflict?

2. **How many sessions per domain in `recentEval`?** The current `limit(1)` is too few; 3 per domain enables trend detection but adds ~500 tokens per domain to the prompt. What's the right balance for cost vs. context richness?

3. **Skip advisor: structural or advisory?** Should the planner structurally remove mastered activities from generated plans (wire `evaluateSkipEligibility` into plan generation), or is prompt-level "Secure → SKIP" guidance sufficient? Structural enforcement is deterministic but rigid; advisory is flexible but the AI can ignore it.

4. **Should `dispositionOverrides` be visible to AI?** Parent-edited disposition narratives are currently written but never read by any CF. Feeding them into the disposition prompt gives the AI Shelly's voice — but the content is free-text, which means prompt injection risk and unpredictable prompt length. Is a structured summary safer than raw overrides?

5. **Reading/phonics scan → `workingLevels` mapping.** Math scans use a lesson-to-level lookup table (`deriveMathWorkingLevelFromScan`). What's the equivalent mapping for phonics workbooks? Is it a fixed table, or should it be derived from the `activityConfigs` curriculum structure?
