# Capture Pipeline Investigation — Apr 7, 2026

> **Symptom:** Shelly photographed Lincoln's GATB Math, GATB Language Arts Level 1, and Booster cards via the Today page per-item capture flow on Apr 7. The Progress page curriculum view still shows "Last updated: Apr 5" for those workbooks. Recent scans listed on the curriculum cards don't include today's captures.

---

## 1. Summary

**This is a parallel-pipelines bug.** The Today page has two completely separate photo-capture paths that look nearly identical to the user but write to different Firestore collections and trigger different side effects:

| Path | UI trigger | Writes to | AI analysis | Updates ActivityConfig | Updates curriculum view |
|------|-----------|-----------|-------------|----------------------|----------------------|
| **Per-item capture** | Camera icon on completed checklist item | `artifacts` collection | None | No | No |
| **Curriculum scan** | "Scan page to track progress" text button | `scans` collection | Yes (Claude Vision) | Yes (`updatedAt`, `currentPosition`) | Yes |

Shelly tapped the per-item capture camera icon (path 1). This created artifact documents with the photo but never touched the `scans` collection or the `ActivityConfig` records that the Progress page reads. The curriculum view's "Last updated" timestamp and "Recent scans" list both read exclusively from data that only path 2 writes.

The per-item capture has **zero curriculum metadata** — no workbook name, no lesson number, no activityConfigId. Even if it tried to update the curriculum view, it wouldn't know which workbook to update. The link between "this checklist item came from GATB Math" and the corresponding ActivityConfig is never materialized.

---

## 2. The Today Capture Flow (Per-Item Evidence)

**Entry point:** `src/features/today/TodayChecklist.tsx:787-804`

When a checklist item is completed, a camera icon button appears:

```
item.completed && !item.evidenceArtifactId → IconButton → onCaptureOpen(index)
```

**Step-by-step trace:**

1. **User taps camera icon** on completed checklist item
2. `onCaptureOpen(index)` sets `captureItemIndex` state in `TodayPage.tsx:836-839`
3. A Dialog opens with `<PhotoCapture>` component + optional "Quick note" text field (`TodayPage.tsx:857-876`)
4. User takes/selects photo → `handleItemPhotoCapture(file)` called (`TodayPage.tsx:395-439`)
5. **Artifact document created** in `families/{familyId}/artifacts`:
   ```ts
   {
     childId: selectedChildId,
     title: "{item label} — {child name}'s work",
     type: "Photo",
     dayLogId: "2026-04-07",           // today's date
     createdAt: ISO timestamp,
     tags: {
       engineStage: "Build",
       domain: "",                      // always empty
       subjectBucket: item.subjectBucket ?? "Other",
       location: "Home",
       planItem: item.label,            // free-text label like "GATB Math (30m)"
       note: captureNote               // optional user note
     }
   }
   ```
6. Photo uploaded to Firebase Storage at `families/{familyId}/artifacts/{artifactId}/{filename}`
7. Artifact document updated with `uri: downloadUrl`
8. Checklist item updated: `evidenceArtifactId: docRef.id` → camera icon replaced by green "Captured" chip

**What does NOT happen:**
- No AI analysis of the photo
- No write to `scans` collection
- No lookup or update of any ActivityConfig
- No curriculum metadata (workbook name, lesson number, provider) saved
- No call to the `scan` Cloud Function task

**Source files:** `TodayPage.tsx:395-439`, `TodayChecklist.tsx:787-804`

---

## 3. The Curriculum Scan Flow

**Entry point (Today page):** `src/features/today/TodayChecklist.tsx:692-717` (post-completion) and `TodayChecklist.tsx:806-833` (workbook nudge)

**Entry point (Progress page):** `src/features/progress/CurriculumTab.tsx:665` (ScanButton on WorkbookCard)

Three separate scan triggers exist on the Today checklist:

| Location | Condition | Button text |
|----------|-----------|-------------|
| Lines 525-538 | Pre-completion, `getSparkleMode === 'scan'` | ScanButton icon next to item label |
| Lines 630-655 | Pre-completion, skipGuidance says "check lesson" | "Scan lesson to check if you should skip" |
| Lines 692-717 | Post-completion, `!item.scanned`, `getSparkleMode === 'scan'` | "Scan page to track progress" |
| Lines 806-833 | Post-completion, `itemType === 'workbook'`, `!evidenceArtifactId` | "Scan the page to track progress" |

All of these call `onScanCapture(file, index)` which maps to `handleScanCapture` in `TodayPage.tsx:443-484`.

**Step-by-step trace:**

1. **User taps scan button** → file picker or camera opens
2. `handleScanCapture(file, index)` called (`TodayPage.tsx:443`)
3. `runScan(file, familyId, selectedChildId)` called → `useScan` hook (`src/core/hooks/useScan.ts:59-157`):
   - Image compressed to <1MB
   - Uploaded to Storage at `families/{familyId}/scans/{timestamp}.{ext}`
   - Converted to base64
   - Sent to `TaskType.Scan` Cloud Function with `{ imageBase64, mediaType }`
4. **Cloud Function** (`functions/src/ai/tasks/scan.ts:129-216`):
   - Builds context: child profile, skill snapshot, grade
   - Calls Claude Sonnet with vision
   - AI analyzes: page type, subject, skills, difficulty, curriculum detection (provider, lesson number, page number, level)
   - Returns structured JSON
5. **ScanRecord written** to `families/{familyId}/scans`:
   ```ts
   {
     childId, imageUrl, storagePath,
     results: { pageType, subject, specificTopic, skillsTargeted,
                estimatedDifficulty, recommendation, estimatedMinutes,
                teacherNotes, curriculumDetected: { provider, name,
                lessonNumber, pageNumber, levelDesignation } },
     action: "pending",
     createdAt: serverTimestamp()
   }
   ```
6. **ActivityConfig auto-sync** (`useScanToActivityConfig.ts:24-124`):
   - Matches curriculum by normalized name against existing `activityConfigs`
   - If found: updates `currentPosition` and `updatedAt`
   - If not found: creates new ActivityConfig
7. **Skill map updated** from `skillsTargeted` findings
8. **Checklist item marked** `scanned: true`

**Source files:** `TodayPage.tsx:443-484`, `useScan.ts:59-157`, `functions/src/ai/tasks/scan.ts`, `useScanToActivityConfig.ts`

---

## 4. The Progress Read Path

### "Last updated" timestamp

**File:** `CurriculumTab.tsx:621-630`

```tsx
{config.updatedAt && (
  <Typography variant="caption">
    Last updated: {new Date(config.updatedAt).toLocaleDateString(...)}
  </Typography>
)}
```

This reads `ActivityConfig.updatedAt` — a field on the activity config document, NOT derived from the scans collection. It gets set when `useScanToActivityConfig` syncs a scan result. If no scan happens, this timestamp never changes.

**"Last updated: Apr 5" means:** The last time a scan was synced to this ActivityConfig was Apr 5. The Apr 7 per-item captures never touched this field.

### "Recent scans" list with badges

**File:** `CurriculumTab.tsx:632-660`

**Query (lines 70-87):**
```ts
query(
  scansCollection(familyId),
  where('childId', '==', activeChildId),
  orderBy('createdAt', 'desc'),
  limit(20)
)
```

This is a real-time `onSnapshot` listener on the `scans` collection only. It does **not** read from `artifacts`.

**Matching scans to workbook cards (lines 98-117):** Uses normalized string matching between `config.name`/`config.curriculum` and `scanResult.subject`/`scanResult.curriculumDetected.name`. This is fuzzy text matching, not ID-based.

**Badge classification (lines 644-654):** The `recommendation` field on the ScanResult (`do`, `skip`, `quick-review`, `modify`) determines badge text and color. This is set by the AI during scan analysis and is not user-editable.

| Badge | Color | Meaning |
|-------|-------|---------|
| `do` | red (error) | Work this page — matches student's level |
| `skip` | green (success) | Student already knows this material |
| `quick-review` | orange (warning) | Brief review, then move on |
| `modify` | orange (warning) | Adapt the activity |

---

## 5. The Linkage Gap

**Core question:** When Shelly captures a photo via the per-item camera icon, does the system have enough information to know which curriculum workbook and lesson it's about?

### What the checklist item knows

The `ChecklistItem` type (`planning.ts:212-272`) has:
- `label`: "Good and the Beautiful Math (30m)" — free-text, includes curriculum name
- `subjectBucket`: Math, Reading, etc.
- `itemType`: "workbook" for workbook items
- `source`: "planner" or "manual"

The `ChecklistItem` type does **not** have:
- `activityConfigId` — no reference to the ActivityConfig it was generated from
- `workbookConfigId` — no reference at all
- `lessonNumber` — not stored on the item
- `curriculum` — not stored separately from the label

### What gets passed to the capture

Only these fields from the checklist item reach the artifact:
- `item.label` → stored as `tags.planItem` (free text)
- `item.subjectBucket` → stored as `tags.subjectBucket`

Everything else is discarded.

### Could the link be inferred after the fact?

**Partially yes.** The `scansForWorkbook` function in `CurriculumTab.tsx:98-117` demonstrates a working approach: normalize the curriculum name from the label and match it against ActivityConfig names. This same technique could match a checklist item's label to an ActivityConfig. However:

- This only identifies *which* workbook — it can't determine the *lesson number* (which requires AI vision or user input)
- The matching is fuzzy string-based, not guaranteed
- There could be collisions (e.g., two GATB configs for different children)

### Verdict

**The link exists conceptually** (the checklist item label contains the workbook name) **but is never materialized** as a structured reference. The activityConfigId is missing from both `ChecklistItem` and `Artifact`. Even if the per-item capture wanted to update the ActivityConfig's `updatedAt`, it has no reliable way to find the right one.

---

## 6. Collection Overlap Analysis

### `artifacts` collection

**Purpose:** Portfolio evidence — a photo/audio/note record of student work for records, compliance, and portfolio export.

**Shape:** Generic evidence container with flexible tags. Supports Photo, Audio, Note, Video, Worksheet types. Links to dayLog by date. No AI analysis. No curriculum-aware fields.

**Read by:** Today page (day's artifacts), Portfolio page (date range), Dad Lab (session artifacts), Evaluations (sample evidence).

### `scans` collection

**Purpose:** Curriculum progress tracking — AI-analyzed workbook page photos that update ActivityConfig position and skill maps.

**Shape:** Vision-analyzed photo with structured results: page type, subject, skills, difficulty, curriculum detection (provider, lesson number, level), recommendation. Always photos.

**Read by:** CurriculumTab (recent scans, badge display), useScanToActivityConfig (auto-sync).

### Overlap

These are **complementary but disconnected** collections doing related but different jobs:

| Dimension | artifacts | scans |
|-----------|-----------|-------|
| "What work did the student do?" | Yes (photo evidence) | Yes (analyzed page) |
| "What curriculum position is the student at?" | No | Yes |
| "Can this be used for compliance/portfolio?" | Yes | No (not designed for it) |
| "Does this require AI processing?" | No | Yes |
| "Does this update the curriculum view?" | No | Yes |

**The gap:** When Shelly photographs a workbook page on the Today checklist, she's simultaneously:
1. Capturing evidence (→ should go to artifacts)
2. Documenting curriculum progress (→ should go to / trigger scans)

Currently only (1) happens. The same photo should also feed (2), but the pipelines are completely independent.

---

## 7. Proposed Fix Options

### Option A: Auto-trigger scan after per-item capture for workbook items

**What changes:** In `handleItemPhotoCapture` (`TodayPage.tsx:395-439`), after creating the artifact, check if the item is a workbook type. If so, also call `runScan(file, familyId, selectedChildId)` and run the same post-scan sync as `handleScanCapture`.

**Files:** `TodayPage.tsx`
**Effort:** S
**Risks:** Doubles the Cloud Function calls for workbook captures (cost + latency). User may not want AI analysis on every photo. Could create confusing UX if the scan results panel appears unexpectedly after a simple evidence capture.
**Addresses:** Root cause — the photo now feeds both pipelines.

### Option B: Lightweight position bump without AI scan

**What changes:** In `handleItemPhotoCapture`, for workbook items, find the matching ActivityConfig by label (reuse fuzzy matching from `scansForWorkbook`) and bump its `updatedAt` to now. Optionally increment `currentPosition` by 1.

**Files:** `TodayPage.tsx`, possibly extract the fuzzy matching to a shared utility
**Effort:** S
**Risks:** No AI analysis means no curriculum detection, no skill extraction, no lesson number from the photo. The `updatedAt` change is cosmetic — it fixes the stale timestamp but doesn't add real scan data. Position increment assumes one lesson per capture, which may be wrong.
**Addresses:** Symptom (stale timestamp) but not root cause (missing scan data).

### Option C: Add activityConfigId to ChecklistItem

**What changes:** When the planner generates checklist items from ActivityConfigs (in PlannerChatPage or the plan-apply flow), store the `activityConfigId` on the ChecklistItem. Pass it through to artifact creation. Optionally use it to trigger a lightweight ActivityConfig update on capture.

**Files:** `planning.ts` (type), plan-apply code in PlannerChatPage, `TodayPage.tsx`
**Effort:** M
**Risks:** Requires changes to the plan-apply flow and checklist item generation. Existing checklist items in Firestore won't have the field (backwards compat). Manual items added by the user still won't have it.
**Addresses:** Root cause of the *linkage* gap. Still needs Option A or B to actually use the link.

### Option D: Merge capture and scan into a single flow

**What changes:** When the user takes a photo of a workbook item, always run both: (1) save artifact for evidence, (2) run scan for curriculum analysis. Combine the two camera buttons into one. The single button does both.

**Files:** `TodayPage.tsx`, `TodayChecklist.tsx`, potentially `useScan.ts`
**Effort:** M
**Risks:** More complex UX flow — what if the scan fails but the artifact succeeded? Need to handle partial success. Cost implications (every capture triggers a Claude Vision call). May slow down the capture flow (scan takes several seconds).
**Addresses:** Root cause comprehensively. Eliminates the confusing two-button problem.

### Option E: Link artifacts to scans bidirectionally

**What changes:** After creating an artifact, if the item is scannable, also create a scan record that references the same image. After scan completes, link the scan back to the artifact. This creates a full paper trail.

**Files:** `TodayPage.tsx`, `useScan.ts` (accept existing imageUrl), type definitions
**Effort:** L
**Risks:** Complex — two documents for one photo, bidirectional references, potential consistency issues. Over-engineered if the real need is just "update the timestamp."
**Addresses:** Root cause + creates clean data model, but high effort.

### Recommended approach

**Option D** (merge flows) is the cleanest fix. The two buttons are confusing even to the developer — they'll certainly confuse Shelly. A single "capture & analyze" button that saves evidence AND updates curriculum is the right UX. Fall back gracefully if the scan fails (artifact is still saved).

If cost/latency is a concern, **Option A** with a user-facing toggle ("Also analyze for curriculum progress?") is a lighter alternative.

---

## 8. Open Questions

1. **Intent question:** Does Shelly think of "capturing evidence" and "scanning for curriculum progress" as the same action? If she taps the camera expecting curriculum tracking, Option D is correct. If she sometimes just wants a quick evidence photo without waiting for AI, we need a way to opt out of the scan.

2. **Cost tolerance:** Each scan costs a Claude Vision API call. If Shelly captures 5-10 photos per day, that's 5-10 additional API calls. Is this within budget?

3. **Booster cards:** Shelly mentioned capturing "Booster cards." These are likely not a tracked workbook in ActivityConfigs. Should the scan flow handle items that don't match any existing config? (It already does — `useScanToActivityConfig` creates new configs for unrecognized curricula.)

4. **Existing artifacts:** There are existing artifact documents from past captures that were never scanned. Is there value in backfilling scans from those artifacts, or is it only going forward?

5. **Checklist item generation:** Where exactly are checklist items created from ActivityConfigs during the plan-apply flow? This needs to be traced to implement Option C. The planner-chat code is 2,200+ lines and the mapping may be indirect (plan items → day blocks → checklist items).

---

## 9. Tangential Findings

### Two nearly identical post-completion scan prompts

`TodayChecklist.tsx` has two overlapping scan prompts for completed workbook items:
- **Line 692-717:** Shows when `!item.scanned && getSparkleMode(item) === 'scan'` — text: "Scan page to track progress"
- **Line 806-833:** Shows when `item.itemType === 'workbook' && !item.evidenceArtifactId` — text: "Scan the page to track progress"

These have slightly different conditions. A completed workbook item with no evidence and no scan could show *both* prompts simultaneously, plus the per-item capture camera icon (line 787-804). That's three camera-related buttons on one completed item.

### `domain` field always empty

In `handleItemPhotoCapture` (line 408), `domain` is hardcoded to `''`. The `ArtifactTags` type allows a string here but it's never populated in this flow.

### `getSparkleMode` uses regex on labels, not `itemType`

The `scanPatterns` array (`TodayChecklist.tsx:86-92`) matches against label text (e.g., `/good and the beautiful/i`, `/workbook/i`). Meanwhile `itemType === 'workbook'` is a structured field on ChecklistItem. These two approaches can disagree — an item with `itemType: 'workbook'` whose label doesn't match scanPatterns would get `getSparkleMode === 'generate'` but still trigger the line 806 scan nudge.

### Fuzzy scan-to-workbook matching could produce false positives

`scansForWorkbook` (`CurriculumTab.tsx:98-117`) uses substring matching on normalized names. If two ActivityConfigs have overlapping names (e.g., "Reading" and "Reading Eggs"), scans for one could appear under the other.

### `ScanRecord.action` lifecycle unclear

ScanRecord has `action: 'added' | 'skipped' | 'pending'`. It starts as `'pending'` and can be updated to `'added'` or `'skipped'` via user action in `ScanResultsPanel`. But the `action` field is never used in any query filter — all scans show up regardless of action status.

### `ChecklistItem` has no `activityConfigId` despite being generated from ActivityConfigs

The planner generates checklist items from ActivityConfigs, but the generated items only carry the label text and subject bucket — not the config ID. This makes it impossible to reliably trace a checklist item back to its source config without fuzzy string matching.

### Artifact type `EvidenceType.Worksheet` exists but is never used in per-item capture

`common.ts` defines `EvidenceType` including `Worksheet`, but `handleItemPhotoCapture` always uses `EvidenceType.Photo`. Even when capturing a workbook page, it's stored as a generic photo.
