# Findings Pipeline

## Purpose

EvaluationFinding objects are the system's primary learning signal. They flow from Knowledge Mine quests and guided evaluations into multiple Firestore collections and AI context windows. Without this trace, future work risks duplicating features that already exist or proposing pipelines that are already wired.

## The Finding Object

Defined in `src/core/types/evaluation.ts:118-124`:

```ts
export interface EvaluationFinding {
  skill: string           // Dot-delimited skill tag (e.g. "phonics.cvc.short-o")
  status: 'mastered' | 'emerging' | 'not-yet' | 'not-tested'  // Assessment result
  evidence: string        // Human-readable description of what was observed
  notes?: string          // Optional additional context
  testedAt: string        // ISO timestamp of when the finding was recorded
}
```

Findings live inside `EvaluationSession.findings[]` (`evaluation.ts:111`). A session can be a guided evaluation or an interactive quest.

## Sources (where findings are created)

### 1. Knowledge Mine quests (`useQuestSession.ts`)

- **Extraction:** `extractQuestFinding()` at `src/features/quest/useQuestSession.ts:108-126`
- **Trigger:** Every AI response during a quest is parsed. The function looks for a `<quest>` XML tag containing JSON with a `finding` property.
- **AI return format:** `<quest>{"finding":{"skill":"...","status":"...","evidence":"..."},...}</quest>` embedded in the response alongside the next question.
- **Accumulation:** Extracted findings are appended to local `findings` state (line 322). Called at lines 648, 1152, 1192, 1319, 1359.

### 2. Guided evaluations (`EvaluateChatPage.tsx`)

- **Extraction:** `extractFindings()` at `src/features/evaluate/EvaluateChatPage.tsx:59-78`
- **Trigger:** Every AI response during a guided evaluation chat is parsed. The function looks for `<finding>` XML tags.
- **AI return format:** `<finding>{"skill":"...","status":"...","evidence":"...","notes":"..."}</finding>` — multiple tags per response allowed.

### 3. Curriculum scans (indirect)

Scans don't produce `EvaluationFinding` objects directly, but `CurriculumTab.tsx:251-253`, `TodayPage.tsx:473-475`, `useUnifiedCapture.ts:111-113`, and `CertificateScanSection.tsx:70-72` all construct findings-shaped arrays from scan results and pass them to `updateSkillMapFromFindings()`. These use the same type but originate from photo scan AI analysis rather than interactive sessions.

## Destinations (where findings are written)

### 1. `evaluationSessions` collection (primary session record)

- **Firestore path:** `families/{familyId}/evaluationSessions/{sessionId}`
- **Quest write:** `useQuestSession.ts:778-779` — `setDoc(ref, session)` where `session.findings` is the full array.
- **Eval write:** `EvaluateChatPage.tsx:273-279` — `setDoc(ref, session)` with deterministic ID `{childId}_{domain}_{date}`.
- **Shape at rest:** Full `EvaluationSession` object with `findings: EvaluationFinding[]`.
- **Mode:** Replacing (full session doc is overwritten on each persist call).

### 2. `skillSnapshots` collection (merged into prioritySkills)

- **Firestore path:** `families/{familyId}/skillSnapshots/{childId}`
- **Quest write:** `useQuestSession.ts:831-896` — reads existing snapshot, builds `PrioritySkill[]` from findings (emerging/not-yet become `SkillLevel.Emerging`, mastered become `SkillLevel.Secure`), merges with existing skills not covered by this session, then `setDoc`.
- **Eval write:** `EvaluateChatPage.tsx:452-559` — same pattern but also merges recommendations as priority skills and updates supports/stopRules/evidenceDefinitions from `<complete>` data.
- **Mode:** Merge — existing skills not touched by this session are preserved. Skills with matching tags are overwritten.

### 3. `childSkillMaps` collection (Learning Map)

- **Firestore path:** `families/{familyId}/childSkillMaps/{childId}`
- **Write function:** `updateSkillMapFromFindings()` at `src/core/curriculum/updateSkillMapFromFindings.ts:75-95`
- **Called from:** Quest endSession (line 904), EvaluateChatPage handleSaveAndApply (line 563), CurriculumTab (line 253), TodayPage (line 475), useUnifiedCapture (line 113), CertificateScanSection (line 72).
- **Shape at rest:** `ChildSkillMap` with `skills: Record<string, SkillNodeStatus>`. Finding skill tags are mapped to curriculum node IDs via `mapFindingToNode()` (`src/core/curriculum/mapFindingToNode.ts:105-168`).
- **Mode:** Additive/upgrade-only — status never downgrades (mastered > in-progress > not-started). Uses `setDoc` with `merge: true`.

### 4. `children/{childId}/wordProgress` subcollection (per-word tracking)

- **Firestore path:** `families/{familyId}/children/{childId}/wordProgress/{wordDocId}`
- **Write:** `useQuestSession.ts:910-958` — iterates answered questions (not findings directly), extracts target words, and updates per-word stats (correctCount, wrongCount, skippedCount, masteryLevel).
- **Shape at rest:** `WordProgress` object (`evaluation.ts:143-154`) with cumulative counts and calculated `masteryLevel`.
- **Note:** This destination is driven by individual question results, not by EvaluationFinding objects. It runs alongside finding extraction but tracks different granularity.

## Consumers (where findings are read and influence behavior)

### 1. Quest context — `recentEval` slice

- **Load:** `loadRecentEvalContext()` at `functions/src/ai/chatTypes.ts:187-257`
- **Read:** `evaluationSessions` with `status == 'complete'`, `orderBy('evaluatedAt', 'desc')`, **`limit(1)`**.
- **What it uses:** `findings[].skill`, `findings[].status`, `findings[].evidence`, plus `summary` and `recommendations`.
- **Downstream:** Formatted as text and injected into quest system prompt. The AI sees the most recent session's findings to avoid retesting mastered skills and to focus on gaps.
- **Limitation:** Only the single most recent session. Older findings are invisible unless they've been merged into skillSnapshot.

### 2. Quest context — `skillSnapshot` slice

- **Load:** `loadSkillSnapshotContext()` at `functions/src/ai/contextSlices.ts:643-712`
- **Read:** `skillSnapshots/{childId}` — reads `prioritySkills`, `supports`, `stopRules`, `conceptualBlocks`, `completedPrograms`.
- **Downstream:** Formatted as labeled text sections in the system prompt. This is the **cumulative** view — all findings that have ever been merged into the snapshot.
- **Tasks using this slice:** `quest`, `plan`, `scan` (see `TASK_CONTEXT` at `contextSlices.ts:41-61`).

### 3. Quest context — word progress

- **Load:** `functions/src/ai/tasks/quest.ts:91-131`
- **Read:** `children/{childId}/wordProgress` where `masteryLevel in ['struggling', 'not-yet']` (limit 15) and `masteryLevel == 'known'` (limit 30).
- **Downstream:** Struggling words are injected into the quest prompt with instructions to revisit them. Known words are listed so the AI avoids over-testing.

### 4. Planner context

- **Slices:** `plan` task uses both `recentEval` and `skillSnapshot` (contextSlices.ts:42-46).
- **Also:** Client-side planner prompts use `snapshot.prioritySkills` directly (`src/core/ai/prompts/plannerPrompts.ts:183`).
- **Downstream:** The planner AI sees accumulated skill priorities and the most recent eval findings when generating weekly plans.

### 5. `useEvaluationBookSuggestions` — book recommendations

- **File:** `src/features/books/useEvaluationBookSuggestions.ts:48-212`
- **Read:** Most recent complete Reading evaluation session (limit 1, line 61-69). Also reads `sightWordProgress` and `skillSnapshots`.
- **What it uses:** `findings` where status is `emerging`, `not-yet`, or `struggling` — specifically looking for sight-word and phonics skill tags.
- **Downstream:** Generates up to 3 `BookSuggestion` objects displayed as banners suggesting the parent create a practice book.

### 6. Working levels (`computeWorkingLevelFromSession`)

- **File:** `src/features/quest/workingLevels.ts:85-140`
- **Note:** This does NOT use findings directly. It uses `SessionQuestion[]` and `sessionEndLevel` to compute the next working level. Findings and working levels are sibling outputs of the same quest session, written to `skillSnapshots.workingLevels` independently.

### 7. Pattern analysis (cross-session)

- **Trigger:** `useQuestSession.ts:961-986` and `EvaluateChatPage.tsx:289` — if 3+ sessions exist, calls `analyzePatterns` Cloud Function.
- **Input:** Current session's findings plus up to 10 recent sessions loaded server-side.
- **Output:** `ConceptualBlock[]` written to `skillSnapshots.conceptualBlocks` — identifies recurring patterns (e.g., "consistently struggles with vowel teams across 3 sessions").

## The Practice Story Loop

1. **Button:** `src/features/quest/QuestSummary.tsx:418-440` — "Generate a practice story" button, shown when `strugglingWords.length > 0`.
2. **On tap:** Calls `onDone()` (closes quest), then `navigate('/books/create-story', { state: { prefillWords: strugglingWords, source: 'quest-summary' } })`.
3. **Destination:** `src/features/books/CreateSightWordBook.tsx:63-68` — reads `location.state.prefillWords` and populates the word input field.
4. **Story generation:** `useStoryGenerator.ts:19-45` calls `TaskType.GenerateStory` Cloud Function with the word list and theme. Context slices for `generateStory`: `childProfile`, `sightWords`, `wordMastery` (contextSlices.ts:52).
5. **Save:** Generated story is saved as a `Book` document via `addDoc(booksCollection(familyId), newBook)` at `CreateSightWordBook.tsx:141` (publish) or `:184` (edit).
6. **Does reading the story create new findings?** No. The book is saved to `families/{familyId}/books`. Reading it does not trigger any evaluation session or finding extraction. Reading hours can be logged as artifacts, but no `EvaluationFinding` objects are produced.

## Known Limitations

1. **`recentEval` uses `limit(1)`** — only the most recent session's findings appear in quest/plan AI context. Older session-level findings are invisible unless merged into `skillSnapshot.prioritySkills`. Pattern analysis (conceptualBlocks) partially compensates but only runs after 3+ sessions.

2. **Practice story loop is human-in-the-loop.** The "Generate a practice story" button must be tapped by Lincoln or Shelly. There is no automatic story generation from findings.

3. **Practice stories do NOT generate new findings.** Reading a generated book is tracked as hours/artifacts but produces no `EvaluationFinding` objects. The loop does not close automatically.

4. **Word progress tracks question-level data, not findings.** Per-word mastery in `wordProgress` is computed from individual quest answers (correct/wrong/skipped), not from the AI's skill-level findings. These are parallel but distinct data streams.

5. **Curriculum scan findings bypass evaluationSessions.** Scan-derived findings go directly to `childSkillMaps` via `updateSkillMapFromFindings()` but are never written to `evaluationSessions`. They are not visible via `recentEval` slice.

## What This Pipeline Already Does (Checklist)

- [x] Quest finds specific skill gaps (e.g., "phonics.cvc.short-o")
- [x] Findings auto-update skill snapshot priority skills
- [x] Findings auto-update Learning Map (childSkillMaps) via `updateSkillMapFromFindings`
- [x] Per-word mastery tracking from quest answers (wordProgress subcollection)
- [x] Next quest's AI prompt sees last session's findings (via `recentEval` slice)
- [x] Next quest's AI prompt sees cumulative skill snapshot (via `skillSnapshot` slice)
- [x] Next quest's AI prompt sees struggling/known words (via wordProgress query in quest.ts)
- [x] Planner's AI sees accumulated skill snapshot and most recent eval
- [x] Quest summary suggests practice story with specific struggling words
- [x] Story generator accepts prefilled words from quest summary
- [x] Generated story saves as a readable book in `books` collection
- [x] Book suggestions hook reads findings to recommend practice books
- [x] Cross-session pattern detection after 3+ sessions (conceptualBlocks)
- [x] Working level auto-updates from quest sessions and evaluations

## What This Pipeline Does NOT Do (Checklist)

- [ ] Cross-session finding aggregation beyond single most-recent session in AI context
- [ ] Automatic story generation without human tap
- [ ] Reading a practice story generating new findings (loop doesn't close)
- [ ] Findings expiring or being re-tested on a schedule
- [ ] Scan-derived findings appearing in `recentEval` AI context
- [ ] Math-domain working level derivation from eval findings (reading domain works; math has a TODO at `EvaluateChatPage.tsx:540`)

## File Index

- `src/core/types/evaluation.ts` — EvaluationFinding, EvaluationSession, SkillSnapshot, WordProgress types
- `src/features/quest/useQuestSession.ts` — Quest session hook; finding extraction, session save, snapshot update, word progress, pattern trigger
- `src/features/quest/QuestSummary.tsx` — Quest results UI; practice story button
- `src/features/quest/workingLevels.ts` — Working level computation from sessions and evaluations
- `src/features/evaluate/EvaluateChatPage.tsx` — Guided evaluation chat; finding extraction, session save, snapshot update
- `src/features/books/CreateSightWordBook.tsx` — Story generator UI; accepts prefilled words
- `src/features/books/useStoryGenerator.ts` — AI story generation hook (TaskType.GenerateStory)
- `src/features/books/useEvaluationBookSuggestions.ts` — Book suggestions from findings + sight word progress
- `src/core/curriculum/updateSkillMapFromFindings.ts` — Learning Map updater; maps findings to curriculum nodes
- `src/core/curriculum/mapFindingToNode.ts` — Finding skill tag to curriculum node ID mapping
- `functions/src/ai/chatTypes.ts` — `loadRecentEvalContext()` — loads most recent session for AI context
- `functions/src/ai/contextSlices.ts` — Context slice definitions, task-to-slice mapping, `loadSkillSnapshotContext()`
- `functions/src/ai/tasks/quest.ts` — Quest task handler; word progress loading, prompt assembly
- `functions/src/ai/tasks/analyzePatterns.ts` — Cross-session pattern analysis Cloud Function
- `src/core/ai/prompts/plannerPrompts.ts` — Client-side planner prompts using prioritySkills
- `src/core/firebase/firestore.ts` — Collection references (`evaluationSessionsCollection`, `skillSnapshotsCollection`, `childSkillMapsCollection`, `booksCollection`)
- `src/features/today/TodayPage.tsx` — Scan capture → findings → Learning Map
- `src/features/today/useUnifiedCapture.ts` — Unified capture pipeline → scan findings → Learning Map
- `src/features/progress/CurriculumTab.tsx` — Curriculum tab scan → findings → Learning Map
- `src/features/progress/CertificateScanSection.tsx` — Certificate scan → findings → Learning Map
