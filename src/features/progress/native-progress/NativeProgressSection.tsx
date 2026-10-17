import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { EmptyState, ErrorState, LoadingState } from '../../../components/states'
import { useFamilyId } from '../../../core/auth/useAuth'
import { useActiveChild } from '../../../core/hooks/useActiveChild'
import { useTodayKey } from '../../../core/hooks/useTodayKey'
import type { NativeProgressObservation } from '../../../core/types/nativeProgress'
import { formatDateShort } from '../../../core/utils/dateKey'
import {
  alreadyRecordedNotice,
  buildHistoryRows,
  childSwitchNotice,
  correctionPreamble,
  draftIsEmpty,
  emptyNativeProgressDraft,
  enteredOnLabel,
  failureNotice,
  NATIVE_MEANING_LABEL,
  NATIVE_MEANINGS,
  NATIVE_PROGRAM_LABEL,
  NATIVE_PROGRAM_UNIT,
  NATIVE_PROGRAMS,
  NATIVE_PROGRESS_NO_PLANNING_NOTICE,
  NATIVE_PROGRESS_SOURCE_NOTICE,
  NATIVE_SOURCE_LABEL,
  NATIVE_SOURCE_SHORT,
  NATIVE_SOURCES,
  newEntryKey,
  NOTE_MAX_LENGTH,
  notSentNotice,
  numberPhrase,
  observationSentence,
  previewSentence,
  reviewNativeProgressDraft,
  savedNotice,
  strandedCorrectionNote,
  strandedSaveNotice,
  strandedSaveTitle,
  summarizeObservations,
  summarySentence,
  type NativeProgressDraft,
  type NativeProgressDraftErrors,
  type ReviewedObservation,
} from './nativeProgressRule'
import {
  useNativeProgressObservations,
  type SaveObservationRequest,
} from './useNativeProgressObservations'

/**
 * A confirmed save whose answer never came back, after the surface had moved to
 * another child.
 *
 * The one piece of this surface's state that OUTLIVES a child switch, and it has
 * to: the entry was confirmed, the write was attempted, no confirmation arrived,
 * and the only copy of what to retry lived in a closure that was about to end
 * (PR-1897 review, P1). It holds the REQUEST unchanged — the same family, child,
 * entry key, content and correction link it was confirmed under — so a retry
 * CHECKS the record it was always bound to, cannot become a second row (the entry
 * key is the document id, and the write is create-or-nothing), and cannot be
 * dragged onto whoever is on screen now.
 *
 * It does not claim the entry was lost. A generic failure is indeterminate — the
 * transaction may have committed with the answer lost on the way home — so the
 * panel says *not confirmed* and the retry is what settles it (review round 2).
 *
 * No name is stored. The panel resolves it from `children` when it renders, the
 * same single source of truth the switch notice uses.
 */
interface StrandedSave {
  request: SaveObservationRequest
  /** What came back instead of a confirmation. Held until a retry answers. */
  message: string
  phase: 'failed' | 'retrying' | 'saved'
  /** Both set only once a retry has come back `ok` — never before. */
  alreadyRecorded?: boolean
  recorded?: NativeProgressObservation
}

/**
 * Write down what Mathseeds or Fast Phonics actually said (FEAT-241).
 *
 * ── Propose → confirm → write ───────────────────────────────────────────────
 *
 * The fields compose a draft; *Check this entry* turns it into a reviewed
 * observation and shows the sentence that will be stored; only *Save this record*
 * writes. Nothing is written by typing, by leaving the section, or by closing
 * anything. That is this repo's rule for any write to a child's record, and it is
 * doubly right here, where the number is a person's recollection.
 *
 * ── Child-switch verdict: RESET ─────────────────────────────────────────────
 *
 * Registry: `docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`.
 *
 * An unconfirmed draft is cleared when the shell's child changes, and the loss is
 * stated in words (`childSwitchNotice`) — on a child change inside one family,
 * which is the only case there is an honest name for; an ACCOUNT change clears the
 * draft and says nothing (review round 3, P2).
 *
 * RESET rather than BIND because the draft is a number, a date and two choices —
 * seconds to retype, and nothing was paid
 * for. RESET rather than GATE because no part of the write is composed from the
 * read: the entry is typed, the collection is append-only, and a correction's link
 * is re-checked inside the writer's transaction — so a history that has not
 * settled (or has failed) blocks nothing except the correction buttons, which are
 * rendered from that very list.
 *
 * A save that has ALREADY been confirmed is a different thing and is **bound**: it
 * carries the family, child and draft it was confirmed under all the way to the
 * document, so it finishes on the right record however the header moves. What a
 * late completion must not do is touch the screen — a receipt for Lincoln must not
 * appear over London's history — so every completion is matched against a scope
 * token before it is allowed to set any state.
 *
 * ── ...and a bound save that came back UNCONFIRMED ──────────────────────────
 *
 * Matching the token used to mean *discarding* the outcome, which was right for a
 * receipt and wrong for a failure: nothing was confirmed, the switch notice said
 * the entry went to the other child's record, and the request existed nowhere
 * else (PR-1897 review, P1). An unconfirmed outcome is now kept as a
 * `StrandedSave` and shown in its own named panel, outside the form:
 *
 *   - the **request is pinned** — same child, program, content, correction link
 *     and entry key — and the panel's one button re-sends exactly it, so the retry
 *     checks the record it was confirmed for and cannot write a second row;
 *   - **nothing is claimed either way.** A generic failure is indeterminate, so
 *     the panel says *not confirmed* rather than *not saved*; a refusal the writer
 *     NAMED keeps its own accurate reason beside it;
 *   - **nothing is automatic.** No retry without a tap, no child switch, no second
 *     selector, and no success claimed until the writer confirms one;
 *   - **the draft on screen is untouched**, including the draft of a *later visit*
 *     to the same child in an A → B → A switch: the panel is separate state, so a
 *     stale outcome can never overwrite newer typing; and
 *   - **a family change ends it.** The panel is cleared during render, and a
 *     completion that arrives afterwards is DISCARDED rather than appended —
 *     checked against a family visit token, because an equal-id test passes again
 *     the moment the parent returns to that family and would resurrect it.
 *
 * Its limit, stated rather than hidden: this lives in component state, so an
 * outcome that arrives after this surface has been **unmounted** is gone with it.
 * Switching child inside the mounted surface — the case the review found — is safe.
 *
 * ── Parent-only, on capability ──────────────────────────────────────────────
 *
 * The form renders only for a parent profile and both save handlers re-check — the
 * confirmed one and the stranded retry — the two-layer rule `CurriculumTab`'s
 * rename and set-lesson doors use. **This is a
 * UI capability gate, not server-side role separation**: `firestore.rules` grants
 * the whole family subtree to the owning UID and the kids share that sign-in, so a
 * kid profile is prevented from reaching the write *in the app*, which is what the
 * gate claims and all it claims.
 */
export default function NativeProgressSection() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild, children, isChildProfile } = useActiveChild()
  /**
   * The LIVE allowed day: the latest date a field accepts, and the day a fresh
   * draft starts on.
   *
   * `useState(todayKey)` pinned it at mount, and this is a phone-first tab that is
   * rarely closed: a tab opened yesterday refused *today* as a day that "hasn't
   * happened yet" until it was reloaded (PR-1897 review, round 4 P2). The
   * rollover-aware hook moves it on focus, on visibility and on the minute tick.
   * Nothing re-seeds the draft when it moves — see `draftSeededOn`.
   */
  const [today] = useTodayKey()
  const {
    observations,
    loading,
    error: readError,
    observationsScope,
    saving,
    savingRequest,
    save,
  } = useNativeProgressObservations(activeChildId)

  const [draft, setDraft] = useState<NativeProgressDraft>(() =>
    emptyNativeProgressDraft(today),
  )
  /**
   * The day the draft on screen was SEEDED on, which is not always today.
   *
   * "Has she typed anything?" is asked against the date the empty draft was given,
   * so a day that rolls over under an untouched draft does not turn its seeded
   * date into typing the switch notice then reports as lost. A fresh draft — new,
   * reset or cancelled — is seeded on the current day and this moves with it.
   */
  const [draftSeededOn, setDraftSeededOn] = useState(today)
  const [fieldErrors, setFieldErrors] = useState<NativeProgressDraftErrors>({})
  /** The reviewed entry awaiting an explicit Save. Nothing is written yet. */
  const [pending, setPending] = useState<ReviewedObservation | null>(null)
  /** The row this entry corrects, when the parent started from one. */
  const [correcting, setCorrecting] = useState<NativeProgressObservation | null>(null)
  /**
   * The draft's identity, and so the document id a save writes to.
   *
   * Held across a failure on purpose: retrying the same entry must not be able to
   * write a second row, and the writer's create-or-nothing transaction is keyed on
   * exactly this. Minted fresh when the entry is finished or abandoned — and when
   * a failed entry is EDITED, because changed content is a different entry and
   * must not silently inherit the id of one that may already have landed.
   */
  const [entryKey, setEntryKey] = useState(newEntryKey)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)
  /**
   * Confirmed saves left unconfirmed once the screen had moved on.
   *
   * A list, not one slot: a second switch can strand a second entry, and the fix
   * for a dropped outcome cannot be a panel that drops the previous one. Keyed by
   * entry key, so retrying the same entry replaces its row instead of stacking.
   */
  const [strandedSaves, setStrandedSaves] = useState<StrandedSave[]>([])

  /**
   * The family + child this surface's draft is bound to. Ids only.
   *
   * An earlier draft kept the bound child's NAME here too and refreshed it from
   * an effect, which `react-hooks/set-state-in-effect` was right to refuse
   * (review item 2). The name was never state: the switch notice needs the name
   * of the child whose id this already holds, and `children` is on hand to
   * resolve it at the moment the notice is written — one source of truth, no
   * second copy to keep in step.
   */
  const [bound, setBound] = useState({
    familyId: familyId ?? '',
    childId: activeChildId,
  })

  /**
   * The live day, readable after an await — in a layout effect, like the switch
   * tokens below. `handleSave` holds the callback captured at the tap, so a write
   * held across midnight would otherwise seed the next draft on yesterday.
   */
  const todayRef = useRef(today)
  useLayoutEffect(() => {
    todayRef.current = today
  }, [today])

  const resetDraft = useCallback(() => {
    const day = todayRef.current
    setDraft(emptyNativeProgressDraft(day))
    setDraftSeededOn(day)
    setFieldErrors({})
    setPending(null)
    setCorrecting(null)
    setEntryKey(newEntryKey())
    setSaveError(null)
  }, [])

  // ── The scope guard, during render ────────────────────────────────────────
  //
  // Not in an effect: an effect runs after this subtree has already painted the
  // previous child's draft under the new child's name, and a parent who taps Save
  // in that frame is the cross-child write the guard exists to prevent.
  const scopeKey = `${familyId ?? ''}|${activeChildId}`
  const familyChanged = bound.familyId !== (familyId ?? '')
  if (familyChanged) {
    // A family change is not a child switch. Nothing pinned to the previous
    // family may stay on screen or stay retryable: the panel names a child from
    // a family this sign-in may not read, and its request carries that family's
    // id. Cleared before the child branch below so a change of both does both.
    setStrandedSaves([])
  }
  if (familyChanged || bound.childId !== activeChildId) {
    if (familyChanged) {
      // No notice at all, rather than a child-switch notice (PR-1897 review,
      // round 3 P2). The sentence would have to name the child the draft
      // belonged to, and after a family change there is no honest name to use:
      // `children` either still holds the family that just signed out — whose
      // child's name is another household's information — or already holds this
      // one, where the same id can be a different boy. Nothing was switched
      // between children either, so the only true statement is silence; the
      // draft is cleared below as it always is.
      setSwitchNotice(null)
    } else {
      const hadDraft =
        !draftIsEmpty(draft, draftSeededOn) || pending !== null || correcting !== null
      // The name of the child the draft belonged to, resolved now from the family
      // list rather than stored alongside the id. Reached only inside one family,
      // so the list being read is the list that child is in.
      const previousName =
        children.find((c) => c.id === bound.childId)?.name ?? 'the other child'
      // A pending save is claimed for the child it belongs to, not for whoever is
      // being left (round 4 P2). The hook's `saving` flag says only that A write
      // is in the air, so with one held request and two switches (Lincoln →
      // London → Luca) leaving London promised London's record an entry that was
      // always Lincoln's, and offered to report back on a second one.
      const leavingPendingSave =
        savingRequest !== null &&
        savingRequest.familyId === bound.familyId &&
        savingRequest.childId === bound.childId
      setSwitchNotice(childSwitchNotice(previousName, hadDraft, leavingPendingSave))
    }
    setBound({ familyId: familyId ?? '', childId: activeChildId })
    setDraft(emptyNativeProgressDraft(today))
    setDraftSeededOn(today)
    setFieldErrors({})
    setPending(null)
    setCorrecting(null)
    setEntryKey(newEntryKey())
    setSaveError(null)
    // The receipt names the previous child; keeping it would read as a receipt
    // for this one.
    setReceipt(null)
  }

  /**
   * Scope token for matching a completion to the screen that started it.
   *
   * A token rather than comparing ids, because A → B → A would alias a stale
   * completion onto a scope that is the same by name and a different visit by
   * history — the `CertificateScanSection` lesson (UX-329, Codex round 3).
   *
   * Bumped in an effect, since a ref may not be assigned during render — but a
   * **layout** effect, which is the whole guarantee (review round 3, P1). A
   * passive effect runs after paint, and an in-flight save's promise settles in
   * a microtask: the switch commits, the completion comes back, and the token it
   * is compared against has not moved yet, so an outcome belonging to the
   * previous child is treated as this one's — clearing the new draft or writing
   * the wrong receipt. A layout effect is in step by the end of the commit that
   * switched, before anything queued can look.
   */
  const scopeRun = useRef(0)
  useLayoutEffect(() => {
    scopeRun.current += 1
  }, [scopeKey])

  /**
   * The FAMILY's own visit token, and the family currently signed in.
   *
   * Separate from `scopeRun` because the two questions have different answers: a
   * child switch may keep a stranded request (it is the same record set, and the
   * retry is bound to its own child), a family change may not keep anything.
   *
   * A generation as well as the id, because the id alone is not enough — the
   * render guard clears the panel on a family change, but a late completion
   * ARRIVES after that and would append to the list, where an equal-id test
   * passes again the moment the parent returns to the first family and
   * resurrects it (PR-1897 review, round 2). A visit that has ended never comes
   * back, so its outcome is discarded rather than stored. Bumped on `familyId`
   * only, so A → B → A **by child** inside one family still keeps its retry.
   *
   * In a layout effect for the same reason as `scopeRun`: an account change that
   * has COMMITTED must be visible to a completion that settles before paint, or
   * the panel is built for a sign-in that is already gone.
   */
  const familyVisit = useRef(0)
  const signedInFamily = useRef(familyId ?? '')
  useLayoutEffect(() => {
    familyVisit.current += 1
    signedInFamily.current = familyId ?? ''
  }, [familyId])

  /**
   * THIS draft's own save is in the air — not merely that some write is.
   *
   * `saving` answers the second question, and the controls that only need to be
   * one-at-a-time (Save, Back, Cancel correction, a stranded retry) are right to
   * use it. The fields are a different matter: while the request carrying this
   * entry is unanswered, typing into them edited the very draft being written
   * (PR-1897 review, continuation 1). Two things went wrong at once — a success
   * cleared the new typing with a receipt for the old content, and an edit made
   * before any failure kept the same `entryKey`, so a changed entry would be
   * written under the id of one that may already have landed.
   *
   * Matched on family + child + entry key, never on `saving` alone. A draft for a
   * child the parent has since switched to — or a NEW entry for the same child
   * after a stranded one — is deliberately editable while that earlier request is
   * still out: it is a different entry, its key says so, and freezing it would
   * break the contract that a switch gives you a usable form.
   */
  const draftSaving =
    savingRequest !== null &&
    savingRequest.familyId === (familyId ?? '') &&
    savingRequest.childId === activeChildId &&
    savingRequest.entryKey === entryKey

  /**
   * The same answer, readable from a handler that was captured earlier.
   *
   * `disabled` stops the taps a parent can see; this stops the ones she cannot —
   * an event already queued when the save began, or a programmatic call holding a
   * closure from a render before it. A layout effect for the reason the tokens
   * above use one: it is in step by the end of the commit that started the write.
   */
  const draftSavingRef = useRef(draftSaving)
  useLayoutEffect(() => {
    draftSavingRef.current = draftSaving
  }, [draftSaving])

  const childName = activeChild?.name ?? 'this child'
  // The fallback is for a stored draft shape that outlived a program being
  // renamed; the field label must never render as "Undefined number".
  const unit = NATIVE_PROGRAM_UNIT[draft.program] ?? 'number'

  const editDraft = useCallback(
    (patch: Partial<NativeProgressDraft>) => {
      // The entry in the air is this one — see `draftSaving`. Changing it now
      // would be written off by the answer either way, and silently.
      if (draftSavingRef.current) return
      setDraft((prev) => ({ ...prev, ...patch }))
      setFieldErrors({})
      // Editing after a failure makes this a different entry — see `entryKey`.
      if (saveError) {
        setSaveError(null)
        setEntryKey(newEntryKey())
      }
      // A reviewed entry describes the fields as they were reviewed. Changing one
      // sends it back for review rather than letting Save write something the
      // preview never showed.
      setPending(null)
    },
    [saveError],
  )

  const handleReview = useCallback(() => {
    const review = reviewNativeProgressDraft(draft, today)
    if (!review.ok) {
      setFieldErrors(review.errors)
      setPending(null)
      return
    }
    setFieldErrors({})
    setReceipt(null)
    setPending(review.reviewed)
  }, [draft, today])

  const handleSave = useCallback(async () => {
    if (!pending) return
    // Re-checked at the write, not only at the control (CurriculumTab's rule): a
    // profile change with this section open would otherwise leave a live Save.
    if (isChildProfile) return
    if (!familyId || !activeChildId) {
      // Refused here, before anything left the device — the one failure that may
      // state absence outright.
      setSaveError(notSentNotice('no child is selected'))
      return
    }
    const run = scopeRun.current
    const familyRun = familyVisit.current
    const request = {
      familyId,
      childId: activeChildId,
      entryKey,
      observation: pending,
      correctsObservationId: correcting?.id,
    }
    const outcome = await save(request)
    // The write is bound to `request` and has gone where it belongs. The SCREEN
    // may have moved on, and a receipt or a cleared form belongs to the scope that
    // asked for it.
    //
    // The ACCOUNT is asked first, before either outcome branch (review round 3,
    // P1). A family change ends this surface's claim on the outcome completely:
    // whatever is on screen now belongs to another household, so there is no
    // branch below — receipt, cleared form, error or recovery panel — that this
    // answer may take. The write still went where it was bound; nothing here
    // speaks for it.
    if (
      familyVisit.current !== familyRun ||
      signedInFamily.current !== request.familyId
    ) {
      return
    }
    if (scopeRun.current !== run) {
      // A confirmed success needs nothing from this screen: the switch notice
      // already says a confirmed entry goes to the child it was confirmed for.
      // An UNCONFIRMED outcome is the one that may not evaporate — it would leave
      // that notice implying the other record settled the entry, with the request
      // nowhere but in this closure. Kept as its own panel, which is why nothing
      // below this line touches the draft: the child on screen may be another boy,
      // or this one on a later visit with newer typing in the form.
      //
      // The family it was confirmed under is still signed in — the check above
      // has already discarded the outcome otherwise, rather than appending a
      // panel that a frame of filtering only hides and the way back resurrects
      // (review round 2).
      if (!outcome.ok) {
        setStrandedSaves((prev) => [
          ...prev.filter((s) => s.request.entryKey !== request.entryKey),
          { request, message: outcome.message, phase: 'failed' },
        ])
      }
      return
    }
    if (!outcome.ok) {
      // Unconfirmed, and the entry is left exactly as it was — including its
      // `entryKey`, so tapping Save again cannot write a second row whether the
      // first attempt landed or not.
      setSaveError(outcome.message)
      return
    }
    setReceipt(
      outcome.alreadyRecorded
        ? alreadyRecordedNotice(outcome.observation, childName)
        : savedNotice(outcome.observation, childName),
    )
    resetDraft()
  }, [
    pending,
    isChildProfile,
    familyId,
    activeChildId,
    entryKey,
    correcting,
    save,
    childName,
    resetDraft,
  ])

  /**
   * Re-send one stranded request, unchanged, on an explicit tap.
   *
   * The request is not rebuilt from anything on screen: it IS the confirmed one,
   * so the entry key makes this a retry rather than a second row, and the child
   * and family are the ones it was confirmed under rather than the ones in the
   * header now.
   */
  const retryStrandedSave = useCallback(
    async (stranded: StrandedSave) => {
      const { request } = stranded
      // The same two checks the first attempt made, because this is the same
      // write: a profile change with this panel open must not leave a live Save,
      // and a request pinned to another family may not be sent under this one.
      if (isChildProfile) return
      if (!familyId || request.familyId !== familyId) return
      const familyRun = familyVisit.current
      // `map`, never append: an entry already cleared by a family change stays
      // cleared, so an in-flight retry cannot resurrect it on the way back.
      setStrandedSaves((prev) =>
        prev.map((s) =>
          s.request.entryKey === request.entryKey ? { ...s, phase: 'retrying' } : s,
        ),
      )
      const outcome = await save(request)
      // The same family-visit guard as the first attempt. `map` alone would hold,
      // because the render guard empties the list on a family change — this says
      // it on purpose rather than leaning on that.
      if (
        familyVisit.current !== familyRun ||
        signedInFamily.current !== request.familyId
      ) {
        return
      }
      setStrandedSaves((prev) =>
        prev.map((s) => {
          if (s.request.entryKey !== request.entryKey) return s
          // Still unconfirmed until the writer says otherwise — including when the
          // answer is the in-flight latch turning a double tap into one write.
          if (!outcome.ok) return { ...s, phase: 'failed', message: outcome.message }
          return {
            ...s,
            phase: 'saved',
            alreadyRecorded: outcome.alreadyRecorded,
            recorded: outcome.observation,
          }
        }),
      )
    },
    [isChildProfile, familyId, save],
  )

  const dismissStrandedSave = useCallback((entryKeyToDrop: string) => {
    setStrandedSaves((prev) =>
      prev.filter((s) => s.request.entryKey !== entryKeyToDrop),
    )
  }, [])

  const startCorrection = useCallback(
    (observation: NativeProgressObservation) => {
      // Starting a correction replaces the draft and mints a new key, which is
      // the same mutation of an unanswered entry that `editDraft` refuses.
      if (draftSavingRef.current) return
      setCorrecting(observation)
      setDraft({
        program: observation.program,
        numberInput: String(observation.nativeNumber),
        meaning: observation.meaning,
        observedOn: observation.observedOn,
        source: observation.source,
        note: observation.note ?? '',
      })
      setFieldErrors({})
      setPending(null)
      setEntryKey(newEntryKey())
      setSaveError(null)
      setReceipt(null)
    },
    [],
  )

  // The history this child's own subscription has answered for. A list stamped
  // with another family or child — or not yet stamped at all — is not this
  // child's record. The FAMILY is part of the test because a child id is unique
  // inside a sign-in, not across them (round 4 P1).
  const settled =
    observationsScope !== null &&
    observationsScope.familyId === (familyId ?? '') &&
    observationsScope.childId === activeChildId
  const rows = settled ? buildHistoryRows(observations) : []
  const summaries = settled ? summarizeObservations(observations) : []

  if (isChildProfile) {
    return (
      <Typography variant="body2" color="text.secondary">
        A parent keeps this record.
      </Typography>
    )
  }

  return (
    <Stack spacing={2}>
      {/* Whose record this is, before anything is typed into it (UX-313). */}
      <Typography variant="body2">
        Recording for <strong>{childName}</strong>.
      </Typography>
      <Alert severity="info" icon={false}>
        {NATIVE_PROGRESS_NO_PLANNING_NOTICE}
      </Alert>

      {switchNotice && (
        <Alert severity="warning" onClose={() => setSwitchNotice(null)}>
          {switchNotice}
        </Alert>
      )}

      {/* ── A confirmed save left unconfirmed after the screen moved ───────
          Its own panel, above the form and outside it: the entry it describes
          belongs to a child who may not be the one on screen, so it must never
          read as the draft below. The family filter is belt to two braces — the
          render guard's clear and the completion guard's discard — so nothing
          from another sign-in is rendered or retryable. */}
      {strandedSaves
        .filter((stranded) => stranded.request.familyId === (familyId ?? ''))
        .map((stranded) => {
          const strandedName =
            children.find((c) => c.id === stranded.request.childId)?.name ??
            'the other child'
          if (stranded.phase === 'saved') {
            const landed = stranded.recorded ?? stranded.request.observation
            return (
              <Alert
                key={stranded.request.entryKey}
                severity="success"
                onClose={() => dismissStrandedSave(stranded.request.entryKey)}
              >
                {stranded.alreadyRecorded
                  ? alreadyRecordedNotice(landed, strandedName)
                  : savedNotice(landed, strandedName)}
              </Alert>
            )
          }
          return (
            <Alert key={stranded.request.entryKey} severity="error">
              <AlertTitle>{strandedSaveTitle(strandedName)}</AlertTitle>
              <Typography variant="body2">
                {previewSentence(stranded.request.observation, strandedName)}
              </Typography>
              {/* The writer's NAMED reason, when there is one. The generic notice
                  says what the panel's own body says next, and a panel that
                  repeats itself twice over is a panel she skims. */}
              {stranded.message !== failureNotice() && (
                <Typography variant="body2">{stranded.message}</Typography>
              )}
              <Typography variant="body2">{strandedSaveNotice(strandedName)}</Typography>
              {stranded.request.correctsObservationId && (
                <Typography variant="body2">
                  {strandedCorrectionNote(strandedName)}
                </Typography>
              )}
              <Box sx={{ mt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void retryStrandedSave(stranded)}
                  // One at a time, the latch's rule: a retry waits for whatever
                  // write is already in the air, its own included.
                  disabled={saving || stranded.phase === 'retrying'}
                >
                  {stranded.phase === 'retrying'
                    ? 'Saving…'
                    : `Try saving ${strandedName}'s entry again`}
                </Button>
              </Box>
            </Alert>
          )
        })}

      {correcting && (
        <Alert
          severity="info"
          action={
            // The way out of a correction started by accident (PR-1897 review,
            // P2). It writes nothing: the link, the reviewed entry and the
            // errors go, and the draft comes back as a fresh standalone entry
            // with a new key — so the Program field unlocks and the next save
            // carries no `correctsObservationId`. Dead while a save is in the
            // air, because the entry that save is carrying is still this one.
            <Button size="small" onClick={resetDraft} disabled={saving}>
              Cancel correction
            </Button>
          }
        >
          {correctionPreamble(correcting)}
        </Alert>
      )}

      {/* ── The form ─────────────────────────────────────────────────────── */}
      <Stack spacing={2}>
        <TextField
          select
          fullWidth
          label="Program"
          value={draft.program}
          onChange={(e) =>
            editDraft({ program: e.target.value as NativeProgressDraft['program'] })
          }
          error={Boolean(fieldErrors.program)}
          // Fixed while correcting (review item 7): a correction is a fix to one
          // observation, and the program decides the unit its number is read in.
          // The writer refuses a cross-program link anyway; locking the field is
          // how a parent finds that out before she types, not after. Fixed while
          // THIS draft is being written for the separate reason in `draftSaving`.
          disabled={correcting !== null || draftSaving}
          helperText={
            fieldErrors.program ??
            (correcting
              ? 'A correction stays with the program of the entry it fixes.'
              : undefined)
          }
        >
          {NATIVE_PROGRAMS.map((program) => (
            <MenuItem key={program} value={program}>
              {NATIVE_PROGRAM_LABEL[program]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          fullWidth
          label={`${unit.charAt(0).toUpperCase()}${unit.slice(1)} number`}
          value={draft.numberInput}
          onChange={(e) => editDraft({ numberInput: e.target.value })}
          error={Boolean(fieldErrors.numberInput)}
          helperText={
            fieldErrors.numberInput ??
            `Exactly the ${unit} number the app showed — type it as you saw it.`
          }
          disabled={draftSaving}
          // A numeric keypad without `type="number"`, which brings spinners and
          // reports "" for values the browser dislikes. The rule module validates.
          inputMode="numeric"
          slotProps={{ htmlInput: { pattern: '[0-9]*' } }}
        />

        <TextField
          select
          fullWidth
          label="What the number means"
          value={draft.meaning}
          onChange={(e) =>
            editDraft({ meaning: e.target.value as NativeProgressDraft['meaning'] })
          }
          error={Boolean(fieldErrors.meaning)}
          disabled={draftSaving}
          helperText={fieldErrors.meaning ?? 'Working on it, finished it, or not sure.'}
        >
          {NATIVE_MEANINGS.map((meaning) => (
            <MenuItem key={meaning} value={meaning}>
              {NATIVE_MEANING_LABEL[meaning]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          fullWidth
          type="date"
          label="Day you saw this"
          value={draft.observedOn}
          onChange={(e) => editDraft({ observedOn: e.target.value })}
          error={Boolean(fieldErrors.observedOn)}
          disabled={draftSaving}
          helperText={
            fieldErrors.observedOn ??
            'The day the progress was seen — not today, if you are catching up.'
          }
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
        />

        <TextField
          select
          fullWidth
          label="Where it came from"
          value={draft.source}
          onChange={(e) =>
            editDraft({ source: e.target.value as NativeProgressDraft['source'] })
          }
          error={Boolean(fieldErrors.source)}
          disabled={draftSaving}
          helperText={fieldErrors.source ?? NATIVE_PROGRESS_SOURCE_NOTICE}
        >
          {NATIVE_SOURCES.map((source) => (
            <MenuItem key={source} value={source}>
              {NATIVE_SOURCE_LABEL[source]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Note (optional)"
          value={draft.note}
          onChange={(e) => editDraft({ note: e.target.value })}
          error={Boolean(fieldErrors.note)}
          disabled={draftSaving}
          helperText={fieldErrors.note ?? `Up to ${NOTE_MAX_LENGTH} characters.`}
        />

        {!pending && (
          <Button variant="contained" onClick={handleReview} disabled={saving}>
            Check this entry
          </Button>
        )}
      </Stack>

      {/* ── The confirm step. Nothing is written until the second tap. ───── */}
      {pending && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Check this before saving</Typography>
              <Typography variant="body1">{previewSentence(pending, childName)}</Typography>
              {/* The source, named — not the notice again. It is already on the
                  field she picked it in, and a confirm step that repeats two
                  sentences she has just read is a confirm step she skims. */}
              <Typography variant="body2" color="text.secondary">
                {NATIVE_SOURCE_LABEL[pending.source]}
              </Typography>
              {pending.note && (
                <Typography variant="body2" color="text.secondary">
                  Note: {pending.note}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Nothing has been saved yet.
              </Typography>
              {saveError && <Alert severity="error">{saveError}</Alert>}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button onClick={() => setPending(null)} disabled={saving}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save this record'}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {receipt && (
        <Alert severity="success" onClose={() => setReceipt(null)}>
          {receipt}
        </Alert>
      )}

      <Divider />

      {/* ── What is on the record ────────────────────────────────────────── */}
      <Typography variant="subtitle2">What you have recorded</Typography>

      {summaries.map((summary) => (
        <Box key={summary.program}>
          <Typography variant="body2" fontWeight={600}>
            {NATIVE_PROGRAM_LABEL[summary.program]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {summarySentence(summary)}
          </Typography>
        </Box>
      ))}

      {readError ? (
        // A failed read is not an empty record, and must never be shown as one.
        // New entries are still allowed: nothing written here is composed from
        // what was read.
        <ErrorState message="Couldn't load the entries you have saved. They are still there — this list will come back." />
      ) : !settled && loading ? (
        <LoadingState label="Loading your entries…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Save what the app showed and it will be listed here with its date."
        />
      ) : (
        <Stack spacing={1} divider={<Divider flexItem />}>
          {rows.map(({ observation, corrects, correctedBy }) => (
            <Stack key={observation.id} spacing={0.5} sx={{ py: 0.5 }}>
              <Typography variant="body2">{observationSentence(observation)}</Typography>
              <Typography variant="caption" color="text.secondary">
                Entered {enteredOnLabel(observation.recordedAt)} ·{' '}
                {NATIVE_SOURCE_SHORT[observation.source]} (as reported)
              </Typography>
              {observation.note && (
                <Typography variant="caption" color="text.secondary">
                  “{observation.note}”
                </Typography>
              )}
              {corrects && (
                <Typography variant="caption" color="text.secondary">
                  Correction of the entry seen {formatDateShort(corrects.observedOn)} (
                  {numberPhrase(corrects)}).
                </Typography>
              )}
              {correctedBy.length > 0 && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label="Later corrected" />
                  <Typography variant="caption" color="text.secondary">
                    Kept as it was recorded.
                  </Typography>
                </Stack>
              )}
              <Box>
                <Button
                  size="small"
                  onClick={() => startCorrection(observation)}
                  // Dead while this draft's own save is unanswered: it would
                  // replace the entry that write is carrying (`draftSaving`).
                  disabled={draftSaving}
                >
                  Correct this entry
                </Button>
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
