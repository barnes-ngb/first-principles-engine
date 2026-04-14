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
