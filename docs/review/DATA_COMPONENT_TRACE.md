# Per-Child Data-Component Trace (DATA-06)

**Status:** Read-only trace · docs-only · no code/type/rules touched.
**Date:** 2026-06-03.
**Why this doc exists.** Per-child data gaps have been found *reactively* — active-child desync
(FUNC-05), chapter skip/answer conflation (FUNC-07), quest-skip leak (FUNC-08), London's read-aloud
not mounting (FUNC-09), plus an open currency-display confusion and a plan-count divergence. This is
the *holistic* map: every per-child data component traced **source → writers → readers → surfaces →
per-child scoping → status**, so gaps get spotted before they surface as live bugs.

**How to read the Status column.** ✅ = confirmed-correct (cites the resolving FUNC-xx). ⚠️ = open gap
(cites the ledger row). 🔍 = needs live-verify against a Firestore export.

All Firestore paths are under `families/{familyId}/` unless marked **global**.

---

## 0. Scoping legend

| Scoping kind | Meaning | Switch-active-child behavior |
|---|---|---|
| **Doc-ID-keyed** | doc id *is* `childId` (or `{childId}_…`) | inherently isolated; no filter needed, no bleed |
| **Field + query filter** | auto-id docs carry a `childId` field; readers must `where('childId','==',activeChildId)` | **bleed risk if a query omits the filter** |
| **Shared / per-week** | one doc for the whole family (e.g. `weeks/{weekStart}`) | every child sees the same value |
| **Module singleton** | one in-memory value (active child) | one source of truth, all consumers re-render together |

---

## 1. Active child / selected child

- **Source.** Module-level store `src/core/hooks/activeChildStore.ts` (in-memory `current` + `localStorage`
  key `fpe_active_child_id`). The child *roster* is `children/{childId}` (auto-id docs), loaded by
  `useChildren.ts` via `getDocs(childrenCollection)`. **Scoping: module singleton** (one selected child
  across the whole app).
- **Writer seam(s).** Central: `activeChildStore.ts` `setActiveChildIdShared(id)`. Called from
  `useChildren.ts` `setSelectedChildId` and the auto-select-on-load path.
- **Reader seam(s).** `useChildren.ts` via `useSyncExternalStore(subscribeActiveChildId, getActiveChildId)`;
  wrapped by `useActiveChild.ts` (enforces the Lincoln/London profile lock — kid profiles can't switch).
  Consumed app-wide (AppShell header pill, Today, Planner, Records, Progress).
- **Surfaces.** Everywhere a child is implied: AppShell header pill, parent Today selector, Plan My Week,
  Records filters, Progress tabs. Kid views are locked to their own child.
- **Per-child scoping.** Module singleton consumed via `useSyncExternalStore` → a write notifies *all*
  subscribers in one render cycle.
- **Status.** ✅ **FUNC-05 (FIXED).** Pre-fix each consumer held its own `useState` copy persisted to
  `localStorage` only on mount, so AppShell and a page's own `ChildSelector` could disagree
  (header "Lincoln" / planner "London"), mis-attributing one kid's data to the other. The shared store +
  `useSyncExternalStore` is the single source of truth. **This component is the lynchpin** — every
  "field + query filter" component below keys its reads off this value, so a regression here re-opens
  bleed everywhere.

---

## 2. Read-aloud book

- **Source.** `weeks/{weekStart}.readAloudBookId` — a string field on the **shared, per-week** week doc
  (one book for the whole family, keyed by Monday `YYYY-MM-DD`). Book content lives in the **global**
  `chapterBooks/{bookId}` collection.
- **Writer seam(s).** `src/features/planner-chat/PlannerChatPage.tsx` writes `readAloudBookId` onto the
  week doc when a book is picked, and mirrors it to `settings/plannerDefaults_{childId}` for next-week
  carry-over. **Written on the shared week doc, not per child.**
- **Reader seam(s).** `useDayLog.ts` reads `readAloudBookId` off the `weeks/{weekStart}` doc; `KidTodayView.tsx`
  and `TodayPage.tsx` fetch the `chapterBooks/{id}` metadata on demand.
- **Surfaces.** Parent Today (read-aloud section + `ChapterQuestionPool`), Lincoln & London kid Today
  (`KidTodayView` read-aloud section), Records (`ChapterResponsesTab`), Progress (monthly-books view).
- **Per-child scoping.** **Shared per-week** — both kids get the same book (or none). The *book id* never
  bleeds because it isn't per-child to begin with; per-child divergence lives only in the Q&A progress (§3).
- **Status.** ✅ **FUNC-09 (FIXED).** The book id was never stranded on a per-child plan — it's read from
  the shared week doc and reaches every child identically. The real bug was the **kid render gate**:
  `KidTodayView` required a per-child `bookProgress`/question-pool doc (only the parent surface creates one)
  before mounting the section, so London — with no pool — saw nothing. Fix: pure
  `isReadAloudSectionVisible(hasBook, pool)` mounts the section whenever the shared book resolves; with a
  pool it renders `KidChapterPool`, without one it renders a gentle placeholder.

---

## 3. Chapter Q&A progress

- **Source.** `bookProgress/{childId}_{bookId}` — **doc-ID-keyed per child *and* book**
  (`bookProgressDocId(childId, bookId)`), holding `questionPool: ChapterQuestionPoolItem[]` (each item:
  `chapter`, `question`, `answered`, `answeredDate?`, `skipped?`, `audioUrl?`, `artifactId?`, `responseNote?`).
  Evidence trail: `chapterResponses/{autoId}` (auto-id, carries `childId`/`bookId` fields).
- **Writer seam(s).** Central: `useBookProgress.ts` `updateChapter(chapter, update)` →
  `setDoc(bookProgressDocId(childId,bookId), …, {merge})`. Called by `KidChapterPool.tsx` (kid saves an
  answer → `answered:true` + audio/artifact/`chapterResponses` doc) and `ChapterQuestionPool.tsx`
  (parent skip → `skipped:true`, **never** `answered:true`). A flag-guarded one-time migration
  (`migratedSkipModel`) repairs legacy skip-stamped chapters.
- **Reader seam(s).** `useBookProgress.ts` (real-time listener); `KidChapterPool` filters via
  `isChapterToGo` (`chapterPool.logic.ts`); `ChapterQuestionPool` splits unanswered/answered/skipped;
  `ChapterResponsesTab.tsx` (Records) queries `chapterResponses` by `childId`.
- **Surfaces.** Parent Today (`ChapterQuestionPool` — skip is **parent-only**), both kid Todays
  (`KidChapterPool`), Records (`ChapterResponsesTab`).
- **Per-child scoping.** **Doc-ID-keyed `{childId}_{bookId}`** → Lincoln's and London's progress on the same
  book are separate docs; **no bleed**. `chapterResponses` is field-keyed and must filter by `childId`
  (Records does).
- **Status.** ✅ **FUNC-07 (FIXED).** `answered` used to double-duty as "answered *or* skipped", so a parent
  skip finished the book (`every(answered)`) and the kid section unmounted. Fix splits the semantics —
  `isBookFinished = every(answered || skipped)`, kid pool visible while `some(!answered && !skipped)` — with
  a one-time legacy repair. Predicates centralized in `chapterPool.logic.ts`.

---

## 4. Daily plan / quests / checklist

- **Source.** Plan: `weeks/{weekStart}` (**shared per-week**: theme, virtue, `readAloudBookId`, `childGoals[]`).
  Checklist: `days/{dayLogDocId}` (**per-child, per-date** `DayLog`) holding `checklist: ChecklistItem[]`.
  Item fields that matter: `category?: 'must-do' | 'choose' | 'routine'`, `mvdEssential?`, `completed`,
  `skipped?` (parent-only), `deferredByBudget?`, `rolledOver?`/`rolledOverFrom?`.
- **Writer seam(s).** `useDayLog.ts` `persistDayLogImmediate` is the day-log writer. Parent edits flow
  through `TodayChecklist.tsx` (`handleToggleItem` / `handleToggleSkip` / add / edit / delete). Kid completion
  flows through `KidChecklist.tsx` `handleToggleItem` (**completion only — no skip/edit/delete**, FUNC-08).
  Plans are seeded by planner-chat apply (week doc + per-child/per-day checklist items).
- **Reader seam(s).** `useDayLog.ts` (load + real-time). Parent: `TodayChecklist.tsx`. Kid:
  `KidTodayView.tsx` → `computeQuestProgress` (`kidQuestGate.ts`) → `KidChecklist.tsx`.
- **Surfaces.** Parent Today (`TodayChecklist`) vs kid Today (`KidChecklist`, must-do "quests" + separate
  "Choose N" section).
- **Per-child scoping.** Checklist is **per-child** (`days` doc keyed by child+date). The week *plan* is
  shared; per-child divergence lives in each child's `days` doc.
- **Status.** ✅ **FUNC-08 (FIXED)** for the kid-skip leak (kid `Skip` control removed; skip is parent-only).
  ⚠️ **Open: plan-count divergence — see §6A** (the parent and kid "X of N" use *different denominators*).

---

## 5. Hours / compliance

- **Source.** Three inputs, all **per-child by `childId` field**: day logs (`days`), `hours` entries,
  `hoursAdjustments`. Computation is additive (block minutes + checklist contributions + adjustments).
- **Writer seam(s).** Manual + backfill + quick-estimate adjustments go through `RecordsPage.tsx` and
  `QuickAddHours.tsx`, now guarded by `assertAttributed` / `NewHoursAdjustment` (requires `childId`) per
  DATA-05 Step 1. Dad Lab hours: `useDadLabReports.ts` `syncComplianceHours`.
- **Reader seam(s).** `records.logic.ts` `computeHoursSummary` (lines ~136–224) and `computeMonthlyTrend`
  (lines ~248–326). Surfaced by `RecordsPage.tsx`, `ComplianceDashboard.tsx`, `MonthlyTrend.tsx`.
- **Surfaces.** Records (hours/compliance/monthly trend). Not on kid Today.
- **Per-child scoping.** Day logs and `hours` filter strictly `=== childId`. **Adjustments leak:** the
  reader filters `!a.childId || a.childId === childId` at `records.logic.ts:150` *and* `:264`, mirrored at
  `RecordsPage.tsx:152` — an unattributed adjustment counts for **both** kids.
- **Status.**
  - ✅ **DATA-01 (FIXED):** `MonthlyTrend` view-layer over-count reconciled to canonical `computeHoursSummary`.
  - ⚠️ **DATA-05 (IN PROGRESS):** writes are now attribution-guarded (Step 1 done, additive, no number
    change); the number-affecting filter tightening (`a.childId === childId`) is **proposed, awaiting human
    confirm** (touches the hours invariant). 🔍 Live impact (do null-`childId` adjustments exist?) needs an export.
  - ⚠️ **DATA-04 (OPEN, propose-and-confirm):** `useDadLabReports.ts` loops `for (const child of children)`
    and writes `minutesPerSubject` hours (`:65-71`) **and** XP+diamonds (`:104-115,138-148`) to **every** child,
    so a single-participant lab over-credits the non-participant. Touches hours + xpLedger invariants.
  - 🔍 **DATA-02 (NEEDS-DATA):** possible duplicate adjustment backfill (2025-07-15 / 2025-08-15) — export-only.

---

## 6. XP / diamonds / gold currency

- **Source.** `xpLedger` — per-child: per-event docs `xpLedgerDocId(childId, dedupKey)` **and** a cumulative
  rollup `doc(xpLedgerCollection, childId)` (`totalXp`, `sources{routines,quests,books}`). Spendable diamond
  balance is cached on `avatarProfiles/{childId}.diamondBalance`. Per-day equip state:
  `dailyArmorSessions/{childId}-{YYYY-MM-DD}`.
- **Writer seam(s).** `addXpEvent.ts` `addXpEvent(...)` (dedup-keyed; also mirrors `avatarProfile.totalXp`).
  Callers: `KidChecklist.tsx` (per-item), `KidTodayView.tsx` (day-complete bonus), quest banking
  (`questBanking.ts`/`useQuestSession.ts`), `useDadLabReports.ts` (Dad Lab — see DATA-04 over-credit).
- **Reader seam(s).** `useXpLedger.ts` (`totalXp` → `getArmorTier` / `getNextTierProgress` from
  `armorTiers.ts`); `useDiamondBalance.ts` (live `avatarProfile.diamondBalance`). Render components:
  `MinecraftXpBar.tsx`, `XpDiamondBar.tsx`.
- **Surfaces.** Kid Today (`XpDiamondBar` + `MinecraftXpBar` + the `KidChecklist` "💎 N XP earned" chip);
  parent Today (`TodayChecklist` "N XP" chip); Progress armor tab; MyAvatarPage.
- **Per-child scoping.** Cumulative ledger and diamond balance are **doc-ID-keyed** by `childId` → no bleed.
- **Status.** ⚠️ **Open: currency "14 vs 2" display confusion — see §6B.** Multiple co-located numbers
  (today's XP / total XP / armor tier index / spendable diamonds) share gem iconography. **Fix lane: the Hero
  Hub build chat** (`xpLedger` / `MinecraftXpBar` are its surfaces) — **diagnosis only here.**

---

## 7. Skill snapshot / working levels

- **Source.** `skillSnapshots/{childId}` — **doc-ID-keyed per child** (priority skills, supports, stop rules,
  evidence definitions, working levels, conceptual blocks).
- **Writer seam(s).** Central: `src/features/evaluate/skillSnapshotWrites.ts` — pure additive
  `applyToSnapshot` reducer + `writeSnapshotUpdate` (additive/evidence-stamped; never downgrades RESOLVED/DEFER
  or existing levels). **Three inline writers not yet migrated:** `EvaluateChatPage.tsx` (eval apply),
  `useQuestSession.ts` (quest end), `SkillSnapshotPage.tsx` (manual edit).
- **Reader seam(s).** `useChildSkillSnapshot.ts`; `TodayChecklist.tsx` / `useUnifiedCapture.ts` (priority-skill
  context); Shelly chat context slice (`childSkillMap` is a separate coverage slice, read-only).
- **Surfaces.** Skill Snapshot page (CRUD), parent Today (priority-skill context), Quest eligibility,
  Evaluation chat, Progress.
- **Per-child scoping.** **Doc-ID-keyed** → no bleed.
- **Status.** ✅ central write path is additive/confirm-safe (FUNC-02 write-through). ⚠️ **ARCH-12 (OPEN):**
  the three inline writers still bypass the central module — drift risk until migrated. Invariant: any
  snapshot write is propose-and-confirm (CLAUDE.md).

---

## 8. Evaluations

- **Source.** `evaluationSessions/{autoId}` (interactive/quest sessions; `status: 'in-progress' | 'complete'
  | 'partial' | …`) and `evaluations/{autoId}` (parent-authored summaries). **Auto-id + `childId` field.**
- **Writer seam(s).** `useQuestSession.ts` (Knowledge Mine — per-answer banking + session doc),
  `EvaluateChatPage.tsx` (eval session), `EvaluationsPage.tsx` (parent summary).
- **Reader seam(s).** `EvaluationHistoryTab.tsx` queries `where('childId','==',activeChildId)`;
  `EvaluationsPage.tsx`; `RecordsPage.tsx`.
- **Surfaces.** Records → Evaluations (history + summaries).
- **Per-child scoping.** **Field + query filter → bleed risk if a query omits `childId`.** Records readers
  do filter.
- **Status.** ✅ **FUNC-04 (FIXED):** stopped-early sessions now persist as `status:'partial'` (badged) and
  show in Records, where previously only `'complete'` showed and partial work evaporated; per-answer
  diamonds/XP/hours bank durably while the mastery loop stays gated on `hasSufficientCompletion`.

---

## 9. Books / portfolio / artifacts

- **Source.** `books/{autoId}` (kid-authored) and `artifacts/{autoId}` (evidence: photos/audio/notes).
  **Auto-id + `childId` field.** Artifacts also carry tags incl. legacy `ladderRef`.
- **Writer seam(s).** Books: `useBook.ts` / `useBookGenerator.ts` / `CreateSightWordBook.tsx`. Artifacts:
  `PortfolioPage.tsx`, `PlannerChatPage.tsx`, `MyAvatarPage.tsx`, workshop utils, `ChapterResponsesTab.tsx`.
- **Reader seam(s).** Books: `useBook.ts` / `BookshelfPage.tsx` (by `childId`). Artifacts:
  `PortfolioPage.tsx` (+ `scoreArtifactsForPortfolio` in `records.logic.ts` — still scores `tags.ladderRef`),
  `EvaluationsPage.tsx`, `ArtifactGallery.tsx`/`ArtifactCard.tsx`.
- **Surfaces.** Bookshelf, Records → Portfolio, Records → Evaluations samples, Workshop, MyAvatar.
- **Per-child scoping.** **Field + query filter → bleed risk if a query omits `childId`.** Readers filter.
- **Status.** ✅ no per-child bug on file. `ladderRef` retained intentionally (ARCH-07 data-layer keep).
  🔍 needs-live-verify only if a new query is added without the `childId` filter.

---

## 10. Avatar / armor  *(Hero Hub build-chat lane — trace only, propose nothing)*

- **Source.** `avatarProfiles/{childId}` (**doc-ID-keyed**: customization, equipped/forged pieces, `totalXp`
  cache, `diamondBalance`) and `dailyArmorSessions/{childId}-{YYYY-MM-DD}` (**doc-ID-keyed per child+day**).
- **Writer seam(s).** `src/core/avatar/getDailyArmorSession.ts` (atomic batch: creates the day session +
  resets `equippedPieces` on a new day); `MyAvatarPage.tsx` via `safeProfileWrite.ts`; forge/unlock helpers
  (`forgeArmorPiece.ts`, `checkAndUnlockArmor.ts`).
- **Reader seam(s).** `useAvatarProfile.ts` (live snapshot); `ArmorTab.tsx`; `useDiamondBalance.ts`.
- **Surfaces.** MyAvatarPage, Progress → ArmorTab, Today avatar thumbnail.
- **Per-child scoping.** **Doc-ID-keyed** → no bleed.
- **Status.** ✅ no per-child bug on file. ⚠️ the currency *display* confusion (§6B) renders these values —
  **owned by the Hero Hub build chat.** Trace only.

---

## 6A. Pinned gap — plan-count divergence ("4 of 11" parent vs "4 of 10 quests" kid)

**Cause: the two surfaces count different denominators by design — not the same list off by one.**

- **Parent total `N`.** `TodayChecklist.tsx:452` renders `{completedCount} of {visibleCount} done`.
  `visibleCount = checklist.filter(isItemVisible).length` (`:259`), where
  `isItemVisible = (item) => showDeferred || !item.deferredByBudget` (`:257`). So the parent's `N` is
  **every checklist item that isn't budget-deferred** — must-do **and** "choose" **and** routine items alike.
- **Kid total `N`.** `KidChecklist.tsx:267` renders `{mustDoCompleted} of {mustDo.length} quests done`.
  `mustDo` comes from `categorizeItems(checklist)` (`kidQuestGate.ts:56`), which returns **only the
  must-do bucket** — items with `category === 'must-do'` (or `mvdEssential` when uncategorized), or, in the
  legacy fallback, `checklist.slice(0, 3)` (`kidQuestGate.ts:26`). The **"choose" items are excluded from this
  count** and render in a *separate* "Choose N" section (`KidChecklist.tsx:304`).

**Therefore:** parent `N` = `must-do ∪ choose ∪ routine` (minus deferred); kid `N` = `must-do` only.
The two coincide **only when every visible item is must-do**. The reported "11 vs 10" is the case where the
parent's visible set has exactly **one** non-must-do item (a single "choose"/extra) that the kid's must-do
denominator omits — hence parent 11, kid 10, both with 4 done.

**Secondary scoping inconsistency (note, not the cause of parent > kid).** `categorizeItems` does **not**
filter `deferredByBudget`, while the parent's `visibleCount` does. So a *deferred must-do* item would be
counted in the kid's `N` but **not** the parent's — pushing the kid side *higher*, the opposite direction.
This means the two surfaces also disagree about deferred items, independent of the must-do/choose split.

**Exact seams.** Parent: `TodayChecklist.tsx:257,259,452`. Kid: `KidChecklist.tsx:267,304`,
`kidQuestGate.ts:9-29,55-77`. **No fix proposed here** — a follow-up decides whether the kid "quests done"
line should read the same visible-checklist denominator as the parent, or whether the parent should split
its count into must-do vs choose to match the kid's framing.

---

## 6B. Pinned gap — currency "14 vs 2" confusion

**Cause: four distinct quantities render in the same compact area, three of them under gem-like iconography,
so a parent reads two different small numbers as "the same currency."** All four live on kid Today
(`KidTodayView.tsx` mounts `XpDiamondBar` at `:570` and `MinecraftXpBar` at `:571`; passes `dailyXp` to
`KidChecklist` at `:714`).

| # | What renders | Exact value | Seam |
|---|---|---|---|
| 1 | `💎 {dailyXp} XP earned` chip | **today's XP from *completed checklist items*** (`dailyXp`, `KidTodayView.tsx:334`) — a 💎 *emoji* on an XP value | `KidChecklist.tsx:272` |
| 2 | `+{todayXp} today` / `{displayXp} XP` + tier title | **today's XP via `calculateXp(dayLog)`** (`KidTodayView.tsx:235`) and **total cumulative XP** | `MinecraftXpBar.tsx:83,93,72` |
| 3 | `LVL {ARMOR_TIERS_INDEX(current.tier)}` | **armor tier *index* 0–5** (wood=0…netherite=5) — *not* a level or XP | `MinecraftXpBar.tsx:163,185-188` |
| 4 | `◆ {displayedDiamondBalance}` | **spendable diamond balance** from `avatarProfile.diamondBalance` (a *currency*, decremented by forging) — cyan `◆` glyph | `XpDiamondBar.tsx:129,147`; source `useDiamondBalance.ts` |

**Why "14 vs 2."** "14" is **today's XP earned** (#1 or #2 — note #1 `dailyXp` and #2 `todayXp` are themselves
*two different* today-XP computations: completed-checklist sum vs `calculateXp(dayLog)`, which can disagree).
"2" is a **different quantity entirely** — either the **spendable diamond balance** (#4, `◆ 2`) or the **armor
tier index** (#3, `LVL 2`). A parent sees a 💎 next to "14 XP earned" and a ◆/LVL "2" inches away and reads
both as "diamonds," when one is *XP earned today* and the other is *spendable diamonds* (or the *tier index*).
The **iconography overlap is the core issue**: the 💎 emoji decorates an XP value (#1) while the visually
similar ◆ glyph is the actual diamond *currency* (#4), and a third small number (#3, the tier index) reads
like a "level."

**Fix lane.** **Hero Hub build chat** owns `xpLedger` / `MinecraftXpBar` / the currency surfaces.
**Diagnosis only here** — no fix proposed.

---

## Cross-cutting observations (for whoever assigns the follow-ups)

- **The recurring failure mode is the "field + query filter" class** (§5 adjustments, §8 evaluations,
  §9 books/artifacts): correctness depends on *every* reader remembering `where('childId','==',activeChildId)`.
  The doc-ID-keyed components (§3 chapter Q&A, §7 snapshot, §10 avatar) are structurally safe. The one live
  leak today is the **deliberate `!a.childId ||` clause** in hours adjustments (§5 / DATA-05) — the only place
  a reader *intentionally* widens past `=== childId`.
- **Active child (§1) is load-bearing for all of §5/§8/§9.** FUNC-05 closed the desync; a regression there
  re-opens cross-kid bleed across every field-filtered reader at once.
- **Shared-per-week sources (§2 read-aloud book, §4 week plan) need a per-child render gate** that does *not*
  silently require a per-child doc to exist — exactly the FUNC-09 lesson. New shared→kid surfaces should mount
  on the shared value and treat the per-child doc as optional.
- **Two display-only gaps remain (§6A plan-count, §6B currency).** Neither is a data-integrity bug — both are
  *denominator/iconography* mismatches between parent and kid framings. §6A is a home-base follow-up; §6B is
  the Hero Hub build chat's lane.
