# Today, walked top to bottom — four doors to "we did some Language Arts"

**Date:** 2026-09-11 · **Run:** AUDIT-228 · **Ids:** `UX-357` → `UX-380` (used: `UX-357`–`UX-368`)
**Base:** `5d599eb4` (#1829, `UX-351`/`352`/`353`/`354`)

Today is where Shelly lives. It is the heaviest write surface in the app and it has **never been
walked end to end**. Progress was (AUDIT-218, `UX-311`–`320`); the planner was (FEAT-205); Books was
(FEAT-179). Today has been edited by more runs than any of them and read as a whole by none — and
both of this week's owner reports came from it.

**Derived, not counted.** `npm run census:today`, on this branch, pasted:

```
source files under src/features/today (non-test): 72
lines of source in them: 18922
largest files:
   1754  TodayPage.tsx
   1694  TodayChecklist.tsx
   1252  KidTodayView.tsx
    904  UnifiedCaptureCard.tsx
    706  KidChecklist.tsx
collections named: 17
   23  artifactsCollection
    7  daysCollection
    4  bookProgressCollection
    3  skillSnapshotsCollection
    3  scansCollection
    2  helpCardsCollection
    2  chapterResponsesCollection
    2  chapterBooksCollection
    2  hoursCollection
    2  dailyPlansCollection
    1  dailyArmorSessionsCollection
    1  hoursAdjustmentsCollection
    1  learnerModelsCollection
    1  xpLedgerCollection
    1  weeksCollection
    1  evaluationSessionsCollection
    1  plannerConversationsCollection
console.error / console.warn call sites: 77
  in 28 of 72 files
```

**Two corrections to the run prompt's own figures, both verified.** The prompt's step-0 greps read
`artifacts ×37, days ×15, skillSnapshots ×8, scans ×4, hours ×4, learnerModels ×3, xpLedger ×2,
evaluationSessions ×2` and *"twelve `console.error` / `console.warn` catches"*. Neither survives
derivation: the collection figures counted **test files** and the `evidenceCollection` *field name*
alongside the `artifactsCollection()` *helper*, and the catch figure is off by a factor of six — there
are **77**, in 28 of 72 files. The script above is committed so the next run does not have to
re-establish this. (The prompt's ledger-id mapping is also off by one: `UX-341` is
`settings/AvatarAdminTab`, not a Today row. The two Today child-switch rows are `UX-342` and
`UX-343`, and those are the two this run fixed.)

---

## 1 · What Shelly sees tomorrow morning

*Written last. This is the paragraph for the phone.*

She opens **Today**. It looks the same — the name chip, the date, the day arrows, the week dots, the
checklist. Four things are different, and three of them only show up when something goes wrong.

**A change she makes on the wrong boy's day can no longer land there.** If she starts something for
Lincoln — a strand session with a photo in it, a *move this to Thursday*, a lesson-video search, a
typed review note — and then switches to London before finishing, Today now **closes it and says what
it closed**: *"Closed the session you were recording and the review note — Lincoln was selected when
you opened them. Nothing was saved."* It does not tell her to try again, because she may well have
meant to switch.

**And an edit that was already in flight when she switched cannot land on the other boy either.**
This is the deeper half: every handler on this page builds its change out of the day it was looking
at and hands the whole day back to be saved. A slow one — a photo uploading, a page being scanned —
used to finish after the switch and have its document quietly **re-stamped** with whoever was now
selected. One boy's entire checklist, written onto his brother's day, under his brother's name.
That write is now refused and reported: *"That change was for a different day and didn't save.
Nothing here was changed — switch back to make it there."*

**When a read fails, the page no longer says the thing was empty.** A dropped read of yesterday used
to mean an unfinished lesson silently did not carry over; now it says *"Couldn't check yesterday for
anything to carry over."* A dropped read of the read-aloud book used to offer to **generate a new set
of chapter questions** over a set that already exists; now it says the questions could not be read and
have not been lost.

**And an answer a boy records himself now answers back.** A chapter answer that failed to save was an
error nobody ever saw — no message, no save state, nothing — and the answer was gone on the next
load. Lincoln and London now read *"That did not save. Try again."*, and Shelly reads a longer
sentence saying it is not recorded. The same is true of the *Add Photo / Add Note* form in **My
Stuff**, which used to swallow a failed save completely, and of My Stuff itself, which used to say
*"Nothing captured yet today"* over a day whose photos it simply had not read.

**What has not changed, and is filed for you to rank:** there are **four** different ways to record
*"we did some Language Arts today"*, and which one she picks decides which of three collections the
minutes live in (§4, `UX-361`). The child's name at the top of Today is still a chip that **looks
tappable and is not**, while the control that actually changes child is seven things further down the
page (`UX-362`). And eleven XP and diamond awards across the boys' surfaces still fail in silence
(`UX-364`).

---

## 2 · The owner's two reports, answered in one line each

> *"Shelly added content for Lincoln on London's page."*

**Today:** open the row's **⋮ → Assign to a child** on **Progress → Curriculum**. `UX-354` shipped
yesterday and it reaches **every** row type now, not only workbooks — a routine, an app, a formation
block, an activity. A finished program and a strand that already has recorded sessions are refused,
and the dialog says why rather than hiding the item. Confirmed on this walk: `reassignActivity.ts`
holds the rules and `CurriculumTab` renders the item for all seven `ActivityType` members.

**After this PR,** the *"how did it get there"* half is closed at the source too: the three ways Today
could put one boy's work on the other's record — an open dialog, an in-flight write, a picked lesson
video — are each refused and reported (`UX-342`, `UX-343`, `UX-357`).

> *"She added to the lessons but some of them seem to have failed or not saved."*

**She will now see a red message naming the row** — *"'Language Arts lesson 4 (20m)' didn't save.
It's back to how it was — try again."* — and the row will be back where it was. That shipped
yesterday as `UX-351`. What this run adds is the two cases `UX-351` could not reach: a write that was
composed for a different day (refused and named as such, above), and every read on the page that used
to render its own failure as an affirmative empty.

---

## 3 · The first screen: what she reads before she has done anything

Walked as a parent on a 390px phone, **from the component tree**. No dev server was run and no pixels
were measured — see §7. This is *what renders above what*, which is structural and checkable; it is
not FEAT-208's measured claim.

| # | What | Whose day is it about? | Can she tap it? |
|---|---|---|---|
| 1 | `ContextBar` — avatar, **name chip**, date chip, four nav icons | Lincoln's | The name chip: **no**. The four icons: yes |
| 2 | `Today` (or the weekday name on another day) | — | — |
| 3 | Day arrows + the long date | Lincoln's | Yes |
| 4 | `WeekRibbon` — five Mon–Fri dots | Lincoln's | Yes |
| 5 | A banner — *draft not applied* / *past* / *upcoming* | Lincoln's | Sometimes |
| 6 | `HelpStrip` — *"Tap items off as you go"* | — | Dismiss |
| 7 | **`ChildSelector`** | **this is the control** | Yes |
| 8 | `HelperPanel`, `DayStatusRow`, the checklist… | Lincoln's | Yes |

**Six things that are about one particular boy render above the control that says which boy.** That
is AUDIT-218's `UX-319` on a second page, and it is sharper here, because item 1 is a `Chip` with
`color="primary" variant="outlined"` and no `onClick` — **styled exactly like every tappable chip in
the app**, which is the precise defect `UX-324` wrote `ChildSwitcherChip` to fix in the app shell and
which is still live here. Filed as `UX-362` with a proposed shape; not built, because moving or
merging the selector is a layout decision and the owner has said the in-page selectors stay for now.

Two seeds in the run prompt did **not** survive the reading, and the corrections matter more than the
hypotheses did:

- **"Two `ChildSelector`s on one page."** There are two `<ChildSelector>` elements in
  `TodayPage.tsx` (`:1186`, `:1314` on `main`), but they are in **mutually exclusive branches** — the
  `!dayLog` loading return and the main render. A parent never sees both. Not a finding.
- **"Two `ContextBar`s and two `HelpStrip`s — the parent view and `KidTodayView`."** `KidTodayView`
  renders **neither**. The two of each are the same loading/loaded pair as above. What *is* true is
  that the kid view has no date control and no context bar at all, so a boy can only ever see today —
  which is correct and deliberate, and is now written down so the next walk does not re-ask.

**The boundary between the two views was, however, hand-written three times.** `TodayPage` computed
`isKidProfile` as `profile === UserProfile.Lincoln || profile === UserProfile.London` — character for
character what `useActiveChild().isChildProfile`, which it was already calling on the next line,
returns — and `canEditLiveDay` as `profile === UserProfile.Parents`, a copy of `useProfile().canEdit`.
On the page that writes nine collections, a fourth profile would have silently been handed the parent
surface with edit mode on. Fixed (`UX-358`); no behaviour changes for any profile that exists,
including an unselected one.

---

## 4 · The doors: how many ways are there to say "we did some Language Arts today"?

This is §3's rule from AUDIT-218 — *if two controls give the same one-sentence answer, that is a
finding* — applied to the page's controls in the order they appear. **Named, not counted**: a short
list is its own check and cannot go stale against a recount.

### On the row itself (`TodayChecklist`)

| Door | Its one honest sentence | Writes |
|---|---|---|
| The **checkbox** | *"This is done."* | `days.checklist[].completed` → hours, via the planned minutes |
| **Add photo(s)** | *"Here is what he did."* | `artifacts`; and if the page reads as curriculum, `scans` + `activityConfigs` + `childSkillMaps` + `skillSnapshots` |
| **Analyze as workbook scan** | *"Read this photo again and file it against the workbook."* | `scans` + `activityConfigs` + `days.checklist[]` |
| **Quick Review** | *"Here is how it went."* | `days.checklist[].gradeResult` (+ the `learnerModels` re-test queue) |
| The **mastery chips** (got it / working / stuck) | *"Here is how it went."* | `days` + `skillSnapshots.conceptualBlocks` + `learnerModels` |
| **Watch** | *"He watched the video that was planned."* | `days` + `artifacts` + hours |
| **Find a video** → *Log watch time* | *"He watched a video I found just now."* | `hoursAdjustments` |
| **Record a session** (a strand row) | *"Here is a session of something with no lessons."* | `activityConfigs.currentPosition` **+1** + `artifacts` |
| **Move to another day** / **Change video** / **✕** | *"Not today."* | `days` (two documents, for a move) |
| **Add Item** / **Add a video** | *"This happened too — put it on the list."* | `days.checklist` |

### Below it

| Door | Its one honest sentence | Writes |
|---|---|---|
| **Capture** — note / photo / audio + *How long?* | *"Here is what happened, and how long it took."* | `artifacts` + `hours` |
| **Capture → quick-log chips** | The same sentence, pre-filled | `artifacts` + `hours` |
| **Kind of day → Life Day** | *"Today the day was the lesson."* | `dailyPlans.planType`, then a block of minutes |

### The finding

**Four of these answer the same question — *"we did some Language Arts, here is the time"* — and they
land in three different collections.** The checkbox puts it in `days`; the Capture card puts it in
`hours`; *Log watch time* puts it in `hoursAdjustments`; the Life Day block puts it back in `days`.

That is **not** a correctness bug, and it is worth saying so plainly rather than filing a scare:
`collectHoursContributions` folds all three, and this run asserted that fold byte-for-byte for the
`hoursAdjustments` path with a positive control. The finding is about the **parent**, not the
arithmetic: nothing on the screen says which door a given row wants, the choice changes which record
her compliance pack cites, and the door with the most friction (the Capture card, at the bottom of the
page, with a subject dropdown and a stepper) is the one that produces the cleanest record. Filed as
`UX-361`, with a proposed shape, for the owner to rank. It is Today's `UX-315`.

**One near-duplicate worth separating from it:** *Watch* and *Find a video → Log watch time* both end
in *"he watched a video"*, but they are genuinely different — one completes a row the planner wrote,
the other logs a video that was never planned — and their two records are correspondingly different.
Not a finding; written down so it is not re-raised.

---

## 5 · The three passes

### Pass 1 — Lincoln's Language Arts, Tuesday morning

His LA work can be **any of four row shapes**, and the screen does not say which:

| Shape | What the row looks like | Where "add to the lesson" goes |
|---|---|---|
| a **workbook** (G&B Language Arts) | a title with `(20m)`, a sparkle, and after capture an *Analyze* button | the row's own photo → `activityConfigs.currentPosition` |
| a **routine** (Handwriting, Sight word games) | the same title with `(15m)` | nowhere — it is a checkbox and a photo |
| a **strand** (History, since `UX-281`) | the same title, plus a **Record a session** button | a session, which increments a count |
| an **app** (Reading Eggs) | the same title, plus an *Open* link | nowhere |

**They are visually identical apart from the extra button.** So *"she added to the lessons"* has four
different meanings depending on a property of the row a parent cannot see, and in two of the four
cases the honest answer is that Today has nowhere to put it — she has to go to Curriculum. That is
the shape behind the second report, and it is filed as `UX-363`: the row should say what kind of
thing it is. Not built; it is a design decision about the densest list in the app.

**What did work on this pass**, and is worth recording as working: the checkbox, the photo, the batch
dialog (*"Snap several pages, then Save once"*), *Quick Review*, and the mastery chips all did exactly
what they said, reported both outcomes, and are correctly parent-gated.

### Pass 2 — London (6)

London's day is thinner by design (*Lincoln-first / London minimal*), and nothing on the parent
surface is gated on his name — every gate this walk found keys on capability or on data
(`canAccessKnowledgeMine` reads the snapshot, `findYoungerSibling` reads the relationship,
`resolveChildAgeGroup` reads the birthdate). The one thing that keys on his name is **cosmetic**:
`isLincoln = child.name.toLowerCase() === 'lincoln'` picks the Minecraft font and palette, which is
`CLAUDE.md`'s explicitly permitted personality flag. Correct as it stands.

### Pass 3 — the kid view

`KidTodayView` is a different page, not a variant: no context bar, no date control, no child selector,
no edit mode, and a `setActiveChildId` that is a no-op by construction. The `TodayPage` early return
that reaches it is the boundary, and it now reads the one canonical capability (§3).

Three silences were found here and two are fixed:

1. **A chapter answer that failed to save threw into nothing** — `updateChapter` had no catch anywhere
   on its path and was called as `void onChapterAnswered(...)`. Fixed (`UX-355`), with the kid copy
   held to the shared readability bar.
2. **The *Add Photo / Add Note* form swallowed a failed save entirely** — the catch logged and the
   form just sat there. Fixed (`UX-359`).
3. **Eleven XP and diamond awards still fail in silence** across `KidChecklist`, `KidConundrumResponse`
   (×4), `KidExtraLogger` (×2), `KidTeachBack` (×2) and `KidTodayView` (×2). Filed, not fixed
   (`UX-364`): `xpLedger` is a propose-and-confirm rail and the right answer is a shared reporting
   lane rather than eleven inline snacks.

---

## 6 · Findings

Severity: **P1** — she cannot complete the task, or the screen says something false · **P2** — she
can, but the page works against her · **P3** — polish.

### Fixed in this PR

| Id | Sev | Finding |
|---|---|---|
| **UX-357** | **P1** | A day write composed for one child or day was **re-stamped** with the live one and saved, in a line labelled *defense in depth*. One boy's whole checklist could land on his brother's day, on the one lane where the preservation guard runs in observe-only mode. Refused and reported now; the loaded day is also dropped on a **date** change, which the old child-only guard never covered. |
| **UX-343** | **P2** | Today's dialog stack outlived a child or day change — a strand session with photos in it, the move and swap targets, the video picker, and (inside `TodayChecklist`) a lesson-video search, a photo dialog, a typed review note and a half-filled new row. All closed now, and **named** in one sentence, RESET's second half. |
| **UX-342** | **P2** | A picked lesson video and its *"logged N min"* confirmation survived a child change while the hours write read the live `childId`. RESET. **No hours arithmetic changed** — asserted through `collectHoursContributions` with a positive control (`DOC-25` term 3). |
| **UX-355** | **P3** | A chapter answer that failed to save was an unhandled promise rejection: nothing on screen, gone on the next load. Two audiences, one rule; kid copy on the readability bar. **Codex round 1 (P1) caught the first cut of this fix**: reporting from a wrapper on the page and then resolving normally disarmed the `catch` blocks in both chapter pools, which were the only thing keeping the staged work — so the reporting would have deleted a boy's recording and a parent's typed note on exactly the failure it was added for. The outcome now reaches the components, and each reads it before discarding anything. |
| **UX-356** | **P3** | Two Today reads rendered a failure as an affirmative empty — the chapter pool (which then offered to **generate** a pool that exists) and yesterday's rollover (which silently carried nothing forward). Both say so now. |
| **UX-358** | **P3** | The page hand-wrote both of its capability answers, duplicating `isChildProfile` and `canEdit`. No behaviour change; a fourth profile is now a decision made once. |
| **UX-359** | **P3** | On the kid's own surfaces, a failed artifact save said nothing and a failed artifact **read** rendered as *"Nothing captured yet today."* **Codex round 1 (P2)**: the first cut said *"That did not save"* for both halves of the save, which is false when the document was created and the upload failed — and the retry it recommended would have made a second artifact and orphaned the first. Two sentences now, and the retry **reuses** the document the first attempt created. |
| **UX-360** | **P3** | Today's pre-completion scan reported a failed `activityConfigs` write with a `console.error` and nothing else, on a path whose success says *"Updated Math K to lesson 14"*. |

### Filed, not built

| Id | Sev | Finding |
|---|---|---|
| **UX-361** | **P2** | **Four doors to "we did some Language Arts today", landing in three collections.** Structural — the owner's call. Proposed shape below. |
| **UX-362** | **P2** | Six things about one particular boy render **above** the control that says which boy, and the first of them is an inert chip styled exactly like a tappable one. `UX-324`'s defect, still live on this page. Proposed shape below. |
| **UX-363** | **P2** | A workbook row, a routine row, a strand row and an app row are visually identical apart from one button, so *"add to the lesson"* means four different things and in two of them Today has nowhere to put it. |
| **UX-364** | **P3** | Eleven XP / diamond award failures across five kid surfaces report nothing. `xpLedger` rail, so a shared reporting lane rather than eleven snacks. |
| **UX-365** | **P3** | Four more reads still render their own failure as an affirmative empty: `useTodayMiningMinutes` (→ *"No mining yet today"*), `useUnappliedDraft` (→ no *review and apply* banner), and `TodayPage`'s own recent-scans and scan-feedback queries. `UX-356`'s class, beyond the two rows it named. |
| **UX-366** | **P3** | The week plan is resolved from `new Date()`, not from the day being viewed, so paging back to last Friday shows **this** week's focus, conundrum and read-aloud book. The page computes its Mon–Fri dates from `selectedDate` two files away. |
| **UX-367** | **P3** | The Capture card has its **own** child dropdown, so a parent can log for the other boy without switching — correct, and it already clears the family presets on a change (`UX-184`). But the artifact it writes is prepended to the list of the child **on screen**, so the page shows it under the wrong boy until reload. |
| **UX-368** | **P3** | `TodayChecklist.tsx` is 1,694 lines and `TodayPage.tsx` 1,754 (both derived, §0). Neither is this run's to split, and the seam is named: the per-row controls and the four dialogs they own — the photo batch, the review note, the lesson video and the add-item row — are one component's worth, and they are exactly the four `UX-343` had to report upward because the page could not see them. |

### Proposed shape for `UX-361` (not built)

**One question, asked once.** Today's capture surfaces collapse to two: the **row**, which answers
*"this planned thing happened"* and writes to `days`, and the **Capture card**, which answers *"this
unplanned thing happened"* and writes to `hours`. *Log watch time* moves inside the row's Watch flow
and stops being a third collection; the Capture card's chips stay exactly as they are. What goes: the
independent hours door inside `LessonVideoDialog`. What stays: every existing record, every fold,
every number. What it costs: one migration-free change to one dialog, plus a decision about what
*Find a video* does when the video was never planned. The reason it is not built here is that it
decides where a minute lives, and `UX-206` / `208` / `209` / `284` — the day-budget cluster the owner
has said goes **last** — read the same three sources.

### Proposed shape for `UX-362` (not built)

**The name at the top becomes the control, or stops looking like one.** Two ways, and they are not
equal. (a) `ContextBar`'s chip renders the shared `components/ChildSwitcherChip` — which already
exists, already has the read-only variant, already gates on capability rather than a name, and is
already held behind `CHILD_SWITCHER_ENABLED`. The in-page `ChildSelector` stays; the two move
together because both read `useActiveChild`. That is small, and it is blocked on `UX-329`'s successor
deciding to flip the constant. (b) Until then, the honest half: the chip stops being styled as a
tappable chip. That is a one-line change and it is the half this run would have made if the component
were Today's own — but `ContextBar` lives in `components/`, and restyling it is a decision about the
app's chip vocabulary rather than about Today. Either way, moving the `ChildSelector` above the week
ribbon is a separate question and the owner has said the in-page selectors stay.

---

## 7 · What I did NOT check, and why

- **The app in a browser.** No dev server, no screenshots, no device. Every layout claim in §3 is
  **structural** — what renders above what, read from the component tree — and is labelled as such.
  FEAT-208 measured pixels; this did not.
- **Live Firestore.** No credentials in this container, as in AUDIT-218. Nothing here is inferred
  from a record nobody opened.
- **The day budget.** `UX-206` / `208` / `209` / `248` / `252` / `253` / `284` are one owner-led piece
  of work and the owner has said it goes last. The `4.8h/day` chip and the red `330m / 288m` are
  untouched, deliberately. No Today control was found showing a computed number where a decision
  belongs beyond that cluster.
- **`KidTodayView`'s game surfaces** — the armor gate, the Workshop cards, Banner Rally, the
  celebration. Excluded by the run prompt; they are FEAT work, not a walk.
- **`TodayChecklist`'s routine sub-components** (`ReadingRoutineItems`, `MathRoutineItems`,
  `SpeechRoutineItems`, `RoutineSection`) were read for their write paths and not walked as surfaces.
  They render for a day whose `blocks` carry routines; whether any current plan produces one was not
  established, and is the first thing a walk of them should settle.
- **Whether `CHILD_SWITCHER_ENABLED` should now flip.** `UX-329` is closed and this run closes the two
  Today rows it left open, but two P2s elsewhere in the census are still open and the flip is the
  owner's decision, not a side effect of a walk.

---

## 8 · Verification

- `npx tsc -b` clean · `npm run lint` — 0 errors, 3 warnings, all pre-existing in
  `useQuestSession.ts` / `EvaluateChatPage.tsx`
- `npx vitest run` — **637 files, 9072 passed, 1 skipped, 0 failed**
- `npm run census:child-switch` — `census problems: 0`
- `node scripts/check-docs-alignment.mjs` — HARD checks pass
- New tests: `todayScope.test.ts` (11) · `chapterSaveOutcome.test.ts` (6) ·
  `useDayLog.wrongTarget.test.tsx` (6) · `useBookProgress.reporting.test.tsx` (6) ·
  `LessonVideoDialog.childSwitch.test.tsx` (5) · `useRolloverUnchecked.readFailure.test.tsx` (4) ·
  `ChapterQuestionPool.failedRead.test.tsx` (3) · `todayScopeWiring.source.test.ts` (7) ·
  `chapterSaveControlFlow.test.tsx` (5, round 1) · `KidCaptureForm.partialSave.test.tsx` (4, round 1)
- **Positive controls, run and recorded.** Removing the `composedFor !== docId` guard fails 2 of the 6
  `useDayLog.wrongTarget` cases; removing `LessonVideoDialog`'s identity effect fails 2 of its 5;
  removing `handleSaveNote`'s `if (!outcome.ok)` guard fails 1 of the 5 control-flow cases; collapsing
  `KidCaptureForm`'s two failure sentences back onto one fails 2 of its 4. Each new file's header names
  its own control.

### Round 1's two findings, and what they say about the shape of this work

Both were **on the fixes, not on the code they fixed**, and both were the same species: *adding a
report changed a control flow that something else was relying on.* Converting a rejection into an
outcome disarmed the `catch` blocks that were keeping a child's recording; writing one honest sentence
for a two-step save made it dishonest for the half that half-succeeded. Neither is visible from the
diff of the thing being fixed — you have to read the callers, which is the same reason this page needed
a walk rather than another targeted run.
