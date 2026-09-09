# Progress, walked top to bottom — four doors to one job

**Date:** 2026-09-09 · **Run:** AUDIT-218 · **Ids:** `UX-311` → `UX-340` (used: `UX-311`–`UX-320`)
**Branch:** `claude/epic-archimedes-2qfjp5` · **Base:** `0b474ec2` (#1808, the strand)

Progress has never been audited. At least eleven runs have edited `CurriculumTab.tsx` and each hit
the defect it was aimed at; none of them looked at the page. This is the walk.

---

## 1 · What Shelly sees, top to bottom, after this PR

*Written last. This is the paragraph for the phone.*

She opens **Progress**. The first thing on the page is still the certificate scanner, and it now
says out loud whose record it will change — **"This updates Lincoln's curriculum."** — before she
taps anything, and the confirm card that follows names him too. That box used to be the one control
on the page that wrote to a child without ever naming the child until the receipt.

She goes to **Curriculum**. Each workbook card still has *Take Photo / From Photos*, but the photo
picker now takes **as many pages as she selects**, not one. Five pages of Math K go in as one batch,
each applied to that card; the order does not matter, because a position only ever moves forward. If
one of the five is a reading page, it is not applied and the summary says *"doesn't look like Math
K"* — it does not quietly write a reading lesson number onto the math book.

**When a scan fails, it now says which failure it was.** It used to say one sentence for four
different problems, and *"try that page again"* was the wrong advice for three of them. A photo the
AI refused now says so and tells her to try a different photo. A reply that got cut off says it was
cut off and that it is not the photo's fault. A photo that never reached the AI says to check the
connection. Only a genuinely unreadable answer still says *"try that page again"*. And a scan the
server rejected outright is no longer stored and applied as though it had worked, which it was.

**And she no longer needs the camera to work at all.** Every workbook card's ⋮ menu has **Set
lesson**. She types 14, taps Save, and reads *"Math K: lesson 8 → 14."* It can go backwards as well
as forwards — it is her record, and a person looking at the book outranks a photograph. Until now
the only way to say where a child had got to was to photograph a page, so a failing scanner was not
a degraded feature, it was a wall.

**What has not changed, and is filed for you to rank:** there are still **two** doors that scan an
unidentified page and create curriculum rows — the one at the top of Progress and the *Add Pages*
staging area at the bottom of Curriculum. They do the same job. Merging them is a design decision,
so it is written down (`UX-315`) rather than guessed at. And a workbook's minutes, frequency,
subject and total are still fixed at the moment it is created (`UX-317`).

---

## 2 · The immediate defect: what the scan failure actually is

### What I could not do

The run asked me to read the saved `scans` records and find out what the unparseable analysis
contained. **I could not.** This container has no Firebase credentials, no `firebase` CLI and no
`gcloud` (`GOOGLE_APPLICATION_CREDENTIALS` unset, no `~/.config/gcloud`). I did not guess at the
contents of a record I did not read, and nothing below is inferred from one.

What I did instead was read the path end to end. That turned out to be enough, because it found
**three independent live causes** and a fourth, separate defect — and the three are not alternatives,
they are all true at once.

### Cause 1 — the client never used the repo's own forgiving parser

`useScan.ts:246` was a bare `JSON.parse` on raw model text. Three other client parse sites
(`parseChatActions`, `parseFriction`, `foundationsReviewActions`) use the shared
`sanitizeAndParseJson`, which strips markdown fences **and** a conversational preamble — the exact
two shapes an LLM adds. This path used neither, while `scan.ts`'s prompt asks the model for "no
markdown fences, no commentary", which is a request, not a guarantee.

### Cause 2 — the vision call read only the first content block

`callClaudeWithVision` (`chatTypes.ts:229`) did `completion.content[0]`. `callClaude` was
deliberately fixed not to do that — its comment says reading only the first block "would drop the
answer". A vision reply that leads with any non-text block yielded `text = ""`, and `""` parses as
nothing. Same toast, entirely different cause.

### Cause 3 — a truncated reply and a refusal were indistinguishable

`callClaudeWithVision` returned no `stopReason`, and `max_tokens` is **1536** for a schema that asks
for a skills array, teacher notes, a content note and a recommendation reason. FEAT-169 already
solved this class on the story path — *"a budget-truncated story and an API error reached the client
as the same message"* — and the vision path never got it. **The sanitizer does not rescue
truncation**: truncated JSON has an unbalanced brace, and `candidateJsonSpans`' `lastIndexOf("}")`
slice cannot repair it. So this is a real, distinct failure that was being told to "try that page
again".

### The fourth defect — a server error was stored as a successful scan

`handleScan` returns `{"error": "…"}` for four bail-outs (`scan.ts:176,194,217`). That is **valid
JSON**. It parsed cleanly, was cast `as ScanResult`, and — because `isWorksheetScan` is
`pageType !== 'certificate'`, which is `true` for an object with no `pageType` at all — it read as a
**worksheet** and went to `syncScanToConfig`. A request that never reached the model was being
recorded and applied as an analysis.

### What was fixed, and what was deliberately not

`scanAnalysis.ts` is one pure module: **tolerant about wrapping, strict about shape.** It parses
through the shared sanitizer, and then a reply is an analysis *only if it declares a real
`pageType`*. That second half is the point — the run warned that a tolerant parse which swallows a
refusal "writes `results: null` and reports success — worse than today", and the strictness is what
makes that impossible. It is asserted in both directions: a fenced analysis is now read, and a
refusal is still refused.

The parse was **not** widened to accept anything, no second parser was written, and the model's own
text still never reaches the screen or the error log — it stays on the scan record, which is the
family's own document.

One nuance worth stating: truncation is checked **after** the parse, not before. A reply can stop at
`max_tokens` on trailing prose and still carry whole JSON — that is a usable analysis, not a
failure, and it is pinned by a test.

---

## 3 · The three passes

Walked as a parent on a 390px phone, from the code. **I did not run the app in a browser** — see §6.

### Pass 1 — add a brand-new curriculum item

| Route | Taps | What she sees |
|---|---|---|
| **Add Activity Manually** (bottom of Curriculum) | Progress → Curriculum → scroll past every section → *Add Activity Manually* → 8 fields → Add | The only route that lets her state minutes, frequency, subject, total and position |
| **Add Page / Add Pages** (bottom of Curriculum) | Same scroll → pick photos → *Scan N pages* | Rows appear named by whatever the model read off the cover |
| **Scan Certificate** (top of Progress) | One tap from landing | Same as above, one page at a time |
| **Ask AI** (off-page) | Chat → confirm card | Named by `duplicateActivityNotice` if it collides |

**The manual route is the last thing on the longest section of the page**, and it is the only one
where she controls the name. The two scan routes name the row from the model's reading of a cover —
which is the reason `aliases` had to exist at all (UX-279/280).

### Pass 2 — update where a child is in an existing workbook

**By photo:** the card's own scanner (door 2) — targeted, with a mismatch prompt. This worked, and
now takes several pages.

**By hand: there was no route.** This is the pass that failed outright. `AddActivityDialog` offers
*"Current lesson (optional)"* when a row is **created**; the ⋮ menu offered Rename, Mark as
complete, quick-log, Assign and Delete. Nothing could say *"we're on lesson 14."*

That is a P1 on its own, and it is compounded by §2: with the scanner failing, a parent had **no way
at all** to record where her child was. `updatePosition` — the shared writer the Ask AI confirm card
already uses — existed the whole time with no door onto it. Fixed as `UX-314`.

### Pass 3 — fix a row that is wrong

Every field she can set at creation, and whether she can reach it afterwards:

| Field | Set at creation | Editable after |
|---|---|---|
| `name` | ✅ | ✅ Rename (UX-279) |
| `aliases` | — | ✅ Rename |
| `currentPosition` | ✅ | ✅ **new — Set lesson (UX-314)**; previously scan-only |
| `defaultMinutes` | ✅ | **routines only**, via *Edit routines* |
| `frequency` | ✅ | **routines only** |
| `subjectBucket` | ✅ | ❌ |
| `totalUnits` | ✅ | ❌ |
| `type` | ✅ | ❌ |
| `scannable` | ✅ | ❌ |
| `childId` | — | ✅ Assign (workbooks only) |
| `completed` | — | ✅ Mark as complete |
| `quickLog` | — | ✅ menu toggle |

**A workbook's minutes, frequency, subject and total are fixed the moment it is saved.** For a row
the app created from a scan — where she never chose any of them — that means the numbers feeding her
day budget were picked by a photograph and cannot be corrected. `EditRoutinesDialog` does exactly
this job already, for routines only. Filed as `UX-317`; not built, because "which fields, in which
dialog, on which sections" is a design decision and the same dialog would need to cover four
sections.

---

## 4 · The door table, completed

| # | Door | File:line | What it is for | Accepts | Writes to | On failure |
|---|---|---|---|---|---|---|
| **1** | Scan Certificate or Progress Report | `CertificateScanSection.tsx:199` | A certificate or report → any workbook | One photo (camera **or** gallery) | Untargeted: matches by name, **creates if none** + `skillSnapshots` + `childSkillMaps` | `ErrorState` inline; now names which failure |
| **2** | Per-card scan | `CurriculumTab.tsx:1516` | *This* workbook's position | **Several** photos (gallery); one per camera tap | This card only (`targetConfigId`) | Snackbar, held until dismissed; mismatch prompt on one page, named skip in a batch |
| **3** | Add Page / Add Pages | `CurriculumTab.tsx:1007` | Several pages → whichever workbooks they are | Several photos | Untargeted: matches by name, **creates if none** | Per-page reasons; failed pages stay staged to retry |
| **4** | Strand session | `StrandSessionDialog.tsx:158` | Evidence for a session that has no lessons | Several photos + audio + note | Strand count (+1) + artifact | Dialog-local; refuses rather than half-writes |

Two corrections to the run's framing, both verified:

- **`ScanButton` already draws the camera/gallery line correctly.** Only the gallery input carries
  `multiple` (line 63); the camera input never does (lines 68–74). So "a camera capture is inherently
  one at a time" was already honoured, and passing `multiple` changes the gallery alone. The real
  cost of the prop is that it **also relabels** the buttons to *"Add Page / Add Pages"* (lines
  98,107) — it is not purely a prop, it carries the staging vocabulary with it.
- **Doors 1 and 3 have the same one-line answer.** Both scan an unidentified page, match it by name,
  and create a config if nothing matches. That is §3's *"if two answers are the same, that is a
  finding"*, and it is the structural finding of this run.

**Door 1 was deliberately left single-page.** Bolting `multiple` onto it would mean giving it its own
staging list, its own retry, and its own owner-guard — a second copy of the batch that already exists
forty lines below it in the same feature. The honest fix is that door 1 should *be* door 3, which is
`UX-315` and the owner's call.

### Proposed shape for `UX-315` (not built)

One door on the Curriculum tab, inside the child selector: **"Add pages"** — staged, multi, with the
existing retry. It handles worksheets (position) and certificates (confirm card) by page type, which
is the one capability door 1 has that door 3 lacks (`UX-318`). The top-of-page certificate box is
removed; its `useCertificateProgress` preview/confirm flow moves into the batch as the certificate
branch. Net effect: two doors on the page (one general, one per-card), each with a distinct answer.

---

## 5 · Findings

Severity: **P1** — she cannot complete the task, or the screen says something false · **P2** — she
can, but the page works against her · **P3** — polish.

### Fixed in this PR

| Id | Sev | Finding |
|---|---|---|
| **UX-311** | **P1** | The scan reported four different failures with one sentence, whose advice was wrong for three of them; the vision call read only `content[0]` and returned no `stopReason`; the client used a bare `JSON.parse` where the repo has a shared forgiving parser; and the CF's own `{"error":…}` envelope parsed as a **worksheet** and was applied to the curriculum. |
| **UX-312** | **P2** | A workbook card took one page at a time, while `ScanButton` has taken `multiple` since the staging batch was built. The owner's report, verbatim. |
| **UX-313** | **P2** | The first scan control on the page writes per-child and named the child **only in the success alert, after the write**. The confirm card for a per-child write listed curriculum, milestone, level, position and skills — and not the child. |
| **UX-314** | **P1** | No by-hand route to a workbook position existed. With the scanner failing, there was no way at all to record where a child had got to. |

### Filed, not built (Batch B)

| Id | Sev | Finding |
|---|---|---|
| **UX-315** | **P2** | Doors 1 and 3 do the same job. Proposed shape in §4. Structural — the owner's call. |
| **UX-316** | **P2** | A worksheet scan **creates and updates** `activityConfigs` with no confirm step, on all three scan doors. `CLAUDE.md` says any user-facing write to a child's record goes propose → confirm → write. The certificate path *is* confirmed; the worksheet path is not. Pre-existing on every door, so not this run's to change quietly. |
| **UX-317** | **P2** | A workbook's `defaultMinutes`, `frequency`, `subjectBucket` and `totalUnits` are unreachable after creation — including on rows a scan created, where she never chose them. They feed the day budget. |
| **UX-318** | **P3** | Door 3 marks a certificate `skipped` → *"1 page not recognized"*. Doors 1 and 2 handle certificates with a confirm card. Same photo, three answers. |
| **UX-319** | **P2** | The certificate door renders above the tabs and above every child selector, so the first control on the page is reached having passed nothing that names a child. `UX-313` makes it *say* the child; it does not move it. Resolved naturally by `UX-315`. |
| **UX-320** | **P3** | `max_tokens: 1536` is tight for the schema `buildScanSystemPrompt` requests. Now *visible* rather than fixed — `UX-311` makes truncation say so instead of hiding as a parse failure, which is the prerequisite for knowing whether it needs raising. |

---

## 6 · What I did NOT check, and why

- **The live `scans` records.** No Firebase credentials in this container (§2). Everything about the
  failure is from the code path, and I have said which parts are which.
- **The app in a browser.** No dev server was run and no screenshots taken; the 390px reading is
  from the component tree, not from a device. The phone-layout claims in §3 are structural (what
  renders above what), not measured — unlike FEAT-208, which measured pixels.
- **The other five Progress tabs.** Foundations, Monthly Books, Learning Map, Skill Snapshot and Word
  Wall were read only where the page shell touches them. The run scoped this to the doors, and each
  of those tabs deserves its own walk.
- **The strand** (merged the day before, PR #1808), **the rename/alias matching**, and **FIX-214's
  error reporting** except where §2 required — all excluded by the run prompt.
- **Whether raising `max_tokens` would fix anything** — `UX-320`. That needs the diagnosis this PR
  adds to run in production first.
- **`analyzeWorkbook`**, the other `callClaudeWithVision` caller. It gains the concatenated blocks
  and the `stopReason` field (both additive, it ignores the latter), but its own parse path was not
  audited.

---

## 7 · Verification

- `npx tsc -b` clean (root) · `tsc --noEmit` clean (functions)
- `npm run lint` — 0 errors, 3 warnings, all pre-existing in `useQuestSession.ts`
- New tests: `scanAnalysis.test.ts` (19) · `manualPosition.test.ts` (20) ·
  `CurriculumTab.cardMultiScan.test.tsx` (5) · `CurriculumTab.setPosition.test.tsx` (6)
- Baseline on `main` before any change: **8417 passed / 1 failed / 1 skipped**. The one failure,
  `StickerLibraryTab.customNote`, **passes in isolation** — a load-related timeout on `main`, not
  this run's and not in its scope.
