import { useEffect, useLayoutEffect, useRef } from 'react'
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
 * with a key made of family, child, profile and the identity EPOCH, so a change
 * destroys the reads instead of carrying them, and there is no frame in which an
 * answer outlives its scope. The epoch is in the key because a raw same-tick
 * `A → B → A` leaves family and child unchanged while the store has counted two
 * movements — the one case a scope string cannot see.
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
  identityEpoch,
  focusGeneration,
  onFocusServed,
  onOffer,
}: {
  familyId: string
  childId: string
  /**
   * The identity epoch this surface was RENDERED with — part of its key, and
   * the only epoch its handlers may act on. A handler that sampled the store
   * instead would always agree with it and so could never be refused.
   */
  identityEpoch: number
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

  /**
   * Is this render's identity still the live one, and is this mount still here?
   *
   * The fresh reading is used ONLY to refuse: the epoch this surface may act on
   * is the one it was rendered with, and a disagreement means the identity moved
   * after the render whose handler is now running. A retained handler from an
   * unmounted tree is refused for the same reason.
   */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * The offer this surface has most recently COMMITTED — the one thing a mount
   * and epoch check cannot see.
   *
   * Both of those answer "is this still the same scope?", and inside one live
   * scope the offer itself can still go away: the model is removed, the read
   * fails, or fresh evidence moves the recommendation to another mode. The
   * component stays mounted and the epoch never moves, so a handler captured by
   * an earlier render would happily hand on an offer the screen no longer makes
   * — and the host would navigate and create a trip for it.
   *
   * This is written in a LAYOUT EFFECT rather than during render on purpose. A
   * render-time write would record an offer from a render that React may
   * abandon (a concurrent render that never commits), which is the opposite
   * mistake: the handler would then be measured against something no child ever
   * saw. Only a commit counts, and a commit that renders nothing records
   * `null`, which is exactly the refusal we want.
   */
  const committedOffer = useRef<{ invitation: MineInvitation | null; settled: boolean }>({
    invitation: null,
    settled: false,
  })
  useLayoutEffect(() => {
    committedOffer.current = { invitation, settled }
  }, [invitation, settled])

  /**
   * Is the offer this handler captured still the offer on the screen?
   *
   * Compared by what the host will ACT on — the concept, the mode and where the
   * offer came from — not by object identity, which a re-read rebuilds every
   * time. Unsettled, cleared, failed and changed all land on `false`.
   */
  const stillOffered = (captured: MineInvitation) => {
    const latest = committedOffer.current
    if (!latest.settled) return false
    const live = latest.invitation
    if (!live) return false
    return (
      live.conceptId === captured.conceptId &&
      live.questMode === captured.questMode &&
      live.domain === captured.domain &&
      live.source === captured.source
    )
  }

  const stillLive = () => mounted.current && identityEpoch === getLibraryIdentityEpoch()

  const actionRef = useRef<HTMLButtonElement | null>(null)
  const servedGeneration = useRef(0)
  useLayoutEffect(() => {
    if (!focusGeneration || !settled) return
    if (servedGeneration.current === focusGeneration) return
    // The focus is a movement on screen: a return whose identity moved between
    // this render and this commit is not served and nothing is focused.
    if (identityEpoch !== getLibraryIdentityEpoch()) return
    servedGeneration.current = focusGeneration
    const action = actionRef.current
    // `isConnected`, as everywhere else in this feature: focusing a detached
    // node moves the focus to `body` and reports that it landed somewhere.
    const landed = Boolean(action?.isConnected)
    if (landed) action?.focus()
    onFocusServed(focusGeneration, landed)
  }, [focusGeneration, settled, identityEpoch, onFocusServed])

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
          // The epoch this render COMMITTED with, never a fresh sample: a
          // retained handler whose identity has moved is refused here and
          // again by the store, so no trip is created and no route changes.
          if (!stillLive()) return
          // And the offer has to still BE this offer. Same scope, same mount,
          // same epoch — and the recommendation gone, failed or moved since
          // this handler was drawn is refused just as firmly.
          if (!stillOffered(invitation)) return
          onOffer(invitation, identityEpoch)
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
