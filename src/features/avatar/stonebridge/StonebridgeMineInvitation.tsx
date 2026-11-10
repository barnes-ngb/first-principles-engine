import { useLayoutEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { useChildSkillSnapshot } from '../../../core/hooks/useChildSkillSnapshot'
import { useLearnerModel } from '../../../core/hooks/useLearnerModel'
import {
  hasMathCalibration,
  hasReadingCalibration,
} from '../../quest/knowledgeMineAccess'
import { MINE_INVITATION_LINE } from './libraryReturnCopy'
import { getLibraryIdentityEpoch } from './libraryReturnFlow'
import { selectMineInvitation, type MineInvitation } from './mineInvitation'

/**
 * The town's one invitation into a Mine mode — the Square-side offer (UX-493).
 *
 * ── What it is, and what it is not ───────────────────────────────────────────
 *
 * One line and one 44px action, beside the Square on the canonical town page. It
 * offers a MODE of the existing, calibrated Knowledge Mine, chosen by the pure
 * `selectMineInvitation` from the child's own learner model. It is **not** a
 * mission: the Square is a landmark with nothing to repair, so there is no
 * counter, no progress, no state or level word, no parent reasoning and no score
 * here — and no new art. The ordinary ways into the Mine are untouched.
 *
 * ── Why it is a component, and why the host gives it a key ───────────────────
 *
 * It exists to be MOUNT-SCOPED. Both reads behind it answer asynchronously and
 * keep their previous answer while the next one is in flight —
 * `useChildSkillSnapshot` reports `loaded` per load and `useLearnerModel` holds
 * the last document — so a surface that simply re-rendered on a child change
 * could offer the PREVIOUS child's next move, authorised by the previous child's
 * calibration, for one render against the new child's id. The host mounts this
 * with `key={`${familyId}_${childId}`}`, so a change destroys the reads instead
 * of carrying them, and there is no frame in which an answer outlives its scope.
 *
 * It reads and offers; it never writes, never selects a child, never generates a
 * synthesis and never starts a session. The host owns the trip.
 *
 * ── The return, and its honest fallback ──────────────────────────────────────
 *
 * A Mine trip's return focuses this action, which is why the focus is claimed
 * HERE rather than by the page: the page's DOM is back before these two reads
 * are, so a focus performed on arrival would always find nothing and always fall
 * back. The claim therefore waits for the reads to settle and then reports
 * whether it landed — if the invitation is legitimately gone (fresh evidence
 * retired it while the child was away) the host puts the focus at the top of the
 * town instead. Either way the journey is served exactly once.
 */
export default function StonebridgeMineInvitation({
  familyId,
  childId,
  focusGeneration,
  onFocusServed,
  onOffer,
}: {
  familyId: string
  childId: string
  /**
   * The generation of a Mine return waiting for its focus, or `0` for none.
   * The host has already checked the journey is this scope's and this entry's.
   */
  focusGeneration: number
  /** Reported once per generation, with whether the focus actually landed. */
  onFocusServed: (generation: number, landed: boolean) => void
  /** The tap: the offer, and the identity epoch read AT that tap. */
  onOffer: (invitation: MineInvitation, observedEpoch: number) => void
}) {
  const { snapshot, loaded } = useChildSkillSnapshot(familyId, childId)
  const { model, loading } = useLearnerModel(familyId, childId)

  /**
   * Both reads have answered — found, absent or failed.
   *
   * A failed read is not an affirmative empty result, and neither hook reports
   * one separately: both turn a failure into "nothing". That is the correct
   * reading for this surface either way, because every one of missing, failed,
   * uncalibrated and unsupported means the same thing here — the ordinary town,
   * with no invitation on it. Nothing is retried and nothing is said.
   */
  const settled = loaded && !loading

  const invitation = settled
    ? selectMineInvitation({
        model,
        readingCalibrated: hasReadingCalibration(snapshot),
        mathCalibrated: hasMathCalibration(snapshot),
      })
    : null

  const actionRef = useRef<HTMLButtonElement | null>(null)
  const servedGeneration = useRef(0)
  useLayoutEffect(() => {
    if (!focusGeneration || !settled) return
    if (servedGeneration.current === focusGeneration) return
    servedGeneration.current = focusGeneration
    const action = actionRef.current
    // `isConnected`, as everywhere else in this feature: focusing a detached
    // node moves the focus to `body` and reports that it landed somewhere.
    const landed = Boolean(action?.isConnected)
    if (landed) action?.focus()
    onFocusServed(focusGeneration, landed)
  }, [focusGeneration, settled, onFocusServed])

  if (!invitation) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        mt: 1,
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'warning.300',
        bgcolor: 'warning.50',
      }}
    >
      <Typography
        sx={{
          flex: '1 1 auto',
          // Plain and at least 14px — this feature's rule for anything a child
          // has to READ, exactly as the way-back banner is.
          fontSize: '14px',
          lineHeight: 1.45,
        }}
      >
        ⛏️ {MINE_INVITATION_LINE}
      </Typography>
      <Button
        ref={actionRef}
        variant="contained"
        color="warning"
        onClick={() => {
          // Read HERE because here IS the tap: this is a plain control on the
          // page with no view closing between the press and the navigation, so
          // the epoch the journey is created against is the one the child's tap
          // was made under. The host stamps the journey with it and never takes
          // a fresh reading of its own.
          onOffer(invitation, getLibraryIdentityEpoch())
        }}
        sx={{
          minHeight: 44,
          px: 2,
          flex: { xs: '1 1 100%', sm: '0 0 auto' },
          fontSize: '14px',
          fontWeight: 700,
          textTransform: 'none',
        }}
      >
        {invitation.label}
      </Button>
    </Box>
  )
}
