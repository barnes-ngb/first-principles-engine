# Native progress capture — recording what Mathseeds and Fast Phonics actually said

**Ledger anchor:** FEAT-241 (`docs/review/REVIEW_HOME_BASE.md` §6).
Status: **IMPLEMENTED** (2026-10-16) — local validation only; not released, no live family data involved.

---

## 1. The problem, in the owner's terms

Mathseeds and Fast Phonics keep their own progress inside their own apps. A parent
reads a number there — *lesson 42*, *peak 7* — and until now had nowhere in this app
to write it down. The two fields that look like the place for it are both
load-bearing:

| Field | What writing it does |
|---|---|
| `activityConfigs.currentPosition` | moves what gets planned, and syncs into the learner model through `syncActivityPositionToModel` |
| `learnerModels` / `skillSnapshots` | changes what the app believes the child can do, and what it teaches next |

So the only ways to record *"the app said lesson 42 on Sunday"* were to change the
plan or to keep it on paper. This feature is the third answer: **a record that
changes nothing**.

Goals G1 and G3 from the approved run: a parent can record and later revisit the
exact native number, what it means, the day it was observed, and what kind of
source she is asserting.

## 2. What a row is, and what it is not

One row is **one sentence a parent asserted on one day**:

> Mathseeds — working on lesson 42, seen Oct 12 (parent report).

It is **not**:

- **verified** — nobody checked the program. `source: 'certificate'` means *she says
  it came from a certificate*, not that a certificate was uploaded or read;
- **authoritative** — two rows may disagree and neither wins (§5);
- **a position** — nothing derives a "current lesson" from these rows, and nothing
  reads this collection except the surface that shows it back;
- **a completion claim** — *working on 42* is stored as `42` with
  `meaning: 'workingOn'`. There is no N−1 normalisation and no inference that
  lessons 1–41 are finished.

### The meaning field is the point

"Lesson 42" is ambiguous in the way that matters: it can mean the lesson being
worked on (42 unfinished) or the last one finished (42 done). The app cannot tell,
and a record that silently assumed one would be wrong about half the rows.
`uncertain` is a first-class answer, because a parent reading a progress screen a
week later often genuinely does not know which it was — and forcing a guess makes
the stored row *less* true than the honest shrug.

## 3. Shape and storage

`families/{familyId}/nativeProgressObservations/{childId}__{entryKey}`

| Field | Meaning |
|---|---|
| `childId` | one child per row; never `'both'` |
| `program` | `mathseeds` \| `fastPhonics` — a closed pair, because the unit differs (lesson / peak) and a surface that cannot name the unit cannot show the number honestly |
| `nativeNumber` | the exact number, a positive integer, stored verbatim |
| `meaning` | `workingOn` \| `completedThrough` \| `uncertain` |
| `observedOn` | `YYYY-MM-DD` — the day the progress was **seen** |
| `source` | `parentReport` \| `programReport` \| `certificate`, all parent-asserted |
| `note` | optional, her own words (≤ 400 chars) |
| `recordedAt` | ISO — when the row was **written** |
| `entryKey` | the draft's identity; the idempotency key the doc id is built from |
| `correctsObservationId` | the row this one corrects, when it is a correction |

**Append-only.** A row is written once and never updated. Corrections are new rows
(§6). **Observation date is separate from entry time** on purpose: a report read on
Sunday and typed in on Thursday is a Sunday observation, and collapsing the two
turns a backdated record into a claim about today.

**No new index.** Rows are read with one equality filter on `childId` and sorted in
memory, so `firestore.indexes.json` is untouched.

**No rules change.** `firestore.rules` already grants the whole
`families/{familyId}/**` subtree to the owning UID, which this collection sits
inside. Nothing about the parent-only UI is server-enforced — see §8.

## 4. The write path

```
form fields → reviewNativeProgressDraft() → preview card → Save
            → useNativeProgressObservations.save(pinned ids)
            → saveNativeProgressObservation()  ← the ONE writer
            → runTransaction: create-or-nothing
```

- **Propose → confirm → write.** Typing writes nothing. *Check this entry* only
  validates and shows the sentence that would be stored. *Save this record* is the
  only write, and the preview says *"Nothing has been saved yet"* until then.
- **One writer, one collection.** `src/core/firebase/nativeProgressWrites.ts`
  imports exactly three things from `firestore.ts` (`db`, the collection helper, the
  doc-id helper) and names no other collection, writer or planning field. Its test
  mock exports nothing else, so reaching for one fails the suite rather than
  passing quietly; `nativeProgressBoundary.source.test.ts` pins the same boundary
  across the feature's other modules by name.
- **It re-validates what the form checked.** The UI rule decides what to *tell* a
  parent; the writer decides what may be *stored*. A caller arriving with a
  fractional number, an impossible date or an unknown program is a bug, and a
  writer that trusted its caller would record the bug.
- **No photo, no AI call.** Nothing here uploads, scans or asks a model anything.

### Validation, and the ceiling we refuse to invent

| Field | Rule | Why |
|---|---|---|
| number | whole, ≥ 1, ≤ 9999 | the ceiling is a **typo guard** (`4222` passes, `42222` does not), not a curriculum limit. This repo does not know how far either program counts, so the refusal says *"this field takes up to 9999 — it isn't a limit on the program"* and never implies otherwise |
| date | a real calendar day, not in the future, not before 2000 | backdating is the normal case and is accepted without comment; a future day is the one value that cannot be a reading of something that happened. The floor is the same kind of typo guard (`0226-10-12`) |
| program / meaning / source | must be a known value | they come from selects today; a check that only guarded the typed fields would be a check that trusts the UI |

### Idempotency and the double tap

Two independent guards, because they fail differently:

1. **A latch** in the hook (`savingRef`) refuses a second save while one is in
   flight — two taps in the same tick both read the pre-render state value, so the
   check is on a ref, not on `saving`.
2. **The entry key.** The document id is `{childId}__{entryKey}`, and the write is a
   transaction that **creates or does nothing**. A retry whose first attempt landed
   and lost its answer — the ordinary phone case — cannot write a second row and
   cannot overwrite the first: the stored row comes back with `alreadyRecorded`, and
   the receipt reads *"Already recorded … Nothing was saved twice."*

A failure leaves the entry on screen, unsaved, with its key intact, so *Save* again
is a retry rather than a second row. **Editing a field after a failure mints a new
key**, because changed content is a different entry and must not inherit the id of
one that may already have landed.

## 5. Reading it back honestly

The strongest claim this feature makes about a list is **the most recent reading by
observed date**, named that way in the type (`mostRecentlyObserved`), in the
sentence (*"Latest record: … as of Oct 12"*) and on screen. It is never called a
current position, and nothing resolves a disagreement:

- **two rows for the same day that differ** → both are listed and the summary says
  *"Another entry for that same day says something different — both are kept."*
- **entries added out of order** (the expected case — a parent catches up on three
  weeks of reports in one sitting) → *"Some entries were added out of order, so the
  newest entry is not the latest day."*

History is sorted by `observedOn`, then `recordedAt`, so a correction sorts above
the row it corrects. Each row shows the day seen, the day entered, the meaning and
the source, labelled *(as reported)*.

**A failed read is not an empty record.** The hook clears and un-stamps its rows
during render on a family/child change, so one child's history can never be painted
under another's name; a read that fails sets `error` and the surface says *"Couldn't
load the entries you have saved. They are still there."* rather than *"Nothing
recorded yet."*

## 6. Corrections

*Correct this entry* seeds the form from a stored row and files the new row with
`correctsObservationId`. The original is **kept and still rendered**, tagged *Later
corrected*: what she believed on a Tuesday is a fact about that Tuesday even once
she knows better. The writer checks the original **inside the transaction** — it
must still exist and still belong to the same child — so a correction can neither
dangle nor join two children's records through the one field nothing else validates.

## 7. Child-switch verdict: RESET

Registry: `docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`.

- **RESET, not BIND**: an unconfirmed draft is a number, a date and two choices —
  seconds to retype, and nothing was paid for. It is cleared on a child change and
  the loss is stated in words.
- **RESET, not GATE**: no part of the write is composed from the read (the entry is
  typed, the collection is append-only, the correction link is re-checked in the
  transaction), so an unsettled or failed history blocks only the correction
  buttons, which are rendered from that list anyway.
- **A confirmed save is bound.** It carries the family, child and draft key it was
  confirmed under all the way to the document, so it finishes on the right record
  however the header moves — and a **scope token** stops its completion touching the
  screen, so a receipt for Lincoln can never appear over London's history. A token
  rather than an id comparison, because an A → B → A switch aliases onto a visit
  that is no longer this one (the `CertificateScanSection` lesson, UX-329 round 3).

## 8. The parent gate, stated at its real strength

The form renders only for a parent profile and `handleSave` re-checks before the
write — the two-layer rule `CurriculumTab`'s rename and set-lesson doors use.

**This is a UI capability gate, not server-side role separation.** `firestore.rules`
grants the family subtree to the owning UID and the kids share that sign-in, so what
the gate claims — and all it claims — is that a kid profile cannot reach this write
*in the app*.

## 9. What this run deliberately did not do

- no write to `activityConfigs` (including `currentPosition`, `totalUnits` and
  `setActivityConfigPosition`), `learnerModels`, `childSkillMaps`, `skillSnapshots`,
  `hours`, `hoursAdjustments`, `days`, `xpLedger` or `artifacts`;
- no inferred prior completion, no automatic N−1 normalisation, no derived position;
- no `firestore.rules`, `firestore.indexes.json` or Cloud Function change;
- no photo requirement, no media upload, no model call;
- no merge of this record into planning, compliance or the Learning Map. Reading
  these rows into any of those is a **separate proposal**, and the isolation above is
  what makes that proposal small.

## 10. Limitations

1. **Not device- or family-validated.** Local synthetic tests only; no live family
   record or media was involved in building it.
2. **Two programs.** A third is a new entry in the program table plus its unit
   label — a deliberate change, not an open text field.
3. **Nothing reads it yet** except its own surface. That is the design, and it also
   means the record is only as useful as a parent's habit of writing in it.
4. **No delete.** A wrong row is corrected, never removed; a genuine deletion door
   is a separate decision about a parent's own record.
5. **Entry order is visible, not resolved.** The surface reports disagreement and
   out-of-order entry; it does not tell a parent which row to believe, because
   nothing in the repo knows.
