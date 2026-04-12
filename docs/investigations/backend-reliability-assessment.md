# Backend Reliability Assessment — Knowledge Mine

_Date: 2026-04-12_

---

## 1. Is the backend signal reliable enough to build on?

**Short answer: The findings pipeline is clean, but the "Generate a practice story" button is not wired to it.**

### What works

The data flow from quest session to persistence is solid:

1. AI generates findings inside `<quest>{...}</quest>` tags containing structured JSON
2. `extractQuestFinding()` (`useQuestSession.ts:108-126`) parses them into well-typed `EvaluationFinding` objects (`{ skill, status, evidence, notes? }`)
3. Findings accumulate in state, then persist to `evaluationSessions/{childId}_{domain}_{date}` on session end
4. Findings also flow to `skillSnapshots/{childId}.prioritySkills` and `workingLevels`

The types are tight (`src/core/types/evaluation.ts`). Status is a union of `'mastered' | 'emerging' | 'not-yet' | 'not-tested'`. No loose `any` types in the critical path.

### What's broken

The "Generate a practice story" button (`QuestSummary.tsx:418-442`) passes only **struggling words** (extracted from failed question stimuli) to the book creator:

```tsx
navigate('/books/create-story', {
  state: { prefillWords: strugglingWords, source: 'quest-summary' }
})
```

The `CreateSightWordBook` component receives word strings — it never sees the `EvaluationFinding[]` array, the skill tags, the mastery levels, or the evidence.

On the server side, `generateStory` loads context slices `["childProfile", "sightWords", "wordMastery"]` (`contextSlices.ts:52`). Notably absent: `recentEval` and `skillSnapshot`. The story generator has **zero visibility** into what the child just demonstrated.

### Verdict

**The backend signal is reliable and clean.** The gap is a wiring problem, not a data quality problem. To fix it:
- Add `"recentEval"` and `"skillSnapshot"` to the `generateStory` context slice list
- Pass findings (or at minimum the skill tags + statuses) via navigation state to the book creator
- Estimated change: ~15 lines across `contextSlices.ts` + `QuestSummary.tsx` + `CreateSightWordBook.tsx`

---

## 2. What is the smallest change to make manual override prevent overwrites for 48 hours?

**Short answer: The 48-hour protection already works for WorkingLevels. It does NOT exist for PrioritySkills.**

### What's implemented

`canOverwriteWorkingLevel()` in `workingLevels.ts:16-27` is correct and enforced in all three write paths:

| Write path | File | Guard present? |
|---|---|---|
| Quest session end | `useQuestSession.ts:879` | Yes |
| Evaluation save | `EvaluateChatPage.tsx:529,534` | Yes |
| Curriculum scan | `useScanToActivityConfig.ts:156` | Yes |

Tests confirm both the block-within-48h and allow-after-48h cases (`workingLevels.test.ts:73-81`).

### What's missing

`PrioritySkill` (`evaluation.ts:24-31`) has **no `source` field and no `updatedAt` field**:

```typescript
export interface PrioritySkill {
  tag: SkillTag
  label: string
  level: SkillLevel
  notes?: string
  masteryGate?: MasteryGate
  // No source, no timestamp
}
```

When an evaluation completes, priority skills are merged by tag — existing skills with matching tags are **replaced unconditionally** (`EvaluateChatPage.tsx:463-546`). A manually curated priority skill list gets silently overwritten by the next eval.

### The single smallest fix

Add `source` and `updatedAt` to `PrioritySkill`, then guard the merge:

**File: `src/core/types/evaluation.ts`** — add two optional fields to `PrioritySkill`:
```typescript
source?: WorkingLevelSource
updatedAt?: string
```

**File: `src/features/evaluate/EvaluateChatPage.tsx`** — in the priority skill merge (~line 500), add:
```typescript
// Keep manually-set skills that are still within the 48h window
const isProtected = (s: PrioritySkill) =>
  s.source === 'manual' && s.updatedAt &&
  Date.now() - new Date(s.updatedAt).getTime() < 48 * 60 * 60 * 1000

const existingSkills = (existing.prioritySkills || []).filter(
  (s) => isProtected(s) || !newPrioritySkills.some((n) => n.tag === s.tag),
)
```

**Estimated size: ~20 lines across 2 files.** No migration needed — the new fields are optional, so existing documents read cleanly.

---

## 3. Is the cross-session pattern recognition loop actually closed?

**Short answer: About 60% closed. Findings flow forward, but the quest prompt doesn't act on them.**

### The data path (works)

```
Session N ends
  → findings saved to evaluationSessions
  → workingLevels updated in skillSnapshot
  → if sessionsCount >= 3: analyzeEvaluationPatterns() runs
      → loads last 5 sessions
      → identifies ConceptualBlocks (ADDRESS_NOW / DEFER)
      → saves blocks to skillSnapshot.conceptualBlocks
```

### The read path (partially works)

When session N+1 starts, the quest task loads context slices:
```
quest: ["childProfile", "sightWords", "recentEval", "wordMastery", "skillSnapshot", "workbookPaces"]
```

- `recentEval` loads the most recent complete session's findings and recommendations (`contextSlices.ts:187-257`)
- `skillSnapshot` includes conceptual blocks marked `ADDRESS_NOW` with strategies (`contextSlices.ts:699-707`)

So the data **is present in the prompt context**.

### The gap (open)

`buildQuestPrompt()` (`chat.ts:~916`) does not contain instructions that tell Claude to:
- Prioritize questions targeting `ADDRESS_NOW` conceptual blocks
- Adjust difficulty curves based on detected patterns
- Repeat skill areas that showed regression across sessions

The conceptual blocks are in the context window as formatted text, so Claude _might_ use them heuristically, but there's no explicit directive. This makes the behavior unreliable — sometimes Claude picks up on it, sometimes it doesn't.

### What would close the loop

Add 5-10 lines to `buildQuestPrompt()` in `chat.ts`:
```
If the child has ADDRESS_NOW conceptual blocks, prioritize questions
that probe those specific skill areas. Use the listed strategies
to scaffold questions. Do not skip these areas even if the child's
working level suggests they've moved past them.
```

**Estimated size: ~10 lines in `chat.ts`.** No structural changes needed.

---

## 4. The ONE improvement to ship for Lincoln this week

### Recommendation: Close the cross-session loop in the quest prompt

**File:** `functions/src/ai/chat.ts`, inside `buildQuestPrompt()` (~line 916)
**Change:** Add explicit instructions for Claude to use conceptual blocks and recent evaluation patterns when generating questions
**Estimated size:** 10-15 lines of prompt text + 5 lines of context formatting

### Why this over the other options

| Option | Impact | Effort | Risk |
|---|---|---|---|
| Wire story button to findings | Nice polish | ~15 lines | Low |
| Fix PrioritySkill protection | Data integrity | ~20 lines | Low |
| **Close the quest loop** | **Directly improves Lincoln's learning** | **~15 lines** | **Low** |
| Add read-aloud/articulation tracking | High eventual value | ~200+ lines, new UI | Medium |

The cross-session loop is the highest-leverage change because:

1. **Lincoln's phonics are "recently clicking"** — this is a fragile skill window. The system already detects his conceptual blocks (after 3+ sessions) and stores ADDRESS_NOW strategies. But right now, the next quest session **ignores that analysis** and generates generic questions. Closing this loop means session 4 actually drills the specific patterns session 3 identified as weak.

2. **Zero UI work.** The data pipeline exists. The context slices load. The prompt just needs to be told to use what's already there.

3. **Compounds over time.** Every subsequent session becomes more targeted. The pattern analyzer gets better data because questions are probing real gaps instead of random skill coverage.

4. **Ships in an hour.** It's a prompt-only change to a Cloud Function — deploy, done. No client build, no migration, no new components.

### The specific change

In `buildQuestPrompt()`, after the level progression rules, add:

```
## Cross-Session Patterns

If the SKILL SNAPSHOT section above lists CONCEPTUAL BLOCKS marked
ADDRESS_NOW, you MUST:
1. Include at least 2 questions per session that directly target
   skills listed under those blocks
2. Use the strategies provided for each block to scaffold your questions
3. When a child answers these targeted questions correctly, note it
   explicitly in your finding: "Previously blocked on X — now showing
   progress"
4. Do NOT skip these areas even if the child's current working level
   is above the block's skill level

This ensures that detected patterns are actively remediated, not just
logged.
```

Then in `loadSkillSnapshotContext()` (`contextSlices.ts:~699`), ensure the ADDRESS_NOW blocks are formatted with their strategies prominently (they already are, but verify the formatting is parse-friendly for the quest prompt).
