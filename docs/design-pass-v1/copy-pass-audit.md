# No-judge copy pass audit — design v1 step 1
_Generated 2026-05-26. Review, edit `Proposed` cells as needed, mark `Decision` per row, then run the application prompt._

## Summary
- Total candidates: 42
- Clear rewrites proposed: 4
- Ambiguous (needs human call): 38
- Files touched: 17 across today/11, records/5, avatar/1

## How to use this file
- Each row defaults to `Decision: APPROVE` for CLEAR cases and `Decision: SKIP` for AMBIGUOUS.
- To reject a CLEAR rewrite, change Decision to SKIP.
- To accept an AMBIGUOUS one, change Decision to APPROVE and fill in `Proposed`.
- To change a rewrite, edit the `Proposed` cell directly.
- To split a row into multiple, copy-paste it.
- When you're done, save and run the application prompt — it reads this file as the source of truth.

## src/features/today/

### KidTeachBack.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T1 | 123 | `setSaveError(...)` rendered in error Alert at line 140 after teach-back save catch | didn't | `"Hmm, that didn't save. Check your connection and try again."` | — | AMBIGUOUS — system save-error message about a Firestore write; same "didn't save" template appears in 4 other Kid\* components | SKIP |

### TeachBackSection.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T2 | 87 | `onSnackMessage({ text: ..., severity: 'error' })` after teach-back save catch | failed | `'Failed to save. Try again.'` | — | AMBIGUOUS — system save-error snackbar | SKIP |

### TodayChecklist.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T3 | 759 | `<Alert severity="error">` body when scan capture errors out | failed | `Scan failed: {scanError}` | — | AMBIGUOUS — system error string surfacing a scan/network error to the parent | SKIP |
| T4 | 916 | `<TextField placeholder=...>` example for the parent's quick-check note about a math item | missed | `"e.g., 5/6 correct, missed regrouping on #4"` | `"e.g., 5/6 correct, noticed regrouping was tricky on #4"` | CLEAR — judgmental example of learner performance; this is exactly the framing the no-judge vocabulary targets | APPROVE |

### KidExtraLogger.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T5 | 89 | `setSaveError(...)` rendered in error Alert at line 106 after extra-activity save catch | didn't | `"Hmm, that didn't save. Check your connection and try again."` | — | AMBIGUOUS — system save-error message, shared template across Kid\* components | SKIP |

### UnifiedCaptureCard.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T6 | 239 | `onSnackMessage` partial-success branch: artifact saved but hours log fell over | couldn't | `"Captured (couldn't log hours — try again from Records)"` | — | AMBIGUOUS — system error about a downstream hours-logging call, not a learner judgment | SKIP |
| T7 | 248 | `onSnackMessage` failure branch when only the hours log was attempted | couldn't | `"Couldn't log hours — try again from Records"` | — | AMBIGUOUS — system error about hours-logging call | SKIP |
| T8 | 279 | `onSnackMessage` after artifact save catch | failed | `'Failed to save note.'` | — | AMBIGUOUS — system save-error snackbar | SKIP |
| T9 | 325 | `onSnackMessage` after photo upload catch | failed | `'Photo upload failed.'` | — | AMBIGUOUS — system upload-error snackbar | SKIP |
| T10 | 367 | `onSnackMessage` after audio upload catch | failed | `'Audio upload failed.'` | — | AMBIGUOUS — system upload-error snackbar | SKIP |

### useUnifiedCapture.ts

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T11 | 212 | `onMessage?.({ text: ..., severity: 'error' })` after capture catch | failed | `'Photo capture failed. Try again.'` | — | AMBIGUOUS — system capture-error snackbar | SKIP |

### WeekFocusCard.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T12 | 151 | `onSnackMessage(...)` after conundrum save catch | failed | `'Failed to save.'` | — | AMBIGUOUS — system save-error snackbar | SKIP |

### TodayPage.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T13 | 321 | `setSnackMessage` when AI returns no chapter-question message | couldn't | `"Couldn't generate chapter questions."` | — | AMBIGUOUS — system error about an AI/network call | SKIP |
| T14 | 330 | `setSnackMessage` when chapter-questions JSON parse throws | couldn't | `"Couldn't parse chapter questions."` | — | AMBIGUOUS — system parse-error message | SKIP |
| T15 | 365 | `setSnackMessage` in retry path for chapter-question generation | couldn't | `"Couldn't generate chapter questions."` | — | AMBIGUOUS — same AI/network error as T13 | SKIP |
| T16 | 543 | `setSnackMessage` after material-generation catch | failed | `'Failed to generate materials. Try again.'` | — | AMBIGUOUS — system AI/generation-error snackbar | SKIP |
| T17 | 651 | `setSnackMessage` after position-update catch in scan-advance handler | failed | `'Failed to update position'` | — | AMBIGUOUS — system Firestore-write error snackbar | SKIP |
| T18 | 674 | `setSnackMessage` after skip-to-next-lesson catch | failed | `'Failed to update position'` | — | AMBIGUOUS — system Firestore-write error snackbar | SKIP |
| T19 | 718 | `setSnackMessage` after accept-skip-recommendation catch | failed | `'Failed to accept skip'` | — | AMBIGUOUS — system Firestore-write error snackbar | SKIP |

### KidChapterPool.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T20 | 165 | `setSaveError(...)` rendered in error Alert at line 310 after chapter-response save catch | didn't | `"Hmm, that didn't save. Check your connection and try again."` | — | AMBIGUOUS — shared system save-error template | SKIP |
| T21 | 224 | `setSaveError(...)` rendered in error Alert at line 310 after chapter-response delete catch | failed | `'Failed to delete recording. Check your connection and try again.'` | — | AMBIGUOUS — system delete-error message | SKIP |

### KidConundrumResponse.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T22 | 152 | `setSaveError(...)` rendered in error Alert at line 221 after conundrum-response save catch | didn't | `"Hmm, that didn't save. Check your connection and try again."` | — | AMBIGUOUS — shared system save-error template | SKIP |
| T23 | 197 | `setSaveError(...)` rendered in error Alert at line 331 after conundrum drawing save catch | didn't | `"Hmm, that didn't save. Check your connection and try again."` | — | AMBIGUOUS — shared system save-error template | SKIP |

### scanBlocker.ts

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| T24 | 52 | `evidence` string written to a `ConceptualBlock` Firestore record (likely rendered later in the learning-map / curriculum surface) | behind | `` `Scan of ${contentRef} identified ${s.skill} as challenging (${s.level}, behind snapshot)` `` | — | AMBIGUOUS — data field rather than direct JSX; downstream rendering surface is outside this folder's scope and the snapshot-relative meaning is half-spatial, half-judgmental | SKIP |
| T25 | 61 | `rationale` string written to the same `ConceptualBlock` Firestore record | behind | `` `Scan recommendation "${rec}" with difficulty "${difficulty}". Skill sits behind the current snapshot.` `` | — | AMBIGUOUS — same caveat as T24; "sits behind" is snapshot-relative phrasing | SKIP |

## src/features/records/

### RecordsPage.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| R1 | 275 | `setSnackMessage` after records-load catch | failed | `` `Failed to load records: ${err...}` `` | — | AMBIGUOUS — system load-error snackbar | SKIP |
| R2 | 318 | `setSnackMessage` after hours-generation catch | failed | `` `Failed to generate hours: ${err...}` `` | — | AMBIGUOUS — system error snackbar | SKIP |
| R3 | 345 | `setSnackMessage` after hours-adjustment save catch | failed | `` `Failed to save adjustment: ${err...}` `` | — | AMBIGUOUS — system save-error snackbar | SKIP |
| R4 | 382 | `setSnackMessage` after backfill catch | failed | `` `Backfill failed: ${err...}` `` | — | AMBIGUOUS — system error snackbar | SKIP |
| R5 | 447 | `setSnackMessage` after quick-estimate catch | failed | `` `Quick estimate failed: ${err...}` `` | — | AMBIGUOUS — system error snackbar | SKIP |
| R6 | 523 | `setSnackMessage` after zip-build catch | failed | `` `Failed to build zip: ${err...}` `` | — | AMBIGUOUS — system error snackbar | SKIP |
| R7 | 587 | `setSnackMessage` after clear-hours catch | failed | `` `Failed to clear: ${err...}` `` | — | AMBIGUOUS — system error snackbar | SKIP |

### ComplianceDashboard.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| R8 | 130 | Compliance alert pushed when total hours are red | behind | `` `Total hours (${totalHours.toFixed(0)}h) are significantly behind the ${TOTAL_HOURS_TARGET}h target` `` | `` `Total hours (${totalHours.toFixed(0)}h) are tracking under the ${TOTAL_HOURS_TARGET}h target` `` | CLEAR — administrative compliance copy uses the banned word in exactly the judgmental sense the design forbids | APPROVE |
| R9 | 132 | Compliance alert pushed when core hours are red | behind | `` `Core hours (${coreHours.toFixed(0)}h) are significantly behind the ${CORE_HOURS_TARGET}h target` `` | `` `Core hours (${coreHours.toFixed(0)}h) are tracking under the ${CORE_HOURS_TARGET}h target` `` | CLEAR — same pattern as R8 | APPROVE |
| R10 | 137 | Compliance alert pushed when a required subject is red | behind | `` `${SUBJECT_LABELS[subject]} (${(minutes / 60).toFixed(0)}h) is falling behind` `` | `` `${SUBJECT_LABELS[subject]} (${(minutes / 60).toFixed(0)}h) is tracking under target` `` | CLEAR — "falling behind" is the strongest judgmental phrasing on this surface | APPROVE |

### PortfolioPage.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| R11 | 95 | `setSnackMessage` after drawing-save catch | failed | `` `Failed to save drawing: ${err...}` `` | — | AMBIGUOUS — system save-error snackbar | SKIP |
| R12 | 155 | `setSnackMessage` after artifacts-load catch | failed | `` `Failed to load artifacts: ${err...}` `` | — | AMBIGUOUS — system load-error snackbar | SKIP |

### EvaluationsPage.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| R13 | 86 | `setSnackMessage` after artifacts-load catch | failed | `` `Failed to load artifacts: ${err...}` `` | — | AMBIGUOUS — system load-error snackbar | SKIP |
| R14 | 119 | `setSnackMessage` after evaluation-load catch | failed | `` `Failed to load evaluation: ${err...}` `` | — | AMBIGUOUS — system load-error snackbar | SKIP |
| R15 | 202 | `setSnackMessage` after evaluation-save catch | failed | `` `Failed to save evaluation: ${err...}` `` | — | AMBIGUOUS — system save-error snackbar | SKIP |

### QuickAddHours.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| R16 | 92 | `onSaved(...)` callback message after quick-add catch (rendered to parent as a snackbar) | failed | `'Failed to save. Try again.'` | — | AMBIGUOUS — system save-error message | SKIP |

## src/features/avatar/

### AvatarPhotoUpload.tsx

| # | Line | Context | Banned | Current | Proposed | Type | Decision |
|---|------|---------|--------|---------|----------|------|----------|
| A1 | 100 | `setPhotoError(msg)` rendered in error Alert at line 231 after feature-extraction throw; this is the fallback message when the thrown Error has no `.message` | failed | `'Feature extraction failed — try a different photo.'` | — | AMBIGUOUS — system error message about an AI feature-extraction call | SKIP |

## Reviewer notes

<!-- Free-form: pattern decisions, omissions, deferred work. -->

## Applied

- Total applied: 4 (T4, R8, R9, R10)
- Total skipped: 38
- Total drifted-and-skipped: 0
- Date: 2026-05-26
