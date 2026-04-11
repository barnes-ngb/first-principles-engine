# Chapter Question Pool — Design Document

**Date:** 2026-04-11
**Status:** Approved for build
**Branch:** `claude/chapter-question-pool-design-RWtdF`

## Problem

The weekly plan currently generates **one chapter question per day**, pre-assigned to specific days, assuming one chapter is read per day. This drifts out of sync with actual reading pace — e.g., the Today page asks about Narnia Ch 8 when Shelly and Lincoln just finished Ch 10.

## Solution

Redesign chapter questions as a **per-book question pool** that persists across weeks. Shelly picks which chapter(s) were actually read on the Today page, and matching questions render stacked with per-question audio recording.

## Design Decisions (Confirmed)

| Decision | Resolution |
|---|---|
| Source of truth for Today | `WeekPlan.readAloudBookId` — what book is active this week |
| Sticky preference across weeks | `plannerDefaults.selectedBookId` — pre-fills the planner |
| Multiple books per week | One for now. Data model supports a list later without breaking changes |
| Chapter summaries in seed | Yes — one-time curation cost, massively improves AI question quality |
| Chapter picker UX | Show **all** unanswered chapters as chips. Default-select the lowest unanswered. Shelly is the decider |
| XP for chapter responses | Deferred. Backlog item: 5 XP per chapter when added |
| Per-child vs per-family | Per-child. Lincoln and London read separately |
| Kid view | Out of scope this pass. Parent-driven for now |

---

## Data Model

### 1. Chapter Book Library (Global)

**Collection:** `curriculum/chapterBooks/{bookId}`

```typescript
export interface ChapterBook {
  id?: string
  title: string
  author: string
  totalChapters: number
  chapters?: ChapterInfo[]       // Per-chapter metadata for AI context
  coverImageUrl?: string
  createdAt: string
}

export interface ChapterInfo {
  number: number
  title?: string                 // e.g., "Lucy Looks Into a Wardrobe"
  summary?: string               // 1-2 sentence summary (AI question context)
}
```

**Rationale:** Global, not family-scoped. Chapter books are curriculum content — same for every family. Family-scoped custom books (`families/{familyId}/customChapterBooks/`) come later as a separate feature.

**Seed data location:** `src/core/data/chapterBooks.ts`

Seeded with *The Lion, the Witch and the Wardrobe* (C.S. Lewis, 17 chapters) including per-chapter titles and summaries.

### 2. Book Progress (Per-Child)

**Collection:** `families/{familyId}/bookProgress/{childId}_{bookId}`

Document ID is a deterministic composite key for easy existence checks via `getDoc`.

```typescript
export interface BookProgress {
  id?: string
  bookId: string                 // Reference to ChapterBook doc ID
  childId: string
  bookTitle: string              // Denormalized for display
  questionPool: ChapterQuestion[]
  currentChapter?: number        // Last chapter read (convenience)
  status: 'in-progress' | 'complete'
  startedAt: string              // ISO timestamp
  completedAt?: string           // Set when all chapters answered
  updatedAt: string
}

export interface ChapterQuestion {
  chapter: number
  chapterTitle?: string          // Denormalized from ChapterBook
  questionType: string           // comprehension | application | connection | opinion | prediction
  question: string
  answered: boolean
  answeredDate?: string          // YYYY-MM-DD
  audioUrl?: string              // Firebase Storage URL
  artifactId?: string            // Reference to artifact doc
  responseNote?: string          // Shelly's note
}
```

**Pool lifecycle:**
- On first book selection: create doc, generate questions for **all** chapters in a single AI call.
- On subsequent weeks with same book: doc already exists, no regeneration needed.
- If new chapters somehow needed (edge case): append-only — never regenerate existing questions.
- When all chapters answered: set `status: 'complete'`, `completedAt`.

### 3. WeekPlan Addition

Add to `WeekPlan` interface:

```typescript
export interface WeekPlan {
  // ... existing fields ...
  readAloudBookId?: string       // Active chapter book for this week
  readAloudBookTitle?: string    // Denormalized for display
}
```

This is the source of truth for "what book is active on the Today page this week."

### 4. Planner Defaults Addition

The existing `families/{familyId}/settings/plannerDefaults` doc gets:

```typescript
{
  // ... existing fields (weekEnergy) ...
  selectedBookId?: string        // Sticky preference, pre-fills next week
  selectedBookTitle?: string     // For display
  // Remove: readAloudBook, readAloudChapters (legacy free-text fields)
}
```

---

## Task Handler

### New: `functions/src/ai/tasks/chapterQuestions.ts`

**Task name:** `'chapterQuestions'`

**Model:** Claude Sonnet (consistent with other reasoning tasks)

**Prompt shape:**

```
System: You generate discussion questions for a chapter book read-aloud.

Context:
- Book: {title} by {author}
- Chapters needing questions: [list of chapter numbers + titles + summaries]
- Child: {name}, age {age}. {brief profile}
- Week virtue/theme: {virtue} — {theme} (thematic alignment when natural)
- Question types: comprehension, application, connection, opinion, prediction

Rules:
- Generate exactly ONE question per chapter listed.
- Vary questionType — never use the same type for consecutive chapters.
- Questions should be age-appropriate, open-ended, and encourage narration.
- For younger children (age < 8), simpler vocabulary and concrete scenarios.
- Reference Stonebridge Story Bible context when it naturally connects.

Return JSON:
{
  "questions": [
    { "chapter": 5, "questionType": "comprehension", "question": "..." }
  ]
}
```

**Invocation:** From `PlannerChatPage.tsx` during setup completion, **before** plan generation. If a book is selected and `bookProgress` doc doesn't exist (or has chapters without questions), call the task, populate the pool, then proceed with plan generation.

**Removes from plan generation:** The `chapterQuestion` field on `DraftDayPlan` and the chapter question generation instructions in `chat.ts` plan prompt are removed. Questions now come from the pool, not the plan.

---

## UI Changes

### Planner Setup Wizard

**File:** `src/features/planner-chat/PlannerSetupWizard.tsx`

**Change:** Replace the two free-text fields ("Book" + "Chapters this week") with a **dropdown/autocomplete** of chapter books from the global library.

- Options: books from `curriculum/chapterBooks`, plus "None (no chapter book)"
- Shows title, author, and chapter count
- Pre-filled from `plannerDefaults.selectedBookId` (sticky across weeks)
- No more chapter range input — chapters are picked on Today when actually read

**Props change:**
- Remove: `readAloudBook`, `onReadAloudBookChange`, `readAloudChapters`, `onReadAloudChaptersChange`
- Add: `chapterBooks: ChapterBook[]`, `selectedBookId: string | null`, `onBookChange: (bookId: string | null) => void`

### Plan Preview Cards

**Files:** `PlanDayCards.tsx`, `PlanPreviewCard.tsx`

**Change:** Remove per-day chapter question display. Questions no longer live on days. Optionally show a summary line: "Reading: The Lion, the Witch and the Wardrobe (12 of 17 chapters remaining)".

### Plan Application

**File:** `PlannerChatPage.tsx`

**Change in `handleApplyPlan`:** Write `readAloudBookId` and `readAloudBookTitle` to the `WeekPlan` doc instead of writing `chapterQuestion` per DayLog.

### Today Page (Parent View)

**File:** `src/features/today/TodayPage.tsx`

**Change:** Load `bookProgress` for active child + active book (from `weekPlan.readAloudBookId`). Render new `ChapterPoolCard` instead of old `ChapterQuestionCard`. Fallback: if `dayLog.chapterQuestion` exists but no `bookProgress`, render the legacy card (transition period).

### New Component: `ChapterPoolCard`

**File:** `src/features/today/ChapterPoolCard.tsx` (replaces `ChapterQuestionCard.tsx`)

**Behavior:**

1. **Chapter picker** — Tappable chips for all unanswered chapters. Lowest unanswered is default-selected. Answered chapters are hidden (or greyed with checkmark).

2. **Stacked questions** — Tapping a chip renders its question below. Multiple selections stack vertically.

3. **Per-question audio** — Each selected chapter gets its own audio recording block using `useAudioRecorder` hook (not manual MediaRecorder).

4. **On save per chapter:**
   - Update `bookProgress.questionPool[chapter].answered = true`, set `answeredDate`, `audioUrl`
   - Create an `Artifact` doc (evidence, same as current)
   - Create a `ChapterResponse` doc (backward compatible with existing `ChapterResponsesTab` and `disposition.ts`)
   - Chip moves to "answered" state

5. **Book complete** — When pool is empty: show completion card with book title. Set `bookProgress.status = 'complete'`.

6. **Shelly's note** — Per-question note field (same as current).

**Props:**

```typescript
interface ChapterPoolCardProps {
  bookProgress: BookProgress | null
  familyId: string
  childId: string
  weekFocus?: { theme?: string; virtue?: string; scriptureRef?: string } | null
  onProgressUpdate: (updated: BookProgress) => void
}
```

---

## Kid View (Out of Scope)

`KidChapterResponse.tsx` continues to read from `dayLog.chapterQuestion`. Since new plans won't write that field, the component will naturally stop rendering (it returns `null` when the field is absent). No code changes needed for this pass.

Future pass: kid view reads from `bookProgress` with its own chapter picker.

---

## Migration Plan

**Leave existing data alone.** No migration script needed.

- Existing `DayLog.chapterQuestion` fields are harmless — the legacy card handles them.
- Existing `chapterResponses` docs are unaffected — same collection, same shape, same queries.
- `plannerDefaults` field names change on next plan generation (overwrites old `readAloudBook`/`readAloudChapters`).
- Both `ChapterPoolCard` (new) and `ChapterQuestionCard` (legacy) render during transition. Legacy card stops appearing naturally when new plans no longer write `chapterQuestion` to DayLog.

---

## Files to Touch

### Backend + Data Model (~7 files)

| File | Action |
|---|---|
| `src/core/types/planning.ts` | Add `BookProgress`, `ChapterQuestion` types; add `readAloudBookId`/`readAloudBookTitle` to `WeekPlan` |
| `src/core/types/chapterBooks.ts` | **Create** — `ChapterBook`, `ChapterInfo` types |
| `src/core/firebase/firestore.ts` | Add `bookProgressCollection()`, `chapterBooksCollection()` helpers |
| `src/core/data/chapterBooks.ts` | **Create** — Narnia seed data (17 chapters with titles + summaries) |
| `functions/src/ai/tasks/chapterQuestions.ts` | **Create** — New task handler |
| `functions/src/ai/chat.ts` | Add `chapterQuestions` task dispatch; remove chapter question from plan prompt |
| `functions/src/ai/chatTypes.ts` | Add `chapterQuestions` task type |

### UI (~8 files)

| File | Action |
|---|---|
| `src/features/today/ChapterPoolCard.tsx` | **Create** — New chapter picker + stacked questions + audio |
| `src/features/today/TodayPage.tsx` | Load bookProgress, render ChapterPoolCard, fallback to legacy |
| `src/features/planner-chat/PlannerSetupWizard.tsx` | Replace free-text with book dropdown |
| `src/features/planner-chat/PlannerChatPage.tsx` | Load books, manage selectedBookId, invoke chapterQuestions task, write readAloudBookId to WeekPlan |
| `src/features/planner-chat/PlanDayCards.tsx` | Remove per-day chapter question section |
| `src/features/planner-chat/PlanPreviewCard.tsx` | Remove per-day chapter question display |
| `src/features/planner-chat/chatPlanner.logic.ts` | Remove `chapterQuestion` parsing from AI response |
| `src/core/types/planning.ts` | Remove `chapterQuestion` from `DraftDayPlan` (shared with backend) |

### Documentation (~4 files)

| File | Change |
|---|---|
| `CLAUDE.md` | Add `curriculum/chapterBooks` and `bookProgress` to collections table; add `chapterQuestions.ts` to CF task list |
| `docs/FIRESTORE_AUDIT.md` | Add new collections |
| `docs/SYSTEM_PROMPTS.md` | Document `chapterQuestions` task prompt |
| `docs/DOCUMENT_INDEX.md` | Add this design doc |

---

## Build Plan

Split into **2 build prompts** (backend can be tested independently):

### Prompt 1: Backend + Data Model
- New types (`ChapterBook`, `ChapterInfo`, `BookProgress`, `ChapterQuestion`)
- Firestore collection helpers
- Narnia seed data with chapter summaries
- `chapterQuestions` task handler
- Update `chat.ts` dispatch + remove chapter question from plan prompt
- Update `WeekPlan` type

### Prompt 2: UI
- Book picker in `PlannerSetupWizard`
- `ChapterPoolCard` component
- Today page integration (load bookProgress, render new card, fallback)
- Remove per-day chapter question from plan preview cards
- Remove `chapterQuestion` from `DraftDayPlan` and parsing logic
- PlannerChatPage: invoke chapterQuestions task, write bookId to WeekPlan

---

## Backlog (Out of Scope)

- **XP for chapter responses** — 5 XP per chapter answered (same as daily armor ritual)
- **Kid view redesign** — Kid reads from `bookProgress` with own chapter picker
- **Custom books** — Shelly adds books to family library (`customChapterBooks` collection)
- **Multiple books per week** — Data model supports; UI iterates a list instead of single book
- **Book recommendations** — AI suggests next book based on reading level + interests
