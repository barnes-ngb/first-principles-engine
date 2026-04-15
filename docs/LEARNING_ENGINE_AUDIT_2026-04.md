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
