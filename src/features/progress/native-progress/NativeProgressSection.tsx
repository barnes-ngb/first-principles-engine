import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
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
import type { NativeProgressObservation } from '../../../core/types/nativeProgress'
import { formatDateShort, todayKey } from '../../../core/utils/dateKey'
import {
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
  numberPhrase,
  observationSentence,
  previewSentence,
  reviewNativeProgressDraft,
  savedNotice,
  summarizeObservations,
  summarySentence,
  type NativeProgressDraft,
  type NativeProgressDraftErrors,
  type ReviewedObservation,
} from './nativeProgressRule'
import { useNativeProgressObservations } from './useNativeProgressObservations'

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
 * stated in words (`childSwitchNotice`). RESET rather than BIND because the draft
 * is a number, a date and two choices — seconds to retype, and nothing was paid
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
 * ── Parent-only, on capability ──────────────────────────────────────────────
 *
 * The form renders only for a parent profile and the save handler re-checks, the
 * two-layer rule `CurriculumTab`'s rename and set-lesson doors use. **This is a
 * UI capability gate, not server-side role separation**: `firestore.rules` grants
 * the whole family subtree to the owning UID and the kids share that sign-in, so a
 * kid profile is prevented from reaching the write *in the app*, which is what the
 * gate claims and all it claims.
 */
export default function NativeProgressSection() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild, isChildProfile } = useActiveChild()
  // Seeded once per mount: the date a fresh draft starts on, and the latest day a
  // date field will accept. A clock read during every render would make "today"
  // move under an open draft.
  const [today] = useState(todayKey)
  const {
    observations,
    loading,
    error: readError,
    observationsChildId,
    saving,
    save,
  } = useNativeProgressObservations(activeChildId)

  const [draft, setDraft] = useState<NativeProgressDraft>(() =>
    emptyNativeProgressDraft(today),
  )
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

  /** The family + child this surface is bound to, with the name for its notices. */
  const [bound, setBound] = useState({
    familyId: familyId ?? '',
    childId: activeChildId,
    childName: activeChild?.name ?? 'this child',
  })

  const resetDraft = useCallback(() => {
    setDraft(emptyNativeProgressDraft(today))
    setFieldErrors({})
    setPending(null)
    setCorrecting(null)
    setEntryKey(newEntryKey())
    setSaveError(null)
  }, [today])

  // ── The scope guard, during render ────────────────────────────────────────
  //
  // Not in an effect: an effect runs after this subtree has already painted the
  // previous child's draft under the new child's name, and a parent who taps Save
  // in that frame is the cross-child write the guard exists to prevent.
  const scopeKey = `${familyId ?? ''}|${activeChildId}`
  if (bound.familyId !== (familyId ?? '') || bound.childId !== activeChildId) {
    const hadDraft =
      !draftIsEmpty(draft, today) || pending !== null || correcting !== null
    setSwitchNotice(childSwitchNotice(bound.childName, hadDraft, saving))
    setBound({
      familyId: familyId ?? '',
      childId: activeChildId,
      childName: activeChild?.name ?? 'this child',
    })
    setDraft(emptyNativeProgressDraft(today))
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
   * history — the `CertificateScanSection` lesson (UX-329, Codex round 3). Bumped
   * in an effect, since a ref may not be assigned during render.
   */
  const scopeRun = useRef(0)
  useEffect(() => {
    scopeRun.current += 1
  }, [scopeKey])

  /** Keep the bound child's NAME current when only the name changes. */
  useEffect(() => {
    if (!activeChild) return
    setBound((prev) =>
      prev.childId === activeChild.id && prev.childName !== activeChild.name
        ? { ...prev, childName: activeChild.name }
        : prev,
    )
  }, [activeChild])

  const childName = activeChild?.name ?? 'this child'
  // The fallback is for a stored draft shape that outlived a program being
  // renamed; the field label must never render as "Undefined number".
  const unit = NATIVE_PROGRAM_UNIT[draft.program] ?? 'number'

  const editDraft = useCallback(
    (patch: Partial<NativeProgressDraft>) => {
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
      setSaveError(failureNotice('no child is selected'))
      return
    }
    const run = scopeRun.current
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
    if (scopeRun.current !== run) return
    if (!outcome.ok) {
      // Unsaved, and the entry is left exactly as it was — including its
      // `entryKey`, so tapping Save again cannot write a second row.
      setSaveError(outcome.message)
      return
    }
    setReceipt(
      outcome.alreadyRecorded
        ? `Already recorded for ${childName}: ${numberPhrase(outcome.observation)}, seen ${formatDateShort(
            outcome.observation.observedOn,
          )}. Nothing was saved twice.`
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

  const startCorrection = useCallback(
    (observation: NativeProgressObservation) => {
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
  // with another child — or not yet stamped at all — is not this child's record.
  const settled = observationsChildId === activeChildId
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

      {correcting && (
        <Alert severity="info">{correctionPreamble(correcting)}</Alert>
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
          helperText={fieldErrors.program}
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
              <Typography variant="body2" color="text.secondary">
                {NATIVE_SOURCE_LABEL[pending.source]} · {NATIVE_PROGRESS_SOURCE_NOTICE}
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
                <Button size="small" onClick={() => startCorrection(observation)}>
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
