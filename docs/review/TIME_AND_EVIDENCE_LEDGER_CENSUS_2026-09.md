# Time and evidence ledger census — 2026-09

**AUDIT-234.** Every place the family says *"we did something"*, every place the app
reports it back, and whether the two agree.

> **Owner report, Friday 2026-09-11, 8:30pm, Review → Week, Lincoln:** *"the days here
> isn't updated — I added time in artefacts and it didn't change it for packing and
> independent play. Maybe crawl all data logging and reporting locations and see if it
> is correct."*

**Every number in this document is derived.** `npm run census:time-ledger` prints them and
this document pastes them; `src/test/timeLedger.invariant.test.ts` fails closed when §5
and the source disagree; `src/test/hoursReaderAgreement.test.ts` asserts the property the
whole audit is about. Where a list is short it is **named rather than counted** — a named
list is its own check and cannot go stale against a recount. Nothing here is hand-counted
except where §7 says so and says why.

---

## 1. The answer to the report, in one paragraph

**The door he used was Today's *Capture* card.** One tap there writes an `artifacts`
document **and** an `hours` document — minutes, a subject, and the activity's own name in
`notes` — and **no checklist item at all**. The minutes were counted: they are inside the
*Hours and Coverage* 15.3 hours and inside Practical Arts' 4 hours. What could not name
them is *what got done*, which lists the day log's **completed checklist items** and
nothing else, so a door that writes no checklist row shows up as an unexplained number.
That is `UX-408`, and the summary now carries an **Also logged** line naming exactly this
kind of time. **And the page was showing the wrong week.** `Review → Week` had no week
control at all: it resolved `lastCompletedSchoolWeekKey`, which on any day but Saturday
names the *previous* school week — so on Friday evening, with Sep 7–11 freshly logged, it
named **Aug 31 – Sep 4** and offered no way to move. That is `UX-406`, and there is now a
**Last week · This week** selector, the same control FEAT-196 gave the planner for the
same reason. A third sentence on that screen was simply false: *"they're saved overnight,
once Saturday is over"*, said on a Friday about a Saturday six days gone (`UX-407`).

**What he will see after this lands:** the same page, with a two-button week selector
under the heading; tapping **This week** shows Sep 7–11 with his packing and
independent-play hours in it, and Practical Arts reading
*"Also logged: Packing ×3 · Independent play ×2"* under its total. On a week whose
overnight snapshot never arrived the page says so plainly instead of promising it for
tonight.

---

## 2. What was checked, and what a repository cannot answer

This is a census of **code**, derived from the source. Three questions in the run prompt
need the family's live Firestore data and are answered here only as far as the code can
take them — marked, not guessed:

| Question | What the code says | What would settle it |
|---|---|---|
| Which door wrote his Practical Arts hours | Only `UnifiedCaptureCard` writes an `hours` row **and** an artifact in one tap, with the activity name in `notes`. That is the shape he described | The `hours` docs for `2026-09-07`–`2026-09-11`, `source` field |
| Whether the weekly cron ran for Aug 31 – Sep 4 | Not derivable. `generateReviewForChild` writes **nothing at all** when the Claude call throws, so an absent document is consistent with both "the cron never fired" and "it fired and failed" (`UX-409`) | `weeklyReviews/2026-08-30_<lincoln>` existing, and the `weeklyReview` function's logs |
| Whether Practical Arts' 4 hours are entries, adjustments or blocks | All three are possible and all three now get named (`UX-408`) | The same week's `hours` / `hoursAdjustments` / `days` documents |

**Not checked:** no browser, no pixels measured, no live Firestore, no Cloud Function
logs. No number, fold, rounding or stored row was changed by this run.

---

## 3. The derived numbers

```
source files scanned (non-test, src/ + functions/src/): 873
surfaces naming a time or evidence collection: 60
by role: {"WRITE":14,"READ":9,"BOTH":37}
by collection: {"hours":16,"hoursAdjustments":7,"days":28,"artifacts":32}
census rows: 60
census problems: 0
date-rule call sites (9 distinct rules): 33
   13  getWeekRange
    5  weekRangeFromDateKey
    4  weekKeyFromDate
    3  getWeekMonday
    2  getSchoolYearRange
    2  lastWeekKey
    2  schoolYearStart
    1  getPlanningWeekRange
    1  lastCompletedSchoolWeekKey
consumers of the shared counting path: 6
       functions/src/ai/tasks/monthlyReviewData.ts
       src/features/records/MonthlyTrend.tsx
       src/features/records/RecordsPage.tsx
       src/features/records/dataReviewExport.logic.ts
       src/features/weekly-review/useWeekHours.ts
       src/features/weekly-review/weekBySubject.ts
```

`ROLE` is per **file**: a file that both reads and writes is `BOTH`, because read/write
intent per call site is not derivable by a scan. What the derivation guarantees is
**completeness** — no file touching the time record is absent from §5 — which is the
property that is expensive to check by reading and cheap to check by machine.

`9 distinct date rules` is the figure the audit exists for. Two of them live on the
functions side and cannot import the app's (`lastWeekKey`, `schoolYearStart`), one is a
known defect (`getWeekMonday` — `UX-215`), and one of the two school-year rules disagrees
with the other by a month (`UX-411`).

---

## 4. Part A — every writer of time or evidence

**Named, not counted** (`CLAUDE.md`'s rule: a short list is its own check). One row per
door a person can use to say *"we did something"*. Every one of them is in §5 as well,
where the guard can see it.

| Door | Collection | Minutes come from | Names itself as | Date |
|---|---|---|---|---|
| Today → checklist check-off | `days` | the row's planned minutes, counted only when **completed** | the item's `label` | the day being viewed — local |
| Today → **Capture** card | `hours` + `artifacts` | typed (or a preset's default) | `notes` = the activity name | the day being viewed — local |
| Today → *Log watch time* | `hoursAdjustments` | the video's planned minutes | `reason` = *"Watched video: …"* | the day — local |
| Today → Life Day block | `days` | a fixed 2h the parent can adjust | the block's `title` | the day — local |
| Today → Life Day chips | `days` | **none** — `estimatedMinutes: 0` by design | the chip's label | the day — local |
| Creative timer stop | `hours` | measured, rounded **up** to 5 | `notes` = the description | `todayKey()` — local |
| Knowledge Mine session | `hours` + `days` | measured (idle-aware), rounded up to 5 | `notes` = *"… quest session"* | hours local, **day log UTC** (`UX-412`) |
| Evaluation session | `hours` | measured, rounded up to 5 | `notes` = *"… evaluation session"* | `todayKey()` — local |
| Book reader session | `hours` + `artifacts` | measured | `notes` = the book's title | local |
| Book editor session | `hours` | measured (plus ≤5 Art minutes when art was made) | `notes` = the book's title | local |
| Story Game Workshop | `hours` + `days` + `artifacts` | measured, split by challenge bucket | `notes` = the game's title | **UTC** (`UX-412`) |
| Dad Lab report | `hours` | the report's total ÷ its subject tags, **for every child** (DATA-04) | `notes` = *"Dad Lab: …"* | the report's own date |
| Dad Lab hours audit | `hoursAdjustments` | the correction, positive or negative | `reason` | the report's date |
| Records → quick-add | `hours` | typed | `notes` = the activity label | typed — local |
| Records → historical hours / adjustment | `hoursAdjustments` | typed | `reason` | typed — local |
| Planner → Apply | `days` | `plannedMinutes` only, which the fold **ignores** | the item's `label` | the chosen week's Mon–Fri |
| Strand session | `artifacts` + `activityConfigs` | **none** — a count, never minutes (`UX-283`) | the artifact's `topic` | local |
| Any capture (photo / audio / note) | `artifacts` | **none** — evidence carries no minutes | the artifact's `title` | local |

**The owner's phrase was "I added time in artefacts", and the table answers it.** An
artifact carries **no** minutes; the only door that writes evidence and minutes in one tap
is the Capture card, and it writes them as two documents in two collections. That is why
the evidence count and the hours moved and the item list did not.

**Every hours door sets a human-readable name** — `notes` on an entry, `reason` on an
adjustment, `title` on a block. That is what made `UX-408` a five-line fix rather than a
schema change: the names were already stored, and nothing read them.

---

## 5. The registry

One row per file that names `hours`, `hoursAdjustments`, `days` or `artifacts`. Columns 2
and 3 are **derived from the source** and compared against it on every run; columns 4 and 5
are written by hand and may not be blank. `src/core/firebase/firestore.ts`, where the four
collection helpers are defined, is deliberately not a row: it builds references and touches
no document.

| File | Collections | Role | Fold / date rule | What it is |
|---|---|---|---|---|
| `functions/src/ai/chat.ts` | hours · days | BOTH | own — `schoolYearStart` (Aug 1) + its own minute sum | **`loadHoursSummary`: the one reader that counts its own way** (`UX-410`). `hours` only, `minutes` **plus** `hours*60`, unrounded, non-positives admitted. `loadEngagementSummary` / `loadWeekContext` read `days` for engagement and the week plan, not for minutes |
| `functions/src/ai/contextSlices.ts` | days | BOTH | — (renders the `hoursProgress` slice) | Prints *“N hours of 1000 target (P% complete)”* into the **plan** and **shellyChat** prompts — a target and a percentage the surfaces are forbidden (`UX-410`). `dayToday` reads the day log for the checklist |
| `functions/src/ai/evaluate.ts` | hours · days · artifacts | BOTH | `lastWeekKey` over `civilDateObjectInZone` (UX-263 / UX-266); **its own** minute sums for the prompt | **The weekly cron and its `generateWeeklyReviewNow` twin.** Reads the week's `hours` / `days` / `artifacts` for the narrative and writes the `weeklyReviews` document — including the `UX-212` position snapshot, lost when the Claude call throws (`UX-409`). It reads **no `hoursAdjustments` at all** and sums minutes two more ways of its own (`UX-410`). Writes no `hours` row |
| `functions/src/ai/tasks/conundrum.ts` | days | BOTH | — (reads `days` for recent responses) | Reads the day log for conundrum history. No minutes |
| `functions/src/ai/tasks/disposition.ts` | days | BOTH | — (reads `days` for engagement + notes) | Reads the day log for the disposition narrative. No minutes |
| `functions/src/ai/tasks/monthlyReviewData.ts` | hours · hoursAdjustments · days · artifacts | BOTH | `collectHoursContributions` → `computeMonthHours` | The monthly review book's month figure — the shared path (ARCH-47 slice 4), and the reason the book stopped narrating a smaller month than the record |
| `functions/src/ai/tasks/shellyChat.ts` | days · artifacts | BOTH | `civilDateObjectInZone` (UX-266) | Reads `days` + `artifacts` for the chat's day/evidence context. No minute fold |
| `functions/src/ai/tasks/weeklyFocus.ts` | days | BOTH | — (reads `days` for the week's items) | Builds the week-focus prompt. No minutes |
| `src/components/ArtifactGallery.tsx` | artifacts | READ | — (no range rule) | Reads evidence for display |
| `src/core/data/seed.ts` | artifacts | BOTH | — (dev seed) | Dev-only seeding of demo artifacts. Not a door a parent can reach |
| `src/core/firebase/migrateHoursAdjustments.ts` | hoursAdjustments | BOTH | — (whole collection, no range) | The DATA-09 one-shot stamp of unattributed adjustments to `'both'`. Run from Records on load; hours-neutral by construction |
| `src/core/firebase/strandSessionWrites.ts` | artifacts | WRITE | — (no minute write, by design) | **WRITER.** A strand session: one artifact carrying `topic` + `activityConfigId`, and an `increment(1)` on the config. Deliberately writes **no** minutes |
| `src/core/hooks/useCreativeTimer.ts` | hours | WRITE | `todayKey()` — local | **WRITER.** The creative timer's stop: measured minutes rounded up to 5, `notes` = the session description, owner resolved by `creativeTimerOwner` (`UX-327`) |
| `src/features/avatar/MyAvatarPage.tsx` | days · artifacts | BOTH | `getWeekRange(new Date())` | Reads the day log for armor/XP context and writes an artifact for a ceremony. No minutes |
| `src/features/books/BookReaderPage.tsx` | hours · artifacts | WRITE | `todayKey()` — local | **WRITER.** A reading session: measured minutes as Language Arts, `notes` naming the book; plus a completion artifact |
| `src/features/books/useBackgroundReimagine.ts` | artifacts | WRITE | — (no range rule) | Writes the reimagined picture's artifact. No minutes |
| `src/features/books/useBook.ts` | hours · artifacts | BOTH | `todayStr()` — local | **WRITER.** Page-editing minutes as Language Arts (plus up to 5 Art minutes when art was generated), `notes` naming the book. `UX-353`'s unmount-order rule lives here |
| `src/features/dad-lab/HoursRoutingAuditPanel.tsx` | hoursAdjustments | BOTH | `hoursRoutingAudit` over whole collection | **WRITER.** The DATA-16 audit's corrections — `hoursAdjustments` rows, positive and negative, each stamped with the `labReportId` that makes them idempotent |
| `src/features/dad-lab/KidLabView.tsx` | artifacts | BOTH | — (no range rule) | Kid-side lab contributions: artifacts only |
| `src/features/dad-lab/LabReportForm.tsx` | artifacts | WRITE | `weekKeyFromDate` for the report's week | Writes the lab's artifacts. The lab's MINUTES are written by `useDadLabReports`, below |
| `src/features/dad-lab/useDadLabReports.ts` | hours | BOTH | the report's own `date` — local | **WRITER.** DATA-04: a lab's minutes are split per subject tag and written **for every child**, by design. `notes` = *“Dad Lab: <title>”* |
| `src/features/evaluate/EvaluateChatPage.tsx` | hours | BOTH | `todayKey()` — local | **WRITER.** An evaluation session's measured minutes, rounded up to 5, under the domain's subject |
| `src/features/evaluate/useMasteryCheckoffs.ts` | days | READ | `toISOString().slice(0,10)` — **UTC** | Reads recent day logs for mastery check-offs. No minutes; the UTC date is a read bound, not a stored one |
| `src/features/planner-chat/applyWeekPlan.ts` | days | BOTH | `dateKeyForDayPlan` over the chosen week | **WRITER.** The single Apply (FEAT-150): the Mon–Fri day writes, every one through `setDayLogGuarded`. Writes `plannedMinutes`, which the fold correctly ignores |
| `src/features/planner-chat/PlannerChatPage.tsx` | days · artifacts | BOTH | `getPlanningWeekRange` → `planningWeekSelection` | **WRITER.** Live-day edits after Apply. Its `hoursPerDay` header figure is the routine's own unweighted total and is **not** a reading of the hours record (`UX-206`) |
| `src/features/planner-chat/useAppliedWeekDays.ts` | days | BOTH | the resolved week's Mon–Fri keys | Reads the applied days back for the mirror view |
| `src/features/quest/useQuestSession.ts` | hours · days | BOTH | `todayKey()` for hours; **UTC** for the day write | **WRITER.** Knowledge Mine minutes (idle-aware, rounded up to 5) and a day-log check-off. The day-log half is dated in UTC — `UX-412` |
| `src/features/records/ChapterResponsesTab.tsx` | artifacts | BOTH | — (no range rule) | Reads chapter-response artifacts |
| `src/features/records/dataReviewExportLoader.ts` | hours · hoursAdjustments · days · artifacts | READ | `getSchoolYearRange()` + the shared fold in `dataReviewExport.logic` | The data-review export's reads. §5 folds the shared path and says so in its own prose |
| `src/features/records/PortfolioPage.tsx` | artifacts | BOTH | `getMonthRange` | Reads a month of evidence for the portfolio |
| `src/features/records/QuickAddHours.tsx` | hours | WRITE | the typed date — local | **WRITER.** Records' quick-add: typed minutes, the activity's subject, `notes` = the activity label, `assertAttributed` at the write |
| `src/features/records/RecordsPage.tsx` | hours · hoursAdjustments · days · artifacts | BOTH | `getSchoolYearRange()` → `computeHoursSummary` | **WRITER and READER.** The compliance surface: the hours table, the subject split, the trend, the pack — and the historical-hours and manual-adjustment doors |
| `src/features/settings/auditArtifactChildIds.ts` | artifacts | BOTH | — (whole collection survey) | Admin survey of artifact attribution |
| `src/features/settings/DevAdminTab.tsx` | days | BOTH | `getWeekRange()` for the Sunday sweep | **WRITER.** The admin Sunday cleanup deletes day logs through `deleteDayLogGuarded` |
| `src/features/shelly-chat/useChatWeekDays.ts` | days | BOTH | `getWeekRange(now, 1)` — Monday-start | Reads the chat's week of days. **The one caller that starts its week on MONDAY**, because it is building a Mon–Fri card set, not counting a compliance week |
| `src/features/shelly-chat/useShellyChatFlows.ts` | days | BOTH | 14 days back, `toISOString().slice(0,10)` | Reads recent days for chat context; writes day edits through the guard |
| `src/features/today/ExplorerMap.tsx` | days | BOTH | — (recent days) | Reads day logs for the kid map |
| `src/features/today/KidCaptureForm.tsx` | artifacts | WRITE | — (no range rule) | **WRITER.** A kid's captured artifact. No minutes |
| `src/features/today/KidChapterPool.tsx` | artifacts | BOTH | — (no range rule) | Chapter answers as artifacts |
| `src/features/today/KidConundrumResponse.tsx` | artifacts | WRITE | `toISOString().slice(0,10)` — **UTC** | **WRITER.** The conundrum answer's artifact. `useConundrumDoneToday`'s own header already records the local/UTC mismatch here |
| `src/features/today/KidTeachBack.tsx` | artifacts | WRITE | — (no range rule) | **WRITER.** A teach-back artifact. No minutes |
| `src/features/today/KidTodayView.tsx` | artifacts | BOTH | the selected date — local | The kid's list. Its quick-log chips write through `useUnifiedCapture` |
| `src/features/today/LessonVideoDialog.tsx` | hoursAdjustments | WRITE | the day's own date — local | **WRITER.** *Log watch time*: an `hoursAdjustments` row, `reason` = *“Watched video: <topic>”* |
| `src/features/today/liveDayEdit.ts` | days | BOTH | the edited day's key — local | **WRITER.** Today's live day edits, all through `setDayLogGuarded`; mirrors the DATA-14 item↔block correspondence |
| `src/features/today/TeachBackSection.tsx` | artifacts | WRITE | — (no range rule) | **WRITER.** The parent-side teach-back artifact |
| `src/features/today/TodayPage.tsx` | artifacts | BOTH | `getWeekRange(parsed, 1)` — Monday-start | The parent Today shell. Its own day total is the checklist's planned minutes, a different question from the counted hours (`weekRibbon.logic`) |
| `src/features/today/UnifiedCaptureCard.tsx` | hours · artifacts | WRITE | the selected day — local | **WRITER, and the door in the owner's report.** One tap writes an `artifacts` document **and** an `hours` document carrying the activity's name in `notes` — and **no checklist item**, which is why *what got done* could not name it (`UX-408`) |
| `src/features/today/useDayLog.ts` | days | BOTH | `getWeekRange(new Date())` (`UX-366`) | **WRITER.** The day document's read and its one write lane, `persistDayLogImmediate` (`UX-351`) |
| `src/features/today/useRolloverUnchecked.ts` | days | READ | yesterday's key — local | Reads the previous day to roll unchecked items forward |
| `src/features/today/useTodayMiningMinutes.ts` | hours | READ | one day, `hours` only | A cap, not a record: Knowledge Mine minutes for today, for the daily mining limit |
| `src/features/today/useUnifiedCapture.ts` | artifacts | BOTH | the selected day — local | **WRITER.** The capture pipeline behind the card: the artifact, the scan, and FEAT-184's kid/parent lane split |
| `src/features/today/WeekFocusCard.tsx` | artifacts | WRITE | the week's key | **WRITER.** The conundrum's artifact |
| `src/features/today/WeekRibbon.tsx` | days | READ | `getWeekRange(…, 1)` — Monday-start | `formatHoursChip`: progress through the week's **planned** checklist against a planned denominator. A different question, excluded from the agreement test **by name** (`UX-211`) |
| `src/features/watch/useWatchHistory.ts` | days | READ | a rolling window back from today | Reads day logs for watch history |
| `src/features/watch/useWatchItemCompletion.ts` | artifacts | WRITE | — (no range rule) | **WRITER.** The watched-video artifact; mirrors the DATA-14 correspondence when it completes the item |
| `src/features/watch/writeWatchItemToDay.ts` | days | BOTH | the chosen day's key — local | **WRITER.** Adds a watch row to a live day, through `setDayLogGuarded`. Its whole job is the write, and it names no raw verb |
| `src/features/weekly-review/useWeekBySubject.ts` | artifacts | READ | `weekRangeFromDateKey` on `createdAt` | Reads the week's evidence for the by-subject rollup. **Ranges on `createdAt` while the minutes range on `date`** — `UX-413` |
| `src/features/weekly-review/useWeekHoursInputs.ts` | hours · hoursAdjustments · days | READ | `weekRangeFromDateKey` → the shared fold | The ONE read behind both weekly sections (`UX-388`). Deliberately does **not** run the DATA-09 migration: a read-only review surface has no business writing to the hours record |
| `src/features/workshop/MyGamesGallery.tsx` | artifacts | BOTH | — (no range rule) | Reads game artifacts |
| `src/features/workshop/workshopUtils.ts` | hours · days · artifacts | BOTH | `toISOString().slice(0,10)` — **UTC** | **WRITER.** Play minutes split proportionally by challenge bucket, plus a day-log mark. **Every date here is UTC**, so an evening session is stamped tomorrow — `UX-412` |
---

## 6. Part B — every reader, and whether they agree

### 6a. The readers that claim the same thing

These state **a child's counted minutes** over a range. `src/test/hoursReaderAgreement.test.ts`
folds one child's week through every one of them and asserts a single number; the fixture
carries every shape a writer in Part A can produce, because a fixture holding only checked
checklist items cannot tell two readers apart.

| Surface | Fold | Range rule | Agrees |
|---|---|---|---|
| Records → Hours | `collectHoursContributions` → `computeHoursSummary` | `getSchoolYearRange()` | ✅ |
| Records → subject distribution | `computeHoursSummary` → `computeSubjectDistribution` | same | ✅ |
| Records → monthly trend | `collectHoursContributions` → `computeMonthlyTrend` | same | ✅ |
| Records → compliance pack | `buildCompliancePackFiles` over `computeHoursSummary` | the picked range | ✅ |
| Data-review export §5 | `computeHoursSummary` → `computeSubjectDistribution` | `getSchoolYearRange()` | ✅ |
| Review → Week → *Hours and Coverage* | `computeHoursSummary` | `weekRangeFromDateKey(weekKey)` | ✅ |
| Review → Week → *The Week by Subject* | `computeHoursSummary` → `computeSubjectDistribution` | same | ✅ |
| Monthly review book (CF) | `collectHoursContributions` → `computeMonthHours` | the month | ✅ |
| **AI context slice `hoursProgress`** | **its own** | **`schoolYearStart` (Aug 1)** | ❌ `UX-410` |
| **The weekly-review prompt's `HOURS BY SUBJECT`** | **its own**, `hours` docs only | `lastWeekKey` | ❌ `UX-410` |
| **The weekly-review prompt's per-day `minutesBySubject`** | **its own**, completed items only | `lastWeekKey` | ❌ `UX-410` |

**The last three rows are the audit's finding**, and the first of them is the agreement
test's **positive control**: the suite asserts that adding a reader with that arithmetic
makes the set disagree, so a future "simplification" of the comparison reddens.

`loadHoursSummary` differs from the rule four ways, each of which changes the answer: it
reads `hours` documents only (no day logs, no adjustments), it adds `minutes` **and**
`hours * 60` where the rule takes minutes *else* hours, it does not round, and it admits
non-positive entries. It is then printed into the **plan** and **shellyChat** prompts as
*"N hours of 1000 target (P% complete)"* — a target and a percentage on a product whose
owner decision reads *"when we move to Texas hours aren't the goal."*

The other two are inside `evaluate.ts`, the weekly-review prompt builder, and they matter
because **that prompt is the monthly review book's raw material** (`UX-219`): its
`HOURS BY SUBJECT` block sums `ctx.hours` alone — no adjustments at all, since the cron
never reads that collection — and its per-day `minutesBySubject` sums completed checklist
items with no block-actuals rule, so a day whose time was tracked on blocks is reported
twice over or not at all depending on which of the two blocks you read. Neither is shown
to a person directly; both are told to a model that writes prose a person reads.

### 6b. The readers that deliberately answer a different question

Excluded from the agreement test **by name**, in the test file, with the reason — an
exclusion list that is a heuristic is an exclusion list that grows silently.

| Surface | What it actually answers | Why it may not be compared |
|---|---|---|
| Today's `WeekRibbon` chip (`formatHoursChip`) | progress through the week's **planned** checklist | different numerator, and a **planned denominator** — the target `UX-211` forbids the hours surfaces |
| Planner's `hoursPerDay` header | the routine's own unweighted minute total, re-parsed from the prose the app wrote | not a reading of the hours record at all; its own tautology is `UX-206` / `UX-208` / `UX-209` |
| `useTodayMiningMinutes` | today's Knowledge Mine minutes | a **cap**, not a record: one day, one source |
| `weekEvidenceCounts` / `WeekInEvidence` | books, reading sessions, teach-backs | counts of evidence, never minutes |

### 6c. The date rules

| Rule | Where | What it answers |
|---|---|---|
| `getWeekRange` | the shared Sun–Sat week | hours, compliance, records, the art quota's week key |
| `getWeekRange(now, 1)` | Today's ribbon, the chat's week | a **Monday-start** Mon–Fri card set — a display shape, not a counting week |
| `getPlanningWeekRange` | the planner's default | which week an unprompted parent means to *plan* (rolls Fri + Sat) |
| `lastCompletedSchoolWeekKey` | the review's default | the last school week whose Mon–Fri ended (rolls Sat only) |
| `getSchoolYearRange` | Records, the export | **July 1 – June 30** |
| `schoolYearStart` (CF) | the `hoursProgress` slice | **August 1** — `UX-411`, a different school year |
| `lastWeekKey` (CF) | the weekly cron | pinned to `lastCompletedSchoolWeekKey` by agreement tests in both suites (`UX-263`) |
| `getWeekMonday` (CF) | `loadWeekContext`, Shelly Chat | local construction, UTC serialisation — `UX-215`, open |
| `toISOString().slice(0,10)` | Workshop, Knowledge Mine's day write, the conundrum | **UTC** — `UX-412` |

---

## 7. Findings

| Id | Band | State | What |
|---|---|---|---|
| `UX-406` | 2 | **FIXED** in this run | Review → Week had no week control, so on any day but Saturday it showed the previous school week with no way to move |
| `UX-407` | 3 | **FIXED** in this run | The positions sentence promised *"saved overnight, once Saturday is over"* about Saturdays already past |
| `UX-408` | 2 | **FIXED** in this run | Counted minutes that no completed checklist item accounts for were named nowhere |
| `UX-409` | 1 | FILED | A failed weekly review writes **nothing**, so that week's position snapshot — the repo's only record of where a workbook stood on a date — is lost permanently, and no client route regenerates it |
| `UX-410` | 2 | FILED | `loadHoursSummary` is a fourth definition of hours, read into two AI prompts, with a 1000-hour target and a percentage |
| `UX-411` | 2 | FILED | Two school years: July 1 in the app, August 1 in the Cloud Function |
| `UX-412` | 2 | FILED | The Workshop and Knowledge Mine date their `hours` / `days` writes in **UTC**, so an evening session is stamped tomorrow |
| `UX-413` | 3 | FILED | The week's evidence is range-queried on `createdAt` while its minutes are range-queried on `date` |
| `UX-414` | 3 | FILED | With a week selector, *"Was that enough this week?"* can now be answered about a week still ahead |

Full bodies are in `docs/review/REVIEW_HOME_BASE.md` §6.

**`UX-409` is the one to read first.** `generateReviewForChild` calls Claude, and only
after that call returns does it load the curriculum snapshot and write the document. So a
thrown call — a rate limit, a missing secret, a parse failure, an outage — loses the
narrative (recoverable: it is regenerable from the records) **and** the position snapshot
(**not** recoverable: `ActivityConfig.currentPosition` is one mutable field with no
history, so nobody can ever say where the workbooks stood that week). `UX-219` removed
the page's *Generate Now* button, so the callable that would re-run it has no caller. The
proposed shape is stated in the ledger row and is deliberately **not built here**: it
changes what a Cloud Function writes to a records document, which is propose-and-confirm.

---

## 8. What the guard cannot see

Three shapes, hand-checked, stated rather than hidden:

1. **A write that reaches a collection through a helper in another file.** The scan is
   per file, so a module whose only Firestore verb lives in an imported writer is only
   caught where the repo's own guarded writers are named. `setDayLogGuarded` /
   `deleteDayLogGuarded` are in the write-verb list for exactly this reason — without them
   four of this repo's day writers read as readers, `watch/writeWatchItemToDay.ts` (a file
   whose entire job is the write) among them. There is no equivalent for `hours`, because
   there is no shared hours writer: **every hours door calls `addDoc` itself.** That is
   itself worth noticing and is half of `UX-361`'s shape.
2. **Which collection a `BOTH` file reads and which it writes.** Not derivable by a scan;
   column 5 says it per file, by hand.
3. **A range query that silently excludes a document.** Every week and month read filters
   `where('date', …)`, and a `days` document with no `date` field cannot match — yet both
   `RecordsPage` and `useWeekHoursInputs` map results with
   `date: data.date ?? parseDateFromDocId(d.id)`, a fallback a range query can never
   trigger. It is either dead code or a silent gap and nothing in the repo says which; a
   Dev-tab survey counting `days` documents without a `date` field would settle it in one
   read. Filed inside `UX-413`.

---

## 9. Index

- Derived by: `npm run census:time-ledger` (`scripts/timeLedgerCensus.ts`)
- Enforced by: `src/test/timeLedger.invariant.test.ts` (fails closed, and proves it can fail)
- The agreement property: `src/test/hoursReaderAgreement.test.ts`
- The one counting rule: `functions/src/shared/hoursContributions.ts` (ARCH-47 slice 4)
- Neighbours: `UX-206` (the planner's budget tautology) · `UX-211` / `UX-212` / `UX-213` /
  `UX-214` (the week's hours, positions, rate and question) · `UX-215` (`getWeekMonday`) ·
  `UX-218` (which week the review names) · `UX-263` (the cron's day and zone) ·
  `UX-361` (four doors, three collections, one question) · `UX-366` (a Today read on the
  wrong week) · `UX-388` (the week by subject)
