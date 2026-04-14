# Skip Inventory 2026-04-09

## Scan Pipeline

### Overview

The scan pipeline lets a parent photograph a workbook page, sends the image to Claude Vision for analysis, and returns a structured `ScanResult` with a recommendation (`do | skip | quick-review | modify`). The parent can override the AI recommendation. Results are persisted in Firestore and displayed in the Today checklist and Curriculum tab.

---

### How `useScan` works

**File:** `src/core/hooks/useScan.ts` (178 lines)

The hook exposes `scan()`, `recordAction()`, `scanResult`, `scanning`, `error`, and `clearScan` (interface `UseScanResult`, lines 11-28).

#### `scan(file, familyId, childId)` — lines 59-157

1. **Compress** the image to <= 1 MB, max 2048x2048, quality 0.85 via `compressIfNeeded` (lines 66-75).
2. **Upload** to Firebase Storage at `families/{familyId}/scans/{timestamp}.{ext}` and get a download URL (lines 77-83).
3. **Base64-encode** the compressed file and infer media type (lines 85-87).
4. **Call the `chat` Cloud Function** with `taskType: TaskType.Scan` and a single user message containing `{ imageBase64, mediaType }` as JSON (lines 89-106). The backend handler is `functions/src/ai/tasks/scan.ts`.
5. **Parse** the AI JSON response into a `ScanResult`. If parsing fails, the raw message is stored as `error` (lines 114-122).
6. **Save** a `ScanRecord` to `families/{familyId}/scans` in Firestore with `action: 'pending'` (lines 124-144).
7. Return the `ScanRecord` (or `null` on failure).

#### `recordAction(familyId, record, action)` — lines 159-169

Updates the scan document's `action` field to `'added'` or `'skipped'` via `updateDoc`.

---

### How `handleUnifiedCapture` works

**File:** `src/features/today/useUnifiedCapture.ts` (186 lines)

`handleUnifiedCapture(file, index)` (lines 68-172) is the entry point when a parent taps the camera on a checklist item:

1. Calls `runScan(file, familyId, childId)` (line 76) which delegates to `useScan.scan()`.
2. **Routes** on `pageType` (lines 82-85):
   - **Curriculum path** (worksheet / textbook / test): calls `syncScanToConfig(childId, results)` to create or update an `ActivityConfig` (line 90), then feeds `skillsTargeted` into the Learning Map via `updateSkillMapFromFindings` (lines 103-117), and links the scan doc to the checklist item with `evidenceCollection: 'scans'` (lines 120-125).
   - **Artifact path** (certificate, other, or scan failure): saves a photo artifact to `families/{familyId}/artifacts`, links it to the checklist item with `evidenceCollection: 'artifacts'` (lines 127-158).

`syncScanToConfig` lives in `src/core/hooks/useScanToActivityConfig.ts`. It matches the detected curriculum to an existing `ActivityConfig` (workbook type), advances `currentPosition` if the lesson number is higher, or creates a new config. It does **not** consult the `recommendation` field at all (lines 25-134).

---

### `ScanResult` shape (full types)

**File:** `src/core/types/planning.ts`, lines 663-757

```ts
// line 666
export interface CurriculumDetected {
  provider: 'gatb' | 'reading-eggs' | 'other' | null
  name: string | null
  lessonNumber: number | null
  pageNumber: number | null
  levelDesignation: string | null
}

// line 674
export interface ScanSkillResult {
  skill: string                                           // e.g. "two-digit addition with regrouping"
  level: 'introductory' | 'practice' | 'mastery' | 'review'
  alignsWithSnapshot: 'ahead' | 'at-level' | 'behind' | 'unknown'
}

// line 680
export interface WorksheetScanResult {
  pageType: 'worksheet' | 'textbook' | 'test' | 'activity' | 'other'
  subject: string                                         // e.g. "math", "reading"
  specificTopic: string                                   // e.g. "two-digit addition with regrouping"
  skillsTargeted: ScanSkillResult[]
  estimatedDifficulty: 'easy' | 'appropriate' | 'challenging' | 'too-hard'
  recommendation: Recommendation                          // AI's suggestion
  recommendationReason: string                            // why
  estimatedMinutes: number
  teacherNotes: string                                    // tips for parent
  curriculumDetected?: CurriculumDetected
}

// line 693
export interface CertificateScanResult {
  pageType: 'certificate'
  curriculum: 'reading-eggs' | 'gatb' | 'other'
  curriculumName: string
  level: string
  milestone: string
  lessonRange: string
  skillsCovered: string[]
  wordsRead: string[]
  date: string
  childName: string
  suggestedSnapshotUpdate: {
    masteredSkills: string[]
    recommendedStartLevel: number | null
    notes: string
  }
  curriculumDetected?: CurriculumDetected
}

// line 712 — discriminated union
export type ScanResult = WorksheetScanResult | CertificateScanResult

// line 714-722 — type guards
export function isCertificateScan(result: ScanResult): result is CertificateScanResult
export function isWorksheetScan(result: ScanResult): result is WorksheetScanResult

// line 725
export type Recommendation = 'do' | 'skip' | 'quick-review' | 'modify'

// line 728
export interface ParentOverride {
  recommendation: Recommendation
  overriddenBy: string                                    // currently always 'parent'
  overriddenAt: string                                    // ISO timestamp
  note?: string                                           // optional free-text reason
}

// line 735
export interface ScanRecord {
  id?: string
  childId: string
  imageUrl: string                                        // Firebase Storage download URL
  storagePath: string                                     // Storage path for cleanup
  results: ScanResult | null                              // null when AI returned non-JSON
  action: 'added' | 'skipped' | 'pending'                // user's disposition choice
  error?: string                                          // raw AI text if JSON parse failed
  createdAt?: string
  parentOverride?: ParentOverride                         // takes precedence over AI rec
}

// line 753 — canonical reader
export function effectiveRecommendation(scan: ScanRecord): Recommendation | undefined {
  if (scan.parentOverride) return scan.parentOverride.recommendation
  if (scan.results && isWorksheetScan(scan.results)) return scan.results.recommendation
  return undefined
}
```

**Firestore collection helper:** `src/core/firebase/firestore.ts`, lines 411-414 — `scansCollection(familyId)` maps to `families/{familyId}/scans`.

No Zod validation schema exists for these types.

---

### What `parentOverride` does

#### Type & helper

- **Defined:** `src/core/types/planning.ts:728-733` (`ParentOverride` interface).
- **Field on ScanRecord:** `src/core/types/planning.ts:745` — optional.
- **Reader:** `effectiveRecommendation(scan)` at `src/core/types/planning.ts:753-757` returns `parentOverride.recommendation` when present, otherwise falls back to `results.recommendation`.

#### Where it is written (set / saved / reverted)

`src/components/ScanAnalysisPanel.tsx`:
- **Save:** `handleOverrideSave` (lines 57-78) — builds a `ParentOverride` object (`overriddenBy: 'parent'`, ISO timestamp, optional note) and writes it to Firestore via `updateDoc(doc(scansCollection(familyId), scan.id), { parentOverride })`.
- **Revert:** `handleRevert` (lines 80-93) — removes the field via `updateDoc(..., { parentOverride: deleteField() })`.
- **UI:** Override menu (lines 290-305) offers all four `Recommendation` values; optional note input (lines 307-341).

#### Where it is read (consumed)

| Location | File : Lines | What it does |
|---|---|---|
| `effectiveRecommendation()` | `src/core/types/planning.ts:753-757` | Canonical reader; prefers override |
| Scan feedback builder | `src/features/today/TodayPage.tsx:394` | Uses `effectiveRecommendation(scan) ?? r.recommendation` to populate `scanFeedbackBySubject` |
| Analysis panel display | `src/components/ScanAnalysisPanel.tsx:98` | Computes displayed recommendation |
| Override badge (collapsed) | `src/components/ScanAnalysisPanel.tsx:121-130` | Shows "Overridden" label |
| Override attribution | `src/components/ScanAnalysisPanel.tsx:254-264` | Shows "Overridden by Shelly" + note |
| ScanResultsPanel | `src/components/ScanResultsPanel.tsx:59-61, 100` | Accepts `overrideRecommendation` prop, uses it over `results.recommendation` |
| CurriculumTab workbook cards | `src/features/progress/CurriculumTab.tsx:683` | Renders `ScanAnalysisPanel` for recent scans |
| CurriculumTab this week | `src/features/progress/CurriculumTab.tsx:360` | Renders `ScanAnalysisPanel` for weekly scans |
| TodayChecklist evidence | `src/features/today/TodayChecklist.tsx:818` | Renders `ScanAnalysisPanel` for linked scans |

**Key design point:** The AI's original `results.recommendation` is never mutated. `parentOverride` is stored alongside it and takes precedence only via `effectiveRecommendation()`.

---

### When recommendation is `'skip'` — acted on or display-only?

**Answer: Display-only.** No code automatically skips an activity or advances a curriculum position based on a `'skip'` recommendation. The recommendation is surfaced to the parent in three ways, all purely informational:

#### 1. Checklist inline badge

`src/features/today/TodayChecklist.tsx:558-583` — When `scanFeedbackBySubject[bucket].recommendation === 'skip'`, the checklist item shows:

```
skip emoji  Skip -- already knows this -- {topic} (~{minutes}m)
```

Styled with `bgcolor: 'success.50'`, `color: 'success.main'`. No programmatic side-effect.

#### 2. `skipGuidance` on checklist items

`src/features/today/TodayPage.tsx:593-595` — When the user clicks "Add to Plan" on a scan result with recommendation `'skip'` or `'quick-review'`, a `skipGuidance` string is written to the checklist item:

```ts
skipGuidance: r.recommendation === 'skip' || r.recommendation === 'quick-review'
  ? `${r.recommendation}: ${r.recommendationReason}`
  : undefined,
```

This string is displayed as a text label in `TodayChecklist.tsx:598-609`. It is advisory — the checklist item is still present, not removed or auto-completed.

#### 3. "Skip to lesson N" button

`src/components/ScanResultsPanel.tsx:191-208` — When recommendation is `'skip'`, a success `Alert` displays:

> "{childName} has this mastered. Skip ahead to the next new content."

With an optional "Skip to lesson {nextLesson}" button. **This button is user-initiated only** — it calls `handleSkipToNext(nextLesson)` (`src/features/today/TodayPage.tsx:647-668`) which manually advances `currentPosition` in the `ActivityConfig` via `syncScanToConfig`. The button must be explicitly tapped.

#### 4. `handleScanSkip` (user-initiated dismiss)

`src/features/today/TodayPage.tsx:605-609` — When the parent dismisses a scan result, `recordScanAction(familyId, scanResult, 'skipped')` writes `action: 'skipped'` to Firestore. This records the parent's choice but triggers no downstream automation.

#### What `useScanToActivityConfig` does with recommendations

**Nothing.** `src/core/hooks/useScanToActivityConfig.ts` (261 lines) processes `curriculumDetected` and `estimatedMinutes` but never reads `recommendation` or `recommendationReason`. The recommendation field has zero influence on config creation/update logic.

---

### Summary table

| Concern | Location |
|---|---|
| Scan hook | `src/core/hooks/useScan.ts` |
| Unified capture router | `src/features/today/useUnifiedCapture.ts` |
| Backend scan task handler | `functions/src/ai/tasks/scan.ts` |
| Type definitions | `src/core/types/planning.ts:663-757` |
| Firestore collection | `families/{familyId}/scans` via `src/core/firebase/firestore.ts:411-414` |
| Config sync (no rec logic) | `src/core/hooks/useScanToActivityConfig.ts` |
| Parent override UI | `src/components/ScanAnalysisPanel.tsx` |
| Checklist feedback display | `src/features/today/TodayChecklist.tsx:558-609` |
| Scan results display | `src/components/ScanResultsPanel.tsx` |
| TodayPage handlers | `src/features/today/TodayPage.tsx:580-668` |

---

## Workbook / Lesson Tracking

### ActivityConfig document shape (full type)

**File:** `src/core/types/planning.ts:810-868`

```ts
export interface ActivityConfig {
  id: string
  name: string                         // e.g., "Good and the Beautiful Reading"
  type: ActivityType                   // 'formation' | 'workbook' | 'routine' | 'activity' | 'app' | 'evaluation'
  subjectBucket: SubjectBucket
  defaultMinutes: number
  frequency: ActivityFrequency         // 'daily' | '3x' | '2x' | '1x' | 'as-needed'
  childId: string | 'both'
  sortOrder: number

  // Workbook-specific (optional)
  curriculum?: string                  // e.g., "GATB", "Explode the Code"
  totalUnits?: number
  currentPosition?: number             // lesson/page number
  unitLabel?: string                   // "lesson", "chapter", "unit"
  curriculumMeta?: CurriculumMeta      // certificate-derived metadata (migration bridge)

  // Completion tracking
  completed: boolean
  completedDate?: string               // ISO date

  // Scan/map connection
  scannable: boolean
  linkedCurriculumNodes?: string[]

  // Block-based schedule grouping
  block?: ScheduleBlock                // 'formation' | 'readaloud' | 'choice' | 'core-reading' | 'core-math' | 'flex' | 'independent'
  pairedWith?: string                  // activity ID to run simultaneously with
  choiceGroup?: string                 // group ID for "pick your order" items
  droppableOnLightDay?: boolean
  aspirational?: boolean               // don't count as missed if unchecked

  // Metadata
  notes?: string
  createdAt: string
  updatedAt: string
}
```

**Supporting types:**

- `ActivityType` — `src/core/types/enums.ts:308-316` — `'formation' | 'workbook' | 'routine' | 'activity' | 'app' | 'evaluation'`
- `ActivityFrequency` — `src/core/types/enums.ts:318-325` — `'daily' | '3x' | '2x' | '1x' | 'as-needed'`
- `ScheduleBlock` — `src/core/types/enums.ts:336-345` — `'formation' | 'readaloud' | 'choice' | 'core-reading' | 'core-math' | 'flex' | 'independent'`
- `CurriculumMeta` — `src/core/types/planning.ts:534-549` — `{ provider, level?, lastMilestone?, milestoneDate?, completed?, masteredSkills?, activeSkills? }`

**Firestore collection:** `families/{familyId}/activityConfigs` — helper at `src/core/firebase/firestore.ts:274-277`.

---

### `currentPosition` — where defined, read, and written

#### Definition

- `ActivityConfig.currentPosition?: number` — `src/core/types/planning.ts:833`. Optional. Absent on non-workbook configs.
- Legacy `WorkbookConfig.currentPosition: number` — `src/core/types/planning.ts:560`. Required (non-optional) in the old type.

#### Written (updated)

| Trigger | File : Lines | Behavior |
|---|---|---|
| Scan → auto-sync | `src/core/hooks/useScanToActivityConfig.ts:60-64` | If `lessonNumber > current`, sets `currentPosition = lessonNumber`. Only advances forward. |
| Scan → new config | `src/core/hooks/useScanToActivityConfig.ts:111` | Sets `currentPosition: lessonNumber ?? 1` on creation. |
| "Update workbook position" button | `src/core/firebase/updateActivityPosition.ts:38-40` | Unconditionally sets `currentPosition = lessonNumber` (no forward-only guard). |
| "Skip to lesson N" button | `src/core/hooks/useScanToActivityConfig.ts:60-64` | Same `syncScanToConfig` path but called with `lessonNumber: detectedLesson + 1`. |
| Certificate scan → progress | `src/core/hooks/useCertificateProgress.ts:83` | Sets `currentPosition: newPosition`. |
| Migration backfill | `functions/src/ai/workbookActivityConfigBackfill.ts:110` | `Math.max(existing, legacy)`. |
| Migration script | `src/core/firebase/migrateActivityConfigs.ts:148` | Copies `wb.currentPosition` from legacy `WorkbookConfig`. |

#### Read (consumed)

| Consumer | File : Lines | What it does |
|---|---|---|
| AI context assembly | `functions/src/ai/contextSlices.ts:411-413` | Injects `"lesson {currentPosition} of {totalUnits} covered"` into AI prompts. |
| GATB enrichment | `functions/src/ai/contextSlices.ts:433-446` | Feeds `currentPosition` to `getGatbProgress()` for covered/upcoming skills. |
| Chat CF workbook context | `functions/src/ai/chat.ts:97, 166-178` | Reads `currentPosition` from Firestore, passes to context assembly. |
| Pace gauge (planner) | `src/features/planner-chat/PaceGaugePanel.tsx:64` | Computes `(currentPosition / totalUnits) * 100` for progress bar. |
| Planner logic | `src/features/planner-chat/chatPlanner.logic.ts:50-51` | Appends `"(at lesson N of M)"` to planner prompt context. |
| Planner prompts test | `src/core/ai/prompts/plannerPrompts.test.ts:94` | Test fixture. |

---

### Does anything track "upcoming" content?

**Yes — for GATB curricula only.** There is a static scope-and-sequence map in `src/core/data/gatbCurriculum.ts` (and a duplicate at `functions/src/ai/data/gatbCurriculum.ts`).

**`getGatbProgress(curriculumKey, currentLesson)`** — `src/core/data/gatbCurriculum.ts:505-545`

Given a GATB curriculum key (e.g., `'gatb-math-2'`) and the `currentPosition`, this function returns:
- `coveredSkills: string[]` — all skills from completed + current units
- `coveredPhonics: string[]` — phonics patterns covered (LA only)
- `currentUnit: CurriculumUnit | null` — the unit the child is currently in
- `upcomingUnits: CurriculumUnit[]` — all future units (topics, skills, lesson ranges)
- `percentComplete: number`

**Where upcoming is consumed:**

| Consumer | File : Lines | What it does |
|---|---|---|
| AI prompt context | `functions/src/ai/contextSlices.ts:442-443` | Injects `"Upcoming: {topic1}, {topic2}"` (first 2 upcoming units) into prompts for plan/eval/shellyChat. |
| `GatbLessonInfo` component | `src/components/GatbLessonInfo.tsx:81-84` | Displays `"Up next: {topic}"` in the UI (first upcoming unit). |

**For non-GATB curricula:** There is no upcoming content tracking. The system only stores `currentPosition` and `totalUnits` — it knows *where* you are but not *what comes next*.

---

### How does a checklist item reference a workbook/lesson?

**There is no structured reference.** A `ChecklistItem` (`src/core/types/planning.ts:262-324`) has no `workbookConfigId`, `activityConfigId`, `lessonNumber`, `curriculum`, or any other field linking it to an `ActivityConfig` document. This was explicitly noted in `docs/CAPTURE_PIPELINE_INVESTIGATION_2026-04-07.md:89`.

The connection is implicit, via two soft signals:

1. **`itemType: 'workbook'`** — `src/core/types/planning.ts:301`. Set by the AI planner when generating the plan (`functions/src/ai/chat.ts:464`). Used by `TodayChecklist.tsx:111` to determine if an item is scannable. No back-reference to which config it came from.

2. **`subjectBucket`** — `src/core/types/planning.ts:269`. Matches the `ActivityConfig.subjectBucket` by convention. Used by `scanFeedbackBySubject` (`src/features/today/TodayPage.tsx:377-412`) to attach scan results to checklist items by subject bucket.

3. **`label` (title string)** — `src/core/types/planning.ts:264`. The AI planner generates a title like `"Good and the Beautiful Math Level 2"` that textually matches the `ActivityConfig.name`. The scan pipeline uses fuzzy name matching (`useScanToActivityConfig.ts:177-227`) to find the config, but the checklist item itself carries only the label string.

4. **`contentGuide`** — `src/core/types/planning.ts:311, 494`. The AI planner can embed lesson-specific guidance like `"Continue from lesson 53. Content: multisyllable words"` in a free-text string. This is generated by the AI from the context assembly (which includes `currentPosition`), but the checklist item does not store a structured lesson number. The prompt instructions are at `functions/src/ai/tasks/plan.ts:322-340`.

**In summary:** Checklist items are connected to workbooks by (label text + subject bucket) convention, not by document ID. The scan pipeline bridges from scan → config by fuzzy name match, not through the checklist item.

---

### "Skip to lesson N" button — location, behavior, and interaction with `currentPosition`

#### Where it lives

The button is rendered in **`src/components/ScanResultsPanel.tsx`** at two locations:

- **Lines 191-208**: Shown when `recommendation === 'skip'` — green success alert: *"{childName} has this mastered. Skip ahead to the next new content."*
- **Lines 218-235**: Shown when `recommendation === 'quick-review'` — blue info alert: *"{childName} knows most of this. Quick 5-minute review, then move on."*

Both render: `<Button>Skip to lesson {lessonNumber + 1}</Button>`

The button is gated on: `onSkipToNext` prop is provided AND `results.curriculumDetected.lessonNumber` is truthy.

#### What it does

The button calls `onSkipToNext((results.curriculumDetected!.lessonNumber ?? 0) + 1)`.

The handler is implemented identically in three places:

| Surface | File : Lines |
|---|---|
| Today page | `src/features/today/TodayPage.tsx:647-668` |
| Curriculum tab | `src/features/progress/CurriculumTab.tsx:292-311` |
| Certificate scan section | `src/features/progress/CertificateScanSection.tsx:143-164` |

Each handler:
1. Takes the scan result's `curriculumDetected` object.
2. Clones it with `lessonNumber` overridden to `nextLesson` (detected + 1).
3. Calls `syncScanToConfig(childId, { ...results, curriculumDetected: { ...curriculum, lessonNumber: nextLesson } })`.
4. Shows a snack: `"Skipping ahead — next lesson: {nextLesson}"`.

#### How it interacts with `currentPosition`

Inside `syncScanToConfig` (`src/core/hooks/useScanToActivityConfig.ts:57-64`):

```ts
if (lessonNumber > current) {
  updates.currentPosition = lessonNumber
}
```

Because the handler passes `detectedLesson + 1` as `lessonNumber`, and the guard is `>`, the effect is:
- If `currentPosition` is at or below the detected lesson, it advances to `detectedLesson + 1`.
- If `currentPosition` is already beyond `detectedLesson + 1` (e.g., someone manually advanced further), no update occurs.

There is also a separate **"Update workbook position to Lesson N"** button at `ScanResultsPanel.tsx:245-260` that sets `currentPosition` to the *detected* lesson (not +1). This uses the `onUpdatePosition` callback, which flows through to either `syncScanToConfig` (in CurriculumTab/TodayPage) or `updateActivityConfigPosition` (direct Firestore write at `src/core/firebase/updateActivityPosition.ts:13-48` — notably this one has no forward-only guard).

#### Summary of position-update paths from scan

| Button | Position set to | Forward-only? | Files |
|---|---|---|---|
| "Skip to lesson N" | `detectedLesson + 1` | Yes (`>` guard in `syncScanToConfig`) | `ScanResultsPanel.tsx:201,228` → `useScanToActivityConfig.ts:62` |
| "Update workbook position" | `detectedLesson` | Via `syncScanToConfig`: Yes. Via `updateActivityPosition`: No. | `ScanResultsPanel.tsx:255` → `useScanToActivityConfig.ts:62` or `updateActivityPosition.ts:39` |
| Auto-sync on scan capture | `detectedLesson` | Yes (`>` guard) | `useUnifiedCapture.ts:90` → `useScanToActivityConfig.ts:62` |

---

## Checklist State

### ChecklistItem type definition (full)

**File:** `src/core/types/planning.ts:262-324`

```ts
export interface ChecklistItem {
  id?: string
  label: string
  completed: boolean
  /** Planned duration in minutes for this item. */
  plannedMinutes?: number
  /** Subject bucket for color-coding. */
  subjectBucket?: SubjectBucket
  /** Skill tags for engine/ladder alignment */
  skillTags?: SkillTag[]
  /** Optional ladder rung reference */
  ladderRef?: { ladderId: string; rungId: string }
  /** When true, this item is part of the Minimum Viable Day (MVD) set. */
  mvdEssential?: boolean
  /** Source of this item: 'planner' for AI/planner-generated, 'manual' for user-added. */
  source?: 'planner' | 'manual'
  /** Category for kid-facing view: must-do, choose, or routine. */
  category?: 'must-do' | 'choose' | 'routine'
  /** Estimated duration in minutes (kid-facing display). */
  estimatedMinutes?: number
  /** Linked lesson card document ID (auto-generated on plan apply). */
  lessonCardId?: string
  /** Linked book ID (for "Make a Book" plan items). */
  bookId?: string
  /** Engagement feedback: how the activity went */
  engagement?: 'engaged' | 'okay' | 'struggled' | 'refused'
  /** Linked evidence document ID (from unified capture — may point to scans or artifacts). */
  evidenceArtifactId?: string
  /** Which Firestore collection the evidence doc lives in. Absent on legacy items means 'artifacts'. */
  evidenceCollection?: 'scans' | 'artifacts'
  /** Manual or AI-generated review result for the captured work. */
  gradeResult?: string
  /** Mastery level observed by parent after completion */
  mastery?: 'got-it' | 'working' | 'stuck'
  /** Guidance note when an item is skipped. */
  skipGuidance?: string
  /** Whether this item was explicitly skipped by the child. */
  skipped?: boolean
  /** Item type: routine, workbook, evaluation (Knowledge Mine/Fluency), or activity. */
  itemType?: 'routine' | 'workbook' | 'evaluation' | 'activity'
  /** Evaluation mode when itemType is 'evaluation'. */
  evaluationMode?: 'phonics' | 'comprehension' | 'fluency' | 'math'
  /** Route to navigate to (e.g., '/quest') for in-app activities. */
  link?: string
  /** Actual minutes spent (set on auto-complete from quest/fluency). */
  actualMinutes?: number
  /** ISO timestamp when item was completed. */
  completedAt?: string
  /** Brief content guide for workbook items (what to cover today). */
  contentGuide?: string
  /** Whether this workbook item has been scanned after completion. */
  scanned?: boolean
  /** Which schedule block this item belongs to */
  block?: ScheduleBlock
  /** Activity ID this runs simultaneously with */
  pairedWith?: string
  /** Group ID for "pick your order" items */
  choiceGroup?: string
  /** Can be dropped on light days */
  droppableOnLightDay?: boolean
  /** Building toward this — don't nag if unchecked */
  aspirational?: boolean
}
```

Total: 28 optional fields + 2 required fields (`label: string`, `completed: boolean`).

---

### All possible states a checklist item can be in

A ChecklistItem has **three mutually exclusive outcome states**, determined by two boolean fields:

| State | `completed` | `skipped` | Visual treatment |
|---|---|---|---|
| **Not done** | `false` | `false` / absent | Normal: unchecked checkbox, full opacity |
| **Completed** | `true` | `false` / absent | Checked checkbox, line-through text, `bgcolor: 'success.50'` |
| **Skipped** | `false` | `true` | Line-through text, `opacity: 0.4`, label suffix "— skipped" |

There is no `'in-progress'`, `'deferred'`, or `'partial'` state. The item is either not done, completed, or skipped.

**Note:** `completed` and `skipped` are not enforced to be mutually exclusive by the type system (both are writable independently). In practice, `skipped` is only ever set to `true` — it is never toggled back to `false`. And `completed` is toggled via checkbox clicks. No code sets both `completed: true` and `skipped: true` simultaneously.

#### Where each state is set

| State | Where set | File : Lines |
|---|---|---|
| Completed (toggle) | `handleToggleItem` | `src/features/today/KidChecklist.tsx:74-98` — toggles `completed` on the item |
| Completed (toggle) | `handleToggleItem` | `src/features/today/TodayChecklist.tsx:296-348` — toggles `completed`, sets `completedAt` on check |
| Skipped | `handleSkipItem` | `src/features/today/KidChecklist.tsx:100-108` — sets `skipped: true` |

#### Where each state is read

| Consumer | File : Lines | Logic |
|---|---|---|
| Must-do remaining count | `src/features/today/KidTodayView.tsx:427` | `mustDo.filter((item) => !item.completed && !item.skipped).length` |
| Must-do completed count | `src/features/today/KidTodayView.tsx:430` | `mustDo.filter((i) => i.completed).length` |
| Must-do skipped count | `src/features/today/KidTodayView.tsx:431` | `mustDo.filter((i) => i.skipped).length` |
| Must-do all done | `src/features/today/KidTodayView.tsx:426` | `mustDo.every((item) => item.completed)` — skipped items do NOT count as done |
| Gate unlock | `src/features/today/KidTodayView.tsx:433` | `mustDoCompleted >= gateThreshold` — only `completed` items count, not `skipped` |
| Skipped item rendering | `src/features/today/KidChecklist.tsx:134-141` | Renders dimmed, struck-through, with "— skipped" suffix |
| Shelly context assembly | `functions/src/ai/tasks/shellyChat.ts:178` | Counts skipped activities by label for engagement context |

---

### Is there a concept of "skipped" today on checklist items?

**Yes.** The `skipped?: boolean` field exists at `src/core/types/planning.ts:299`. It is:

- **Set** by `handleSkipItem` in `KidChecklist.tsx:100-108` — the kid-facing view has a skip affordance.
- **Rendered** as a dimmed, struck-through row with "— skipped" label in `KidChecklist.tsx:134-141`.
- **Counted** separately from completed: `mustDoSkipped` at `KidTodayView.tsx:431`.
- **Excluded** from "remaining" count: items that are `skipped` are not counted in `mustDoRemaining` (`KidTodayView.tsx:427`).
- **Does NOT unlock the gate**: only `completed` items count toward `gateThreshold` (`KidTodayView.tsx:433`).
- **Consumed by AI**: `shellyChat.ts:178` tallies skipped activities by label to give Shelly engagement context.

Separately, `skipGuidance?: string` (line 297) is a different concept — it is AI-generated advice about *whether* to skip or modify a workbook item, set during plan generation or scan analysis. It is display-only text and does not affect the `skipped` boolean.

---

### Does anything track "why" an item is in its current state?

**Partially — for completed items only.** There is no `reason` or `note` field on ChecklistItem explaining why it was completed, not completed, or skipped. However, three post-completion annotation fields exist:

| Field | Type | Set where | Purpose |
|---|---|---|---|
| `engagement` | `'engaged' \| 'okay' \| 'struggled' \| 'refused'` | Parent taps emoji row after completion — `TodayChecklist.tsx:686-706` | Records *how* the activity went, not *why* it was completed |
| `mastery` | `'got-it' \| 'working' \| 'stuck'` | Parent or kid selects after completion — `TodayChecklist.tsx:726-750`, `KidChecklist.tsx:118-124` | Records observed mastery level |
| `completedAt` | ISO timestamp string | Set on completion toggle — `TodayChecklist.tsx:310` | Records *when*, not *why* |

**For skipped items:** There is **no "why skipped" field**. The `skipGuidance` field is AI-generated *before* the skip happens (it's planning advice, not a skip reason). When a child skips an item via `handleSkipItem`, only `skipped: true` is recorded — no reason, no timestamp, no annotation.

**For not-completed items:** Nothing tracks why an item remained unchecked. The `aspirational` flag (`line 323`) signals "don't nag if unchecked" but is set at plan time, not as a post-hoc explanation.

---

### Confirming: ChecklistItem has NO structured reference to ActivityConfig

**Confirmed.** The `ChecklistItem` interface (`src/core/types/planning.ts:262-324`) contains **zero fields** that reference an `ActivityConfig` document by ID. Specifically:

- No `activityConfigId` field
- No `activityId` field
- No `configId` field
- No `curriculum` field
- No `lessonNumber` field

A grep for `activityConfig|activityId|configId` in `src/core/types/planning.ts` returns **no matches** within the `ChecklistItem` interface.

#### Fields that *could* be used for a soft link

| Field | Reliability as link | Why |
|---|---|---|
| `label` (line 264) | **Low** — fuzzy, AI-generated text | The AI planner generates labels like "Good and the Beautiful Math Level 2" that textually overlap with `ActivityConfig.name`. The scan pipeline uses fuzzy name matching (`useScanToActivityConfig.ts:177-227`), but this is not a stable identifier. |
| `subjectBucket` (line 269) | **Low** — many-to-many | Multiple checklist items can share a subject bucket, and multiple `ActivityConfig` docs can have the same `subjectBucket`. Not unique in either direction. |
| `itemType: 'workbook'` (line 301) | **None** — boolean signal only | Indicates the item came from a workbook config but does not identify *which* one. |
| `block` (line 315) | **None** — shared grouping | Maps to `ScheduleBlock`, which is shared across items. Not specific to a config. |
| `contentGuide` (line 311) | **None** — free text | AI-generated guidance that may reference a lesson number, but is unstructured prose. |

**Bottom line:** There is no reliable way to link a `ChecklistItem` back to its originating `ActivityConfig` using existing fields. The only connection paths are fuzzy label matching and subject bucket convention, both of which are fragile and non-unique.
