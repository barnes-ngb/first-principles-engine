# Finished-program completion — confirming a whole program, and what it covers

**Ledger anchor:** FEAT-242 (`docs/review/REVIEW_HOME_BASE.md` §6).
Status: **IMPLEMENTED (LOCAL CANDIDATE, 2026-10-17)** — written in an isolated
worktree, not merged, not deployed, not validated against any family record. No
test result is claimed here: the organizer runs build, lint and the suites.

---

## 1. The problem

FEAT-241 can record *"the app said peak 20 on Sunday"* and deliberately changes
nothing. What it cannot do is let a parent say the thing she actually knows —
**this program is finished** — and have the learning picture know that the
material was covered.

The two existing routes were both wrong for it:

| Route | Why not |
|---|---|
| `skillSnapshot.completedPrograms` | the seeder reads it as **`solid`** for every mapped node — blanket mastery from a completion |
| a `curriculumPosition` ref | that kind is a *witnessed position*, and `maxWitnessedNativePosition` caps the Fast Phonics divisor guess against it. A completion is not a position |

## 2. The shape

Two documents, because they are two different things — and the second is not
described as immutable while its fields move:

| | |
|---|---|
| `programCompletionEvents/{childId}__{program}__{entryKey}` | **IMMUTABLE history.** One document per act (confirm / withdraw / reapply), written once |
| `programCompletionState/{childId}__{program}` | **MUTABLE active projection.** Which confirmation is in force and what the learner model currently carries. Updated in place |

Plus one deterministic marker, which exists only to be readable *by id* inside a
transaction:

| | |
|---|---|
| `nativeProgressCorrectionMarkers/{observationId}` | "that native-progress row has been corrected". Written by `nativeProgressWrites` for **every** correction, whether or not a completion cites the row |

Bounded: `MAX_COMPLETION_EVENTS = 50` per child and program, refused **in words**
at the limit rather than absorbed silently.

**The last slot is reserved for the undo.** The bound used to be spent
first-come-first-served, so the fiftieth act could be a *confirmation* — leaving
a claim standing on the learner model and the withdrawal refused as the
fifty-first. A bound that can trap a parent inside an assertion she wants to take
back is worse than no bound, so:

| | |
|---|---|
| `MAX_CLAIMING_COMPLETION_EVENTS = 49` | the count at or above which an act that **creates or keeps** a claim — a confirmation, or a re-apply recording a mapping upgrade — is refused, before any write |
| `COMPLETION_WITHDRAWAL_CEILING = 51` | the hard ceiling a **withdrawal** may not cross: one slot of recovery headroom for records written before the reserve existed (already active at fifty) and for the automatic source-correction revocation, which is never refused because it runs inside the parent's own correction transaction |

The withdrawal is not held to the claiming bound, and is still bounded: it needs
an active confirmation, and no confirmation is recorded without leaving room for
it. Nothing is rewritten to make room — the recovery *adds* an act. A repeat
repair at the same mapping version reuses its stored act, so it costs no
capacity and stays available on a full record.

**Finishing an act already recorded is not a new act.** A confirmation made with
no learner model to write to sits `pending`, and the apply button is the only
route a surface offers to it. Charging that button a re-apply act made a
confirmation accepted in the *last* claiming slot impossible to finish — the one
remaining slot belongs to the withdrawal, so the refusal could never be
satisfied. So the apply button writes no event, and spends no capacity, when it
completes the pending application (at the version the confirmation names, having
applied nothing yet) or an outstanding withdrawal. Only a reviewed **mapping
upgrade** records an act there, and that one is still refused at
`MAX_CLAIMING_COMPLETION_EVENTS`, before any write, with the claim it declined to
upgrade still withdrawable. The export reads up to
`COMPLETION_EVENT_CAP = 200` acts per child, well above the ceiling, so the act
that undid a claim is never the one the audit cannot see.

## 3. The completion fact

`ProgramCompletionAssertion` is the parent's own claim: the day she observed the
program was finished, where she got that from (the FEAT-241 asserted-source
vocabulary, unchecked), optionally whether he had help (`unknown` by default,
never a forced question), and `reportedProgramVersion: 'unknown'` — a literal,
because this app cannot learn the edition and will not fabricate one.

**Citing a `completedThrough` peak-20 row is optional.** A confirmation stands on
its own; no number creates one. `workingOn` / `uncertain` / a number past the
final peak are refused as citations — the last for the same reason as the first:
it is not a parent saying the program is done.

## 4. The derived contribution

One confirmation → `programCompletionCoverage` evidence refs on the twelve
curated concepts, each stamped with `completionId` (the ownership key),
`mappingVersion`, `coverageQualifier`, `ownsPromotion`, `baselineState`, and
`status: active | superseded`.

### The mapping (reviewed, versioned, derived from the bridge)

`fastPhonicsBridge` stays the authority. `fastPhonicsCompletion.ts` adds a
reviewed read of it at `FAST_PHONICS_COMPLETION_MAPPING_VERSION = 1`, derived —
not hand-typed — so a bridge re-curation flows through and cannot disagree.

| concept | attributed peak | reach |
|---|---|---|
| `reading.phonemic.hearSounds` | Peak 1 | **partial** |
| `reading.encoding.spellCvc` | Peak 5 | direct |
| `reading.phonics.sightWords` | Peak 5 | **partial** |
| `reading.phonics.cvc` | Peak 7 | direct |
| `reading.phonics.letterSounds` | Peak 7 | direct |
| `reading.phonics.digraphs` | Peak 8 | direct |
| `reading.phonics.rControlled` | Peak 12 | direct |
| `reading.phonics.blends` | Peak 14 | direct |
| `reading.decoding.multisyllable` | Peak 14 | **partial** |
| `reading.phonics.diphthongs` | Peak 17 | direct |
| `reading.phonics.vowelTeams` | Peak 17 | direct |
| `reading.phonics.longVowels` | Peak 18 | direct |

**Attribution skips the depth rows.** Peaks 19–20 are consolidation; Peak 20 is
alternative *consonant* spellings (tch, dge, kn, wr, mb) and is **not** where
vowel teams are learned, so vowel teams cite Peak 17 and multisyllable cites
Peak 14. A cumulative position read labels both "Peak 20", which reads as though
the child's vowel work happened there.

**Publisher discrepancy, recorded not resolved:** the scope & sequence lists `ie`
in Peak 15 and the split digraph `i-e` in Peak 18, and some printed material
renders both as "ie". The bridge keeps them apart and this mapping inherits that.

Source: the publisher's published scope & sequence (organizer-verified
2026-10-17). Per-peak activities and end-of-peak quiz gates exist in the
publisher's material; **no individual result is read, inferred or stored**, and
the stored disclosure says so.

## 5. Coverage precedence — one rule, three writers

`functions/src/shared/foundations/completionCoverage.ts`, compiled by both
projects:

1. coverage caps at `forming`, never `solid`, never downgrades — and a claim that
   asserts *less* than the cap is worth only what it asserted. The Review Chat
   may propose `frontier` or `not-yet` and the writer honours it, so both
   `curriculumPosition` writers stamp `coverageCeiling` (the position sync: always
   the cap; a `covered` action: its clamped proposal). Without it, a withdrawal
   read every surviving position as cap-strength support and could leave a
   `forming` nobody had claimed;
2. **direct evidence governs** — an active `attestation` / `eval` / `quest` ref is
   an observation of the *child*, so a coverage claim records its evidence and
   moves nothing. This narrowed the pre-existing workbook and Review-Chat paths
   (authorized): a replayed position could previously raise a concept a guided
   evaluation had just read lower;
3. a `partial` qualifier promotes nothing, ever;
4. a superseded ref is history and is read by nothing that forms a judgment;
5. an entry whose withdrawn basis cannot be reconstructed keeps its stored state
   and is flagged `completionReviewNeeded` — a flag distinct from
   `needsReconcile` — and **every advice consumer** reads it through
   `effectiveConceptState`, which caps it at `completionReviewCeiling`: the
   working edge, **or whatever a live claim on the entry actually supports**.
   The ceiling is derived, not stored, so a claim that lands *after* the
   withdrawal — a newly confirmed completion covering the same concept `direct`,
   a workbook position — lifts the read to exactly the strength it asserted
   (never past the cap, and never over a live direct read), and superseding that
   claim restores the uncertainty in the same breath. The flag itself is cleared
   only by a writer that answers its question — a parent's word, a diagnostic,
   or the UX-291 working-level projection *establishing* a fresh higher state in
   place of the one under review — so no baseline, `readState` or provenance is
   ever invented to make an ambiguous `forming` read as settled.

No prerequisite traversal, no quest queued, no attestation created, and
`needsReconcile` is never read or written by this path.

## 6. Correction contract

**Ownership** is the `completionId`. **Baseline** is `baselineState`, recorded on
the first promotion and carried forward across an idempotent re-apply and a
mapping upgrade — without it, a re-applied ref sees the already-raised state and
a later withdrawal would leave an unsupported `forming`.

Releasing a concept (withdrawal, or a revision that drops/downgrades a target)
recomputes it in this order:

1. a direct observation made **after** the completion's own observation controls
   outright when it establishes a valid state, however often the write is replayed. A later observation with no state read does not erase the latest actual assessment;
2. otherwise whatever **surviving** evidence justifies — the *latest* direct read,
   or, when an independent coverage claim (a workbook position, another
   confirmation) still stands, **the state that claim asserted**
   (`coverageCeiling`), strongest claim first. **Never a maximum over history**,
   so a stale `solid` cannot beat a later calibrated eval, and never the cap by
   assumption;
3. the recorded baseline is the other floor: the **higher** of it and (2) is
   restored, clamped so a release can only lower. A claim weaker than the
   baseline cannot erase the state the concept already stood on, and a baseline
   cannot cancel a claim that outlives it;
4. otherwise keep the state and flag `completionReviewNeeded`.

**Old records need no migration.** A `curriculumPosition` ref written before
`coverageCeiling` existed is read by its producer: a position sync's own write
(`positionSync`) could never have claimed anything but the cap, so it still
supports `forming`; an unstamped *manual* ref recorded no claim, so it supports
nothing and the release falls to the baseline — which is the state the concept
actually held while that ref was already on the entry, so nothing the ref did is
lost and nothing is invented. Completion refs are unaffected: they claim the cap
by construction. No stored document is rewritten, and no backfill can recover a
claim that was never written down.

A reviewed revision walks the **union** of the new targets and the concepts the
confirmation still owns, so a dropped or downgraded target is released rather
than left live.

### A corrected citation

Any correction of the cited row ends the citation — including one whose
replacement still names the final peak. It is **not transferred** to the
corrected row; re-establishing the claim is a fresh confirmation. Three checks,
because one is not enough:

| | |
|---|---|
| the marker, read by id **inside** the confirming/applying transaction | covers a correction committing concurrently |
| a pre-transaction query for correction descendants, **failing closed** | covers rows corrected before markers existed |
| `planCompletionRevokeForCorrection`, called by `nativeProgressWrites` inside **its** transaction | covers a correction of a row a live completion already cites |

A pending application revalidates the **stored** citation, not the caller's
payload — and so does a **retry of the confirmation itself**. A retry re-sends
the entry key and may carry different content, or none: the record is what was
confirmed, so the markerless-correction query runs against the stored citation
before the transaction opens, and a retry whose own citation disagrees with the
record is refused rather than finished against a source nobody validated for it.

A retry of a **correction** whose first attempt already withdrew the completion
finds nothing active to revoke, so the outcome is recovered from that
correction's **own recorded act** — the event id is the correction's draft key,
and the act names the correction row — never from whatever is active now. A
newer, unrelated confirmation is therefore neither touched nor spoken for.

A retry of a **correction** consults the revocation coordinator again, because
the first attempt's answer was lost and what it did to a completion citing the
row is unknown. The plan is idempotent — an active completion citing the row is
withdrawn, anything else is a no-op — which is what lets the retry's receipt say
`revoked` or `pending` instead of "nothing else changed".

### 6.1 What the two surfaces may claim

The wording is part of the contract, because a receipt is the only thing a parent
can check:

| | |
|---|---|
| a correction, **before** the confirm tap | warns that a finished-program record pointed at this entry would be withdrawn with it. Stated conditionally — the native-progress surface does not read that record and must not imply it knows one exists |
| a correction's receipt (including an already-recorded retry) | `revoked` ⇒ the coverage has been taken back; `pending` ⇒ withdrawn, but the learning picture still has to be updated, and the button that finishes it is named. Neither says "nothing else changed" |
| an ordinary, uncited report | keeps its "nothing else changed" and its no-planning line, unaltered. That claim is the feature |
| the apply button | three answers, never one: *updated*, *already up to date*, or **recorded but not applied** (there is no learner model yet). `alreadyRecorded === false` is not evidence that anything was applied |
| a confirmation or withdrawal with **no answer** | kept as a retry panel bound to the family, child, entry key and account visit it was made under, named for that child, and discarded on an account change. A late retry settles only the request it names, so an older answer cannot mark a newer stranded entry saved or failed |

## 7. Transactions

`updateLearnerModelInTransaction` is the one way a model write-back is computed.
Five writers moved onto it — the workbook position sync, the quest write-back,
the eval write-back, the stuck-signal enqueue, and the Review-Chat /
Foundations-tab action writer — because all five sent arrays
(`conceptStates.<id>.evidence`, `openQuestions`, `changeFeed`), which
`{ merge: true }` replaces rather than merges. The computation happens **inside**
the callback; the UI cache is updated only from the committed result.

The synthesis beat compares the revision it read before committing: on any
movement, or a deleted document, it writes **nothing** — so an older run cannot
overwrite newer advice, cannot clear a fresh stale mark, and cannot recreate a
deleted model.

The revision it compares is the Firestore document's own `updateTime`, **exactly**
— seconds *and* nanoseconds. The app's `updatedAt` / `synthesisStaleAt` strings
are kept as a second, weaker check and are not sufficient on their own: a write
can leave both byte-identical (the same ISO second, or a writer that touches
neither field) while the concept states underneath have changed, and two commits
can share a millisecond. A revision this code cannot read **on either side**
fails closed and the run is reported as skipped, because "we could not tell" must
never resolve to "nothing moved".

### 7.1 The reapply act is immutable too

The repair button's event id is deterministic (`{entryKey}-v{mappingVersion}`),
so a second repair at the same mapping version addresses the **same** document.
It is read inside the transaction before anything is written: the stored bytes
win, `recordedAt` never moves, and only a genuinely new act is counted in
`eventCount` / `lastEventAt` (and refused at `MAX_CLAIMING_COMPLETION_EVENTS`,
because a mapping upgrade must not be the act that makes the claim it upgraded
impossible to take back). Finishing a `pending` application at the same mapping
version records no event at all — it completes the confirmation already on the
record — so that refusal cannot strand one. A repeat
repair still rewrites the coverage it restored, so it is not reported as "nothing
needed changing".

Two other honesty rules on that path: a withdrawal with **no model** to retract
from stays `applicationPending` (the stored status says `withdrawalPending`, and
the result must agree), and the citation checked by the pre-transaction query
must still be the stored citation at commit time — if another confirmation became
active in between, the apply is refused rather than resting coverage on a source
nothing checked.

## 8. What this deliberately does not do

No `hours`, `hoursAdjustments`, `days`, `xpLedger`, `skillSnapshots`,
`childSkillMaps`, `activityConfigs` (no `currentPosition`), `firestore.rules` or
index change. No forced quests or open questions. No attestation. No claim that
the basics are behind him or that comprehension is next. Advice refreshes
asynchronously through the existing stale mark; nothing re-plans inline.

## 9. Limitations

1. **Not validated against any family record** — synthetic fixtures only, and no
   organizer-run check is claimed by this document.
2. **One program.** A second needs a reviewed mapping plus a registry entry.
3. **The legacy-descendant check is a query, so it is pre-transaction.** It fails
   closed, which can refuse a save that a transient read error made unverifiable;
   the parent retries.
4. **A `completionReviewNeeded` entry is conservative, not resolved.** It clears
   when a parent's word or a diagnostic lands on the concept, and when the
   working-level projection raises the concept to a freshly derived state (that
   write replaces the state the flag was asking about and carries its own
   `workingLevel` ref; a blocked, equal or lower projection clears nothing). A
   fresh coverage claim does **not** clear it — it only raises what the entry is read at while
   that claim stands (§5 rule 5), so the Foundations drawer and the prompt say
   which of the two is true rather than promising caution that is not happening.
5. **A stranded outcome does not survive unmount** — the recovery panel is
   component state, as in FEAT-241 §10.6.
