# Items In Place Report — First Principles Engine

Date: 2026-02-09

**Build status:** `npx tsc -b` clean (zero errors)
**Test status:** `npm test` — 7 test files, 81 tests, all passing

---

## 1) Snapshot (what exists)

### Routes / pages

| Route | Page component | Purpose |
|---|---|---|
| `/dashboard` | `src/features/sessions/DashboardPage.tsx` | Energy picker, daily plan (A/B), session launcher, streak, level-up alerts |
| `/sessions/run` | `src/features/sessions/SessionRunnerPage.tsx` | Run a session (stream + ladder + rung) |
| `/scoreboard` | `src/features/scoreboard/ScoreboardPage.tsx` | Weekly scoreboard |
| `/projects` | `src/features/projects/ProjectBoardPage.tsx` | Project board (Plan/Build/Test/Improve) |
| `/today` | `src/features/today/TodayPage.tsx` | Daily log: blocks, routines, artifact capture, Plan A/B |
| `/week` | `src/features/week/WeekPage.tsx` | Weekly plan (theme, virtue, goals) |
| `/week/lab` | `src/features/week/LabModePage.tsx` | Lab Mode — quick artifact capture per engine stage |
| `/engine` | `src/features/engine/EnginePage.tsx` | Learning engine (Wonder/Build/Explain/Reflect/Share) |
| `/ladders` | `src/features/ladders/LaddersPage.tsx` | Ladders — parent full view + kid simplified view |
| `/kids` | `src/features/kids/KidsPage.tsx` | Kids — per-child ladder detail, mark-achieved, evidence linking |
| `/records` | `src/features/records/RecordsPage.tsx` | Hours summary, exports, compliance pack |
| `/records/evaluations` | `src/features/records/EvaluationsPage.tsx` | Monthly evaluations |
| `/records/portfolio` | `src/features/records/PortfolioPage.tsx` | Portfolio index |
| `/settings` | `src/features/settings/SettingsPage.tsx` | Settings + account section |

### Firebase collections (`src/core/firebase/firestore.ts`)

All under `families/{familyId}/`:

| Collection | Type | Converter |
|---|---|---|
| `children` | `Child` | raw |
| `weeks` | `WeekPlan` | raw |
| `days` | `DayLog` | `dayLogConverter` (strips undefined) |
| `artifacts` | `Artifact` | `artifactConverter` (ensures `id`) |
| `hours` | `HoursEntry` | `hoursEntryConverter` |
| `evaluations` | `Evaluation` | raw |
| `ladders` | `Ladder` | raw |
| `milestoneProgress` | `MilestoneProgress` | raw |
| `hoursAdjustments` | `HoursAdjustment` | raw |
| `sessions` | `Session` | raw |
| `dailyPlans` | `DailyPlan` | raw |
| `projects` | `Project` | raw |
| `weeklyScores` | `WeeklyScore` | raw |
| `labSessions` | `LabSession` | raw |
| `dadLab` | `DadLabWeek` | raw |

### Roles (parent / lincoln / london)

- Profiles defined in `src/core/types/enums.ts:58-63` — `UserProfile = { Lincoln: 'lincoln', London: 'london', Parents: 'parents' }`
- Theme modes per profile: `src/core/types/enums.ts:65-70` — `ThemeMode = { Family, Lincoln, London }`
- Profile selection gate: `src/app/App.tsx:37-44` — `ProfileGate` shows `ProfileSelectPage` when no profile chosen
- `useProfile()` exposes `{ profile, canEdit, themeMode }` — `src/core/profile/useProfile.ts`
- Kid vs parent UI branching: `LaddersPage.tsx:73` checks `isKid` to show simplified view; `DashboardPage.tsx:257` uses `canEdit` to conditionally show energy picker and quick-start

---

## 2) "Right items in place" checklist

### Kid logging (Lincoln / London)

- **Child.dayBlocks** — `src/core/types/domain.ts:29` — `dayBlocks?: DayBlockType[]` ordered list per child
- **Child.routineItems** — `src/core/types/domain.ts:31` — `routineItems?: RoutineItemKey[]` ordered list per child
- **Seed data** — `src/core/data/seed.ts:49-55` — Lincoln: 5 dayBlocks (Formation, Reading, Math, Together, Project) + 7 routineItems (phonemic through narration). London: 4 dayBlocks, no routineItems specified (falls back to `ALL_ROUTINE_ITEMS` default).

| Item | Status | Evidence |
|---|---|---|
| DayLog scoped per child | :white_check_mark: | `TodayPage.tsx:79-81` — doc ID = `${selectedChildId}_${today}`, each child gets its own Firestore document |
| Blocks respect child's dayBlocks order | :white_check_mark: | `daylog.model.ts:86` — `buildBlocks(dayBlocks ?? ALL_DAY_BLOCKS)` uses child's order |
| RoutineSection respects child's routineItems | :white_check_mark: | `TodayPage.tsx:541` — passes `routineItems={selectedChild?.routineItems}` to `RoutineSection`; `RoutineSection.tsx:34-37` builds a Set from the items and conditionally renders only matching items |
| Plan A / Plan B toggle | :white_check_mark: | `TodayPage.tsx:550-558` — ToggleButtonGroup for A/B; Plan B filters to only Reading + Math blocks (`TodayPage.tsx:566-568`) |
| Kid role logging never overwrites another child's log | :white_check_mark: | Each DayLog is keyed by `${childId}_${date}` (`TodayPage.tsx:81`), so child A's writes cannot collide with child B |
| Lincoln's "noise-cut" routine items (literacy engine) | :white_check_mark: | `RoutineSection.tsx:170-378` renders PhonemicAwareness, PhonicsLesson, DecodableReading, SpellingDictation when present in items Set; seed gives Lincoln exactly these items |
| London's routine items configured | :large_orange_diamond: | `seed.ts:75` — London has no `routineItems` defined, so she falls back to `ALL_ROUTINE_ITEMS` (handwriting, spelling, sightWords, minecraft, readingEggs, math, speech) — these are the **legacy** items, not London-specific ones. London should have her own spec. |
| Empty state — no children | :white_check_mark: | `TodayPage.tsx:511` — `ChildSelector` shows `"Add a child to start logging."` when empty |
| Empty state — no daylog yet | :white_check_mark: | `TodayPage.tsx:514-520` — shows loading spinner when `selectedChildId` set but `dayLog` is null; auto-creates default on first load (`TodayPage.tsx:170-179`) |
| DayLog default creation uses child config | :white_check_mark: | `TodayPage.tsx:171-176` — `createDefaultDayLog(selectedChildId, today, selectedChild?.dayBlocks, selectedChild?.routineItems)` |
| XP calculation aligned to routine items | :white_check_mark: | `xp.ts:24-43` — covers all 13 routine items including Lincoln's literacy engine items |

### Dad Lab

| Item | Status | Evidence |
|---|---|---|
| LabSession type defined | :white_check_mark: | `domain.ts:319-330` — `LabSession` with stages (`LabStageCapture[]`), mission, constraints, roles, story |
| LabStageCapture links artifacts | :white_check_mark: | `domain.ts:332-337` — each stage has `artifactIds?: string[]` |
| `labSessions` collection exists | :white_check_mark: | `firestore.ts:145-148` — `labSessionsCollection()` |
| `dadLab` collection exists (DadLabWeek) | :white_check_mark: | `firestore.ts:150-153` — `dadLabCollection()` with `DadLabWeek` type (experiment + daily reports) |
| Lab Mode UI exists | :white_check_mark: | `LabModePage.tsx` — shows 5 engine-stage buttons (Wonder/Build/Explain/Reflect/Share), opens artifact capture form per stage |
| Lab Mode creates artifacts tagged with engine stage | :white_check_mark: | `LabModePage.tsx:89-109` — `buildBase()` sets `tags.engineStage` from selected stage |
| Lab Mode supports Note/Photo/Audio | :white_check_mark: | `LabModePage.tsx:205-297` — toggle between Note, Photo, Audio capture |
| Lab artifacts link to dayLogId | :white_check_mark: | `LabModePage.tsx:92` — `dayLogId: createdAt.slice(0, 10)` |
| Lab artifacts link to weekPlanId | :red_circle: | `LabModePage.tsx` does **not** set `weekPlanId` on artifacts (unlike `TodayPage.tsx:338`) |
| LabSession Firestore doc creation from UI | :red_circle: | `LabModePage.tsx` creates **artifacts** directly but does **not** create a `LabSession` document. The `labSessions` collection is defined but never written to from the Lab Mode UI. The structured Wonder→Build→Explain→Reflect→Share flow is not persisted as a session. |
| Minimum loop for a kid to complete | :large_orange_diamond: | A kid can tap a stage button, fill in a note or photo, and save. That's the minimum loop. But there's no "session complete" state — the stage resets after each save without tracking which stages were completed in a lab session. |
| DadLabWeek / experiment tracking UI | :red_circle: | `DadLabWeek` type exists (`domain.ts:383-391`), collection exists (`firestore.ts:150-153`), but **no UI page** reads or writes `dadLab` documents. The experiment/daily-report structure is data-only. |
| Project board connected | :white_check_mark: | `ProjectBoardPage.tsx` exists at `/projects` — manages projects with Plan/Build/Test/Improve phases |

### Ladders + evidence

| Item | Status | Evidence |
|---|---|---|
| Ladder type with rungs | :white_check_mark: | `domain.ts:202-218` — `Ladder` has `rungs: Rung[]`, each rung has `order`, `proofExamples`, `milestones` |
| MilestoneProgress tracking | :white_check_mark: | `domain.ts:220-230` — status: `locked | active | achieved` with `achievedAt` timestamp |
| Ladder logic (active rung, status) | :white_check_mark: | `ladder.logic.ts:12-36` — `getActiveRungId()` finds first unachieved rung; `getRungStatus()` returns locked/active/achieved |
| Evidence-required gate for achievement | :white_check_mark: | `ladder.logic.ts:38-39` — `canMarkAchieved(linkedArtifacts) => linkedArtifacts.length > 0` — **cannot mark achieved without at least one linked artifact** |
| Mark Achieved button disabled without evidence | :white_check_mark: | `KidsPage.tsx:448` — `disabled={!canMarkAchieved(linkedArtifacts) \|\| isSaving}` |
| Artifact-to-rung linking UI (on TodayPage) | :white_check_mark: | `TodayPage.tsx:929-1017` — each artifact has "Link to rung" button, opens ladder/rung selector, persists `tags.ladderRef` via `updateDoc` |
| Artifact-to-rung linking UI (on KidsPage) | :large_orange_diamond: | `KidsPage.tsx:429-439` shows linked artifacts in the rung dialog but does **not** provide a way to link new artifacts from this page. "Link Evidence" button is present in `LaddersPage.tsx:484-486` but is a no-op (no `onClick`). |
| ArtifactTags.ladderRef data field | :white_check_mark: | `domain.ts:185` — `ladderRef?: { ladderId: string; rungId: string }` |
| Ladder templates for quick creation | :white_check_mark: | `ladder.templates.ts` imported in `LaddersPage.tsx:43` — `createLiteracyLadder`, `createMathLadder` auto-create starter ladders |
| Kid-simplified ladder view | :white_check_mark: | `LaddersPage.tsx:180-304` — simplified cards with progress bars, current rung highlight, "Suggest Proof" button (placeholder), proof-examples dialog |
| Parent full ladder view | :white_check_mark: | `LaddersPage.tsx:308-493` — rung list with status chips, progress bar, child selector, rung detail dialog with linked evidence |
| 6 seed ladders for Lincoln | :white_check_mark: | `seed.ts:91-519` — reading, writing, communication, math, independence, dadlab — each with 6 rungs and proof examples |
| London ladders in seed | :large_orange_diamond: | `seed.ts:524-534` — only 1 ladder (london-math, 2 rungs). No reading/communication/independence ladders for London. |

### Records / compliance

| Item | Status | Evidence |
|---|---|---|
| Hours computed from DayLog blocks | :white_check_mark: | `records.logic.ts:65-78` — fallback: sums `block.actualMinutes` per `subjectBucket` from all DayLogs |
| Hours computed from HoursEntry docs | :white_check_mark: | `records.logic.ts:54-64` — primary: uses `hoursEntries` when available |
| Hours adjustments tracked | :white_check_mark: | `records.logic.ts:81-90` — applies `HoursAdjustment` minutes (positive or negative) with audit trail |
| Core vs total hours split | :white_check_mark: | `records.logic.ts:15-21` — `coreBuckets` = Reading, LanguageArts, Math, Science, SocialStudies |
| Home hours tracked | :white_check_mark: | `records.logic.ts:61,74` — tracks `homeMinutes` based on `LearningLocation.Home` |
| Hours Summary CSV export | :white_check_mark: | `records.logic.ts:133-154` — `generateHoursSummaryCsv()` with Subject, Total Hours, Home Hours |
| Daily Log CSV export | :white_check_mark: | `records.logic.ts:156-203` — `generateDailyLogCsv()` with Date, Block Type, Subject, Location, Minutes, Notes |
| Evaluation Markdown export | :white_check_mark: | `records.logic.ts:207-261` — `generateEvaluationMarkdown()` with wins, struggles, next steps, sample artifacts |
| Portfolio Index Markdown export | :white_check_mark: | `records.logic.ts:263-305` — `generatePortfolioMarkdown()` grouped by child with table format |
| Single-click compliance zip | :white_check_mark: | `records.logic.ts:377-418` — `buildComplianceZip()` bundles hours CSV + daily log CSV + evaluations MD + portfolio MD into a zip. `RecordsPage.tsx:506-512` — "Download Compliance Pack (.zip)" button |
| School year range auto-detected | :white_check_mark: | `RecordsPage.tsx:74` — `getSchoolYearRange()` from `lib/time.ts` |
| Generate Hours From Logs button | :white_check_mark: | `RecordsPage.tsx:176-202` — batch-creates `HoursEntry` docs from DayLog blocks |
| Manual adjustment with audit | :white_check_mark: | `RecordsPage.tsx:205-223` — date, minutes, reason, subject, all tracked in `hoursAdjustments` |
| Per-child filtering in hours | :red_circle: | `RecordsPage.tsx:93-108` queries hours by date range but does **not** filter by `childId`. Hours for all children are summed together. For MO compliance where per-child hours matter, this is a gap. |
| "MO pack" label / state-specific formatting | :large_orange_diamond: | The zip is labeled "compliance-pack" generically. No Missouri-specific fields (e.g. 1,000-hour minimum callout, subject-hour breakdowns per MO §167.031). The data is present but formatting is generic. |
| Portfolio auto-suggest scoring | :white_check_mark: | `records.logic.ts:309-343` — `scoreArtifactsForPortfolio()` scores by ladder ref, content, tags, evidence type |

### Stability / hardening

| Item | Status | Evidence |
|---|---|---|
| ErrorBoundary catches render errors | :white_check_mark: | `ErrorBoundary.tsx:23-25` — `getDerivedStateFromError()` catches React render errors |
| ErrorBoundary catches unhandled promise rejections | :white_check_mark: | `ErrorBoundary.tsx:27-29` — `componentDidMount` adds `unhandledrejection` listener; `ErrorBoundary.tsx:42-50` — `handleUnhandledRejection` sets error state and calls `event.preventDefault()` |
| ErrorBoundary cleanup on unmount | :white_check_mark: | `ErrorBoundary.tsx:31-35` — removes listener in `componentWillUnmount` |
| ErrorBoundary recovery options | :white_check_mark: | `ErrorBoundary.tsx:52-57` — "Try Again" (resets state) + "Reload Page" (full reload) + link to Settings |
| ErrorBoundary wraps entire app | :white_check_mark: | `App.tsx:54-56` — `<ErrorBoundary>` wraps `<AuthGate />` inside ThemeProvider |
| Anonymous sign-out guard | :white_check_mark: | `AccountSection.tsx:53-58` — `handleSignOutClick` checks `isAnonymous`; if true, opens confirmation dialog (`AccountSection.tsx:143-166`) warning about data loss with "Cancel", "Upgrade account", and "Sign out anyway" options |
| Anonymous auto-sign-in | :white_check_mark: | `AuthContext.tsx:28-33` — when no user, calls `signInAnonymously()` so app is always usable |
| Upgrade anonymous to email | :white_check_mark: | `AuthContext.tsx:40-47` — `upgradeToEmail()` uses `linkWithCredential` to preserve data |
| LabModePage missing try/catch on save | :red_circle: | `LabModePage.tsx:111-126` — `handleSave()` is async but has **no try/catch**. If `addDoc` fails, the promise rejects unhandled. Photo/audio handlers (`LabModePage.tsx:129-167`) have try/finally but no catch for the `addDoc` call itself. |
| KidsPage/fetchData missing try/catch | :large_orange_diamond: | `KidsPage.tsx:148-159` — `fetchData().then(...)` has no `.catch()`. If Firestore queries fail, unhandled rejection. ErrorBoundary will catch it globally, but no user-friendly snackbar. Same pattern in `LaddersPage.tsx:85-107`. |
| DashboardPage/fetchData missing try/catch | :large_orange_diamond: | `DashboardPage.tsx:106-115` — same `.then()` without `.catch()` pattern |
| Firestore converter strips undefined | :white_check_mark: | `firestore.ts:32-49` — `stripUndefined()` recursively removes `undefined` values before Firestore writes, preventing runtime errors |
| Save state indicator on TodayPage | :white_check_mark: | `SaveIndicator.tsx` + `TodayPage.tsx:559` — shows saving/saved/error states |

---

## 3) Gaps that will bite us (top 5)

### 1. Per-child hours not separated in Records/compliance export

**Risk:** Missouri compliance requires per-child hours. Currently all children's hours are summed together.
**Why:** `RecordsPage.tsx:93-108` queries by date range only. `computeHoursSummary()` doesn't group by `childId`. The zip export has no child dimension.
**Smallest fix:** Add a `childId` filter in `fetchRecords()` (use the existing `ChildSelector`), pass `childId` through to `computeHoursSummary` and CSV generators. ~50 lines across `RecordsPage.tsx` + `records.logic.ts`.
**Files:** `src/features/records/RecordsPage.tsx`, `src/features/records/records.logic.ts`

### 2. LabModePage async handlers lack try/catch — silent failures

**Risk:** If Firestore write fails during Lab Mode (network glitch, quota hit), the user sees nothing — no error, no feedback. The `ErrorBoundary` catches the rejection but shows a full-screen error instead of a recoverable snackbar.
**Why:** `LabModePage.tsx:111-126` `handleSave()` has no try/catch. Photo/audio handlers have try/finally but the inner `addDoc` can still reject without user notification.
**Smallest fix:** Wrap all three handlers in try/catch, add a Snackbar state (same pattern as `TodayPage.tsx`). ~30 lines.
**Files:** `src/features/week/LabModePage.tsx`

### 3. LabSession document never created — Lab Mode data is unstructured

**Risk:** Lab Mode creates individual artifacts but never persists a `LabSession` document. You can't query "all lab sessions for this child" or "which stages were completed." The `LabSession` type and `labSessionsCollection` exist but are unused. Same for `DadLabWeek`.
**Why:** `LabModePage.tsx` only creates artifacts. There's no session lifecycle (start → stage captures → complete → link to week).
**Smallest fix:** On first stage-tap, create a `LabSession` doc. On each artifact save, append `artifactId` to the matching `LabStageCapture.artifactIds`. Show a "Session Summary" at the end. ~100 lines in `LabModePage.tsx`.
**Files:** `src/features/week/LabModePage.tsx`, `src/core/firebase/firestore.ts`

### 4. London has no spec'd routine items or London-specific ladders

**Risk:** London falls back to legacy routine items (handwriting, spelling, sightWords, etc.) which may not match her actual curriculum. She only has 1 ladder (math, 2 rungs) vs Lincoln's 6 ladders.
**Why:** `seed.ts:66-76` — London child has `dayBlocks` but no `routineItems`. No London-specific ladders beyond basic math.
**Smallest fix:** Define London's `routineItems` in seed (decide which items she uses). Add at least 2-3 London ladders with age-appropriate rungs. ~60 lines in `seed.ts`. Ideally: create `docs/specs/london_engine.md` first.
**Files:** `src/core/data/seed.ts`, `docs/specs/london_engine.md` (new)

### 5. "Link Evidence" button on LaddersPage is a no-op

**Risk:** Parents see a "Link Evidence" button in the rung detail dialog on `/ladders` but clicking it does nothing — no `onClick` handler. This is a dead-end in the rung achievement workflow.
**Why:** `LaddersPage.tsx:484-486` — button has `variant="contained"` but no `onClick`. The linking flow only works from `/today` (TodayPage artifact list) or indirectly via `/kids` (viewing linked artifacts).
**Smallest fix:** Either wire the button to navigate to `/today` with a query param, or open an artifact picker dialog inline. ~40 lines.
**Files:** `src/features/ladders/LaddersPage.tsx`

---

## 4) Next 3 slices (small, shippable)

### Slice 1: Per-child compliance export

**Goal:** Records page filters hours by selected child and exports per-child compliance pack.

**Acceptance criteria (click path):**
- Go to `/records`
- Select "Lincoln" from child selector
- See hours table showing only Lincoln's hours
- Click "Download Compliance Pack (.zip)"
- Zip contains `lincoln-hours-summary.csv`, `lincoln-daily-logs.csv`, `lincoln-portfolio.md`
- Switch to "London" — see London's hours only

**Likely files touched:**
- `src/features/records/RecordsPage.tsx` — add ChildSelector, pass childId to queries
- `src/features/records/records.logic.ts` — filter entries by childId in `computeHoursSummary`, CSV generators, zip builder

### Slice 2: LabModePage error handling + LabSession creation

**Goal:** Lab Mode saves reliably with user feedback and creates a structured `LabSession` document.

**Acceptance criteria (click path):**
- Go to `/week/lab`, select Lincoln
- Tap "Wonder" — type a note — tap "Save Note"
- See green snackbar "Note saved"
- Tap "Build" — take a photo — see green snackbar "Photo uploaded"
- Both artifacts are linked to the same `LabSession` doc in Firestore
- If network is offline, see red snackbar "Failed to save" (not a full-screen crash)

**Likely files touched:**
- `src/features/week/LabModePage.tsx` — add try/catch, Snackbar state, LabSession lifecycle
- Possibly `src/features/week/LabModePage.tsx` imports from `src/core/firebase/firestore.ts` (labSessionsCollection)

### Slice 3: London routine items + starter ladders

**Goal:** London has her own routine spec and at least 3 age-appropriate ladders.

**Acceptance criteria (click path):**
- Seed demo data
- Select London on `/today` — see London-specific routine items (not Lincoln's literacy engine items)
- Go to `/ladders`, select London — see 3+ ladders with rungs
- Each ladder has at least 3 rungs with proof examples

**Likely files touched:**
- `src/core/data/seed.ts` — define London's `routineItems`, add London ladders
- Possibly `src/core/types/enums.ts` — if London needs new `RoutineItemKey` values
- `docs/specs/london_engine.md` (new) — spec document

---

## 5) Plan docs status

### Existing docs

| Doc | Path | Status |
|---|---|---|
| AGENT.md | `/AGENT.md` | :white_check_mark: Present |
| CLAUDE.md | `/CLAUDE.md` | :white_check_mark: Present, current (TypeScript constraints, patterns, commands) |
| README.md | `/README.md` | :white_check_mark: Present |
| Master Scope | `docs/00_MASTER_SCOPE.md` | :white_check_mark: Present |
| MVP v0.1 | `docs/01_MVP_V0_1.md` | :white_check_mark: Present |
| Engine + Ladders | `docs/02_ENGINE_LADDERS.md` | :white_check_mark: Present |
| Records & Compliance | `docs/03_RECORDS_COMPLIANCE.md` | :white_check_mark: Present |
| Media Capture | `docs/04_MEDIA_CAPTURE.md` | :white_check_mark: Present |
| Deployment & Operations | `docs/05_DEPLOYMENT_OPERATIONS.md` | :white_check_mark: Present |
| Testing Plan | `docs/06_TESTING_PLAN.md` | :white_check_mark: Present |
| Saturday Lab Runbook | `docs/07_SATURDAY_LAB_RUNBOOK.md` | :white_check_mark: Present |
| Codex Context Canvas (link) | `docs/LINK_CODEX_CONTEXT_CANVAS.md` | :white_check_mark: Present (link doc) |
| Codex Prompt Kickoff (link) | `docs/LINK_CODEX_PROMPT_KICKOFF.md` | :white_check_mark: Present (link doc) |
| Repo Audit Summary | `docs/REPO_AUDIT_SUMMARY.md` | :white_check_mark: Present |
| Runbook | `docs/RUNBOOK.md` | :white_check_mark: Present |

### Missing docs (recommended)

| Doc | Recommended path | Why |
|---|---|---|
| Lincoln Engine Spec | `docs/specs/lincoln_engine.md` | Document Lincoln's literacy/math/speech routine items, ladder definitions, XP values, Plan A/B rules in one place. Currently spread across seed.ts, xp.ts, daylog.model.ts. |
| London Engine Spec | `docs/specs/london_engine.md` | London has no spec. Her routine items default to legacy. Need age-appropriate items + ladders defined. |
| Roles & Permissions | `docs/specs/roles_and_permissions.md` | Document what each role (parent/lincoln/london) can see and do. Currently implicit in `canEdit`/`isKid` checks. |
| Data Model | `docs/specs/data_model.md` | ER diagram or table mapping all Firestore collections, their fields, relationships, and index requirements. Currently only inferable from `domain.ts` + `firestore.ts`. |

### Docs that should be updated

| Doc | What should change |
|---|---|
| `docs/03_RECORDS_COMPLIANCE.md` | Should note the per-child hours gap and MO-specific requirements. Should document the compliance zip contents. |
| `docs/02_ENGINE_LADDERS.md` | Should reflect that `LabSession` docs are defined but not yet created from UI. Should note the "Link Evidence" button gap on LaddersPage. |
| `docs/07_SATURDAY_LAB_RUNBOOK.md` | Should note that the Lab Mode UI currently creates artifacts only (no LabSession doc) and doesn't track session completion state. |
