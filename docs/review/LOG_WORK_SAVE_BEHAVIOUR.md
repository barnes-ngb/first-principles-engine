# Log work — what one save does, and what it does not promise (FIX-267)

Parent Today's capture card is now one form, `src/features/today/LogWorkCard.tsx`.
This note is the behaviour contract; the code comments carry the reasons.

## The draft

- Four optional parts: activity name + category · optional minutes · a note · ONE
  attachment (photos **or** audio, never both). Quick fill is collapsed, optional,
  and writes nothing; it asks before replacing a field typed by hand, and
  de-selecting takes back only what it put there.
- **One tray.** The shared `PhotoCapture` / `AudioRecorder` are mounted in their
  opt-in direct-staging modes (`onStageFiles`, `stageDirect`), so a selection is in
  the parent draft the moment it is made. There is no second *Attach* step and no
  second copy inside the child component.
- **Other callers: default behaviour unchanged, by intent and by test — not
  byte-identical code.** The new props are opt-in and no existing caller passes
  them, so `onCaptureBatch`'s tray and *Save N photos*, the single-photo preview,
  and the recorder's *Use Recording* / *Discard* confirmation all behave as they
  did. But the **lifecycle** inside both components did change for everyone: a
  liveness flag now restored on effect setup (StrictMode-safe), a per-request
  generation, microphone release and busy reporting on unmount, and busy raised at
  the permission request rather than after it. Default paths are covered by
  `UnifiedCaptureCard.draftProtectionMedia.test`; every legacy caller was not
  re-verified one by one, and no browser or device verification is claimed here.
- Selecting a file writes nothing. *Save work* is the only write.
- **An attached recording is replaced only by removing it (FIX-268).** The audio
  slot holds one take. While it is filled, the recorder and the *Upload audio
  file* control are unmounted and the card says to remove the recording first,
  so a second take or a second file cannot take the first one's place unasked.
  *Remove recording* is the parent's intentional discard and brings the recorder
  back empty. `stageAudio` enforces the same rule functionally: a duplicate or
  late `onCapture` from the live instance is refused, and the held blob and its
  object URL are left untouched. A staged photo is unaffected — photos add to a
  batch rather than replace each other, and each has its own remove.
- While a surface is working — compressing, waiting for microphone permission, or
  recording — the save waits and says so. A photo that cannot be processed is named
  on screen with a *Choose again* / *Leave it out* choice; the note and any other
  staged photos stay, and the draft remains savable without it.
- The summary above the button states child · date · category, what evidence will
  be saved, and whether time is recorded. A name on its own cannot be saved, and the
  reason is on screen, not in a tooltip.

## What a save writes

| Draft | Writes |
| --- | --- |
| note only / media only | one `artifacts` document, no `hours` row |
| minutes only | one `hours` row, no artifact |
| note + photos | ONE `Photo` artifact, `mediaUrls` + `uri` cover, note in `content` |
| note + recording | ONE `Audio` artifact, note in `content` |
| any + minutes > 0 | the above plus ONE `hours` row, same shape and minutes as before |

No minutes are inferred from an image or a recording. No math, no rounding and no
schema changed; `content` is absent rather than empty when there is no note.

## Retry

- Document ids are generated **before** the first write. The two record **creates**
  are `setDoc(…, { merge: true })` at those ids; a photo batch's media addresses are
  then a **same-id `updateDoc` patch** on the artifact that already exists (`uri` +
  `mediaUrls`), not a third record. Retrying a submission therefore addresses the
  same documents either way, so an unanswered write and a refused one are finished
  the same way.
- A partial outcome names what is known saved and what could **not be confirmed** —
  never that an unanswered write did not happen. Evidence that is whole is published
  to *Today's evidence* immediately, even when the `hours` row is unconfirmed.
- Retry resumes: no second artifact, no second `hours` row, only the uploads that are
  missing, under filenames frozen at submission.
- **Scope of the guarantee: this page session.** The submission is held in component
  state. A reload drops it, and a fresh save of the same words afterwards is a new
  record. Nothing persists a draft or a pending retry across a reload.
- **Stop waiting** (there is deliberately no bare *Dismiss*) asks first, names the child
  and day it is finishing, and says which of its two outcomes applies: whatever already
  saved stays saved, and then either the submitted draft is cleared with it — so the same
  work cannot be filed twice — or, where the parent has edited the draft since, her edits
  are kept and the submitted parts are taken out of it (below). Nothing stored is ever
  deleted or rolled back, and there is no automatic retry. A failed retry keeps the
  pending card, the frozen submission and its progress exactly as they were.
- A finished retry clears the form only if the submitted draft is still the draft on
  screen; a newer draft keeps its own edits, and the parts it inherited are retired.

## What a terminal transition takes out of the draft

The second half of idempotence: an id makes the WRITE safe to repeat, and this makes the
FORM safe to tap again. All three endings — an initial save that completed, a retry that
completed, a confirmed *Stop waiting* — run the same reconciliation.

- **The defect this repairs** (PR #1909 round 1, reproduced in a browser): a note, a
  photo and 27 minutes were submitted, the `hours` write went unanswered, the parent
  edited only the NOTE, and *Stop waiting* then read *"the draft changed, so leave all of
  it alone"*. The minutes and the photo in that draft were not edits — they were
  inherited from the submission — so the next *Save work* wrote a second `hours` row for
  the same 27 minutes and re-uploaded the same photo under a new artifact. The two
  success endings had the same shape whenever a different field was edited.
- **Only what the submission still owns is taken:** the note and the minutes whose
  **edit epoch** has not moved since the submission froze them, and the **exact file
  objects** that submission carried. Newer edits, newly staged media, and the activity
  name and category (which cannot be saved on their own) are untouched.
- **Epochs, never value equality.** `captureDraftOwnership` deliberately treats typing a
  word away and back as a new draft; a per-field counter keeps that judgement one field
  down, so a note or a minutes value retyped to the same characters is the parent's and
  stays. Every writer of either field — by hand, by a quick fill, by a de-select, by a
  reset — moves its epoch, which a source guard pins. The counters live in component
  state only: no Firestore field, no payload and no schema change.
- **A scope change is never touched.** A completion that lands after the editor moved to
  another child or day — including day A → B → A, which is a new visit — retires nothing,
  exactly as before.
- **Stop is the ambiguous case, and the line is ATTEMPTED.** A write whose acknowledgement
  was lost may well have committed, so a part that was attempted is taken out of the
  draft; a part no write reached (an `hours` row the save returned before, a file the
  upload loop never got to) certainly is not stored and stays, where the parent can still
  save it. Nothing is deleted, rolled back or retried to find out.
- **It is announced.** A field may not empty itself under a parent's hands unexplained: an
  on-screen notice names each part that was taken, says the same work cannot be filed
  twice, and says that nothing saved was deleted and that anything changed since is still
  here. The *Stop waiting* confirmation no longer promises that a newer draft is kept
  "as it is", because that was not true of the fields it had inherited.

## Identity

- `captureDraftOwnership` (FIX-263) is unchanged: a completion clears only the draft
  it was started from, and names the child and day it saved for when the page has
  moved on. Its three verdicts are still the whole rule for *clearing the form*; the
  per-field epochs above are a narrower question asked only of a `draft-changed`
  verdict, and they can never widen what a completion is allowed to touch.
- A child or day change **drops staged media** (nothing is written) with the loss
  stated on screen, and remounts the media surface so no selection, recording or
  in-flight compression can cross the change.
- **Cancellation is by generation, not only by scope.** Every media callback carries
  the visit AND the instance generation it was made in; the generation moves
  synchronously when the attachment is discarded, replaced, emptied or saved. So a
  photo still compressing when the parent switches to Audio, discards the draft or
  changes child cannot reattach itself, cannot alter the new draft, and cannot clear
  the new instance's busy state. A recording works the same way: a permission prompt
  answered after the surface was replaced releases the microphone instead of starting,
  and a take whose `onstop` fires on the way out is dropped.
- An unfinished save stays bound to the child, day and data it was submitted with and
  says so, whatever the page is showing.

## Not in this change

Kid Today's capture card (same file, `variant="kid"`) is the code it was: chips,
stepper, immediate save. No mastery, XP, progress, telemetry or compliance behaviour
is touched. Browser and family validation are not claimed here.
