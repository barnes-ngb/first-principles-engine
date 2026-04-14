> **STALE** — does not reflect `chapterBooks` (global, top-level) and `bookProgress` (family-scoped) collections added Apr 10, 2026. Chapter Pool P3 (Apr 12, 2026) added real-time `bookProgress` subscription via `useBookProgress` hook and continued `chapterResponses` writes from the new `ChapterQuestionPool` component.

# Firestore Audit — 2026-03-21

## Summary

| Metric | Count |
|---|---|
| Total collections defined in `firestore.ts` | 28 |
| Total composite indexes | 6 |
| Total field overrides | 7 |
| Unused composite indexes | 0 |
| Potentially missing composite indexes | 5 |
| Consolidation candidates | 5 |

---

## Collection Inventory

All collections live under `families/{familyId}/`. No subcollections go deeper than 2 levels (i.e., `families/{familyId}/{collection}`), so there are **no deep nesting issues**.

| # | Collection | Doc ID Pattern | Est. Docs/Family | Primary Access Pattern |
|---|---|---|---|---|
| 1 | `children` | auto | 2–5 | Full collection read |
| 2 | `weeks` | `{weekStart}` | ~52/yr | Single doc by weekStart |
| 3 | `days` | auto | ~180/yr | Range query by `date`; single doc listener |
| 4 | `artifacts` | auto | ~500+/yr | Range query by `createdAt`; filtered by `childId` + `dayLogId` |
| 5 | `hours` | auto | ~200/yr | Range query by `date`; filtered by `source` + `labReportId` |
| 6 | `hoursAdjustments` | auto | <20/yr | Range query by `date` |
| 7 | `evaluations` | auto | ~12/yr | Range by `monthStart`; filtered by `childId` + `monthStart` |
| 8 | `ladders` | auto | 10–20 | Full collection read |
| 9 | `ladderProgress` | `{childId}_{ladderKey}` | 20–40 | Filtered by `childId` |
| 10 | `milestoneProgress` | auto | 50–100 | Range by `achievedAt`; full collection read |
| 11 | `sessions` | auto | ~200/yr | Filtered by `childId` + `ladderId` or `childId` + `date` |
| 12 | `dailyPlans` | `{date}_{childId}` | ~360/yr | Filtered by `childId` + `date` |
| 13 | `projects` | auto | <20 | Full collection read |
| 14 | `weeklyScores` | auto | ~104/yr | Filtered by `childId` + `weekStart` |
| 15 | `labSessions` | `{weekKey}_{childId}[_{projectId}]` | ~50/yr | Filtered by `childId` + `weekKey`, ordered by `createdAt` |
| 16 | `dadLabReports` | auto | ~50/yr | Ordered by `date`; filtered by `status` |
| 17 | `skillSnapshots` | `{childId}` | 2–5 | Single doc listener by `childId` |
| 18 | `plannerSessions` | `{weekKey}_{childId}` | ~104/yr | Single doc read |
| 19 | `lessonCards` | auto | ~50 | Filtered by `childId` |
| 20 | `plannerConversations` | `{weekKey}_{childId}` | ~104/yr | Single doc listener |
| 21 | `workbookConfigs` | `{childId}_{slug}` | <20 | Filtered by `childId` |
| 22 | `weeklyReviews` | `{weekKey}_{childId}` | ~104/yr | Single doc read (presumed) |
| 23 | `xpLedger` | `{childId}_{dedupKey}` | 100+/yr | Filtered by `childId`; ordered by `awardedAt` |
| 24 | `books` | auto | 20–50 | Filtered by `childId` + optional `status`, ordered by `updatedAt` |
| 25 | `stickerLibrary` | auto | 10–50 | Ordered by `createdAt` |
| 26 | `sightWordProgress` | `{childId}_{word}` | 50–200 | Full collection read |
| 27 | `sightWordLists` | auto | <10 | Full collection read (presumed) |
| 28 | `aiUsage` | auto | 50+/yr | Range by `createdAt` |
| 29 | `avatarProfiles` | `{childId}` | 2–5 | Single doc listener |
| 30 | `dailyArmorSessions` | `{childId}-{date}` | ~360/yr | Single doc listener |
| 31 | `evaluationSessions` | auto | 20–50 | Filtered by `childId` + `domain`/`status`, ordered by `evaluatedAt`. Status values: `in-progress`, `complete`, `resumed`, `abandoned`. Interactive sessions may include `savedQuestState`, `savedCurrentQuestion`, `bonusRoundUsed` for resume support. |

> **Note:** 31 collections found (28 in `firestore.ts` + `sightWordLists`, `sightWordProgress`, and `aiUsage` are in `firestore.ts` but the CLAUDE.md table lists only 18 named collections). The CLAUDE.md collection table is outdated.

> **Update (Apr 8, 2026):** The `scans` collection (not listed above — added post-audit) stores AI-analyzed curriculum evidence (workbook pages, worksheets, tests). The `artifacts` collection stores non-curriculum evidence (creative builds, drawings, etc.). As of the unified capture pipeline, checklist items have an `evidenceCollection` field (`'scans' | 'artifacts'`) alongside `evidenceArtifactId` to indicate which collection the evidence doc lives in. Legacy items without `evidenceCollection` are in `artifacts`.

> **Update (Apr 14, 2026):** Child documents now support an optional `dispositionOverrides` field (separate from `dispositionCache`):
> ```typescript
> dispositionOverrides?: {
>   curiosity?: DispositionNarrativeOverride
>   persistence?: DispositionNarrativeOverride
>   articulation?: DispositionNarrativeOverride
>   selfAwareness?: DispositionNarrativeOverride
>   ownership?: DispositionNarrativeOverride
> }
>
> interface DispositionNarrativeOverride {
>   text: string               // Shelly's corrected narrative
>   overriddenBy: string       // 'parent'
>   overriddenAt: string       // ISO timestamp
>   note?: string              // reason for the edit
> }
> ```
> Stored as a **separate field** from `dispositionCache` so AI regeneration (which overwrites `dispositionCache.result` + `generatedAt`) cannot blow away parent overrides. The canonical way to read the current narrative for a disposition is `effectiveDispositionText(entry, override)` from `src/core/types/disposition.ts`, which returns `override?.text ?? entry.narrative`. When no overrides remain, the field is deleted via `deleteField()`.

> **Update (Apr 9, 2026):** Scan documents now support an optional `parentOverride` field:
> ```typescript
> parentOverride?: {
>   recommendation: 'do' | 'skip' | 'quick-review' | 'modify'
>   overriddenBy: string
>   overriddenAt: string  // ISO timestamp
>   note?: string
> }
> ```
> When present, the parent's recommendation takes precedence over the AI's original in `results.recommendation`. The canonical way to read the current recommendation is `effectiveRecommendation(scan)` from `src/core/types/planning.ts`, which returns `parentOverride.recommendation ?? results.recommendation`. The AI's original is never mutated.

---

## Composite Index Inventory

### Composite Indexes (from `firestore.indexes.json`)

| # | Collection | Fields | Scope | Matching Query? | Status |
|---|---|---|---|---|---|
| 1 | `xpLedger` | `childId` ASC, `dedupKey` ASC | COLLECTION | Yes — `addXpEvent.ts:91`, `AvatarAdminTab.tsx:406` (`childId` == + `dedupKey` !=) | **MATCHED** |
| 2 | `xpLedger` | `childId` ASC, `awardedAt` DESC | COLLECTION | Yes — `AvatarAdminTab.tsx:125` (`childId` == + `awardedAt` orderBy desc) | **MATCHED** |
| 3 | `dailyArmorSessions` | `childId` ASC, `date` DESC | COLLECTION | No query found using both fields as filters | **POSSIBLY UNUSED** |
| 4 | `books` | `childId` ASC, `updatedAt` DESC | COLLECTION | Yes — `useBook.ts:446` (`childId` == + `updatedAt` orderBy desc) | **MATCHED** |
| 5 | `books` | `childId` ASC, `status` ASC, `updatedAt` DESC | COLLECTION | Yes — `useBook.ts:521` (`childId` == + `status` == + `updatedAt` orderBy desc) | **MATCHED** |
| 6 | `evaluationSessions` | `childId` ASC, `domain` ASC, `evaluatedAt` DESC | COLLECTION | Yes — `useQuestSession.ts:130`, `EvaluateChatPage.tsx:198` | **MATCHED** |
| 7 | `evaluationSessions` | `childId` ASC, `status` ASC, `evaluatedAt` DESC | COLLECTION | Partial — queries use `childId` + `status` but don't always orderBy `evaluatedAt`; Cloud Functions do use full pattern | **MATCHED** |

### Field Overrides (Single-Field Index Customization)

| # | Collection | Field | Index Types | Purpose |
|---|---|---|---|---|
| 1 | `artifacts` | `dayLogId` | ASC + DESC | Supports equality queries on `dayLogId` |
| 2 | `artifacts` | `createdAt` | ASC + DESC | Supports range queries on `createdAt` |
| 3 | `milestoneProgress` | `achievedAt` | ASC + DESC | Supports range queries on `achievedAt` |
| 4 | `hours` | `date` | ASC + DESC | Supports range queries on `date` |
| 5 | `days` | `date` | ASC + DESC | Supports range queries on `date` |
| 6 | `hoursAdjustments` | `date` | ASC + DESC | Supports range queries on `date` |
| 7 | `evaluations` | `monthStart` | ASC + DESC | Supports range queries on `monthStart` |

---

## Query Patterns

### Queries Requiring Composite Indexes

| Collection | Where Fields | OrderBy | Source File(s) | Index Exists? |
|---|---|---|---|---|
| `xpLedger` | `childId`, `dedupKey` (!=) | — | `addXpEvent.ts:91` | Yes (#1) |
| `xpLedger` | `childId`, `dedupKey` (!=) | `awardedAt` DESC | `AvatarAdminTab.tsx:125` | Yes (#2) |
| `books` | `childId` | `updatedAt` DESC | `useBook.ts:446` | Yes (#4) |
| `books` | `childId`, `status` | `updatedAt` DESC | `useBook.ts:521` | Yes (#5) |
| `evaluationSessions` | `childId`, `domain` | `evaluatedAt` DESC | `useQuestSession.ts:130`, `EvaluateChatPage.tsx:198` | Yes (#6) |
| `evaluationSessions` | `childId`, `status` | `evaluatedAt` DESC | `EvaluationHistoryTab.tsx:220` (client), `chat.ts:1046` (functions) | Yes (#7) |
| `artifacts` | `childId`, `dayLogId` | — | `TodayPage.tsx:297`, `KidTodayView.tsx:183` | **MISSING** — needs composite on `childId` + `dayLogId` |
| `days` | `childId`, `date` (range) | — | `ExplorerMap.tsx:73` | **MISSING** — needs composite on `childId` + `date` |
| `evaluations` | `childId`, `monthStart` | — | `EvaluationsPage.tsx:99` | **MISSING** — needs composite on `childId` + `monthStart` |
| `hours` | `source`, `labReportId` | — | `useDadLabReports.ts:47` | **MISSING** — needs composite on `source` + `labReportId` |
| `labSessions` | `childId`, `weekKey` | `createdAt` DESC | `useWeekSessions.ts:36` | **MISSING** — needs composite on `childId` + `weekKey` + `createdAt` |

### Single-Field Queries (no composite index needed)

| Collection | Where/OrderBy | Source File(s) |
|---|---|---|
| `artifacts` | `createdAt` range | `EnginePage.tsx:99`, `RecordsPage.tsx:197`, `EvaluationsPage.tsx:79`, `PortfolioPage.tsx:71` |
| `days` | `date` range | `RecordsPage.tsx:175` |
| `hours` | `date` range | `RecordsPage.tsx:170` |
| `hoursAdjustments` | `date` range | `RecordsPage.tsx:180` |
| `evaluations` | `monthStart` range | `RecordsPage.tsx:185` |
| `milestoneProgress` | `achievedAt` range | `EnginePage.tsx:104` |
| `ladderProgress` | `childId` == | `LaddersPage.tsx:124`, `LadderQuickLog.tsx:39`, `ScoreboardPage.tsx:110` |
| `weeklyScores` | `childId` + `weekStart` == | `ScoreboardPage.tsx:136` |
| `sessions` | `childId` + `ladderId` == | `SessionRunnerPage.tsx:152` |
| `sessions` | `childId` + `date` == | `SessionRunnerPage.tsx:180` |
| `dailyPlans` | `childId` + `date` == | `SessionRunnerPage.tsx:172` |
| `dadLabReports` | `status` == | `KidLabView.tsx:50` |
| `dadLabReports` | `status` ==, `date` orderBy | `KidLabView.tsx:59`, `KidLabView.tsx:68` |
| `dadLabReports` | `date` orderBy | `useDadLabReports.ts:28` |
| `stickerLibrary` | `createdAt` orderBy | `StickerPicker.tsx:137`, `StickerLibraryTab.tsx:59` |
| `workbookConfigs` | `childId` == | `PlannerChatPage.tsx:263`, `SkillSnapshotPage.tsx:285` |
| `lessonCards` | `childId` == | `TeachHelperDialog.tsx:105` |
| `aiUsage` | `createdAt` range | `AIUsagePanel.tsx:96` |
| `books` | `contributorIds` array-contains | `useBook.ts:451` |

### Full Collection Reads (no filters)

| Collection | Source File(s) | Concern |
|---|---|---|
| `children` | `useChildren.ts:63` | OK — always small (<5 docs) |
| `ladders` | `DashboardPage.tsx:95`, `KidsPage.tsx:98` | OK — typically 10–20 docs |
| `milestoneProgress` | `DashboardPage.tsx:96`, `KidsPage.tsx:99` | **Watch** — could grow to 100+ docs |
| `artifacts` | `KidsPage.tsx:100` | **Concern** — unbounded; could be 500+ docs |
| `sessions` | `DashboardPage.tsx:94` | **Concern** — unbounded; grows per year |
| `days` | `ScoreboardPage.tsx:93` | **Watch** — grows ~180/yr per child |
| `hours` | `RecordsPage.tsx:448` | **Watch** — fallback full read |
| `hoursAdjustments` | `RecordsPage.tsx:458` | OK — typically <20 docs |
| `projects` | `ProjectBoardPage.tsx:126` | OK — typically <20 docs |
| `sightWordProgress` | `useSightWordProgress.ts:20` | **Watch** — could reach 200+ docs |

### Cloud Functions Queries (server-side in `functions/src/`)

| Collection | Where Fields | OrderBy | Source File |
|---|---|---|---|
| `sessions` | `childId`, `date` (>=) | — | `chat.ts:146` |
| `workbookConfigs` | `childId` | — | `chat.ts:183` |
| `hours` | `childId`, `date` (>=) | — | `chat.ts:271` |
| `days` | `childId`, `date` (>=) | — | `chat.ts:297`, `chat.ts:339` |
| `books` | `childId`, `status` | — | `chat.ts:372` |
| `sightWordProgress` | (full read) | — | `chat.ts:924` |
| `evaluationSessions` | `childId`, `status`, `evaluatedAt` orderBy DESC | — | `chat.ts:1046`, `chat.ts:1387` |
| `aiUsage` | (write only) | — | `chat.ts:1153`, `chat.ts:1252`, `chat.ts:1488`, `imageGen.ts:185` |

---

## Cross-Reference: Indexes vs Queries

### Unused Indexes

| Index | Status | Notes |
|---|---|---|
| `dailyArmorSessions` (`childId` ASC, `date` DESC) | **Possibly unused** | Current code only does single-doc lookups by `{childId}-{date}` doc ID. No query found filtering on both `childId` and `date`. May have been for a removed feature or planned future use. |

### Missing Composite Indexes

These queries filter/sort on multiple fields and likely need composite indexes. They may work in production via auto-created indexes from the Firebase console, but are not tracked in `firestore.indexes.json`.

| # | Collection | Fields Needed | Query Source | Risk |
|---|---|---|---|---|
| 1 | `artifacts` | `childId` + `dayLogId` | `TodayPage.tsx`, `KidTodayView.tsx` | Medium — high-frequency daily use query |
| 2 | `days` | `childId` + `date` (range) | `ExplorerMap.tsx` | Medium — weekly view feature |
| 3 | `evaluations` | `childId` + `monthStart` | `EvaluationsPage.tsx` | Low — monthly use |
| 4 | `hours` | `source` + `labReportId` | `useDadLabReports.ts` | Low — dad-lab feature |
| 5 | `labSessions` | `childId` + `weekKey` + `createdAt` DESC | `useWeekSessions.ts` | Medium — weekly view feature |

> **Recommendation:** Export these from the Firebase console and add them to `firestore.indexes.json` for version control.

---

## Consolidation Recommendations

### 1. `ladders` + `ladderProgress` — Always Read Together

**Observation:** `LaddersPage.tsx`, `KidsPage.tsx`, and `DashboardPage.tsx` always fetch both `ladders` and `ladderProgress` in the same component.

**Option A — Embed progress in ladder docs:** Add a `progress: Record<childId, { currentStep, completedAt }>` map field to each ladder document.

| Metric | Current | After Merge |
|---|---|---|
| Reads per page load | 2 collection reads | 1 collection read |
| Write complexity | Simple `setDoc` on progress | `updateDoc` with nested field path |
| Migration complexity | **Low** — backfill script + client update |

**Recommendation:** Worth doing. Ladders are small (10–20 docs) and progress is always needed alongside ladder definitions.

### 2. `milestoneProgress` — Embed in `ladderProgress`

**Observation:** Milestones are logically children of ladder steps. `milestoneProgress` is fetched alongside `ladderProgress` in `DashboardPage.tsx` and `KidsPage.tsx`.

**Option:** Add `milestones: MilestoneProgress[]` array to each `ladderProgress` doc.

| Metric | Current | After Merge |
|---|---|---|
| Reads per page load | 2 collection reads | 1 collection read |
| Range query on `achievedAt` | Supported (field override exists) | Would require restructuring or moving to `days` collection |
| Migration complexity | **Medium** — need to update all milestone writes and the `achievedAt` range query in `EnginePage.tsx` |

**Recommendation:** Consider, but the `achievedAt` range query complicates this. Evaluate whether that query could use a different source (e.g., denormalized onto `days`).

### 3. `weeklyScores` — Embed in `weeks`

**Observation:** `weeklyScores` are keyed by `childId` + `weekStart` and are small summary documents. They're always contextual to a specific week.

**Option:** Add `scores: Record<childId, WeeklyScore>` to the `weeks` document.

| Metric | Current | After Merge |
|---|---|---|
| Reads for scoreboard | 1 `weeklyScores` query + 1 `weeks` doc | 1 `weeks` doc |
| Doc size impact | Negligible — scores are small objects |
| Migration complexity | **Low** |

**Recommendation:** Worth doing. Weekly score docs are tiny and 1:1 with week+child.

### 4. `skillSnapshots` + `avatarProfiles` — Merge Into One Per-Child Profile

**Observation:** Both are keyed by `{childId}` (one doc per child). They represent per-child metadata. `avatarProfiles` has XP/level data; `skillSnapshots` has evaluation data.

**New field (2026-04):** `workingLevels?: WorkingLevels` — per-domain working levels for Knowledge Mine progression.

```
workingLevels: {
  phonics?: { level: number, updatedAt: string, source: 'quest'|'evaluation'|'curriculum'|'manual', evidence?: string }
  comprehension?: { ... same shape }
  math?: { ... same shape }
}
```

Written by: quest session end (`source: 'quest'`), guided evaluation apply (`source: 'evaluation'`), curriculum scan (`source: 'curriculum'`), future parent UI (`source: 'manual'`). Manual overrides are protected from automated overwrites for 48 hours. Optional field — absence means "no data, use default Level 2."

**Option:** Merge into a single `childProfiles` collection or embed both as subcollections of `children`.

| Metric | Current | After Merge |
|---|---|---|
| Reads when both needed | 2 doc reads | 1 doc read |
| Separation of concerns | Currently clean separation | Would mix assessment data with gamification data |
| Migration complexity | **Medium** |

**Recommendation:** Only merge if they're frequently read together. Currently they're used in different features, so this is **lower priority**.

### 5. `plannerSessions` + `plannerConversations` — Likely Redundant

**Observation:** Both are keyed by `{weekKey}_{childId}`. `plannerSessions` appears to be an older planner workflow, while `plannerConversations` is the newer chat-based planner. No queries found for `plannerSessions` in the current codebase (only the collection definition exists).

**Option:** Deprecate `plannerSessions` if it's no longer used.

| Metric | Current | After Merge |
|---|---|---|
| Reads saved | 0 — `plannerSessions` may not be actively read |
| Risk | Low — verify no server-side or admin usage |
| Migration complexity | **Low** — just remove the collection reference |

**Recommendation:** Audit Cloud Functions and admin tools for `plannerSessions` usage. If none, deprecate it.

---

## Full Collection Reads — Scalability Concerns

These full-collection reads will become increasingly expensive as the family accumulates data:

| Collection | Current Full Reads | Projected Growth | Recommendation |
|---|---|---|---|
| `artifacts` | `KidsPage.tsx` | 500+ docs/yr | Add date or child filter; paginate |
| `sessions` | `DashboardPage.tsx` | 200+ docs/yr | Add date filter (e.g., last 30 days) |
| `days` | `ScoreboardPage.tsx` | 180+ docs/yr | Add date range filter |
| `milestoneProgress` | `DashboardPage.tsx`, `KidsPage.tsx` | 100+ docs | Filter by `childId` |

---

## CLAUDE.md Collection Table — Out of Date

The CLAUDE.md file lists 18 collections but the codebase defines 31. Missing from CLAUDE.md:

1. `dadLabReports`
2. `workbookConfigs`
3. `xpLedger`
4. `books`
5. `stickerLibrary`
6. `sightWordProgress`
7. `sightWordLists`
8. `aiUsage`
9. `avatarProfiles`
10. `dailyArmorSessions`
11. `evaluationSessions`
12. `plannerConversations`

**Recommendation:** Update the CLAUDE.md collection table to reflect all 31 collections.

---

## Action Items

### Priority 1 — Index Hygiene (Low effort, prevents production issues)

- [ ] Add 5 missing composite indexes to `firestore.indexes.json` (artifacts `childId`+`dayLogId`, days `childId`+`date`, evaluations `childId`+`monthStart`, hours `source`+`labReportId`, labSessions `childId`+`weekKey`+`createdAt`)
- [ ] Evaluate removing the `dailyArmorSessions` composite index if confirmed unused
- [ ] Export any auto-created indexes from Firebase console into `firestore.indexes.json`

### Priority 2 — Quick Consolidations (Low effort, read savings)

- [ ] Embed `weeklyScores` into `weeks` documents
- [ ] Audit and potentially deprecate `plannerSessions` collection

### Priority 3 — Medium Consolidations (Medium effort, architectural improvement)

- [ ] Merge `ladderProgress` into `ladders` documents
- [ ] Evaluate merging `milestoneProgress` into `ladderProgress` (blocked by `achievedAt` range query)

### Priority 4 — Scalability Fixes (Medium effort, prevents future performance issues)

- [ ] Add filters to full collection reads in `KidsPage.tsx` (artifacts), `DashboardPage.tsx` (sessions), `ScoreboardPage.tsx` (days)
- [ ] Add pagination for `sightWordProgress` full reads

### Priority 5 — Documentation

- [ ] Update CLAUDE.md collection table to include all 31 collections
