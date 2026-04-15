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
| G9 | Client vs server starting-level divergence | Medium | Client reads `workingLevels` (authoritative); server CF (`functions/src/ai/tasks/quest.ts:29-88`) reads only `activityConfigs` curriculum data — they can disagree |
| G10 | Math quests have no AI starting-level injection | Low | `buildQuestPrompt` only injects `STARTING LEVEL:` for reading domain modes; math gets no level directive in the prompt |
| G11 | `applySnapshotSuggestions` ignores mastery gates | Medium | `src/features/planner-chat/chatPlanner.logic.ts` plan generation uses stop rules + duration heuristics, not `evaluateSkipEligibility` — the code-driven skip path is fully bypassed |
| G12 | `workingLevels` not included in AI context text | Low | `loadSkillSnapshotContext` formats priority skills, stops, supports, blocks — but omits the numeric `workingLevels` field; the AI never sees quest progression levels |

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
