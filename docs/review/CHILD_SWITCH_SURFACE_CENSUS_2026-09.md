# Child-switch surface census — 2026-09-10 (UX-329)

**Every mounted editor a change of `activeChildId` can re-target, what it does about it, and why.**

Run: `AUDIT-222`. Ledger row: `UX-329` (opened by FIX-220's Codex round 5, closed by this run).
Owner decision, 2026-09-09: *shell rule, all surfaces classified, the P1s fixed.*

---

## 1. Why this document exists

`UX-324` made the active child changeable from the app shell. Five Codex rounds on PR #1817 then found
**the same class of defect in a different mounted editor each time**: a generated story re-filed under
the newly-selected child, a Workshop wizard following the switch instead of staying with the child it
started for, a dirty goal stack saved onto another child's record, a creative timer crediting its
minutes to whoever was active when it stopped. Six were fixed, one per round. Round 5 named three more
and said the honest thing:

> five rounds have each found more, the per-surface answers are each different, and bounding this
> needs a rule at the shell rather than another patch.

The reason it was found one round at a time is that **nothing in the repo knew the list existed**. A
seventh surface could join it tomorrow and nothing would notice. So this document is a **registry**,
not a report: it is derived from the source by a committed script, and a test fails when a surface
joins the class without declaring what a switch means for it.

**It is not a claim that the class is closed.** It is a claim that the class is now *enumerated*, that
each member has an answer on record, and that the next member cannot arrive silently.

## 2. How to read it, and how to keep it

- The registry is the **table in §5**. One row per derived candidate, six columns, **no blank cells**.
- The candidate set is derived by `src/test/childSwitchSurfaces.ts` and printed by
  `npm run census:child-switch`. Every number in this document is that script's output, pasted.
- `src/test/childSwitchSurfaces.invariant.test.ts` fails when a candidate has no row, when a row names
  a file that no longer exists **or one that is no longer a candidate**, when a row is malformed or has
  a blank cell, when a verdict is not one of the five **or names one without saying why**, and when the
  table parses to nothing at all. The last three were added by review rounds on this PR — the guard's
  own gaps were the most valuable findings it produced.
- **Adding a surface?** Add its row in the same PR. That is the point: a verdict is declared when the
  surface is written, not when a reviewer finds it.

The **Verdict** column states what the surface does today where it is settled, and what it **must do**
where the row is still open — an open row names its ledger id in the Severity column.

**`DOC-25` unblocks three of the P1s this document filed.** `UX-336`, `UX-339` and `UX-340` each read
*FILE, DO NOT FIX* because their fix touches `xpLedger`, `hours`, `skillSnapshots` or
`hoursAdjustments` — rails that were propose-and-confirm without exception when §7 was written. The
owner's 2026-09-10 decision (`CLAUDE.md` › **Attribution-only fixes are pre-authorised**) pre-authorises
a change that alters only **whose** a record is, so those three no longer wait on a decision; their
verdicts, severities and rows are unchanged, and `FIX-223` is the run that implements them.

## 3. The five verdicts

This vocabulary is the run's main product. *"The per-surface answers are each different"* is true, and
the answers repeat — they just had no names, so each round re-derived one from scratch.

| Verdict | The work is… | So the surface… | Precedent |
|---|---|---|---|
| **BIND** | unsaved and expensive to recreate | binds the **write** to the identity the work was created under, and says so before the tap | `CreateSightWordBook` (a generated story cost a paid call); `useCreativeTimer.ownerChildId` |
| **HIDE** | already persisted under its own child | stops rendering for the new child and is restored on switching back — nothing is written, so nothing is lost | `WorkshopPage` |
| **RESET** | cheap to retype | re-seeds from the new child, clears `dirty`, and **makes the loss visible** | `GoalBuilder`; `QuickAddHours` |
| **GATE** | not readable yet, or the read **failed** | is not editable at all — a failed read is **not** an affirmative empty result | `useBusinessGoal` (Codex round 5) |
| **SAFE** | carried with its own id, or not carried at all | needs nothing — **and the row says why**, with the line that makes it true | most data hooks |

Two rules the vocabulary encodes, both learned the hard way:

1. **The safe default is that persisted work stays with the identity it was started for, and unsaved
   work is re-seeded with the loss made visible** (DOC-24's rail).
2. **An unexplained SAFE is the row that comes back as a P1.** Every SAFE below names the mechanism —
   a document id, a captured ref, a gate its host renders, or a capability that makes switching
   impossible.

## 4. The numbers

All derived. `npm run census:child-switch`, **as AUDIT-222 ran it on 2026-09-10**. The paragraphs
below do arithmetic on this block, so it is kept exactly as it was read; the current reading follows
it.

```
source files scanned (non-test, under src/, excluding src/test/): 752
files reading useActiveChild: 69
candidates: 94 (hook arm 42, prop arm 52)
files rendering an in-page <ChildSelector>: 8
feature files referencing setActiveChildId (any in-page child control): 13
census rows: 94
by verdict: {"BIND":6,"HIDE":3,"RESET":19,"GATE":10,"SAFE":56}
by severity: {"P1":5,"P2":6,"P3":3,"—":80}
```

Read that as: **94 surfaces classified**, **56 SAFE with a stated reason**, and **38 that a switch
genuinely reaches and that therefore had to decide something**.

The verdict tally counts the **prescribed** answer, so a row reading *"GATE needed"* is counted as a
GATE; the **Severity** column is what separates settled from open, and the two tallies are the same
split seen from either side. Doing the arithmetic on the block above: `94 − 56 SAFE = 38` deciding
rows; `5 P1 + 6 P2 + 3 P3 = 14` of them are **open**; `38 − 14 = 24` need no further work, of which
**4 are fixed in this run** (`RecordsPage`, `SaleEntryForm`, `KitBuilderForm`, `CertificateScanSection`)
and **20 were already answered** — the six PR #1817 fixes plus fourteen surfaces whose hosts already
gate or re-key them. The 80 dashes in the severity tally are the 56 SAFE rows plus those 24.

### Re-derived 2026-09-11 (AUDIT-228)

Same command, on Today's walkthrough branch. Pasted, not retyped:

```
source files scanned (non-test, under src/, excluding src/test/): 765
files reading useActiveChild: 69
candidates: 94 (hook arm 42, prop arm 52)
files rendering an in-page <ChildSelector>: 8
feature files referencing setActiveChildId (any in-page child control): 13
census rows: 94
by verdict: {"BIND":6,"HIDE":3,"RESET":18,"GATE":10,"SAFE":57}
by severity: {"P1":0,"P2":4,"P3":2,"—":88}
census problems: 0
```

Three things moved, and none of them is the candidate set — still **94**, still every row filled.

- **`P1: 5 → 0`** happened on `main` before this run: `FIX-223` implemented `UX-336` / `UX-339` /
  `UX-340` under `DOC-25`'s attribution-only authorisation, and `FIX-220`'s remaining rows closed with
  them. The block above was simply never re-pasted, which is the ordinary way a derived number goes
  stale and the reason this section now carries a date.
- **`P2: 6 → 4`, `P3: 3 → 2`** are this run: `UX-342` (`LessonVideoDialog`, the `hours` rail) and
  `UX-343` (Today's dialog stack, and `useUnifiedCapture` with it) are fixed, so three rows lose their
  ledger id.
- **`RESET: 19 → 18`, `SAFE: 56 → 57`** is the one verdict that genuinely changed rather than settling:
  `useUnifiedCapture` was prescribed RESET on the reading that its writes take the live `childId`. They
  do not — `handleUnifiedCapture` is a `useCallback` over `childId`, so an invocation already running
  keeps the child it was tapped for, and every collection it writes comes from that closure. Its one
  shared write was the day-log lane, and `UX-357` closes that at the lane. The row is **SAFE with the
  line that makes it true**, which is what rule 2 above demands of every SAFE.

**Three of those SAFE rows were wrong, and a review round found them (`UX-344`, `UX-345`).** They are
the reason rule 2 above is written the way it is, so they are corrected in place rather than quietly
edited: `useSkillMap` (I checked `updateSkillMap`, which has no caller, and missed `updateNodeStatus`,
which `LearningMap` calls), `LearningMap` (the document *reference* is rebuilt from the live child;
the *payload* is the previous child's whole skill map) and `useDailyPlan` (the row named the loaded
document as the only thing carried over and then dismissed it — it is spread into the write). All
three were re-filed as GATE P1s and are now fixed. **A registry whose SAFE rows are wrong is worse
than no registry**,
which is this document's own thesis turned on itself; the corrections are the most important lines in
it.

**The candidate set grew from 80 to 94 during review**, and that is the most useful thing in this
document. Codex round 1 on PR #1820 found the first heuristic silent on `CertificateScanSection`,
which holds a scanned certificate awaiting Confirm and delegates its `activityConfigs` /
`skillSnapshots` write through a **positional** argument (`applyUpdate(familyId, activeChildId,
pendingResult)`) rather than an object field. So the census reported green over a live P1 — the
`[ledger-shape]` failure mode this guard was explicitly built to avoid, reproduced on its first
outing. The heuristic gained a positional-argument arm rather than that one file being added by hand,
which cost 14 more rows, all SAFE or already answered.

**What is still open after `FIX-223`: 11 items under 10 ids.** Nine are the registry rows the block
above counts (`6 P2 + 3 P3`) and two are §5b second-editor rows the script cannot see (`UX-334`,
`UX-337`) — `UX-340`, the third of those, is fixed. The ids are `UX-331`, `UX-332`, `UX-333`,
`UX-334`, `UX-335`, `UX-337`, `UX-338`, `UX-341`, `UX-342`, `UX-343`; ten ids for eleven items,
because `UX-343` covers two registry rows — `TodayPage` and the capture hook mounted inside it, which
are the same dialog stack on the same page. (`AUDIT-222` filed 14 items under 13 ids, and `UX-344`
covered the `useSkillMap` / `LearningMap` pair, one defect seen from the hook and from its only
caller.)

The two arms are how the surface comes by the identity it writes with — `useActiveChild` directly
(**hook**, 42) or a `childId` handed down by a caller (**prop**, 52). Both are in the class: the
switch reaches a prop-threaded editor **through** its parent, and two of this run's four fixes
(`SaleEntryForm`, `KitBuilderForm`) are prop-arm surfaces that a hook-only heuristic could not see.

**The header switcher is currently OFF** (`CHILD_SWITCHER_ENABLED === false`, UX-330), so the shell
route into these surfaces is closed today. It is not the only route: **8** pages render an in-page
`<ChildSelector>` and **13** feature files hold some in-page child control, and every defect on a page
with one of those is reachable **right now**. That is why the fixes in this run are not deferred until
the constant flips back.

## 5. The registry

| Surface (file) | Child-scoped state it holds | What it writes, and to which collection | Reachable by a switch today? | Verdict | Severity |
|---|---|---|---|---|---|
| `src/components/ChildSelector.tsx` | one add-child dialog flag | nothing — it calls `onSelect`, and its avatar icon is a read | It **is** the switch (8 pages) | **SAFE** — the control itself holds no child-scoped draft; the dialog boolean survives a selection and means the same thing either way | — |
| `src/components/ChildSwitcherChip.tsx` | one menu anchor element | nothing — a source scan already pins that it writes no Firestore document | It **is** the shell switch (off since UX-330) | **SAFE** — the anchor is a DOM node for a menu, not child-scoped state, and the chip's whole job is to call `setActiveChildId` | — |
| `src/components/CreativeTimer.tsx` | a picked subject and a save flag around `useCreativeTimer` | delegated — `useCreativeTimer` writes `hours` | Selector (mounted on several pages) | **BIND** — the hook carries `ownerChildId` from `startTimer` (UX-327), and this host already renders `timerOwnerDiffers(state.ownerChildId, activeChildId)` so a running timer names the child its minutes will go to | — |
| `src/components/DebugPanel.tsx` | a minimised flag and a service-worker status string | nothing — it is a read-only diagnostic overlay | Everywhere it is mounted | **SAFE** — it renders `activeChildId` as text and writes nothing anywhere | — |
| `src/core/curriculum/useSkillMap.ts` | the loaded `ChildSkillMap` for the `childId` prop | `childSkillMaps/{childId}` — create-if-missing on read, plus an `updateSkillMap` writer | Selector (via `LearningMap` on Progress) | **GATE** — this row was **wrong**, and Codex round 4 caught it: I checked `updateSkillMap` (which genuinely has no caller) and missed `updateNodeStatus`, which `LearningMap` calls. `skillMap` was not cleared on a `childId` change, and a rejected `getDoc` escaped the load's only `catch` while `finally` still cleared `isLoading` — so the next status edit spread `...skillMap?.skills` into a `setDoc` on the **new** child's document. Now: the map is dropped **during render** on a target change, an outer `catch` records `loadFailed`, and `updateNodeStatus` refuses unless `skillMapIsEditable` — the shared `core/hooks/childScopedGate` rule, one definition with `useDailyPlan`. Fixed by FIX-223 (UX-344) | — |
| `src/core/hooks/useActivityConfigs.ts` | the child's `ActivityConfig[]` | `activityConfigs` — `updateDoc`/`deleteDoc` by document id; the seeder is keyed on `childId` | Selector (Curriculum, Planner, Today) | **SAFE** — every write addresses a document **by its own id**, so a stale row edits the document it names and never the live child | — |
| `src/core/hooks/useCertificateProgress.ts` | a computed `CertificatePreview` | `activityConfigs` + `skillSnapshots` via `applyCertUpdate(familyId, childId, …)` | Selector (Curriculum) | **SAFE** — every entry point takes `childId` as an argument; the preview's owner is captured by the caller (`CurriculumTab`'s `certConfirm.childId`), not read live at Confirm | — |
| `src/core/hooks/useCreativeTimer.ts` | a running timer session (start time, subject, note) | `hours` — one entry per stopped session | Selector (several pages) | **BIND** — `ownerChildId` captured at `startTimer`, restored by `resumePersistedTimer`, resolved through `creativeTimerOwner.ts` (UX-327) | — |
| `src/core/hooks/useScan.ts` | `scanResult` / `error` for the last scan | `scans` — one record per scan | Selector (Curriculum, Today) | **SAFE** — `scan(file, familyId, childId)` takes its child as an argument and writes the record it just built; no draft is held between the call and the write | — |
| `src/core/hooks/useTranscription.ts` | the last transcript result | `children/{childId}/transcriptionEvents` | Selector (several) | **BIND** — `lastChildIdRef` is stamped inside `transcribe()` and `updateFinalText` resolves the document through it, never through the current props | — |
| `src/features/avatar/AvatarPhotoUpload.tsx` | a staged photo preview awaiting "extract features" | `avatarProfiles/{childId}` + one paid `extractFeatures` call against the art quota | Selector (Hero Hub's own child chips) | **RESET** needed — a staged photo survives the switch and `handleExtract` reads the live `childId` prop, so one boy's photo can seed the other's avatar and spend his quota | P2 · `UX-331` |
| `src/features/avatar/MyAvatarPage.tsx` | tuner state (`localProportions`, `heroAnimationTuning`, `armorDebugValues`) and a captured `screenshotData` | `avatarProfiles`, `dailyArmorSessions`, `artifacts`, `xpLedger` (via `addXpEvent`) | Selector (its own child chips, line 1361) | **RESET** needed — the tuner draft and the screenshot outlive the switch while `saveProportions` / "save to portfolio" read the live `childId` | P2 · `UX-332` |
| `src/features/avatar/stonebridge/StonebridgeMissionCard.tsx` | one `villageOpen` boolean | nothing — it renders `useStonebridgeProgress` | Selector (Hero Hub) | **SAFE** — holds no child-scoped state and performs no write; matched only because its props interface declares `childId: string` (a deliberate over-match, §6) | — |
| `src/features/avatar/stonebridge/useStonebridgeProgress.ts` | derived reading + progress snapshots | `stonebridgeProgress/{childId}` | Selector (Hero Hub) | **SAFE** — the write is guarded by `expectedKey` (`${familyId}_${childId}`), which is recomputed with the props, so a snapshot from the previous child cannot be written under the new one | — |
| `src/features/books/BookEditorPage.tsx` | the open book's pages, images and finish-dialog draft | `books/{bookId}`, `stickerLibrary` | Shell only (Books has no selector) | **SAFE** — every write is scoped to the **book** being edited, which carries its own `childId`; the one `stickerLibrary` write is family-scoped | — |
| `src/features/books/BookGenerateChat.tsx` | chat composer text | delegated to `useBookGenerateChat` | Shell only | **SAFE** — `useBookGenerateChat` persists a draft book as soon as a story exists and every later save keeps that stored `childId`; before that there is no document to mis-file | — |
| `src/features/books/BookReaderPage.tsx` | page index, reading timer, words encountered | `hours` + `artifacts`, both stamped `book.childId` | Shell only | **SAFE** — the reader's writes read `book.childId`, the document's own field, not the header | — |
| `src/features/books/BookshelfPage.tsx` | shelf filters, a new-book title and cover style, a resume target | `books` via `createBook` / `deleteBook` | Shell only, plus its own draft-resume switch | **SAFE** — the new-book dialog's `createBook` runs from its own submit with the child read at that moment, and a resume routes through `planDraftResume`, which switches the header to the draft's child **before** the chat mounts (FEAT-188). Filters reach no write | — |
| `src/features/books/CreateSightWordBook.tsx` | a generated story held only in local state | `books` — the published book | Shell only | **BIND** — `draftChild` captured when the story is generated; both write paths save to it, with `difficulty` riding along, and `inFlightDraftNotice` says so above the buttons (UX-324 round 1) | — |
| `src/features/books/DrawingGroupCard.tsx` | rename / delete / re-style draft for a sticker group | `stickerLibrary` — partial updates by document id | Shell only | **SAFE** — stickers are family-scoped and every write addresses a sticker by its own id | — |
| `src/features/books/MakeStickerDialog.tsx` | a generated sticker awaiting save | `stickerLibrary` — `childId: null` by construction | Shell only | **SAFE** — the write stamps `childId: null`; a sticker belongs to the family, so there is no child to mis-target | — |
| `src/features/books/SightWordDashboard.tsx` | one selected word | `sightWordProgress` via `confirmMastery` | Shell only | **SAFE** — `confirmMastery` is `useSightWordProgress`'s writer, which rebuilds the document id from the `childId` it currently holds; the selected word is a word, not a child-scoped draft | — |
| `src/features/books/SketchScanner.tsx` | a captured sketch, its cleaned and fancy versions | `stickerLibrary` — `childId: null` by construction | Shell only | **SAFE** — same as above; the `profile` field it does write is a picker the person sets, not the active child | — |
| `src/features/books/useBackgroundReimagine.ts` | a running reimagine job and its result | `stickerLibrary` + `artifacts`, stamped with the `childId` prop | Shell only | **RESET** needed — a finished job's "save this" survives a switch and the artifact is stamped with the live prop | P3 · `UX-333` |
| `src/features/books/useBook.ts` | the open book, save state | `books`, `hours`, `artifacts` | Shell only | **SAFE** — every write reads `book.childId` from the loaded document; `useBookshelf`'s `createBook` takes the `childId` it was called with | — |
| `src/features/books/useBookGenerateChat.ts` | chat history, current story, level stretch, theme | `books/{bookId}` | Shell only | **SAFE** — a draft book is persisted as soon as a story exists and `bookId` pins every later write; the resume path reads the document's `childId` (FEAT-188) | — |
| `src/features/books/useSightWordProgress.ts` | the child's word progress map | `sightWordProgress/{childId}_{word}` | Selector (Books, Progress) | **SAFE** — the document id is built from the `childId` the hook was called with at the moment of the write, and the map is re-read on a prop change | — |
| `src/features/business/GoalBuilder.tsx` | a dirty milestone stack the parent is editing | `businessGoals/{childId}` | Shell only (Business has no selector) | **RESET** — a child change wins over `dirty`: re-seed, clear `dirty` (which disables Save), and say the unsaved changes weren't kept (UX-324 rounds 3–4) | — |
| `src/features/business/KitBuilderForm.tsx` | a typed kit roster — vault, hero, defenders, invaders, verbatim | `kitRosters` — one new roster per save | Shell only | **BIND**, quota included — `boundChildId` captured at mount, the save stamps it, and the form says *"This kit will be saved for …"* first; `KitBuilderSection` now reads `useArtQuota` from the **roster's** owner, since art generated onto one boy's kit was spending his brother's weekly allowance (Codex round 3). Fixed here (UX-329) | — |
| `src/features/business/SaleEntryForm.tsx` | a picked preset, an amount, a date, a note | `businessLog` via `onLogSale`, which feeds the goal thermometer | Shell only | **RESET** — a pending sale is an intent; the form clears, the Log button goes dead, and the notice names whose sale was dropped — including when the only thing changed was the **date**, which the reset also puts back (Codex round 2). Fixed here (UX-329) | — |
| `src/features/business/useArtQuota.ts` | this week's count for one child | `artQuota/{childId}-wk-{weekStart}` | Selector (several) | **SAFE** — the document id is recomputed from the current `childId` on every render and the `increment(1)` write goes to that id; a stale count is re-read, never written | — |
| `src/features/business/useBusinessGoal.ts` | the loaded milestone stack | `businessGoals/{childId}` | Shell only | **GATE** — milestones are cleared before the new subscription opens, and a **failed** read renders a non-editable line rather than an empty stack (UX-324 rounds 4–5) | — |
| `src/features/business/useBusinessLog.ts` | the family's sale entries | `businessLog` — append via `addDoc`, edits by document id | Shell only | **SAFE** — `addSale` writes `sale.childId` from its argument (the caller's bound value) and every mutation addresses an entry by its own id | — |
| `src/features/business/useKitRosters.ts` | the child's rosters, a `trackedChild` marker | `kitRosters` — `addDoc` with the caller's body, `updateDoc` by id | Shell only | **SAFE** — `createRoster` writes `roster.childId` verbatim from the form's bound value; `trackedChild` already resets `loading` on a child change so a stale list is never presented as settled | — |
| `src/features/dad-lab/LabReportForm.tsx` | a whole lab report draft, per-child role text, beats | `dadLabReports`, `artifacts` | Shell only (Dad Lab has no selector) | **SAFE** — Dad Lab is whole-family (DATA-04): the report carries no `childId`, role text is keyed by **every** child in `children`, and each artifact is stamped from the child the row belongs to, never the active one | — |
| `src/features/evaluate/EvaluateChatPage.tsx` | a live evaluation session — messages, findings, recommendations | `evaluationSessions`, `skillSnapshots`, `childSkillMaps`, `learnerModels`, `hours` | Selector (its own `ChildSelector`) | **GATE** — the child-change effect sets `initializing` synchronously and the entire body, Apply included, renders behind it until the new child's sessions land | — |
| `src/features/evaluate/MasteryCheckoffPanel.tsx` | a `saving` flag and a note | `skillSnapshots` via `commitMasteryRollup(familyId, childId, …)` | Selector (Skill Snapshot) | **SAFE** — its host nulls `snapshot` on a child change and gates the whole editable tree behind it, so this panel unmounts and remounts with the new child's data | — |
| `src/features/evaluation/SkillSnapshotPage.tsx` | the loaded `SkillSnapshot` | `skillSnapshots/{activeChildId}` | Selector (its own `ChildSelector`) | **GATE** — `snapshotChildId` is compared during render and `snapshot` is nulled on a change; the page then renders *"Loading skill snapshot…"* and every editor below it is unmounted | — |
| `src/features/evaluation/WorkingLevelsSection.tsx` | an open level editor — level, evidence note | `skillSnapshots/{childId}.workingLevels` | Selector (Skill Snapshot) | **SAFE** — unreachable across a switch: its host's `{!snapshot ? … : …}` gate unmounts this section on the child change and remounts it with fresh state | — |
| `src/features/foundations-review/FoundationsReviewLauncher.tsx` | which session is open (`{childId, childName, domain}`) | nothing — it opens `FoundationsReviewSession` | Selector (Foundations tab) | **SAFE** — the open session carries the `childId` it was launched with in its own state object, so the session below it is already bound | — |
| `src/features/foundations-review/FoundationsReviewSession.tsx` | a message draft, staged uploads | delegated to `useFoundationsReview` | Selector (Foundations tab) | **SAFE** — the session is mounted with an explicit `childId` from the launcher's state, not from the header | — |
| `src/features/foundations-review/useFoundationsReview.ts` | the review transcript, pending actions | `learnerReviewSessions/{childId}_{domain}`, `learnerModels/{childId}` | Selector (Foundations tab) | **SAFE** — `applyAction` refuses outright when `action.childId !== childId`, so a card built for one child cannot be confirmed against another | — |
| `src/features/monthly-review/DiagnosticPanel.tsx` | an audit result | nothing — a callable read | Shell only | **SAFE** — every call is keyed on `review.childId`, the document's own field | — |
| `src/features/monthly-review/GenerateNowDialog.tsx` | a picked child and month | `monthlyReviews` via the generate callable | Shell only | **SAFE** — the child is the dialog's **own** `useState` picker, seeded once from `defaultChildId` and thereafter set only by the person; the header does not reach it | — |
| `src/features/monthly-review/KidBooksAboutMePage.tsx` | the child's published review books | nothing — a read-only query | No — kid-facing page | **GATE** — `lastChildId` is compared during render and the list is emptied with `loading` set back to true, so one child's books are never shown under another's name | — |
| `src/features/monthly-review/MonthlyBooksTab.tsx` | a child filter, a generate-dialog flag | delegated to `GenerateNowDialog` | Selector (Progress) | **SAFE** — the filter is the tab's own control (defaulting to *all*), and the only write is the dialog's, which carries its own picked child | — |
| `src/features/monthly-review/MonthlyReviewReader.tsx` | reader mode, page index, publish dialog | `monthlyReviews` via publish/unpublish callables | Shell only | **SAFE** — publish targets `review.childId` and `review.month` from the loaded document | — |
| `src/features/planner-chat/PlannerChatPage.tsx` | a whole draft week, the chat transcript, day types | `days`, `weeks`, `plannerConversations`, `dailyPlans`, `lessonCards`, `artifacts` | Selector (its own `ChildSelector`) | **RESET** — `conversationDocId` is keyed on `(weekStart, childId)` and the subscribe effect clears `messages` / `currentDraft` / `dayTypes` / `applied` / `setupComplete` before resubscribing (FEAT-112's clear covers the child too) | — |
| `src/features/planner/TeachHelperDialog.tsx` | a loaded snapshot + lesson card for one item | `lessonCards` | Selector (Today) | **SAFE** — `lessonCardKey` is `${childId}:${item.id}:${item.lessonCardId}` and every load and write is guarded on it, so a stale card cannot be saved under a new child | — |
| `src/features/progress/AddActivityDialog.tsx` | a typed new activity — name, type, subject, minutes, cadence, position | `activityConfigs` — a new row via `onAdd` | Selector (Curriculum) | **RESET** needed — the form does not reset on a `childId` change and `handleAdd` stamps the live prop, so a typed activity can be created for the sibling | P2 · `UX-335` |
| `src/features/progress/ArmorTab.tsx` | a typed XP award — amount, reason, type | `xpLedger` via `addXpEvent`, plus armor unlocks | Selector (its own child chips) | **RESET** — the award form survived the switch and `doAward` reads the live `childId`. `formChildId` is now compared during render, the draft is cleared through `armorAwardOwnership.ts`, the **Correction** confirm dialog is closed with it (its own button calls `doAward` directly), and an `Alert` names both boys. It **prevents** a write rather than changing one, so no `xpLedger` write path changed — `DOC-25` attribution-only, all four terms in PR #1823. Fixed by FIX-223 (UX-336) | — |
| `src/features/progress/CertificateScanSection.tsx` | a scanned certificate result awaiting Confirm, plus its preview | `activityConfigs` + `skillSnapshots` via `applyUpdate(familyId, activeChildId, pendingResult)` | Selector (inside `CurriculumTab` since UX-326) | **RESET** — `scanChildId` is compared during render; the pending result and preview are dropped and the parent is told to scan again, **and a run token discards a scan that completes after the change** (Codex round 3: `useScan` sets its result unconditionally, so an in-flight scan repopulated after the switch and reached `syncScanToConfig` with the new child's id — `WorkshopPage`'s round-4 defect on another surface). Fixed here (UX-329) — it **prevents** a write rather than changing one, so the `skillSnapshots` lane is untouched | — |
| `src/features/progress/CurriculumTab.tsx` | staged scan pages, a strand-session draft, a certificate confirm | `activityConfigs`, `scans`, `skillSnapshots`, `childSkillMaps`, `artifacts` | Selector (its own `ChildSelector`) | **RESET** — `stagedChildId` is stamped at staging time, a switch drops the batch with one line saying so, the write path guards on it again, and a switch **during** a batch discards the completion (UX-275) | — |
| `src/features/progress/DispositionProfile.tsx` | an inline narrative override being typed, the AI `result` | `children/{activeChildId}.dispositionOverrides` | Selector (its own `ChildSelector`) | **RESET** — the child-change effect clears `overrides` and `editingKey`, and `handleEditSave` returns early without an `editingKey`, so the cross-child write is unreachable | — |
| `src/features/progress/FoundationsDiagPanel.tsx` | per-child loading / error / model state | `learnerModels` via `bootstrapLearnerModel('reseed')` | Selector (Foundations tab, `?diag=1`) | **SAFE** — every piece of its state is a map **keyed by `childId`** and each action takes the child id of the row whose button was tapped | — |
| `src/features/progress/FoundationsTab.tsx` | an open concept drawer, an override selection | `learnerModels/{activeChildId}` via `writeReviewAction` | Selector (its own `ChildSelector`) | **SAFE** — the override refuses when `action.childId !== activeChildId`, and the action is built from the same `childId` the drawer was opened under | — |
| `src/features/progress/WordWall.tsx` | a selected word, a multi-select set | nothing — it navigates; the write is `useWordWall`'s | Selector (Progress) | **SAFE** — a selection reaches no write on this surface; the navigation carries `childId` explicitly | — |
| `src/features/progress/learning-map/LearningMap.tsx` | a domain tab and a selected node | `childSkillMaps` via `useSkillMap.updateNodeStatus` | Selector (Progress) | **GATE** — this row was **wrong** (Codex round 4). The document *reference* is rebuilt from the live `childId`, which is what I checked; the *payload* was not — `useSkillMap` handed over the previous child's `skills` map, so one child's whole skill map could be written onto the other's document. The hook is now gated, and this host renders `skillMapGateNote` and passes `onUpdateStatus` only while the map is writable, so the drawer shows **no** status buttons rather than buttons that silently do nothing. Fixed by FIX-223 (UX-344) | — |
| `src/features/progress/useWordWall.ts` | the child's word list, a filter | `children/{childId}/wordProgress/{word}` | Selector (Progress) | **SAFE** — the document path is rebuilt from the current `childId` at the moment of the write, and the list is re-read on a prop change | — |
| `src/features/quest/KnowledgeMinePage.tsx` | which domain is open, a resumable session | `evaluationSessions` — marks a session abandoned | Shell only | **RESET** needed — the resume card holds the previous child's session while the page reads the live child | P3 · `UX-338` |
| `src/features/quest/useQuestSession.ts` | a **running quest** — questions, answers, findings, fluency state | `evaluationSessions`, `skillSnapshots`, `hours`, `xpLedger`, `days`, `wordProgress` | Shell only | **BIND** — a quest in flight survived a switch and `endSession` wrote every one of those against the live child, while `bankAnswerReward` had already banked diamonds under its owner. The owner is captured at `startQuest` (and restored from the document a resume reopens) and resolved at the **top** of the hook through `questSessionOwner.ts`, so all thirty write sites follow the session rather than the header; the quest screen names whose it is before the last question. **No number changed** — the 5-minute hours bucket, its floor, `XP_PER_DIAMOND` and the 15-XP bonus are pinned by test with a positive control (`DOC-25` attribution-only, all four terms in PR #1823). Fixed by FIX-223 (UX-339) | — |
| `src/features/records/ChapterResponsesTab.tsx` | a pending delete confirmation | `chapterResponses`, `artifacts` — deletes by document id | Selector (Records) | **SAFE** — the confirmation holds the response object itself and both deletes address documents by their own ids | — |
| `src/features/records/DataReviewExportPanel.tsx` | per-child export state | nothing — it builds a file to download | Shell only (Progress, `?diag=1`) | **SAFE** — the state is a map **keyed by `childId`** and every build takes the id of the row whose button was tapped | — |
| `src/features/records/EvaluationHistoryTab.tsx` | the loaded sessions and a selected one | nothing — read-only history | Selector (Records) | **GATE** — `loadedKey` is `${familyId}:${activeChildId}` and the list is not rendered as this child's until the key matches, so one child's sessions are never shown under another's | — |
| `src/features/records/PortfolioPage.tsx` | a selection of artifacts for export | `artifacts` — one sketch upload | Selector (Records) | **SAFE** — the sketch write runs from the file picker's own change event with no draft held; `selectedIds` drives an export and reaches no write | — |
| `src/features/records/QuickAddHours.tsx` | a picked activity and duration, a session receipt | `hours` — one entry per log | Selector (Records) | **RESET** — `formChildId` is compared during render; the selection and the receipt are cleared, and both the button and the receipt name the live child (UX-328) | — |
| `src/features/records/RecordsPage.tsx` | a typed historical-hours draft — a month and five subject figures, or a month range and a daily rate | `hoursAdjustments` — **one document per subject per month** | Selector (Records) | **RESET** — `hoursFormChildId` is compared during render, the draft is cleared through `historicalHoursOwnership.ts`, Save goes dead, and an `Alert` names both children. Fixed here (UX-329) | — |
| `src/features/settings/AvatarAdminTab.tsx` | typed XP / diamond amounts, a reason, pending regenerations | `avatarProfiles`, `xpLedger`, `dailyArmorSessions`, `children` | Selector (its own child chips) | **RESET** needed — the same shape as `ArmorTab`, on an admin surface. **Not fixed here:** `xpLedger` is propose-and-confirm | P2 · `UX-341` |
| `src/features/settings/DevAdminTab.tsx` | scan results, selected document ids, backfill results | `chapterBooks`, `weeks`, `bookProgress`, plus admin deletes | Shell only (admin-only tab) | **SAFE** — every destructive action addresses documents by the ids it just listed; the one `selectedChildId` use is the chapter-pool generator, which re-reads on each run | — |
| `src/features/settings/SoftProfileSection.tsx` | a typed draft per child — motivators, interests, strengths, birthdate, grade | `children/{childId}` via `updateChildIdentity` / `updateChildSoftProfile` | Shell only (Settings) | **SAFE** — `drafts` is a map **keyed by `childId`** and `save(childId)` takes the id of the row being saved, so it edits every child side by side and never follows an active one | — |
| `src/features/settings/StickerLibraryTab.tsx` | edit / delete / print / make-version drafts | `stickerLibrary` — partial updates by document id | Shell only | **SAFE** — the library is family-scoped and every write addresses a sticker by its own id; no `childId` is written | — |
| `src/features/settings/VoiceInputSection.tsx` | per-child optimistic override map | `children/{childId}.voiceInputEnhanced` | Shell only (Settings) | **SAFE** — the toggle's handler takes the row's own `childId`; it iterates every child rather than reading the active one | — |
| `src/features/shelly-chat/ShellyChatPage.tsx` | the chat transcript, a tab selection | delegated to `useShellyChatActions` | Shell only | **SAFE** — the chat's context `childId` is the tab's own binding, and the tab is what a person picks; it is not the header | — |
| `src/features/shelly-chat/useShellyChatActions.ts` | pending confirm cards | `sightWordProgress`, `children`, `skillSnapshots`, `activityConfigs`, `days`, `watchLibrary`, `conceptArcs`, `dadLabReports` | Shell only | **GATE** — `rejectReason` refuses any action whose `action.childId` is not a family child or does not match `activeChildId`, so a card built under one child cannot be confirmed under another | — |
| `src/features/today/ExplorerMap.tsx` | the set of explored dates | nothing — a read-only subscription | No — `KidTodayView` only | **SAFE** — performs no write, and a kid profile cannot switch child at all (`setActiveChildId` is a no-op) | — |
| `src/features/today/HelpCardStrip.tsx` | a loaded help card, a video-fetch flag | `helpCards/{childId}__{subject}__{label}` | Selector (Today) | **SAFE** — `docId` is recomputed from the current `childId` and the write goes to that id; the loaded card is re-read whenever it changes | — |
| `src/features/today/KidCaptureForm.tsx` | a typed capture — title, content, a file | `artifacts` | No — `KidTodayView` only | **SAFE** — a kid profile's `setActiveChildId` is a no-op, so this form cannot be re-targeted; the `childId` prop is `child.id` from the kid's own view | — |
| `src/features/today/KidChapterPool.tsx` | recorded chapter audio awaiting save | `chapterResponses`, `artifacts` | No — `KidTodayView` only | **SAFE** — same capability answer: a kid profile cannot switch child | — |
| `src/features/today/KidExtraLogger.tsx` | a picked extra activity and minutes | `days` (the day log) + `xpLedger` via `addXpEvent` | No — `KidTodayView` only | **SAFE** — same capability answer: a kid profile cannot switch child | — |
| `src/features/today/KidTodayView.tsx` | choices, captures, celebration state | `days`, `artifacts`, `dailyArmorSessions` | No — kid profiles only | **SAFE** — `TodayPage` returns this view for a kid profile, and a kid profile's `setActiveChildId` is a no-op; every prop below it is `child.id` | — |
| `src/features/today/LessonVideoDialog.tsx` | a picked video, an exclusion list | `hours` — the logged watch entry | Selector (Today) | **RESET** — an identity effect keyed on `childId\|date` clears the pick, the exclusions and the logged confirmation and calls `onClose`, so a video found for one boy can never be logged against the other; the caller's scope notice names it. **No hours arithmetic changed** (`DOC-25`'s four terms; the fold is asserted with a positive control in `LessonVideoDialog.childSwitch.test.tsx`). Fixed by AUDIT-228 | — |
| `src/features/today/TodayPage.tsx` | a strand-session draft, edit-mode move/swap targets, energy and plan type | `days`, `dailyPlans`, `artifacts`, `scans`, `activityConfigs` | Selector (its own `ChildSelector`) | **RESET** — a scope guard keyed on `childId\|date` closes the strand dialog, the move and swap targets and the watch picker, and `todayScope.todayScopeResetNotice` names in words what it closed and who it was for (RESET's second half: make the loss visible); `TodayChecklist` is keyed on the same scope and reports its own four open decisions up so the remount is not silent. Energy and plan type are `GATE`d separately by `useDailyPlan` (`UX-345`). Fixed by AUDIT-228 | — |
| `src/features/today/WeekRibbon.tsx` | one week's day summaries | nothing — a read-only subscription | Selector (Today) | **SAFE** — writes nothing; `subscriptionKey` (`familyId\|childId\|weekStart`) already re-keys the subscription | — |
| `src/features/today/useBookProgress.ts` | the loaded `BookProgress` | `bookProgress/{childId}_{bookId}` | Selector (Today, Planner) | **SAFE** — the document id is rebuilt from the current `childId` at the write, and the subscription resets on a prop change | — |
| `src/features/today/useDailyPlan.ts` | the loaded `DailyPlan` | `dailyPlans/{date}_{childId}` — merge-only | Selector (Today) | **GATE** — this row named the hazard and then **dismissed it wrongly** (Codex round 4). The id is rebuilt from the live `childId`, but `saveDailyPlan` spreads `dailyPlan?.sessions`, and the child-change effect did not clear `dailyPlan` before its `getDoc` — so a toggle in that window wrote the previous child's `sessions` onto the new child's plan under `merge: true`. Now: the plan is dropped **during render** on a target change, and a failed read sets `loadFailed` rather than passing as an empty day (which would have written `sessions: []` over a day that has some — the half of the report that did not hold turned out to be its own defect). `saveDailyPlan` refuses unless `dailyPlanIsEditable`, and `DayStatusRow`'s two controls are dead while it does. Fixed by FIX-223 (UX-345) | — |
| `src/features/today/useUnifiedCapture.ts` | a staged capture — photo, note, which checklist item | `artifacts`, `scans`, `days`, and (parent only) `activityConfigs` / `childSkillMaps` / `skillSnapshots` | Selector (Today) | **SAFE** — and the line that makes it true: `handleUnifiedCapture` is a `useCallback` over `childId`, so an invocation already running when the parent switches keeps the child it was tapped for, and every collection above is written from that closure. Its one shared write is the day-log lane, which since `UX-357` refuses a document composed for another day rather than re-stamping it, and says so. The dialog that opens it is closed by the page's scope guard | — |
| `src/features/watch/useWatchItemCompletion.ts` | which checklist item is being completed | `days` + `artifacts` | Selector (Today) | **SAFE** — the completion writes into `dayLog`, the document the caller passed, and stamps the `childId` of that same day log | — |
| `src/features/watch/useWatchLibrary.ts` | the family's vetted videos, a `trackedChild` marker | `watchLibrary` — `addDoc` / `updateDoc` by id | Selector (Planner, Today) | **SAFE** — the library is family-scoped with a `childId \| 'both'` filter; vetting writes the caller's body and edits address a video by its own id | — |
| `src/features/weekly-review/WeekReflectionCard.tsx` | the parent's answer and note, before Save | `weeklyReviews/{weekKey}_{childId}.reflection` — single-key merge | Selector (Weekly Review) | **GATE** — `seeded` is compared during render against `(docKey, storedKey)` and re-seeds unless the answer is `dirty`, so the card cannot carry one child's answer into another's document | — |
| `src/features/weekly-review/WeeklyReviewPage.tsx` | accept/reject ticks for pace adjustments | `weeklyReviews` — a transaction over `adjustments` | Selector (its own `ChildSelector`) | **RESET** — `loadedChildId` is compared during render and the decision draft is cleared on a change; Apply then resolves the draft against the document's current adjustments inside a transaction | — |
| `src/features/workshop/MyGamesGallery.tsx` | a type filter, a child filter, a delete target | `storyGames` — deletes by document id | Shell only | **SAFE** — every delete addresses a game by its own id and permission is checked against `game.childId`, the document's own field | — |
| `src/features/workshop/PlaytestReviewView.tsx` | per-card review states, an edit draft | `storyGames/{gameId}` | Shell only | **HIDE** — reached only through `WorkshopPage`, whose derived `renderPhase` closes every phase gate while the header is on another child | — |
| `src/features/workshop/VoiceRecordingStep.tsx` | recorded audio awaiting upload | `storyGames/{gameId}` + Storage | Shell only | **HIDE** — same gate; and the write targets `gameId`, the document's own id | — |
| `src/features/workshop/WorkshopPage.tsx` | a whole multi-step wizard workflow | `storyGames`, `artifacts`, `xpLedger`, the art quota | Shell only | **HIDE** — `workflowChildId` is stamped at creation and `renderPhase` is derived from `workflowLeftItsChild`, closing all fifteen phase gates; an in-flight run is identified by a token so a late completion cannot be adopted (UX-324 rounds 2, 4, 5) | — |

### 5b. Second editors on a surface already in the registry

The derivation is **per file**, so a page with two independent editors gets one registry row. These
are the second editors — hand-maintained rather than derived, and listed here so that "the row above
says RESET" is never read as "everything on that page is answered".

| Second editor | Child-scoped state it holds | What it writes | Verdict | Severity |
|---|---|---|---|---|
| `PlannerChatPage`'s model inputs — `snapshot`, `weekPlan`, `hoursPerDay` | the previous child's skill snapshot | nothing directly; they reach the planner prompt | **RESET** needed — the snapshot listener's `if (snap.exists())` never clears, so a child with no snapshot document leaves the previous child's snapshot in the prompt context | P2 · `UX-334` |
| `DispositionProfile`'s cached AI narrative — `result` | one child's generated disposition narrative | nothing — display only | **RESET** needed — `result` is only replaced when the new child **has** a fresh cache, so one boy's narrative can be read under the other's name | P2 · `UX-337` |
| `RecordsPage`'s Manual Hours Adjustment form | typed minutes, a reason, a subject | `hoursAdjustments` — one document | **RESET** — `adjChildId` re-synced to the new child while the typed minutes and reason stayed. `adjFormChildId` is now compared during render, the draft is cleared through `hoursAdjustmentOwnership.ts`, and an `Alert` names both children; the date is restored but deliberately does **not** count as a typed draft, so a saved adjustment cannot raise a false *"wasn't saved"* on the next switch (UX-329's own round-4 finding, one form over). **No hours math changed** — `DOC-25` attribution-only, all four terms in PR #1823. Fixed by FIX-223 (UX-340) | — |

## 6. What the heuristic cannot see

The derivation over-matches on purpose — a surface it catches that turns out to be fine costs one SAFE
row, and a surface it cannot see is a hole. Three shapes it still misses, each checked by hand:

1. **A child id threaded through props as something other than `childId: string`.** A component taking
   `child: Child`, `operatorId`, or a whole `dayLog` is not matched. Hand-checked: `LabReportForm`
   (takes `children`, whole-family by DATA-04), `KidTodayView`'s tree (takes `child`, kid-only so
   unswitchable), `MonthlyReviewReader` (takes `review`, which carries its own `childId`). None is a
   new member of the class.
2. **State held in a `useRef` rather than `useState`.** A ref is invisible to `HOLDS_STATE`.
   Hand-checked: the refs that matter here are all **fixes** — `useTranscription.lastChildIdRef`,
   `CurriculumTab.activeChildIdRef`, `useShellyChatActions.activeChildIdRef`,
   `WorkshopPage`'s run token — i.e. the pattern is used to *bind*, not to hold a draft.
3. **A custom hook wrapping `useActiveChild`.** There is none: `useActiveChild` has 69 readers and
   every one of them is a surface or a component, not a re-export. `useProfile` sits *below* it, not
   around it.

A fourth, deliberate exclusion: `src/test/` is not scanned. It holds the vitest setup and shared
assertion helpers, and this registry's own modules quote `useActiveChild` in their prose — scanning
them would have the guard counting itself.

Where the over-match shows up: several prop-arm rows are SAFE because the file's **props interface**
declares `childId: string` on its own line, which is the same shape as an object-literal shorthand
submit. `StonebridgeMissionCard` is the clearest case. Tightening the pattern to shorthand-only would
drop five rows and lose one hook-arm file — a worse trade than five SAFE rows with a reason. The
positional arm added in round 1 over-matches harder still (any call naming a child id, `doc(col,
childId)` included) and it is worth every one of the 14 rows it cost: it is the arm that sees
`CertificateScanSection`.

**A fourth shape it could not see, and now can.** Round 1's finding is recorded here rather than
quietly fixed, because it is the evidence for how this list should be maintained: the answer to a
missed surface is to widen the derivation, never to add the file to the table by hand. A hand-added
row fixes one case and leaves the guard reporting green on the next one.

## 7. What this run changed, and what it did not

**Fixed (4).** Each with a test whose last case fails when the fix is reverted:

- `RecordsPage`'s Historical Hours dialog — **RESET**, owner-authorised in advance on the UX-327
  terms. `historicalHoursOwnership.ts` decides whether a draft was typed and what the parent is told;
  the page clears the draft during render and Save goes dead. **No hours math changed** — not the fold,
  the rounding, the subject split, the `4.33` constant or the shape of a written adjustment — and the
  test asserts it rather than claiming it (12 typed hours still writes 720 minutes).
- `SaleEntryForm` — **RESET**, with the dropped sale named in kid copy held to the shared bar.
- `KitBuilderForm` — **BIND**, with *"This kit will be saved for …"* shown before the tap.
- `CertificateScanSection` — **RESET**, found by Codex round 1 on this PR. A scanned certificate held
  for Confirm was applied to whoever was active at the tap, writing `activityConfigs` and
  `skillSnapshots`; it now drops on the change and says to scan again, matching `stagedChildId` forty
  lines below it on the same tab. It **prevents** a write rather than changing one, so the
  `skillSnapshots` lane is untouched — no new write path, no change to what `applyUpdate` does.

**Filed, not fixed (14 items under 13 ids).** `UX-331` … `UX-343`. This paragraph is `AUDIT-222`'s own
record and stands as written; **`FIX-223` has since closed the five P1s**, including all four of the
rail-blocked items below — see §9. Four of them are on rails that run may not touch and
say so in their rows: `ArmorTab` and `AvatarAdminTab` write `xpLedger`; `useQuestSession` writes
`hours`, `skillSnapshots` **and** `xpLedger`; `RecordsPage`'s Manual Hours Adjustment form writes
`hoursAdjustments`, and the owner's authorisation named the Historical Hours dialog specifically.
Those are propose-and-confirm decisions, not this run's to make.

**Not done.** The switcher stays off (`CHILD_SWITCHER_ENABLED === false`); flipping it back is its own
one-line PR once the P1s here are cleared. (They are, as of `FIX-223` — the P2s and P3s are not, and
the flip is still nobody's side effect.) The eight in-page `ChildSelector`s stay (owner: later) —
and it is worth restating that they are why these fixes are not deferred: `RecordsPage`, `TodayPage`,
`CurriculumTab`, `ArmorTab` and `MyAvatarPage` can all be re-targeted **today**, with the shell
switcher off.

## 8. The shell rule

`DOC-24` stated the design rail; `CLAUDE.md` now carries the checkable form of it:

> A new surface that reads `useActiveChild` — or is handed a scoped identity — and holds editable
> state **declares its verdict when it is written**, not when a reviewer finds it. The five verdicts
> are the vocabulary, this census is the registry, and
> `src/test/childSwitchSurfaces.invariant.test.ts` is the enforcement.

## 9. What `FIX-223` closed (2026-09-10)

The five open P1s, in the order they are **reachable** rather than the order they were filed — four of
them through in-page `ChildSelector`s that have always existed, with the shell switcher still off.

| Id | Surface | Verdict applied | The one thing it changes |
|---|---|---|---|
| `UX-345` | `useDailyPlan` | **GATE** | the loaded plan is dropped during render, and a failed read is flagged rather than passing as an empty day |
| `UX-344` | `useSkillMap` + `LearningMap` | **GATE** | same rule, one definition (`core/hooks/childScopedGate`); the drawer offers no status buttons while the map is un-writable |
| `UX-340` | `RecordsPage`'s Manual Hours Adjustment form | **RESET** | the typed adjustment is cleared and the loss named, on the same rail as the dialog above it |
| `UX-336` | `ArmorTab`'s award form | **RESET** | the draft and the Correction confirm dialog go together — that dialog's own button calls `doAward` |
| `UX-339` | `useQuestSession` | **BIND** | the owner is captured at `startQuest` and resolved at the top of the hook, so all thirty write sites follow the session |

**Three of them cross a propose-and-confirm rail** — `UX-336` (`xpLedger`), `UX-340`
(`hoursAdjustments`) and `UX-339` (`hours` + `skillSnapshots` + `xpLedger`) — and are landed as
**attribution-only** fixes under `CLAUDE.md`'s 2026-09-10 pre-authorisation, whose four terms the PR
body states one by one. No number, fold, rounding, bucket or threshold moves; nothing is stored that
was not stored before; the unchanged arithmetic is asserted with a positive control rather than
claimed; and no existing row is rewritten. Rows already misattributed are **data** — correcting
history is a separate proposal that still stops for a decision, and none was found to file.

**`UX-339`'s verdict was prescribed but not argued**, so this run argued it and agrees: a quest in
flight is unsaved, expensive (paid model calls, a child's attention, an idle-aware timer counting real
minutes) and — the decider — **already partly written**, because `bankAnswerReward` banks a diamond
and its XP as each correct answer arrives. RESET would discard a half-answered quest and orphan those
diamonds against a session recorded for someone else; HIDE would hide a *running* write rather than
prevent one; GATE answers a question about a read that settled long ago. BIND is the only one of the
five that fits, and `questSessionOwner.ts` says so in full.

**Two of the five were SAFE rows a review round overturned** (`UX-344`, `UX-345`), which is why §4's
correction paragraph is the most important thing in this document and why it is left standing rather
than tidied away now that both are fixed.
