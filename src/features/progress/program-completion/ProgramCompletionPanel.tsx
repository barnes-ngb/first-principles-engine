import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../../core/auth/useAuth'
import { useActiveChild } from '../../../core/hooks/useActiveChild'
import { useTodayKey } from '../../../core/hooks/useTodayKey'
import { completionMappingFor } from '../../../core/foundations/fastPhonicsCompletion'
import {
  CompletionAssistance,
  ProgramCompletionProgram,
  type CompletionWithdrawReason,
} from '../../../core/types/programCompletion'
import {
  NATIVE_SOURCE_LABEL,
  NATIVE_SOURCES,
} from '../native-progress/nativeProgressRule'
import { useNativeProgressObservations } from '../native-progress/useNativeProgressObservations'
import {
  ASSISTANCE_CHOICES,
  ASSISTANCE_LABEL,
  COMPLETION_MAP_FOOTNOTE,
  COMPLETION_MAP_NOTICE,
  COMPLETION_SCOPE_NOTICE,
  COMPLETION_SOURCE_NOTICE,
  COMPLETION_STATE_UNKNOWN,
  COMPLETION_STATE_UNREADABLE,
  NOTE_MAX_LENGTH,
  WITHDRAW_REASON_CHOICES,
  WITHDRAW_REASON_LABEL,
  activeCompletionSentence,
  citationLabel,
  completionAlreadyRecordedNotice,
  completionChildSwitchNotice,
  completionDraftIsEmpty,
  completionNotSentNotice,
  completionPreview,
  completionSavedNotice,
  completionStrandedNotice,
  completionStrandedTitle,
  coverageSummary,
  coverageSummaryHeadline,
  eligibleCitations,
  emptyCompletionDraft,
  eventSentence,
  lastWithdrawSentence,
  mappingUpgradeLine,
  needsApplyRetry,
  newCompletionEntryKey,
  projectionStatusLine,
  reviewCompletionDraft,
  sortEvents,
  sourceConflictNotice,
  type CompletionDraft,
  type CompletionDraftErrors,
  type ReviewedCompletionDraft,
} from './programCompletionRule'
import {
  useProgramCompletion,
  type ConfirmCompletionRequest,
  type WithdrawCompletionRequest,
} from './useProgramCompletion'

/**
 * Confirm that a whole program is finished (FEAT-242).
 *
 * One primary action and one confirm step: the parent taps *This program is
 * finished*, says when she knew and where from, checks the sentence, and
 * confirms. The reviewed mapping turns that single act into per-concept coverage
 * evidence — there is no per-concept checklist, and the detail is collapsed
 * behind a toggle so a phone shows the action and a one-line summary first.
 *
 * Citing an existing *finished through peak 20* entry is OPTIONAL: the
 * completion is her own assertion, carrying its own date, source and (only if
 * she says) whether he had help. No number creates one on its own.
 *
 * Child-switch verdict: **RESET** (registry:
 * `docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`). An unconfirmed draft is
 * a date and three choices, so it is cleared on a child change and the loss is
 * stated; an ACCOUNT change clears it and says nothing, because the only names
 * available belong to a household that has just signed out. A CONFIRMED save is
 * bound to the family, child and entry key it was confirmed under, and every
 * outcome — success, determinate refusal, or indeterminate failure — is gated on
 * the hook's `current` flag, which compares the committed VISIT and not just the
 * ids (so an A → B → A switch cannot show a first-visit answer in the third).
 *
 * Mutations are blocked until the record is authoritative: a loading or failed
 * read never presents as "nothing recorded yet", because that sentence invites a
 * confirmation that could duplicate one already stored.
 */

/**
 * A confirmed write whose answer never came back. Retried under its own key.
 *
 * It carries its own IDENTITY — family, child, entry key, kind and the family
 * visit it was confirmed under — because a retry's answer may come back after
 * the panel has moved on to a newer stranded request, and an older answer must
 * not settle a newer entry (review item 6).
 */
interface StrandedCompletionWrite {
  kind: 'confirm' | 'withdraw'
  confirmRequest?: ConfirmCompletionRequest
  withdrawRequest?: WithdrawCompletionRequest
  familyId: string
  childId: string
  entryKey: string
  /** The signed-in family's visit generation, so A → B → A cannot alias. */
  visit: number
  phase: 'failed' | 'retrying' | 'saved'
}

/** Is this the very request that was sent, down to the visit it belongs to? */
function sameStrandedRequest(
  a: StrandedCompletionWrite,
  b: StrandedCompletionWrite,
): boolean {
  return (
    a.kind === b.kind &&
    a.familyId === b.familyId &&
    a.childId === b.childId &&
    a.entryKey === b.entryKey &&
    a.visit === b.visit
  )
}

export default function ProgramCompletionPanel() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild, children, isChildProfile } = useActiveChild()
  const [todayKey] = useTodayKey()
  const program = ProgramCompletionProgram.FastPhonics
  const mapping = completionMappingFor(program)

  const {
    state,
    events,
    stateStream,
    eventStream,
    saving,
    savingRequest,
    confirm,
    withdraw,
    applyProjection,
  } = useProgramCompletion(activeChildId, program)
  // Read-only here: the citation picker needs the rows the parent already
  // recorded. This surface never writes that collection.
  const { observations, observationsScope, error: observationsError } =
    useNativeProgressObservations(activeChildId)

  const [draft, setDraft] = useState<CompletionDraft>(() => emptyCompletionDraft(todayKey))
  const [seededDate, setSeededDate] = useState(todayKey)
  const [entryKey, setEntryKey] = useState(() => newCompletionEntryKey())
  const [pending, setPending] = useState<ReviewedCompletionDraft | null>(null)
  const [errors, setErrors] = useState<CompletionDraftErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState<CompletionWithdrawReason | ''>('')
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawKey, setWithdrawKey] = useState(() => newCompletionEntryKey())
  const [stranded, setStranded] = useState<StrandedCompletionWrite | null>(null)
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const childName = activeChild?.name ?? 'this child'

  // ── The scope, as STATE, compared during render ──
  //
  // State rather than a ref: a ref read and written during render is both a lint
  // error and a correctness hazard (a ref mutated in render is not part of the
  // commit). The native-progress panel next door establishes the pattern — reset
  // during render, so no child's draft is ever painted under another's name.
  const [bound, setBound] = useState({ familyId: familyId ?? '', childId: activeChildId })
  const familyChanged = bound.familyId !== (familyId ?? '')
  if (familyChanged || bound.childId !== activeChildId) {
    const previousChild = children.find((c) => c.id === bound.childId)
    const hadDraft = !completionDraftIsEmpty(draft, seededDate) || pending !== null
    const confirmedForPrevious =
      savingRequest != null &&
      savingRequest.childId === bound.childId &&
      savingRequest.familyId === bound.familyId
    setSwitchNotice(
      familyChanged
        ? null
        : completionChildSwitchNotice(
            previousChild?.name ?? 'the previous child',
            hadDraft,
            confirmedForPrevious,
          ),
    )
    setDraft(emptyCompletionDraft(todayKey))
    setSeededDate(todayKey)
    setEntryKey(newCompletionEntryKey())
    setWithdrawKey(newCompletionEntryKey())
    setPending(null)
    setErrors({})
    setNotice(null)
    setFailure(null)
    setFormOpen(false)
    setWithdrawOpen(false)
    setWithdrawReason('')
    setShowDetail(false)
    // A family change ENDS the stranded panel: an equal-id test passes again the
    // moment the parent returns to that family, which would resurrect a panel a
    // frame of filtering had only hidden.
    if (familyChanged) setStranded(null)
    setBound({ familyId: familyId ?? '', childId: activeChildId })
  }

  // The signed-in family as COMMITTED, and its VISIT — both advanced in a layout
  // effect, which is where the guarantee lives: a save in flight settles in a
  // microtask, before any passive effect would have run.
  //
  // The generation matters as much as the id: an A → B → A account change makes
  // the id equal again, and a retry answered across that round trip would
  // otherwise settle a panel belonging to a different sign-in. Bumped on
  // `familyId` only, so a child switch inside one family keeps its retry.
  const signedInFamily = useRef(familyId ?? '')
  const familyVisit = useRef(0)
  useLayoutEffect(() => {
    signedInFamily.current = familyId ?? ''
    familyVisit.current += 1
  }, [familyId])

  const citations = useMemo(
    () => eligibleCitations(observations, program),
    [observations, program],
  )
  const citation = useMemo(
    () => citations.find((row) => row.id === draft.reportObservationId) ?? null,
    [citations, draft.reportObservationId],
  )
  const summary = useMemo(() => coverageSummary(program), [program])

  /** Has the state document answered, for THIS family and child, without error? */
  const authoritative =
    stateStream.settled != null &&
    stateStream.settled.familyId === (familyId ?? '') &&
    stateStream.settled.childId === activeChildId &&
    !stateStream.error &&
    !stateStream.loading
  const citationsSettled =
    observationsScope != null &&
    observationsScope.familyId === (familyId ?? '') &&
    observationsScope.childId === activeChildId &&
    !observationsError
  const canMutate = Boolean(familyId) && Boolean(activeChildId) && authoritative && !saving

  // ── The handlers are plain functions ──
  //
  // Not `useCallback`: the React Compiler memoizes this component and could not
  // preserve the manual memoization here (its inferred dependencies did not
  // match the written ones), which is a compile-time refusal rather than a
  // style note. Hand-written dependency lists that the compiler rejects are
  // worse than none — they are a claim about when a value changes that nothing
  // enforces — so they are removed rather than suppressed.
  const editDraft = (patch: Partial<CompletionDraft>) => {
    if (saving) return
    setDraft((prev) => ({ ...prev, ...patch }))
    setPending(null)
    setErrors({})
    setNotice(null)
    setFailure(null)
    // Changed content is a DIFFERENT entry and must not inherit the id of one
    // that may already have landed.
    setEntryKey(newCompletionEntryKey())
  }

  const handleCheck = () => {
    const review = reviewCompletionDraft(draft, todayKey, observations)
    if (!review.ok) {
      setErrors(review.errors)
      setPending(null)
      return
    }
    setErrors({})
    setPending(review.reviewed)
  }

  const handleConfirm = async () => {
    // Belt-and-braces: the controls are hidden for a kid profile, and this
    // handler refuses one as well — the two-layer rule the set-lesson door uses.
    if (isChildProfile) return
    if (!familyId || !activeChildId) {
      setFailure(completionNotSentNotice('no child is selected'))
      return
    }
    if (!authoritative) {
      setFailure(completionNotSentNotice('we do not yet know what is recorded here'))
      return
    }
    if (!pending) return
    const request: ConfirmCompletionRequest = {
      familyId,
      childId: activeChildId,
      entryKey,
      reviewed: pending,
    }
    const visit = familyVisit.current
    const outcome = await confirm(request)
    // ── The INDETERMINATE failure is answered first, and is NOT gated on
    // `current` ──
    //
    // The write may have landed with its answer lost on the way home, and the
    // render reset has already cleared the draft. If the parent has switched
    // child in the meantime, dropping the outcome here would leave the switch
    // notice implying the other record settled the entry while the only copy of
    // the request was in this closure. So it is kept as its own retry panel,
    // bound to the family, child and entry key it was confirmed under — and
    // nothing below this line touches the form, which may now belong to another
    // child. A family change still discards it (the render guard clears the
    // panel, and the visit check in `retryStranded` refuses a late answer).
    if (!outcome.ok && !outcome.refused) {
      // The account as COMMITTED **and** its visit: an A → B → A sign-in makes
      // the id equal again, and keeping only the id test would raise a retry
      // panel for a visit that has ended.
      if (signedInFamily.current !== request.familyId) return
      if (familyVisit.current !== visit) return
      setStranded({
        kind: 'confirm',
        confirmRequest: request,
        familyId: request.familyId,
        childId: request.childId,
        entryKey: request.entryKey,
        visit,
        phase: 'failed',
      })
      return
    }
    // Every REMAINING branch is gated, including a determinate refusal: a
    // refusal shown after the header moved would be a sentence about another
    // child's record.
    if (!outcome.current) return
    if (!outcome.ok) {
      setFailure(outcome.message)
      return
    }
    setNotice(
      outcome.result.alreadyRecorded
        ? completionAlreadyRecordedNotice(childName)
        : completionSavedNotice(pending, childName, outcome.result.applied),
    )
    setPending(null)
    setFormOpen(false)
    setDraft(emptyCompletionDraft(todayKey))
    setSeededDate(todayKey)
    setEntryKey(newCompletionEntryKey())
  }

  const handleWithdraw = async () => {
    if (isChildProfile) return
    if (!familyId || !activeChildId) return
    if (!authoritative) {
      setFailure(completionNotSentNotice('we do not yet know what is recorded here'))
      return
    }
    if (!state?.activeEntryKey || !withdrawReason) return
    // The SAME key for a repeat tap, so an indeterminate withdrawal retried is a
    // retry of that act and not a second one.
    const request: WithdrawCompletionRequest = {
      familyId,
      childId: activeChildId,
      program,
      entryKey: withdrawKey,
      withdrawsEntryKey: state.activeEntryKey,
      reason: withdrawReason,
    }
    const visit = familyVisit.current
    const outcome = await withdraw(request)
    // The same rule as a confirmation: an unconfirmed correction is kept as a
    // retry bound to the child it was made for, whatever the header now says.
    if (!outcome.ok && !outcome.refused) {
      // Same two tests as a confirmation: the id, and the visit it belongs to.
      if (signedInFamily.current !== request.familyId) return
      if (familyVisit.current !== visit) return
      setStranded({
        kind: 'withdraw',
        withdrawRequest: request,
        familyId: request.familyId,
        childId: request.childId,
        entryKey: request.entryKey,
        visit,
        phase: 'failed',
      })
      return
    }
    if (!outcome.current) return
    if (!outcome.ok) {
      setFailure(outcome.message)
      return
    }
    setWithdrawOpen(false)
    setWithdrawReason('')
    setWithdrawKey(newCompletionEntryKey())
    setNotice(
      outcome.result.applicationPending
        ? 'Withdrawn. The learning picture still has to be updated — use the button below.'
        : 'Withdrawn. What this had marked as covered has been taken back, and nothing else was touched.',
    )
  }

  const handleApply = async () => {
    if (isChildProfile) return
    if (!familyId || !activeChildId) return
    if (!authoritative) return
    const outcome = await applyProjection({
      familyId,
      childId: activeChildId,
      program,
      ...(state?.activeEntryKey ? { expectedEntryKey: state.activeEntryKey } : {}),
    })
    if (!outcome.current) return
    if (!outcome.ok) {
      setFailure(outcome.message)
      return
    }
    // ── The receipt says which of three things happened ──
    //
    // `alreadyRecorded` alone was not enough: the writer returns
    // `applied: false, applicationPending: true` when there is still no learner
    // model to write to, and claiming "the learning picture has been updated"
    // there was a receipt for something that had not happened.
    const result = outcome.result
    setNotice(
      result.applicationPending
        ? 'The learning picture has not been updated — there is nothing to update it on for this child yet. What you recorded is safe, and this button will finish it when there is.'
        : result.alreadyRecorded
          ? 'Already up to date — nothing needed changing.'
          : result.applied
            ? 'The learning picture has been updated.'
            : 'Done. What that record had marked as covered has been taken back, and nothing else was touched.',
    )
  }

  const retryStranded = async () => {
    const target = stranded
    if (!target) return
    if (isChildProfile) return
    const request = target.confirmRequest ?? target.withdrawRequest
    if (!request || request.familyId !== familyId) return
    // The account as COMMITTED, and the visit it was confirmed under.
    if (signedInFamily.current !== request.familyId) return
    if (familyVisit.current !== target.visit) return
    setStranded((prev) =>
      prev && sameStrandedRequest(prev, target) ? { ...prev, phase: 'retrying' } : prev,
    )
    const outcome =
      target.kind === 'confirm'
        ? await confirm(target.confirmRequest!)
        : await withdraw(target.withdrawRequest!)
    if (signedInFamily.current !== request.familyId) return
    if (familyVisit.current !== target.visit) return
    // Settled only if the panel still names THIS request (review item 6): a
    // second stranded entry may have replaced it while this retry was out, and
    // an older answer must not mark a newer entry saved or failed.
    setStranded((prev) =>
      prev == null || !sameStrandedRequest(prev, target)
        ? prev
        : outcome.ok
          ? { ...prev, phase: 'saved' }
          : { ...prev, phase: 'failed' },
    )
  }

  const activeSentence = activeCompletionSentence(state, childName)
  const statusLine = projectionStatusLine(state)
  const conflict = sourceConflictNotice(state)
  const upgrade = mappingUpgradeLine(state, mapping)
  const withdrawnLine = lastWithdrawSentence(state)
  const history = sortEvents(events)
  const strandedChildName =
    children.find((c) => c.id === stranded?.childId)?.name ?? 'that child'

  if (isChildProfile) {
    return (
      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Finished programs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A grown-up records this one.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Finished programs
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Recording for <strong>{childName}</strong>. {COMPLETION_SCOPE_NOTICE}
        </Typography>

        {switchNotice && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {switchNotice}
          </Alert>
        )}

        {stranded && (
          <Alert
            severity={stranded.phase === 'saved' ? 'success' : 'warning'}
            sx={{ mb: 1.5 }}
          >
            <AlertTitle>{completionStrandedTitle(strandedChildName)}</AlertTitle>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {completionStrandedNotice(strandedChildName)}
            </Typography>
            {stranded.phase === 'saved' ? (
              <Typography variant="body2">That entry is on the record now.</Typography>
            ) : (
              <Button
                size="small"
                variant="outlined"
                onClick={retryStranded}
                disabled={saving || stranded.phase === 'retrying'}
                sx={{ textTransform: 'none' }}
              >
                Try that entry again
              </Button>
            )}
          </Alert>
        )}

        {notice && (
          <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {failure && (
          <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setFailure(null)}>
            {failure}
          </Alert>
        )}
        {conflict && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {conflict}
          </Alert>
        )}

        {/* ── What is on the record. "Nothing recorded" is said ONLY when the
            read has actually answered: an unknown or failed read says so. ── */}
        {!authoritative ? (
          <Alert severity={stateStream.error ? 'warning' : 'info'} sx={{ mb: 1.5 }}>
            {stateStream.error ? COMPLETION_STATE_UNREADABLE : COMPLETION_STATE_UNKNOWN}
          </Alert>
        ) : activeSentence ? (
          <Box sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Chip size="small" color="success" label="Finished" />
              {state?.projection.appliedMappingVersion != null && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`coverage map v${state.projection.appliedMappingVersion}`}
                />
              )}
            </Stack>
            <Typography variant="body1">{activeSentence}</Typography>
            {statusLine && (
              <Typography variant="body2" color="text.secondary">
                {statusLine}
              </Typography>
            )}
            {state?.activeAssertion?.reportObservationId && (
              <Typography variant="body2" color="text.secondary">
                Evidence on file: the entry seen{' '}
                {state.activeAssertion.reportObservedOn ?? '—'}
                {state.activeAssertion.reportNativeNumber != null
                  ? ` (peak ${state.activeAssertion.reportNativeNumber})`
                  : ''}
                .
              </Typography>
            )}
            {state?.activeAssertion?.note && (
              <Typography variant="body2" color="text.secondary">
                “{state.activeAssertion.note}”
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Nothing is recorded as finished yet.
            {withdrawnLine ? ` ${withdrawnLine}` : ''}
          </Typography>
        )}

        {upgrade && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {upgrade}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={handleApply}
              disabled={!canMutate}
              sx={{ textTransform: 'none' }}
            >
              Apply the reviewed map
            </Button>
          </Alert>
        )}

        {authoritative && needsApplyRetry(state) && (
          <Box sx={{ mb: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleApply}
              disabled={!canMutate}
              sx={{ textTransform: 'none' }}
            >
              Update the learning picture
            </Button>
          </Box>
        )}

        {/* ── The primary action, then a one-line summary, then the detail on
            request. The full list of concepts before the action was a phone
            page of reading in front of one tap. ── */}
        {authoritative && !state?.activeEntryKey && !formOpen && (
          <Box sx={{ mb: 1 }}>
            <Button
              variant="contained"
              onClick={() => setFormOpen(true)}
              disabled={!canMutate}
              sx={{ textTransform: 'none' }}
            >
              This program is finished
            </Button>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary">
          {coverageSummaryHeadline(program)}
        </Typography>
        <Button
          size="small"
          onClick={() => setShowDetail((v) => !v)}
          sx={{ textTransform: 'none', px: 0 }}
        >
          {showDetail ? 'Hide what it covers' : 'See what it covers'}
        </Button>
        <Collapse in={showDetail} unmountOnExit>
          <Stack spacing={0.5} sx={{ mb: 1 }}>
            {summary.map((line) => (
              <Typography key={line.conceptId} variant="body2">
                <strong>{line.kidName}</strong> — {line.reach} ({line.unit})
                {line.partialReason ? ` · ${line.partialReason}` : ''}
              </Typography>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            {COMPLETION_MAP_NOTICE}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {COMPLETION_MAP_FOOTNOTE}
          </Typography>
        </Collapse>

        {formOpen && authoritative && !state?.activeEntryKey && (
          <Box sx={{ mt: 1.5 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1.5}>
              <TextField
                size="small"
                type="date"
                label="When did you know it was finished?"
                value={draft.observedOn}
                onChange={(e) => editDraft({ observedOn: e.target.value })}
                disabled={saving}
                error={Boolean(errors.observedOn)}
                helperText={errors.observedOn}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayKey } }}
              />

              <TextField
                select
                size="small"
                label="Where did you get this?"
                value={draft.source}
                onChange={(e) =>
                  editDraft({ source: e.target.value as typeof draft.source })
                }
                disabled={saving}
                error={Boolean(errors.source)}
                helperText={errors.source ?? COMPLETION_SOURCE_NOTICE}
              >
                {NATIVE_SOURCES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {NATIVE_SOURCE_LABEL[s]}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Did he have help? (optional)"
                value={draft.assistance}
                onChange={(e) =>
                  editDraft({ assistance: e.target.value as CompletionAssistance })
                }
                disabled={saving}
                error={Boolean(errors.assistance)}
                helperText={errors.assistance ?? 'Leave as it is if you’d rather not say.'}
              >
                {ASSISTANCE_CHOICES.map((a) => (
                  <MenuItem key={a} value={a}>
                    {ASSISTANCE_LABEL[a]}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Point at an entry you already saved? (optional)"
                value={draft.reportObservationId}
                onChange={(e) => editDraft({ reportObservationId: e.target.value })}
                disabled={saving || !citationsSettled}
                error={Boolean(errors.reportObservationId)}
                helperText={
                  errors.reportObservationId ??
                  (!citationsSettled
                    ? 'Your saved entries have not loaded, so there is nothing to point at yet.'
                    : citations.length === 0
                      ? 'No saved entry says this program was finished — you can still confirm it here.'
                      : 'Optional. Only an entry that says the last peak was finished can be used.')
                }
              >
                <MenuItem value="">No entry — just my confirmation</MenuItem>
                {citations.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {citationLabel(row)}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                size="small"
                label="Note (optional)"
                value={draft.note}
                onChange={(e) => editDraft({ note: e.target.value })}
                disabled={saving}
                multiline
                minRows={2}
                error={Boolean(errors.note)}
                helperText={errors.note ?? `Up to ${NOTE_MAX_LENGTH} characters.`}
              />

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={handleCheck}
                  disabled={saving}
                  sx={{ textTransform: 'none' }}
                >
                  Check this
                </Button>
                <Button
                  onClick={() => {
                    setFormOpen(false)
                    setPending(null)
                    setErrors({})
                  }}
                  disabled={saving}
                  sx={{ textTransform: 'none' }}
                >
                  Cancel
                </Button>
              </Stack>

              {pending && (
                <Alert severity="info">
                  <AlertTitle>Nothing has been saved yet</AlertTitle>
                  <Typography variant="body1" sx={{ mb: 1 }}>
                    {completionPreview(pending, childName, citation)}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {coverageSummaryHeadline(pending.program)} {COMPLETION_MAP_NOTICE}
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={!canMutate}
                    sx={{ textTransform: 'none' }}
                  >
                    Confirm it is finished
                  </Button>
                </Alert>
              )}
            </Stack>
          </Box>
        )}

        {/* ── Corrections: the explanation and one Withdraw button. ── */}
        {authoritative && state?.activeEntryKey && (
          <Box sx={{ mt: 1.5 }}>
            {!withdrawOpen ? (
              <Button
                size="small"
                color="inherit"
                onClick={() => setWithdrawOpen(true)}
                disabled={!canMutate}
                sx={{ textTransform: 'none' }}
              >
                Correct this — it isn’t finished
              </Button>
            ) : (
              <Alert severity="info">
                <AlertTitle>Nothing has been changed yet</AlertTitle>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="What was wrong with it?"
                  value={withdrawReason}
                  onChange={(e) =>
                    setWithdrawReason(e.target.value as CompletionWithdrawReason)
                  }
                  disabled={saving}
                  sx={{ my: 1 }}
                >
                  {WITHDRAW_REASON_CHOICES.map((r) => (
                    <MenuItem key={r} value={r}>
                      {WITHDRAW_REASON_LABEL[r]}
                    </MenuItem>
                  ))}
                </TextField>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  This takes back what that record marked as covered. Anything that
                  still stands on its own — what you have recorded yourself, what an
                  evaluation found, what he did in the Mine, a workbook position —
                  is left exactly as it is, and the record of what you confirmed
                  stays in the history.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    onClick={handleWithdraw}
                    disabled={!canMutate || !withdrawReason}
                    sx={{ textTransform: 'none' }}
                  >
                    Withdraw it
                  </Button>
                  <Button
                    onClick={() => {
                      setWithdrawOpen(false)
                      setWithdrawReason('')
                    }}
                    disabled={saving}
                    sx={{ textTransform: 'none' }}
                  >
                    Keep it
                  </Button>
                </Stack>
              </Alert>
            )}
          </Box>
        )}

        {/* ── The immutable history, with its OWN read status. ── */}
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="overline" sx={{ fontWeight: 700 }}>
            History
          </Typography>
          {eventStream.error ? (
            <Typography variant="body2" color="text.secondary">
              Couldn’t read the history just now, so what is listed here may be
              incomplete. Nothing has been lost.
            </Typography>
          ) : eventStream.loading ? (
            <Typography variant="body2" color="text.secondary">
              Reading the history…
            </Typography>
          ) : history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing has been recorded or corrected here yet.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {history.map((event) => (
                <Typography key={event.id} variant="body2" color="text.secondary">
                  {eventSentence(event)}
                </Typography>
              ))}
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}
