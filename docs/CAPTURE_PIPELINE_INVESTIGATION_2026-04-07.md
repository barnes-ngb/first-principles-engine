# Capture Pipeline Investigation — 2026-04-07

## Problem Statement

Shelly photographed Lincoln's schoolwork on Apr 7 using the **Today page per-item capture flow** (check off checklist item → tap camera icon → photo saved). Three captures: The Good and the Beautiful Math, The Good and the Beautiful Language Arts Level 1, and Booster cards.

On the **Progress page curriculum view**, those same workbooks show **"Last updated: Apr 5"** — two days stale. Recent scans listed under each workbook card don't include today's work.

**Suspected cause:** The Today per-item capture and the curriculum scan pipeline are two separate data paths that don't share state.

---

## Part 1 — The Today Per-Item Capture Flow

### 1. What component renders the camera icon on a checklist item?

**`TodayChecklist.tsx:786-804`**

After a checklist item is marked `completed`, a camera `IconButton` appears:

```tsx
{item.completed && (
  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 5, mt: 0.5 }}>
    {!item.evidenceArtifactId && (
      <IconButton size="small" onClick={() => onCaptureOpen(index)} title="Capture work">
        <CameraAltIcon fontSize="small" />
      </IconButton>
    )}
    {item.evidenceArtifactId && (
      <Chip size="small" label="Captured" variant="outlined" color="success" />
    )}
  </Stack>
)}
```

Guard condition: `item.completed && !item.evidenceArtifactId`. The icon appears for **all** completed items that haven't been captured yet — not just workbooks.

### 2. What happens when the user taps it — which function is called?

Tapping the camera icon calls `onCaptureOpen(index)`, which is a prop from `TodayPage.tsx`. This sets `captureItemIndex` state, which opens a `PhotoCapture` dialog. When the user takes or selects a photo, it calls **`handleItemPhotoCapture`** (`TodayPage.tsx:395-439`).

### 3. Where does the photo go?

**Firebase Storage path:** `families/{familyId}/artifacts/{artifactId}/{filename}`

The flow:
1. Creates a Firestore document first (`addDoc` to `artifactsCollection`) — line 415
2. Uploads the photo to Storage using the new doc ID as a path segment — line 418
3. Updates the Firestore doc with the `downloadUrl` — line 419

### 4. What Firestore collection gets written to? What's the document shape?

**Collection:** `families/{familyId}/artifacts`

**Document shape** (from `TodayPage.tsx:400-414`):

```typescript
{
  childId: string,                    // selected child
  title: string,                      // e.g. "Good and the Beautiful Math — Lincoln's work"
  type: EvidenceType.Photo,           // 'photo'
  dayLogId: string,                   // 'YYYY-MM-DD'
  createdAt: string,                  // ISO timestamp
  uri: string,                        // download URL (set after upload)
  tags: {
    engineStage: EngineStage.Build,   // 'build'
    domain: '',                       // empty string
    subjectBucket: SubjectBucket,     // inferred from checklist item
    location: 'Home',
    planItem: string,                 // item.label, e.g. "Good and the Beautiful Math (30m)"
    note?: string,                    // optional parent note
  }
}
```

After creation, the artifact ID is linked back to the checklist item:

```typescript
const updatedChecklist = dayLog.checklist.map((ci, i) =>
  i === captureItemIndex ? { ...ci, evidenceArtifactId: docRef.id } : ci
)
persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
```

### 5. Is there ANY link to the curriculum workbook the checklist item came from?

**No structured link.** The only connection is `tags.planItem`, which stores the checklist item's display label (e.g. `"Good and the Beautiful Math (30m)"`). This is a free-text string, not a foreign key.

There is **no** `workbookConfigId`, `activityConfigId`, `lessonNumber`, `workbookTitle`, `curriculum`, or any other structured reference to the curriculum system.

### 6. Does the flow ever call the `scan` task type from the chat Cloud Function?

**No.** `handleItemPhotoCapture` does not:
- Call `useScan` or `runScan`
- Invoke `chat()` with `taskType: 'scan'`
- Write to the `scans` collection
- Call `syncScanToConfig`
- Touch `activityConfigs` in any way

The photo is saved as a generic evidence artifact and nothing more.

---

## Part 2 — The Curriculum Scan Flow

### 1. What component renders the "Take Photo" / "From Photos" buttons?

**Two locations:**

**A) Progress page — `CurriculumTab.tsx:663-666`**

Each `WorkbookCard` with `config.scannable === true` renders a `ScanButton`:

```tsx
{config.scannable && (
  <Box sx={{ mt: 2 }}>
    <ScanButton onCapture={onScanCapture} variant="button" loading={scanning} />
  </Box>
)}
```

**B) Today page — `TodayChecklist.tsx:528-537`**

Pre-completion scan icon for items matching `scanPatterns`:

```tsx
if (mode === 'scan') return (
  <Tooltip title="Scan workbook page">
    <span>
      <ScanButton variant="icon" loading={scanLoading && scanItemIndex === index}
        onCapture={(file) => onScanCapture(file, index)} />
    </span>
  </Tooltip>
)
```

The `scanPatterns` (`TodayChecklist.tsx:86-92`) match: `/good and the beautiful/i`, `/gatb/i`, `/language arts workbook/i`, `/reading eggs/i`, `/workbook/i`.

**C) Today page — `TodayChecklist.tsx:806-833`**

Post-completion "Scan the page to track progress" text button for `item.itemType === 'workbook'` items:

```tsx
{item.completed && item.itemType === 'workbook' && !item.evidenceArtifactId && (
  <Button ... onClick={() => { /* opens camera input → onScanCapture(file, index) */ }}>
    Scan the page to track progress
  </Button>
)}
```

### 2. What happens on tap — which function is called?

**On Progress page:** `handleCapture` (`CurriculumTab.tsx:200-236`) calls `scan()` from the `useScan` hook, then `syncScanToConfig()`.

**On Today page:** `handleScanCapture` (`TodayPage.tsx:443-484`) calls `runScan()` from `useScan`, then `syncScanToConfig()`, then optionally `updateSkillMapFromFindings()`.

Both paths follow the same pipeline: `useScan` → AI analysis → `scans` collection → `syncScanToConfig` → `activityConfigs`.

### 3. Does the photo go to Firebase Storage? What metadata is saved?

**Yes.** `useScan.ts:78-83`:

**Storage path:** `families/{familyId}/scans/{timestamp}.{ext}`

The image is also converted to base64 and sent to the Cloud Function for AI analysis.

**Firestore document** written to `families/{familyId}/scans` (`useScan.ts:125-143`):

```typescript
{
  childId: string,
  imageUrl: string,          // download URL from Storage
  storagePath: string,       // Storage path
  results: ScanResult | null, // AI analysis output (see below)
  action: 'added' | 'skipped' | 'pending',
  error?: string,
  createdAt: serverTimestamp()
}
```

### 4. Does the flow call the `scan` task type? What does that task do?

**Yes.** `useScan.ts:90-102`:

```typescript
response = await chat({
  familyId,
  childId,
  taskType: TaskType.Scan,
  messages: [{ role: 'user', content: JSON.stringify({ imageBase64, mediaType }) }],
})
```

The Cloud Function (`functions/src/ai/tasks/scan.ts`) sends the image to Claude with vision. It returns a `ScanResult` containing:

```typescript
// For worksheets:
{
  pageType: 'worksheet' | 'textbook' | 'test' | 'activity' | 'other',
  subject: string,
  specificTopic: string,
  skillsTargeted: [{ skill, level, alignsWithSnapshot }],
  estimatedDifficulty: 'easy' | 'appropriate' | 'challenging' | 'too-hard',
  recommendation: 'do' | 'skip' | 'quick-review' | 'modify',
  recommendationReason: string,
  estimatedMinutes: number,
  curriculumDetected: {
    provider: 'gatb' | 'reading-eggs' | 'other' | null,
    name: string,
    lessonNumber: number | null,
    pageNumber: number | null,
    levelDesignation: string | null,
  }
}
```

### 5. How does `syncScanToConfig` bridge scans to activityConfigs?

`useScanToActivityConfig.ts` provides `syncScanToConfig(childId, scanResult)`.

**Two paths:**

- **UPDATE existing config** (lines 56-84): Finds a matching `ActivityConfig` by fuzzy name/curriculum comparison. Updates `updatedAt: new Date().toISOString()` and optionally `currentPosition`.
- **CREATE new config** (lines 86-118): If no match found, creates a new `ActivityConfig` document with `createdAt` and `updatedAt` set to now.

This is the **only mechanism** that updates `activityConfigs.updatedAt` from scan data.

### 6. What does "Last updated" display on the Progress page?

`CurriculumTab.tsx:621-629`:

```tsx
{config.updatedAt && (
  <Typography variant="caption" color="text.secondary">
    Last updated: {new Date(config.updatedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    })}
  </Typography>
)}
```

Reads `config.updatedAt` from the `activityConfigs` collection. **Only updated by `syncScanToConfig`.**

### 7. What does "Recent scans" display?

`CurriculumTab.tsx:70-87` queries the `scans` collection (last 20 for the child, ordered by `createdAt` desc). Scans are matched to workbook cards by fuzzy name comparison (`scansForWorkbook`, lines 98-117) — comparing config name/curriculum against scan subject/curriculumDetected.

---

## Root Cause — Confirmed

The Today per-item capture and the curriculum scan are **completely separate data pipelines** writing to **different Firestore collections** with **no shared state**.

| Aspect | Per-Item Capture (Camera Icon) | Curriculum Scan Pipeline |
|--------|-------------------------------|------------------------|
| **Trigger** | Camera icon on any completed item | "Scan the page" button or Progress page ScanButton |
| **Storage path** | `artifacts/{id}/{file}` | `scans/{timestamp}.{ext}` |
| **Firestore collection** | `artifacts` | `scans` |
| **AI analysis** | None | Claude vision via `taskType: 'scan'` |
| **Updates `activityConfigs`?** | No | Yes (via `syncScanToConfig`) |
| **Updates "Last updated"?** | No | Yes |
| **Appears in "Recent scans"?** | No | Yes |
| **Curriculum awareness** | None (free-text `planItem` label only) | Full (`curriculumDetected`, `lessonNumber`, `subject`) |

---

## The Interaction That Makes It Worse

The camera icon and the "Scan the page to track progress" nudge share the same visibility gate on the Today page:

```
Camera icon:  item.completed && !item.evidenceArtifactId    (TodayChecklist.tsx:787,790)
Scan nudge:   item.completed && item.itemType === 'workbook' && !item.evidenceArtifactId  (TodayChecklist.tsx:807)
```

Once the user taps the camera icon:
1. `evidenceArtifactId` is set on the checklist item
2. Both the camera icon AND the scan nudge disappear
3. The scan pipeline becomes **unreachable** for that item
4. The curriculum view never gets updated

The two buttons **compete for the same interaction slot**. The camera icon is more prominent (appears for all items, renders as an icon button vs. a small text link), so it naturally gets tapped first. After that, the curriculum-aware scan path is gone.

---

## Data Flow Diagram

```
TODAY PAGE — Per-Item Capture (what Shelly used)
═══════════════════════════════════════════════
Check item ✓ → Camera icon → PhotoCapture dialog → handleItemPhotoCapture()
  → addDoc(artifacts)           ← writes to artifacts collection
  → uploadArtifactFile()        ← uploads to artifacts/ Storage
  → set evidenceArtifactId      ← hides camera icon AND scan nudge
  → DONE (curriculum never notified)


TODAY PAGE — Scan Pipeline (not reached)
═══════════════════════════════════════════════
Check item ✓ → "Scan the page" button → handleScanCapture()
  → runScan()
    → upload to scans/ Storage
    → chat({ taskType: 'scan' })  ← Claude vision AI analysis
    → addDoc(scans)               ← writes to scans collection
  → syncScanToConfig()
    → update activityConfigs      ← sets updatedAt = now
  → updateSkillMapFromFindings()  ← updates learning map
  → DONE (curriculum IS updated)


PROGRESS PAGE — Curriculum View (what shows "Apr 5")
═══════════════════════════════════════════════
WorkbookCard reads:
  → config.updatedAt from activityConfigs  ← "Last updated: Apr 5"
  → scans collection (last 20)            ← "Recent scans" list
  → Neither touched by per-item capture
```

---

## Conclusion

The diagnosis is confirmed: **the per-item capture flow writes to `artifacts` and the curriculum view reads from `activityConfigs` + `scans`. These are disjoint collections with no bridge between them.** The "Scan the page" nudge on the Today page was designed to be that bridge, but the camera icon's shared visibility gate prevents it from being used after a capture.

---

## Resolution — 2026-04-08

### What was unified

The three Today-page capture entry points were replaced by a single **"Capture work"** button on every completed checklist item. One button, one handler (`handleUnifiedCapture`), AI-routed output.

**Removed entry points:**
1. Camera icon on completed items (`TodayChecklist.tsx:786-804`) — wrote to artifacts only, no curriculum analysis
2. Pre-completion ScanButton icon for workbook items (`TodayChecklist.tsx:528-537`) — ran full scan pipeline
3. Post-completion "Scan the page to track progress" button (`TodayChecklist.tsx:806-833`) — ran full scan pipeline

**Replaced by:** A single `<Button>Capture work</Button>` that appears on `item.completed && !item.evidenceArtifactId`.

### AI routing rule

Every capture runs through the AI scan pipeline (`taskType: 'scan'`). The result's `pageType` determines routing:

- `'worksheet' | 'textbook' | 'test'` → **scans collection** + `syncScanToConfig` (updates curriculum "Last updated") + `updateSkillMapFromFindings` (feeds Learning Map)
- `'activity' | 'other' | 'certificate'` OR scan failure → **artifacts collection** (portfolio evidence)

One photo produces ONE record. Never both. Never neither.

### evidenceCollection field

Added `evidenceCollection?: 'scans' | 'artifacts'` to the `ChecklistItem` type alongside the existing `evidenceArtifactId`. This tells readers which Firestore collection to fetch from. Legacy items without the field are assumed to be `'artifacts'`.

### Deleted/changed handlers

- `handleItemPhotoCapture` (TodayPage.tsx) — **deleted**, replaced by `handleUnifiedCapture`
- `handleScanCapture` (TodayPage.tsx) — **replaced** by `handlePreCompletionScan` (retained for the "scan to check if should skip" pre-completion flow) and `handleUnifiedCapture` (for post-completion evidence capture)
- `scanPatterns` regex (TodayChecklist.tsx) — **retained** for pre-completion scan-based feedback display; no longer used for capture gating

### Photo library upload added (2026-04-08)

The single "Capture work" button was split into two side-by-side buttons: **Camera** (opens device camera via `capture="environment"`) and **Upload** (opens photo library/file picker, no `capture` attribute). Both route to the same `handleUnifiedCapture` handler — no pipeline changes needed.

### Not changed (out of scope)

- Kid-facing capture views (KidChecklist, KidTodayView) — still use the old `onCaptureOpen` → artifacts-only flow
- Cloud Functions (disposition.ts, evaluate.ts) — only count `evidenceArtifactId` presence, work unchanged
- Progress page scan button (CurriculumTab.tsx) — unchanged, still uses `useScan` directly
- PlannerChatPage scan handler — unchanged, separate from Today capture flow

### Scan analysis persistence + parent override — 2026-04-09

**Fix A (Today flash popup):** The scan analysis panel was flashing and disappearing because `handleUnifiedCapture` cleared `scanItemIndex` in a `finally` block, unmounting `ScanResultsPanel` before the user could see it. Fixed by only clearing on error or artifacts path. Additionally, the "Captured ✓" chip on completed items is now tappable when evidence is from the scans collection — expanding an inline `ScanAnalysisPanel` showing photo, AI reasoning, skills, difficulty, curriculum, and override controls.

**Fix B (Progress Recent scans):** Recent scans in the `WorkbookCard` on CurriculumTab are now expandable cards using the shared `ScanAnalysisPanel` component instead of static text bullets.

**Fix C (This Week's Scans):** New section at the top of CurriculumTab showing a 7-day rolling list of all scans for the active child, using the same `ScanAnalysisPanel` component.

**Parent override system:** Added `parentOverride` field to `ScanRecord` type — optional, stores `{ recommendation, overriddenBy, overriddenAt, note? }`. The `effectiveRecommendation(scan)` helper returns `parentOverride.recommendation ?? results.recommendation`. All recommendation readers updated to use the helper. Override UI in `ScanAnalysisPanel`: menu with 4 options, optional note, save/revert. Original AI recommendation is never mutated — preserved for audit trail.

### Follow-up bug fixes — 2026-04-09

Three bugs found during end-to-end testing of scan analysis visibility:

**Fix D (This Week's Scans filter too narrow):** `CurriculumTab.tsx` loaded scans from Firestore via `onSnapshot` but did not convert `createdAt` from Firestore `Timestamp` objects to ISO strings. Since `createdAt` is saved with `serverTimestamp()`, the runtime value was a Timestamp object despite the `string` type annotation. The ISO string comparison `(s.createdAt ?? '') >= cutoff` silently failed, filtering out ALL scans. Fixed by converting Timestamp→ISO string in the onSnapshot handler. Also broadened the filter to exclude only `'certificate'` and `'other'` pageTypes (previously the comment said "worksheet only" but the code excluded only certificates; now `'other'` is also excluded since it signals non-curriculum content).

**Fix E (Scanned: Invalid Date):** `ScanAnalysisPanel.tsx` passed `scan.createdAt` directly to `new Date()`, which produced "Invalid Date" when the value was a Firestore Timestamp object rather than a string. Fixed with a defensive conversion: checks for Timestamp `.toDate()` method, falls back to string parsing, and hides the line entirely if the date is unparseable. The primary fix in Fix D (converting in onSnapshot) prevents this path for CurriculumTab, but the defensive guard protects against other callers passing raw Firestore data.

**Fix F (Override note tooltip → inline):** The override note was surfaced via a Material-UI `Tooltip` on "(note)" text — works on hover but not on mobile tap. Replaced with inline display: the note text renders directly below "Overridden by Shelly" in italics with curly quotes, always visible. Empty notes show no second line.

**syncScanToConfig propagation verified:** Parent overrides do NOT need to re-fire `syncScanToConfig` because the recommendation lives on the `ScanRecord`, not the `ActivityConfig`. The `WorkbookCard` renders `ScanAnalysisPanel` for matched scans, which reads `parentOverride` from the scan document via real-time onSnapshot. When an override is saved, the Firestore update triggers onSnapshot, re-renders `recentScans`, and the panel shows the overridden recommendation. No additional sync needed.
