# Native progress capture — recording what Mathseeds and Fast Phonics actually said

**Ledger anchor:** FEAT-241 (`docs/review/REVIEW_HOME_BASE.md` §6).
Status: **IMPLEMENTED** (2026-10-16) — local validation only; not released, no live family data involved.
Repaired after PR-1897's review: a save whose child changed mid-flight and came back
unconfirmed is kept and retryable (§7), that panel ends with its family visit rather
than being merely hidden, failure wording no longer claims a write did not happen
(§4), and a correction can be cancelled (§6). Local tests only.

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
  uses it as learning evidence. The report surface reads it back, and the
  child-reference safety survey checks it before offering duplicate-child deletion;
- **a completion claim** — *working on 42* is stored as `42` with
  `meaning: 'workingOn'`. There is no N−1 normalisation and no inference that
  lessons 1–41 are finished.

### The meaning field is the point

"Lesson 42" is ambiguous in the way that matters: it can mean the lesson being
worked on (42 unfinished) or the last one finished (42 done). The app cannot tell,
and a record that silently assumed one can misrepresent what the parent observed.
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
  fractional number, an impossible or future date, an unreadable entry stamp, an
  unknown program or a cross-program correction is a bug, and a writer that
  trusted its caller would record the bug.
- **No photo, no AI call.** Nothing here uploads, scans or asks a model anything.

### Validation, and the ceiling we refuse to invent

| Field | Rule | Why |
|---|---|---|
| number | whole, ≥ 1, and storable **exactly** (`Number.isSafeInteger` plus a digit round-trip) | there is **no upper limit on the program**. An earlier draft guessed a four-digit ceiling and called it a typo guard; review refused it, correctly — a bound nobody can derive is an invented program range however it is labelled, and a parent reading a real number off a real screen would have been told it was a typo. The one bound that survives is a property of the *field*: past `Number.MAX_SAFE_INTEGER` the value stored is not the value typed, and the message says exactly that. Leading zeros are read as the keypad artefact they are (`007` → 7) |
| date (`observedOn`) | a real calendar day, and not in the future — **in both the form and the writer** | backdating is the normal case and is accepted without comment; a future day is the one value that cannot be a reading of something that happened, so the writer refuses it too rather than trusting the form. "Today" is `todayKey()`, the app's one definition of a local day (injectable, so tests pin it instead of depending on the wall clock), read through the rollover-aware `useTodayKey` rather than pinned at mount: this is a tab that is rarely closed, and one opened yesterday used to refuse *today* as a day that "hasn't happened yet" (round 4, P2). The live day moves the ceiling and seeds the next fresh draft; it never re-dates a date already typed, and "has she typed anything?" is asked against the day the draft on screen was seeded on. The form additionally refuses a year before 2000 — a UI typo guard, deliberately *not* re-made in the writer, which refuses only what is false rather than what looks odd |
| `recordedAt` | must parse as a time | it is injectable, and a row whose entry stamp cannot be read would render an "Entered" date of nothing |
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

A failure leaves the entry on screen with its key intact, so *Save* again is a
retry rather than a second row. **Editing a field after a failure mints a new key**,
because changed content is a different entry and must not inherit the id of one that
may already have landed. A failure that arrives after the child changed keeps the
same key for the same reason, in the recovery panel of §7.

### ...and what a failure is allowed to SAY

A generic failure is **indeterminate**. The transaction may have committed with its
answer lost on the way home — exactly the case `alreadyRecorded` exists for — so
*"that was not saved"* is as much a guess as *"that was saved"*, and the first cut
of this feature made it (PR-1897 review, round 2; the same correction `UX-359` made
on the kid capture). The wording rule now:

- **generic failures say `not confirmed`** (`failureNotice`, and the recovery panel
  of §7) — nothing is asserted about absence or presence, and the sentence points
  at the retry, which *checks* the same entry rather than adding one;
- **a named refusal keeps its reason.** `NativeProgressRefused` is determinate — the
  writer rejected the entry on its own validation, before or inside a transaction
  that then aborted — so its message is accurate and is shown as it is;
- **a pre-flight refusal may state absence.** `notSentNotice` is for a save that
  never left the device (no child selected), where *"nothing was written"* is simply
  true and manufactured doubt would be its own dishonesty.

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

**Settlement names the family as well as the child**, and both snapshot callbacks
are checked before they set anything — against the scope as **committed** (a layout
effect, as in §7) and against the subscription's own generation. A child id is
unique inside a family and not across sign-ins, so a stamp naming only the child let
the queued answer of a household that had signed out present its rows, or its
failure, as the new one's (round 4, P1). A listener that has been unsubscribed
settles nothing — including on an A → B → A round trip by child or by family, where
the key is equal again and the visit is not — and the immediate read-back of a
confirmed save is matched against the same committed scope.

## 6. Corrections

*Correct this entry* seeds the form from a stored row and files the new row with
`correctsObservationId`. The original is **kept and still rendered**, tagged *Later
corrected*: what she believed on a Tuesday is a fact about that Tuesday even once
she knows better.

The writer checks the original **inside the transaction**: it must still exist, still
belong to the **same child**, and still be about the **same program**. The program
check is there for the same reason as the child one and with the same blast radius —
the program decides the unit the number is read in, so a cross-program "correction"
would restate *lesson 42* as *peak 41* and leave both rows reading as though both had
been observed. A different program is a different observation, which is a new entry
rather than a fix. The form says so before she types: the Program field is locked
while a correction is open, with the reason under it.

So a correction can neither dangle, nor join two children's records, nor silently
change what it is about — through the one field nothing else validates.

### ...and the way out of one

**Cancel correction** is beside the correction notice, because *Correct this entry*
is one tap on a history row and is therefore tapped by accident. It **writes
nothing**: the link, the reviewed entry and the field errors are dropped and the
draft comes back as a fresh standalone entry with a new key, so the Program field
unlocks and the next save carries no `correctsObservationId`. Without it the only
exits were a child switch or leaving the page, and every entry typed in between was
filed against a row the parent never meant to touch. It is dead while a save is in
flight, because the entry that save is carrying is still this correction.

## 7. Child-switch verdict: RESET

Registry: `docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`.

- **RESET, not BIND**: an unconfirmed draft is a number, a date and two choices —
  seconds to retype, and nothing was paid for. It is cleared on a child change and
  the loss is stated in words. On an **account** change it is cleared and *nothing
  is said*: the notice would have to name the child the draft belonged to, and the
  only lists available are the household that has just signed out — whose child's
  name is not this parent's to read — and the new one, where the same id can be a
  different boy. No children were switched either, so silence is the only true
  sentence (round 3, P2).
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
  The token — and the family visit/identity pair beside it — is advanced in a
  **layout** effect, which is where the guarantee actually lives: a passive effect
  runs after the paint, and a save in the air settles in a microtask before that,
  so a committed switch would be invisible to the completion and the previous
  child's outcome would be taken for the current one's (round 3, P1). The account
  is also re-checked immediately after the save `await`, ahead of every outcome
  branch, rather than only inside the moved-on branch.
- **The notice claims a pending save for the record it belongs to.** The hook
  exposes the in-flight request's own family, child and entry key, not only the
  flag that says *a* write is in the air; the sentence about a confirmed entry is
  written only when the child being left is the one that request names. Read from
  the flag, one held request made every later switch claim one — Lincoln → London →
  Luca promised London's record an entry that was always Lincoln's, and offered a
  second receipt for it (round 4, P2). A retry carries the same identity, so it
  speaks for the same record and no other.

### A bound save that comes back UNCONFIRMED after the switch

Matching the scope token used to mean *discarding* the outcome, which was right for
a receipt and wrong for a failure: nothing was confirmed, the switch notice said the
entry went to the other child's record, and the request existed nowhere but the
closure that was ending. PR-1897's review refused that, correctly — the notice was
claiming a landing the surface had never seen. The contract now:

| | |
|---|---|
| **What is kept** | the confirmed `SaveObservationRequest`, unchanged — family, child, entry key, content and correction link. Nothing is rebuilt from the screen |
| **What is shown** | a named panel (*"Not confirmed for Lincoln"*), outside the form, with the entry's own sentence and what a retry does. It asserts neither absence nor presence (see §4). A named `NativeProgressRefused` reason is shown above that, as it was given, because it is accurate and says why; the generic notice is **not** repeated there, since it says what the panel's body already says. The switch notice carries the matching exception rather than promising a landing |
| **What a retry does** | re-sends exactly that request on an explicit tap. Same entry key, so the create-or-nothing transaction makes it a retry and not a second row — a first attempt that *had* landed comes back *"already recorded"*; same child, so it cannot be dragged onto whoever is on screen now |
| **What never happens** | no automatic retry, no forced child switch, no second child selector, no success claimed before the writer confirms one, and no touch of the draft on screen — including a *later visit's* draft in an A → B → A switch, because the panel is separate state |
| **Family change** | **ends it.** The panel is cleared in the render guard, and a completion arriving afterwards is *discarded rather than appended* — guarded on a **family visit token** plus the signed-in family, because an equal-id test passes again the moment the parent returns to that family and would resurrect the panel a frame of filtering had only hidden (round 2). The retry outcome is guarded the same way. A **child** switch, including A → B → A inside one family, keeps the panel and its retry. So the switch notice's standing offer to report an unconfirmed entry holds only while that family is still signed in; the bound write itself still goes where it was bound |
| **Kid profile** | the whole surface is already gone, and the retry handler re-checks the capability the way `handleSave` does |

Its limit, stated rather than hidden: the panel is component state, so an outcome
arriving after the surface has been **unmounted** is gone with it (§10.6).
Switching child inside the mounted surface — the case the review found — is safe.

## 8. The parent gate, stated at its real strength

The form renders only for a parent profile and both handlers that can reach the
writer re-check before it — `handleSave` and the stranded retry of §7 — the
two-layer rule `CurriculumTab`'s rename and set-lesson doors use.

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
3. **No planning integration.** Its readers are the report surface and the
   child-reference safety survey. Its immediate value is a dated family record.
4. **No delete.** A wrong row is corrected, never removed; a genuine deletion door
   is a separate decision about a parent's own record.
5. **Entry order is visible, not resolved.** The surface reports disagreement and
   out-of-order entry; it does not tell a parent which row to believe, because
   nothing in the repo knows.
6. **A stranded outcome does not survive unmount.** The recovery panel of §7 lives
   in component state: a write whose answer arrives after this surface has been
   left is not queued anywhere, so the entry has to be typed again — and, since a
   generic failure is indeterminate, re-typing it is a *new* entry key and could
   therefore become a second row if the first had in fact landed. Persisting the
   request would be an outbox — a separate decision about keeping a parent's
   unconfirmed words on the device, not a repair of this bug.
