# Barnes Family Homeschool — Master Project Outline v15

**Version:** v15 — April 12, 2026  
**Status:** Updated since v14 — Hero Hub reframe, two-currency economy hardening, Stonebridge narrative foundation, armor progression gating, capture pipeline unification, working levels, chapter book pool.

## Project Summary
Homeschool management app for the Barnes family: Shelly (parent, fibromyalgia), Nathan (dad, builder), Lincoln (10, neurodivergent, speech challenges), London (6, drawing/story-first).

---

**Tech:** React + TypeScript + Vite, Firebase (Auth/Firestore/Storage/Functions/Hosting), MUI, Claude + OpenAI image stack.

**Scale (current):**
- TypeScript lines: **126,034** total
- Commits: **112**
- Tests: **69 test files**
- Firestore collections/doc helpers: **33** in `firestore.ts`
- Cloud Functions: **18**
- Chat task types: **14**
- Routes: **27**

## Navigation
**Parent:** Today, Plan My Week, Weekly Review, Progress, Records, Books, Ask AI, Game Workshop, Dad Lab, Settings  
**Kid:** Today, Knowledge Mine, Game Workshop, My Books, **Hero Hub**, Dad Lab

---

## What's Built and Working

### Hero Hub (formerly My Armor)
- Reframed from a settings-style page into a **place** with identity + mission focus.
- Above-the-fold order: hero render → mission card → Stonebridge preview → stat row.
- Mission state progression implemented for hub card logic: **Suit Up → Conundrum → Chapter → Hero Ready**.
- Stonebridge preview surfaces current chapter/conundrum context.
- Existing customization controls are preserved below the fold.

### 3D Avatar — Armor of God System
- Family-tuned voxel proportions: `headSize 1.8`, `torsoW 1.7`, `armW 1.0`, `legH 2.8`, `sleeveRatio 0.7`, `bootRatio 0.3`.
- Sleeves + forearm split with wrist wraps.
- Boots include lower-leg band (lower ~30%).
- Cape defaults on all characters with gentle sway.
- Tunic details: collar, trim band, cloth belt + buckle, skirt, shoulder pads.
- Thin dark edge outlines on character + armor blocks (Legends readability pass).
- Open-face helmet design keeps face visible.
- Shield position fixed in front of arm (no torso clip).
- Ghost armor visuals removed (binary equipped/hidden model).
- Lighting overhaul: warm key, cool fill, gold rim, bounce fill.
- `MeshPhongMaterial` baseline with tier-specific specular/emissive tuning.
- Scene polish: gradient sky, floating gold particles, stone pedestal with edge glow.
- Idle loop includes breathing, arm sway, head micro-movement, and cape sway.

### Accessories System
- 10 cosmetic accessories unlocked at XP milestones.
- Slot model: eyes, head, back, hand, shoulder, neck.
- Conflict rules applied (e.g., helmet hides crown, shield hides book).
- Persisted on profile at `customization.accessories`.

### Brothers View
- Toggle to render Lincoln + London side-by-side.
- Shared 3D scene with synchronized pose actions.
- Each child keeps independent armor/customization state.

### Night / Room Background Toggle
- **Night (default):** dark sky + moon/stars.
- **Room:** Minecraft-style interior (stone walls, wood floor, torch glow, crafting table, chest).
- Persisted at `customization.background`.

### Two-Currency Economy (XP + Diamonds)
(Reference docs: `docs/ECONOMY_AUDIT_PART1.md`, `docs/ECONOMY_AUDIT_PART2.md`.)

- XP = passive progression (tier unlock axis); Diamonds = active spend currency.
- Current voxel tier thresholds: Wood 0, Stone 200, Iron 500, Gold 1000, Diamond 2000, Netherite 5000.
- Forge model: spend diamonds once to forge piece, then equip toggle is free.
- `addXpEvent()` and `addDiamondEvent()` are the intended award gateways (dedup + transactional-safe patterns).
- Parent admin UI supports manual awards/deductions across both currencies.
- `xpLedger` stores both currencies via `currencyType`.
- `diamondBalance` cache/read-path work added for responsive UI.
- Lincoln backfill applied to restore fair early-progress economics.

### Armor Progression Gating
- **Loose gate** — next-tier pieces visible but locked with clear reason text (aspirational, not hidden).
- **Dual requirement** — both XP threshold AND prior tier fully forged needed to unlock next tier.
- **`forgedPieces[]`** field on AvatarProfile (distinct from `equippedPieces`).
- **Migration backfill** — infers forged pieces from current equipped state + ledger history.
- **`armorGate.ts`** with `isTierComplete()`, `canForgePiece()`, `getHighestCompletedTier()`.
- **Milestone rewards** — diamond bonuses on tier completion: Wood 20, Stone 30, Iron 50, Gold 75, Diamond 120, Netherite 200.
- **Daily Suit Up** — based on OWNED pieces, not all 6 total (can't equip what you haven't forged).
- **Phantom piece fix** — gate counts from active forge tier down, ignoring stale data in higher tiers.

### Stonebridge Narrative Foundation
- Canonical narrative bible documented at `docs/STONEBRIDGE_BIBLE.md`.
- Shared world model with recurring places/characters (designed for continuity over novelty).
- Imported into Cloud Functions prompt context (`functions/src/ai/stonebridgeBible.ts`).
- Chapter question and conundrum generation now use Stonebridge context.
- Sets continuity foundation for Banner Rally mission layer.

### Chapter Book Progress Tracking (Chapter Pool P1-P3)
- **Role split:** Parent (Shelly) stages chapters via chip picker + text notes; Kid (Lincoln) performs via audio recording. Single shared `answered` state — kid recording marks `answered: true` globally, removing from both views.
- **Parent view (`ChapterQuestionPool`)** — horizontal scrollable chip row of unanswered chapters with multi-select. Stacked question cards show text note field only (no audio). "Save Note" persists `responseNote` without marking `answered`. Skip action marks `answered: true, skipped: true`. Chip selections persisted to `DayLog.todaysSelectedChapters`.
- **Kid view (`KidChapterPool`)** — reads `dayLog.todaysSelectedChapters` (falls back to lowest unanswered). Each chapter shows question + audio record button. Save uploads audio → creates artifact + ChapterResponse docs → marks `answered: true` on bookProgress. Positioned below verse card. No skip, no text note.
- `useBookProgress` hook — live `onSnapshot` subscription on `bookProgress/{childId}_{bookId}` doc. Provides `updateChapter` callback for atomic pool entry updates.
- Records "Book Responses" tab groups chapter responses by book in expandable accordions. Shows all chapters: answered (with inline audio), skipped, and unanswered. Legacy responses without `bookId` fall back to title match; unmatched entries bucket to "Other Books".
- Legacy `ChapterQuestionCard` deleted. `DayLog.chapterQuestion` deprecated (reads only, no new writes). `DraftDayPlan.chapterQuestion` removed.
- **Storage rule fix:** `chapterResponses/` path added to `storage.rules` (was missing — caused 403 on audio upload). Chapter response audio capture now fully working end-to-end.
- **Save error surfacing:** All kid recording/save components (`KidChapterPool`, `KidTeachBack`, `KidConundrumResponse`, `KidExtraLogger`) now show a visible MUI Alert on save failure instead of silently swallowing errors. Dismissible with retry guidance.

---

## What's Built but Untested with Real Users
- Full Hero Hub mission-state cycle end-to-end across multiple weeks.
- Brothers View sustained usage (especially London-led sessions).
- Stonebridge continuity quality over 2–3 week narrative runs.
- Diamond economy pacing over sustained real usage (earn/spend cadence).
- Edge-outline render performance on lower-end mobile tablets.

## What's Not Built Yet — Priority Queue
1. **Banner Rally missions (Hero Hub Phase 2)** — adaptive reading missions in Stonebridge.
2. **Restoration Map (Phase 2)** — village repair nodes and progress map.
3. **In-app character tuner** — slider playground directly in production UX.
4. **Curriculum scanning expansion** — workbook photo → AI skill mapping refinement.
5. **Eval close-the-loop automation** — re-eval triggers from engagement patterns.
6. **Math evaluation parity** — reading-style evaluation flow for math.
7. **London-specific evaluation flow** — age-adjusted assessment UX.
8. **Tier-up ceremony** — armor shatter / reveal celebration on tier transitions.
9. **Screenshot & share** — export avatar to PNG.
10. **Minecraft skin export** — 64x64 skin output from avatar config.
11. **Seasonal themes** — date-aware winter/fall/Christmas/Easter theming.

---

## Sprint History (Since v14)

| Sprint | Date | Outcome |
|---|---|---|
| Phase 2-3 Polish | Apr 2026 | XP toasts, tier-up ceremony, armor detail, scene polish, London avatar with younger proportions |
| Parent XP Mgmt | Apr 2026 | XP dashboard, award/adjust UI with presets |
| Legends Overhaul | Apr 2026 | Lighting, materials, gradient sky, particles, pedestal, dye/enchant glow/cape/emblem |
| Proportions Playground | Apr 2026 | In-chat slider tuner, Lincoln designed his own character, family-approved values applied |
| Edge Outlines + Mobile Fix | Apr 2026 | EdgesGeometry on all blocks, accessories grid overflow fixes, pose button truncation |
| Ghost Armor Removed | Apr 2026 | Binary on/off visibility only |
| Shield/Helmet Fix | Apr 2026 | Open-face helmet (5 pieces), shield positioned in front of body |
| Dream Features | Apr 2026 | Accessories (10 items), screenshot/share, Minecraft skin export, seasonal themes |
| Economy Audit | Apr 2026 | 2-part read-only audit, 7 bugs identified, pacing math, fix plan |
| Economy P0 Fixes | Apr 2026 | Consolidated voxel tier system, addXpEvent for admin, valid XP_EVENTS keys, transactional spendDiamonds, WOOD default tier |
| Economy P1 Fixes | Apr 2026 | WEEKLY_ALL_COMPLETE wired, BOOK_PAGE_READ wired, diamonds on evals, chapter response earning, conundrum dedup split |
| Economy P2 Cleanup | Apr 2026 | Cached balance used everywhere, forge helpers extracted to shared util |
| Diamond Gateway | Apr 2026 | addDiamondEvent(), DIAMOND_EVENTS constants, parent admin UI, spendDiamonds uses gateway |
| Phase 1A Stonebridge | Apr 2026 | Story bible, AI prompt injection for conundrum + chapter questions |
| Phase 1B Hero Hub | Apr 2026 | Nav rename, mission card, Stonebridge preview, above/below-fold layout |
| Armor Progression Gate | Apr 2026 | forgedPieces tracking, isTierComplete, canForgePiece, milestone bonuses, loose gate UI |
| Suit Up Bug Hunt | Apr 2026 | Tier display fixed (compute from XP), suit up counts owned pieces, phantom tier data bug fixed |
| Crash Cascade Stabilization | Apr 7, 2026 | Quest graceful error paths, `/quest` error boundary, AvatarThumbnail WebGL safety |
| Unified Capture Pipeline | Apr 8, 2026 | Merged 3 Today capture entry points into 1 AI-routed handler. Worksheets/textbooks/tests → scans + curriculum update; everything else → artifacts. Fixes "Last updated" staleness on Progress. |
| Scan Analysis + Parent Override | Apr 9, 2026 | Post-capture scan analysis visible inline on Today (expandable panel on "Captured ✓"). Progress Recent scans now tap-to-expand. New "This Week's Scans" section on Progress — 7-day rolling list. Parent override on AI recommendations — Shelly can correct classifications, originals preserved for audit. Shared ScanAnalysisPanel component. |
| Kid Unified Capture | Apr 9, 2026 | Extended unified capture pipeline to kid views. KidTodayView now uses shared `useUnifiedCapture` hook — Lincoln's captures route through AI scan, update curriculum, and appear in Shelly's Progress view identically to parent captures. Kid-friendly feedback (snackbar, no analysis panel). |
| Working Levels Data Model | Apr 9, 2026 | Per-domain working level tracking for Knowledge Mine progression (phonics/comprehension/math). Starting levels persist across sessions via `workingLevels` field on skill snapshot. Updated by quest completion, guided evaluation, and curriculum scans. Manual overrides protected for 48 hours. Fixes "starts at Level 2 every session" regression. (Part 1 — plumbing only; parent UI in Part 2.) |
| Bugfix Apr 10 | Apr 10, 2026 | Planner lock-in off-by-one: Friday plans were written to Thursday's date key because WEEK_DAYS (Monday=0) was added to a Sunday-based weekRange.start. Extracted `dateKeyForDayPlan` pure helper + unit tests. |
| Chapter Pool P1 | Apr 10, 2026 | Chapter book question pool foundation: ChapterBook + BookProgress types, Narnia seed data (17 chapters with summaries), chapterQuestions Cloud Function task handler, Firestore collection helpers. |
| Chapter Pool P2 | Apr 12, 2026 | Planner book picker (Autocomplete from library), readAloudBookId persistence on WeekPlan + plannerDefaults, handleApplyPlan triggers chapter question pool generation via chapterQuestions task, removed inline chapterQuestion prompt injection. (Apr 12 fix: picker now visible in review and active phases, not just setup wizard). (Apr 12 diagnostic: temp raw-response logging added for Monday plan fragment investigation). |
| Hotfix: chapterBooks path | Apr 12, 2026 | Moved chapterBooks from invalid `curriculum/chapterBooks` path (even segment count = document ref, not collection) to top-level `chapterBooks` collection. Updated Firestore rules, seed, and all references. |
| Chapter Pool P3 | Apr 12, 2026 | Today ChapterQuestionPool component (parent view): chapter picker + stacked question cards + per-chapter audio recording + live bookProgress updates. Deleted legacy ChapterQuestionCard. Deprecated DayLog.chapterQuestion field (reads only, no new writes). Removed P2 Monday diagnostic logging. Cleaned chapterQuestion from DraftDayPlan and AI plan schema. (Apr 13 fix: preserve readAloudBookId across plan applies, harden title prompt to prevent phonics context bleeding, parser safety net for long titles, re-added diagnostic logging). (Apr 13 fix: parent-only chip picker with multi-select + text notes (audio removed from parent); kid view gets KidChapterPool with audio recording positioned below verse card; single shared answered state; todaysSelectedChapters persisted on DayLog). (Apr 13 cleanup: ExplorerMap weekStart → Monday-based; removed temp diagnostic writes). (cleanup: hide chapter range field when library book selected — pool handles chapter selection) |
| Dev Admin Tab | Apr 13, 2026 | Mobile-friendly dev admin tab in Settings for one-off data ops: seed Narnia to chapterBooks, scan/delete stale Sunday DayLogs, set readAloudBookId on current week. Gated to Nathan's UID; delete or re-scope if the project has other developers. Firestore rules updated to allow admin UID writes to chapterBooks. |
| Plan + Pool Reliability | Apr 13, 2026 | Increased plan AI max_tokens to 16000, surface truncation as user error instead of silent routine fallback, added pool generation success/failure toasts with retry, manual pool gen trigger in Dev admin tab and on Today chapter card after 60s loading. (Apr 13 fix: useBookProgress loading state never-resolves bug — ensured all exit paths set loading: false, added bookId to useEffect deps for async re-subscription, split ChapterQuestionPool render into distinct loading vs "no pool doc yet" states so the generate-questions button appears immediately instead of waiting 60s for the fallback retry). |
| Charter: Remove Quest Scores | Apr 14, 2026 | Removed all numeric score displays from kid-facing quest UI per charter principle "No grades, no scores, no rankings on kid UI." Removed: X/10 question counter, running totalCorrect tally, totalQuestions on summary, X/5 fluency ratio, X/Y correct on resume card. Kept: progress bar (no numbers), diamond achievement framing, level indicator. Parent analytics unchanged. |
| Editable Disposition Narrative | Apr 14, 2026 | Per-disposition inline edit on Learning Profile tab. Parent overrides stored separately (`dispositionOverrides` on child doc) so AI regeneration cannot blow away edits. `effectiveDispositionText()` helper centralizes override-vs-AI resolution. "Edited by Shelly" indicator, revert to AI, optional reason note. "Newer AI available" notice when AI regenerates after an override. Types extracted to shared `src/core/types/disposition.ts`. Charter principle #5 now Aligned. |
| Working Levels Backfill | Apr 14, 2026 | One-time backfill action in Dev tab: derives workingLevels from evaluation findings + quest history for children missing them. Pure logic extracted for testing. Closes Fix #1 from workingLevels inspection. |
| Skip System Phase 1 | Apr 14, 2026 | Data model (`activityConfigId`, `skipReason`, `rolledOver`, `rolledOverFrom` on ChecklistItem) + `SkipReason` const enum. Auto-rollover of unchecked items to next school day (Mon←Fri, dedup by configId/label, chain-rollover, weekend skip). Scan-advance auto-completes bypassed checklist items when `syncScanToConfig` advances position. "Accept & advance" button on ScanResultsPanel for AI skip recommendations (marks skipped + advances position + records parentOverride). 38 new tests across 3 test files. Design: `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md`. |
| Chapter Response Save Fix | Apr 14, 2026 | Added missing `chapterResponses/` storage rule (caused 403 on kid audio upload). Surfaced save errors in all kid recording components (KidChapterPool, KidTeachBack, KidConundrumResponse, KidExtraLogger) — failures now show dismissible MUI Alert instead of silently swallowing. |
| Skill Snapshot Data-Loss Fix | Apr 16, 2026 | Fixed G27/R4 from Learning Engine Audit: bare `setDoc` on skillSnapshots silently erased unlisted fields (e.g. `completedPrograms`, `createdAt`). Added `{ merge: true }` to all three write sites: eval Apply (`EvaluateChatPage.tsx`), quest endSession (`useQuestSession.ts`), and admin backfill (`backfillWorkingLevels.ts`). |
| Ask AI Context Wiring (R6) | Apr 19, 2026 | Closed "Ask AI knows nothing" gap from Learning Engine Audit. Wired shellyChat task to the same adaptive context the quest/planner/disposition tasks already use: added `skillSnapshot`, `recentHistoryByDomain` (cross-domain, depth 3), `recentScans`, plus new `dayToday` (today's checklist with engagement/mastery/skip state) and `dadLabReports` (last 3 relevant reports with kid prediction/explanation) slices. No removals. Ask AI can now answer "what level is Lincoln at in phonics?", "how did this week go?", "what should we do for Dad Lab?", and "should Lincoln skip the next GATB math lesson?" from live Firestore data. |
| Working Levels UI (B.2 / G20) | Apr 20, 2026 | Closed G20 from Learning Engine Audit. Progress → Skill Snapshot tab now shows a Working Levels section with current level, source badge (quest / evaluation / curriculum / manual), last-updated timestamp, and evidence note for phonics / comprehension / math. Parents can adjust with ± controls and an optional note (suggestions: "further along", "struggling", "fresh start") — writes use `setDoc … { merge: true }` with `source: 'manual'`, respects `QUEST_MODE_LEVEL_CAP` ceilings (phonics 8, comp/math 6), and triggers the 48-hour manual-override guard. "Revert to last auto level" link clears the manual slot via `deleteField()` so the next quest/eval/scan writes through. London sees "Not set — will default to Level 2" until her first quest or manual set. |
| Comprehension Quest Prompt Rewrite (P1-3) | Apr 20, 2026 | Closed P1-3 from Knowledge Mine Audit. `buildComprehensionQuestPrompt` rewritten to match phonics structure: 6 concrete question types per 2-level band (18 total across L1-2 explicit / L3-4 simple inference / L5-6 deeper inference), Minecraft-themed passages required (Steve / Alex / Lincoln as protagonist, standard mobs and biomes), passage-length rules per level (15-30 / 30-60 / 60-100 words), auto-read TTS note (passages auto-read before answer — tests listening + reading, not decoding), kid-friendly language ban list (no "comprehension" / "inference" / "main idea" / "author's purpose" / "context clues" / "summarize" / "point of view" in question text), type rotation rule, expanded skill-tag vocabulary covering all 17 sub-skills. Level 6 is the comprehension ceiling. No engine or UI changes. |
| Weekly Review Bug Fixes | Apr 20, 2026 | Closed both findings from Learning Engine Audit "Weekly Review Context Inspection." **Bug 2 (doc ID mismatch → 0% completion):** added `lastCompletedWeekKey` util to `src/core/utils/time.ts` (mirrors CF `lastWeekKey`). `WeeklyReviewPage` now keys on the just-completed Sun–Sat week instead of the current-week Sunday, so the scheduled Sunday 7pm CT write and the page read agree on the doc ID. "Generate Now" covers the same range as the scheduled run (no more morning-snapshot 0%). Display label changed from raw Sunday key to `Week of Apr 12 – Apr 18`. **Bug 1 (context poverty):** weekly review now uses shared context slices alongside week-specific dayLog/hours data. Registered `weeklyReview` in `TASK_CONTEXT` with `charter, childProfile, skillSnapshot, activityConfigs, recentHistoryByDomain, recentScans, wordMastery, dadLabReports`. `generateReviewForChild` loads the child's skill snapshot and calls `buildContextForTask('weeklyReview', …)`. `assembleWeekContext` is untouched — it still supplies the week-scoped dayLogs/hours/plans/books/missedDays that the shared slices don't cover. Prompt addendum updated to push the reviewer to ground wins, growth areas, and pace adjustments in concrete skill progression (working levels, domain eval history, scan recommendations, activity-config frequency vs actual) rather than completion counts alone. Worst-case combined system prompt ≈3.1k input tokens, well under Claude Sonnet limits. |
| Book Attribution | Apr 20, 2026 | Added `createdBy` ('parent' or childId) and `createdFor` (childId) fields to Book type so Shelly can create books from parent profile without the Weekly Review mis-attributing them to the kid. Editor shows compact "For/By" controls at the top — "For" drives editor theming (Minecraft palette for Lincoln, storybook palette for London) via a new `themedChild` derivation that reads from `book.createdFor` instead of the active profile, so parent-profile creation gets WYSIWYG child palette preview. Theme tweaks (font/background/style) still stick after child-based defaults apply — an `aiStyleTouched` flag prevents the default-sync effect from clobbering user picks. Blank and generated books created from parent profile default to `createdBy: 'parent'`, `createdFor: selectedChildId`; kid-profile creation defaults to `createdBy: childId, createdFor: childId`. Weekly Review `bookActivity` context now includes `createdBy`/`createdFor`, includes books owned OR made-for the child, and tags each line as "made by Mom/Dad for Lincoln" / "made by Lincoln" / "made by sibling"; prompt TONE explicitly tells the reviewer not to credit parent-made books as the kid's creative work. Bookshelf gained a parent-only "Made by: All / Mom's Books / Kids" filter row and each book card shows a compact "By Mom" / "By Lincoln" badge. Existing books (no fields) default to `createdBy: 'parent'` (safer default — legacy books were made by Shelly in kid profiles); Shelly re-tags them one at a time via the editor dropdown. No batch migration. |
| Book Planner Integration | Apr 20, 2026 | Prompt 2 of book authorship: hooked Mom's Books and kid drafts into Plan My Week so planner-generated weeks surface "Read: {title}" and "Continue Book: {title}" choose-items with a `bookId` link. Replaced the count-only `loadDraftBookCount` with `loadDraftBooksByChild` (filters on `createdBy === childId`, returns title + page count + id per draft). Rewrote `loadGeneratedContent` into two buckets: **MOM'S BOOKS** (createdBy='parent' + createdFor=childId, last 30 days) and legacy AVAILABLE GENERATED CONTENT (childId-owned, de-duped). Both sections include the bookId inline so the AI can echo it on plan items. Added `bookId` to `DraftPlanItem`, parsed it in `chatPlanner.logic.ts`, and propagated it to `ChecklistItem` on plan apply. Added book-guidance rules to `PLAN_OUTPUT_INSTRUCTIONS` ("Read:" = Reading 10-15m with bookId, "Continue Book:" = LA/Art 15-20m with draft bookId, "Make a New Book" = null bookId). Today parent checklist gained a `MenuBookIcon` affordance next to the sparkle whenever `item.bookId` is set; KidChecklist's book-item heuristic now matches on `bookId \|\| /book\|read:/i` so AI-generated "Read: {title}" labels (no literal "book" word) still trigger the "Go to My Books" button. Hours tracking works naturally — checklist-item completion already credits `subjectBucket` minutes in `records.logic.ts`, so Reading and LanguageArts hours accrue on tick. |
| Kid Chapter + Cleanup | Apr 20, 2026 | Closed out the chapter pool feature. `KidChapterPool` component (audio recording per chapter, positioned directly below the verse card on Kid Today, above diamonds/workshop/checklist) reads `DayLog.todaysSelectedChapters` with fallback to the lowest unanswered chapter, uploads audio to `families/{familyId}/chapterResponses/{childId}/{bookId}/ch{n}_{ts}.webm`, creates matching artifact + `ChapterResponse` docs, and calls `updateChapter` to mark `answered: true` on `bookProgress` — so a kid recording disappears the chapter from the parent chip picker via the single shared state. Delete-and-redo flow cleans storage, artifact, and the response doc before un-answering. Legacy kid chapter response component removed (no more `dayLog.chapterQuestion` reads in kid view). Stripped the remaining Apr-13 diagnostic console logs from `useBookProgress.ts` now that the loading fix is confirmed stable. |
| Rollover Dedup + Planner Budget Enforcement | Apr 21, 2026 | Fixed the 21-item / 6h45m Monday checklist regression. **Rollover dedup (`src/features/today/rollover.ts` + new `src/core/utils/workbookMatching.ts`):** `mergeRolledItems` now **replaces** planned workbook items with rolled same-workbook items instead of appending/dropping them. `isSameWorkbook(a, b)` matches on `activityConfigId` → normalized label → substring (≥5 chars) → shared-word + same-subject fuzzy fallback; `normalizeWorkbookName` strips "Lesson N" / "Ch N" / time estimates / "book set" / separators. When a match wins, the rolled item keeps `rolledOver: true` + `rolledOverFrom`, inherits the planner's `skipGuidance` / `block` / `category` / `plannedMinutes` / `subjectBucket` / `skillTags` / `contentGuide` / etc. If both have lesson numbers the higher lesson wins (planner already advanced past yesterday's unfinished lesson). Chain-rollover still works. **Post-merge budget enforcement (new `src/features/today/budgetEnforcement.ts`):** `enforceDailyBudget(checklist, budget)` trims overflow by deferring lowest-priority items first (Must-Do always protected → rolled items → Choose → Focus/aspirational, longest-within-tier first) with a ~10% grace window (186m budget allows ~205m). Items are flagged `deferredByBudget: true` — not deleted. `resolveDailyBudget` halves the budget on `planType: 'mvd'` / energy `low` / `overwhelmed`. **Data:** `dailyBudgetMinutes` added to `DayLog`; `handleApplyPlan` in `PlannerChatPage` now persists each day's `timeBudgetMinutes` onto its DayLog so rollover can enforce. `deferredByBudget` added to `ChecklistItem`. **Hook wiring:** `useRolloverUnchecked` now takes `dailyPlan`, runs enforcement after rollover merge (and on weekends / already-rolled days too, so planner-overfull plans without a rollover still get trimmed). `TodayPage` moved the rollover call below `useDailyPlan` so MVD/low-energy can halve the budget. **UI:** `TodayChecklist` hides deferred items and shows a subtle "N items deferred to fit today's schedule — tap to show" row at the bottom. Tap toggles them back. Summary line and "Est. finish" now count only visible items. **Planner prompt:** `buildPlannerPrompt` emits a HARD BUDGET RULE ("sum of estimatedMinutes per day MUST be ≤ budget; a shorter plan that fits beats a longer plan that overflows; aim 8–10 items/day"). Subject time defaults reframed as TOTAL minutes per subject per day (not per item). `PLANNER_TASK_INSTRUCTIONS` gained matching language + explicit MVD-halves-budget rule. **Tests:** +13 `workbookMatching` tests, +6 new `rollover` cases (same-workbook replace, lesson-number winner, metadata inheritance), +11 `budgetEnforcement` tests (grace, priority, MustDo protection, MVD halving, idempotent clear), +2 planner prompt tests; snapshots refreshed. 1435 pass. |
| Knowledge Mine UX | Apr 22, 2026 | Ungated Knowledge Mine: dedicated `KidMiningCard` (src/features/today/KidMiningCard.tsx) rendered above the checklist, auto-tracks session time to Reading hours via `useQuestSession` (source renamed `quest-session` → `knowledge-mine`, rounded to 5 min). Card sums today's auto-tracked minutes with `useTodayMiningMinutes` (queries `hours` collection for `source === 'knowledge-mine'`) and displays "⛏️ Mined X min today" / "No mining yet today" with an always-available "Start Mining" button. Removed the inline `DiamondsMined` / "Ready to mine?" card from `KidTodayView` and the now-unused `useTodayQuests` hook. Removed Knowledge Mine injection from the plan AI (`functions/src/ai/tasks/plan.ts` EVALUATION SCHEDULING section + Block 7) and from the fallback `ensureEvaluationItems` in `chatPlanner.logic.ts` (fluency-only; Knowledge Mine is no longer a checklist item). `KidExtraLogger` copy clarified to "Did extra work on your tablet? (Reading Eggs, Math App, Typing)" so it's clearly for tablet apps, not Knowledge Mine. Nav item unchanged (`/quest` route), Game Workshop gate unchanged (different design decision). |
| Blockers Phase 2 | Apr 21, 2026 | Shipped Phase 2 of the evaluation methodology (`docs/EVALUATION_METHODOLOGY_2026-04.md` §4): the quest prompt now deliberately targets known blockers. **Prompt change (`functions/src/ai/chat.ts`):** `buildQuestPrompt` gained an `extras` arg + two new section builders — `buildKnownBlockersSection` surfaces ADDRESS_NOW + RESOLVING blocks with stable ids, affected skills, example words, rationale, and a 0/1/2+ distribution rule; `buildRecentCurriculumSection` points the AI at the existing `recentScans` slice and suggests 1-2 optional reinforcement questions. Both sections inject before RESPONSE FORMAT in the reading-phonics, math, and comprehension branches. Quest response schemas now include `"targetedBlockerId": null` so the AI can tag deliberate probes with the exact block id. **Context wiring (`functions/src/ai/tasks/quest.ts`):** filters `snapshotData.conceptualBlocks` to ADDRESS_NOW + RESOLVING, detects whether `recentScans` produced a RECENT WORKBOOK SCANS section, and passes both into `buildQuestPrompt`. `SnapshotData` (`chatTypes.ts`) extended with `conceptualBlocks` and the skill-snapshot load in `chat.ts` now carries them through. **Targeted-evidence signal (`src/features/quest/questTypes.ts`, `useQuestSession.ts`, `src/core/utils/blockerLifecycle.ts`):** `QuestQuestion` + `SessionQuestion` gained optional `targetedBlockerId`; `parseQuestBlock` reads it from the AI's `<quest>` JSON; answer + skip flows pass it through to `SessionQuestion`. `sessionEvidenceFromQuestions` now emits `targetedCorrect` / `targetedTotal` subcounts and routes attempts by `targetedBlockerId` when set (falling back to skill-derived id, or crediting both when they differ). `updateBlockerLifecycle` weights targeted evidence by `TARGETED_EVIDENCE_WEIGHT = 2` so a deliberately-probed correct answer counts twice toward RESOLVING / RESOLVED thresholds — reflecting that targeted hits are stronger signal than incidental ones. DEFER and RESOLVED transitions unchanged. No adaptive-engine changes, no UI changes, no new data model. New tests cover both the prompt builders and the weighted lifecycle. |
| Book Picker UX | Apr 21, 2026 | Replaced free-text book input with clear library selector + "Add a Book" inline form. Removed `freeSolo` Autocomplete and the "Chapters this week" range field from setup wizard, review phase, and active phase. New MUI `Select`-based `ChapterBookPicker` with explicit "None — no read-aloud this week" sentinel and an "+ Add a new book" option at the bottom that expands an inline form (title/author/chapter count + optional chapter titles) and writes directly to the global `chapterBooks/{id}` collection. `readAloudBookId` now auto-populates from `plannerDefaults` on new weeks, is written unconditionally to the week doc on plan apply when `selectedBook` is set, and is persisted back to `plannerDefaults` on apply so the sticky default carries forward. Firestore rules widened to allow any authenticated user to write `chapterBooks` (was admin UID only). Fixes the silent root cause behind every "chapter card disappeared" report — Shelly typed a series name into free-text instead of selecting a library book, so `readAloudBookId` never got written and Today never rendered the chapter card. |
| Blockers Phase 1 | Apr 21, 2026 | Shipped Phase 1 of the evaluation methodology (`docs/EVALUATION_METHODOLOGY_2026-04.md` §3): `conceptualBlocks` on Skill Snapshot now has **four writers** and a real **lifecycle**. Data model extended with optional `id` (slugified skill), `status` (`ADDRESS_NOW` / `DEFER` / `RESOLVING` / `RESOLVED`), `evidence`, `firstDetectedAt`, `lastReinforcedAt`, `sessionCount`, `resolvedAt`, `source` / `lastSource` (`evaluation` / `quest` / `scan` / `parent`), `specificWords`, `specificQuestions`, `correctAttempts`, `totalAttempts`. All existing fields preserved — legacy blocks load untouched and render as ADDRESS_NOW via `recommendation` fallback. Helpers live in `src/core/utils/blockerLifecycle.ts`: `generateBlockId`, `mergeBlock` (merge-by-ID with regression handling for RESOLVING → ADDRESS_NOW), `updateBlockerLifecycle` (ADDRESS_NOW → RESOLVING at ≥3 cumulative correct, RESOLVING → RESOLVED at ≥5 correct across ≥2 sessions with no new wrong answers, DEFER and RESOLVED are static), `sessionEvidenceFromQuestions`. **Writer 1 (existing, fixed):** `EvaluateChatPage.handleSaveAndApply` now **merges** pattern-analysis blocks into the existing array via `updateDoc` (closes R4 blockers-specific — the eval used to wholesale-overwrite the array and wipe quest/scan/parent blocks). **Writer 2 (new):** `detectBlockersFromSession` in `src/features/quest/detectBlockers.ts` emits a block when Lincoln gets 2+ wrong at the same sub-skill in a ≥5-question session (DEFER if 2 wrong + 1 skipped, ADDRESS_NOW otherwise). Fluency mode is skipped. Wired into `useQuestSession.endSession` after the snapshot write; `updateBlockerLifecycle` also runs there using `sessionEvidenceFromQuestions(questions)` so correct answers advance existing blocks. **Writer 3 (new):** `detectBlockersFromScan` in `src/features/today/scanBlocker.ts` emits one block per `alignsWithSnapshot: 'behind'` skill on any `skip`/`modify`/`too-hard`/`challenging` scan (falls back to a topic-level block if no specific skills surface). Wired into `useUnifiedCapture` after the skill map update. **Writer 4 (new):** `buildStuckBlock` + `buildGotItReinforcement` in `src/features/today/masteryBlocker.ts`. `TodayChecklist` mastery chips now call a shared `handleMasteryChip` that writes an ADDRESS_NOW block on "Stuck" and a RESOLVING nudge on "Got it" (only if an existing block with the same id already exists — prevents empty reinforcement writes). **AI context fix:** `formatConceptualBlocks` extracted from `contextSlices.ts` and now emits three sections to the model — ADDRESS_NOW, RESOLVING ("trending better, keep probing gently"), and DEFER ("do NOT push on these"). RESOLVED blocks are omitted from prompts (kept in the array for history). All writes use `updateDoc` so unrelated snapshot fields are preserved. 64 new tests (`blockerLifecycle.test.ts`, `detectBlockers.test.ts`, `scanBlocker.test.ts`, `masteryBlocker.test.ts`, `applyMerge.test.ts`, plus `formatConceptualBlocks` tests in `functions/src/ai/contextSlices.test.ts`). |

### Sprint Cleanup — April 2026
- Deleted Sprint 1 UFLI scaffolding (9 files, dormant since creation, seed never ran)
- Kept: scripts/setLincolnPhonicsLevel.ts (sets workingLevels, not UFLI-specific)
- Kept: voice-first Knowledge Mine changes (tap-to-hear, speaker icons)
- Decision: rely on existing Knowledge Mine + findings pipeline for Lincoln acceleration

### Findings Pipeline Doc + UFLI Cleanup Polish — Apr 13, 2026

- Added `docs/FINDINGS_PIPELINE.md` — end-to-end trace of EvaluationFinding data flow from Knowledge Mine → skillSnapshot → AI context windows
- Updated CLAUDE.md accuracy: CF count, collections, imageTasks, ladder TODOs, terminology
- Fixed ExplorerMap weekStart to Monday-based, removed temp diagnostic writes
- Decision documented: rely on existing Knowledge Mine + findings pipeline rather than separate UFLI tracking layer

## Removed Features / Concepts
- Ghost armor visual state (moved to binary on/off only).
- Legacy tier model (consolidated around voxel tier thresholds).
- “Forge” as separate currency (re-merged into Diamonds economy).
- `parent_adjustment` event type (replaced by `MANUAL_AWARD` / `MANUAL_DEDUCT`).
- Hardcoded `/6` denominators in suit up UI (now uses actual forgedCount).

## Key Design Decisions
1. **Two currencies, distinct roles** — XP = progression, Diamonds = choice.
2. **Forge then equip** — spend once to forge, free equip toggles forever.
3. **Stonebridge is one shared world** — all narrative systems build continuity in the same canon.
4. **Hero Hub is a place, not a settings page** — mission context above customization.
5. **Knowledge Mine vs Banner Rally split** — measure vs adventure (both needed).
6. **Family-tuned proportions** — design with the child in a live playground, not by guesswork.
7. **Edge outlines for readability** — biggest visual clarity gain per implementation cost.
8. **Open-face helmet** — identity and recognition beat full visual coverage.
9. **Loose tier gate** — next tier visible but locked with clear requirement, aspirational not hidden.
10. **Daily Suit Up = equip all OWNED pieces** — not all 6 total. Can't equip what you haven't forged.
11. **Gateway functions for currency** — `addXpEvent()` and `addDiamondEvent()` are the ONLY paths. All direct Firestore writes to balances are bugs.
12. **Nothing is ever lost** — Reimagined drawings always auto-save to gallery, even when placed on page or discarded. Image replacements preserve previous URLs in `previousVersions[]` (max 5).
13. **Drawings are stickers, scenes are backgrounds** — A photographed kid drawing is treated as a movable, transparent overlay (sticker). Full-page art is generated by AI as a scene/background. The Clean up flow always promotes the cleaned drawing to a sticker by default.

---

## Architecture Notes

### Top 5 Largest Files (Current)
| File | Lines | Status |
|---|---:|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,439 | Still primary planner shell/state center |
| `src/features/books/BookEditorPage.tsx` | 2,087 | Grew with undo/redo + contextual action bar |
| `src/features/quest/useQuestSession.ts` | 1,763 | Largest hook; future split candidate |
| `src/features/avatar/MyAvatarPage.tsx` | 1,749 | Grew with Hero Hub layout + mission surfaces |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | Stable, still large |

### Decomposition Status
- Today page, Kid Today view, Planner render layers, and Avatar subpanels have all been partially decomposed.
- Remaining risk concentration is state-heavy files (`PlannerChatPage`, `useQuestSession`, `MyAvatarPage`).

### Book Editor Features
- **Undo/Redo**: 20-entry history stack (`useEditorHistory`). Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z. Tracks page-level changes (image add/remove, layout changes).
- **Image version history**: `PageImage.previousVersions[]` preserves up to 5 previous URLs when images are replaced (reimagine, sketch enhance). Accessible via "Previous versions" in background menu.
- **Contextual action bar**: Top chip row shows "Delete sticker" / "Remove background" / "Change" based on which image is selected in PageEditor.
- **Reimagine placement clarity**: Dialog splits "Add to page" into "Replace background" (full-page) vs "Add as sticker" (movable/resizable).
- **Auto-save to gallery**: Every reimagine result auto-saves to sticker gallery on completion, regardless of placement choice.
- **Sketch cleanup auto-detects background color**: `cleanSketchBackground` (in `src/features/books/cleanSketch.ts`) samples the image's outer ring and takes the per-channel median to find the dominant background color, then makes pixels close to it transparent (with feathered edges). Works on white paper, brown tables, lined notebooks, colored construction paper — anything roughly uniform around the drawing. Falls back to a conservative HSL paper-detect when border samples are too varied (busy tablecloths, hand in frame).
- **Cleaned drawings default to sticker**: After "Clean up", the user picks Add to page / Reimagine this / Save as sticker / Make a scene. "Add to page" creates a `type: 'sticker'` PageImage with a centered 40%-width default position. The legacy "promote cleanup result to background photo" path is gone — cleaned drawings are always positionable overlays.
- **Cleanup → Reimagine pipeline**: When the user picks "Reimagine this" on a cleaned drawing, the transparent PNG is uploaded as the sketch source for `enhanceSketch`. Feeding the AI the cleaned drawing (instead of the raw photo with table/paper artifacts) produces noticeably better reimagined output.
- **Attribution ("For" / "By")**: `Book.createdBy` ('parent' | childId) and `Book.createdFor` (childId) fields let Shelly create from parent profile without mis-attribution. Editor shows compact "For" / "By" dropdowns at the top; "For" drives editor theming so Shelly gets WYSIWYG child palette preview (Minecraft for Lincoln, storybook for London) without switching profiles. Bookshelf has a parent-only "Made by" filter (All / Mom's Books / Kids) and each card shows a "By Mom" / "By Lincoln" badge. Weekly Review attribution respects `createdBy` — parent-made books are reading/learning resources, not credited to the kid as creative wins. Legacy books default to `createdBy: 'parent'` (Shelly's historical workflow); re-tag one at a time via the editor dropdown.

### Known Technical Debt
- **AvatarThumbnail WebGL instances** — Console warns "many active instances — consider static mode." The `forceContextLoss()` fix from the Crash Cascade sprint resolved the hard crash, but multiple active `WebGLRenderer` instances still get created when several thumbnails mount (N thumbnails = N renderers). Consider: single shared renderer with static snapshots, or CSS/canvas 2D fallback for thumbnails where 3D isn't needed. Not blocking but worth addressing before avatar features expand.
- **Hardcoded admin UID** — Admin access is hardcoded to a single UID in `SettingsPage.tsx` (`ADMIN_UID` constant). Works for current single-admin use case but blocks multi-admin, role management, or admin handoff scenarios. Consider moving to a role flag on family/user document if admin access needs to change.

---

## Key Files Reference
| File | Purpose |
|---|---|
| `docs/MASTER_OUTLINE.md` | Master state snapshot (this file) |
| `docs/ECONOMY_AUDIT_PART1.md` | Economy model + data inventory |
| `docs/ECONOMY_AUDIT_PART2.md` | Economy earning/spending path audit |
| `docs/STONEBRIDGE_BIBLE.md` | Canonical narrative world bible |
| `functions/src/ai/stonebridgeBible.ts` | Stonebridge prompt import for CF context |
| `src/core/xp/addXpEvent.ts` | XP event gateway |
| `src/core/xp/addDiamondEvent.ts` | Diamond event gateway |
| `src/features/avatar/MyAvatarPage.tsx` | Hero Hub shell + avatar systems |
| `src/features/avatar/HeroMissionCard.tsx` | Hero Hub mission card logic + rendering |
| `src/features/avatar/StonebridgePreviewCard.tsx` | Stonebridge narrative preview surface |
| `src/features/avatar/BrothersVoxelScene.tsx` | Side-by-side brothers scene |
| `src/features/avatar/AccessoriesPanel.tsx` | Accessories system UI + slot conflicts |
| `src/features/avatar/armorGate.ts` | Forge tier gate logic + phantom piece fix |
| `functions/src/ai/tasks/index.ts` | Chat task registry (14 task types) |

---

Last updated: April 13, 2026
