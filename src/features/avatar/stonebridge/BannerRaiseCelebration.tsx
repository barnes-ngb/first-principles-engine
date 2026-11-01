import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'

import { speakStatus } from '../speakVerse'
import { playBannerRaiseFanfare } from './bannerRaiseSound'
import StonebridgeLocationArt from './StonebridgeLocationArt'
import StonebridgeRecoveryNotice, { type StonebridgeRecoveryState } from './StonebridgeRecoveryNotice'
import { getMission } from './missions'

interface BannerRaiseCelebrationProps extends StonebridgeRecoveryState {
  /** Mission that was just completed, or null when idle. */
  missionId: string | null
  isLincoln: boolean
  /** Whether to read the thank-you aloud (TTS). */
  speak?: boolean
  /**
   * Acknowledged. Called **synchronously** on the tap, the Escape or the
   * button, so the caller's state moves in that same event.
   */
  onDismiss: () => void
  /**
   * Called once the view has finished leaving.
   *
   * A caller that supplies this **owns the focus hand-off** — the village board
   * puts the focus back on the repaired tile the replay came from — so MUI's
   * own focus restore is turned off for it. A caller that does not supplies
   * nothing and keeps MUI's restore, which is right for the Hero Hub card: the
   * focus goes back where it was before the celebration arrived.
   */
  onExited?: () => void
}

/** What the view is rendering, which outlives the prop through its own exit. */
interface CelebrationView {
  missionId: string | null
  open: boolean
}

/**
 * Celebration when a Stonebridge location is repaired: heals the art, raises the
 * banner, plays a fanfare, and shows the canon character's thank-you plus an
 * optional brief formation beat.
 *
 * ── Why this is a real MUI Dialog and not an overlay (AV-02 rounds 1–2) ──────
 *
 * It began as a `position: fixed` Box at `z-index: 9999` whose only way out was
 * `onClick` on the whole thing. Two rounds of independent verification found
 * what that costs once it is *replayable* from the village board rather than a
 * once-per-completion event, and the second round is why it is a Dialog:
 *
 *   • **round 1** — Escape did nothing, nothing took the focus and there was no
 *     control to tab to, so a child on a keyboard was stuck inside it; and
 *     because it covered everything, a read or save failure arriving while it
 *     was up hid the *Try again* underneath and swallowed the tap aimed at it;
 *   • **round 2** — `role="dialog"` plus a key handler was **not containment**.
 *     Tab out of *Keep going* and the focus walked straight into the board
 *     behind it: the hidden board close, then the Old Bridge tile, then the
 *     Watchtower tile. And at 390×400 with enlarged text the flex-centred
 *     content was 568px tall in a 400px window with no `overflow-y`, so *Keep
 *     going* sat at y≈476 — off the screen, unreachable by touch.
 *
 * Both are things a modal primitive already does properly, so this uses the one
 * the app already has rather than a second hand-rolled implementation of it:
 * MUI's `Dialog` brings the focus trap (Tab and Shift+Tab cycle **inside**),
 * `aria-hidden` on the underlying siblings, Escape routed to the **topmost**
 * modal only — so Escape here closes the replay and not the board under it —
 * and `scroll="paper"`, which is what makes a short screen work: the title, the
 * recovery notice and *Keep going* are outside the scrolling region, so a long
 * thank-you scrolls and the way out never moves off screen.
 *
 * ── What is deliberately preserved ──────────────────────────────────────────
 *
 * Dismissal is still **synchronous** — the caller's state moves on the tap —
 * and the view then animates out and reports `onExited` for the focus hand-off.
 * The fanfare, the optional TTS and the no-write behaviour are untouched: this
 * component reads nothing and writes nothing. The 350 ms `setTimeout` that once
 * deferred `onDismiss` stays **removed** rather than cancelled, and the view it
 * renders is held in local state so a prop cleared in that same event cannot
 * cut its own exit short.
 *
 * ── How it is named, and why not with `aria-label` (AV-02 round 3) ──────────
 *
 * The agreed name is the location: `<location> repaired`, the same shape the
 * board uses, so the view is addressable as the thing it celebrates. That was
 * first written as an `aria-label` on the paper, and it named nothing: MUI runs
 * the `aria-labelledby` prop through `useId`, so the paper **always** carries a
 * labelledby relation — pointing, by default, at the `DialogTitle` — and a
 * labelledby relation wins over `aria-label`. The computed name was therefore
 * the whole title, "🎉 BANNER RAISED!The Old Bridge repaired!", and neither a
 * browser nor a test could find the dialog by the name both had agreed on.
 *
 * So the relation is made explicit instead of left to the default, and it
 * points at the location line **itself** rather than at a duplicate of it: the
 * title's second line holds the name in its own span and the "!" sits outside
 * that span, so the name is exactly `<location> repaired` while the title still
 * reads `<location> repaired!` on screen. The `DialogTitle` is given its own id
 * so it cannot take the one the name is addressed to (it would otherwise
 * inherit it from `DialogContext` and the duplicate would resolve first), and
 * there is **no** `aria-label` left on the paper: a second naming mechanism
 * that loses to this one is the defect, not a fallback.
 *
 * ── The one behaviour that changed ──────────────────────────────────────────
 *
 * Tapping the celebration *itself* no longer dismisses it — tapping outside it
 * does, and the button does. That is the same change that fixed round 1's
 * swallowed *Try again*: a surface where every tap means "continue" cannot also
 * hold a control that means something else.
 */
export default function BannerRaiseCelebration({
  missionId,
  isLincoln,
  speak = false,
  onDismiss,
  onExited,
  stale,
  readError,
  saveError,
  retrying,
  onRetry,
}: BannerRaiseCelebrationProps) {
  const mission = missionId ? getMission(missionId) : undefined

  /**
   * The mission on screen, and whether the view is open for it.
   *
   * Held here rather than read straight from the prop because `onDismiss` is
   * synchronous: the caller clears `missionId` in the same event, and a view
   * that unmounted on that would skip its own exit — and with it the one
   * callback that can safely hand the focus back (while a dialog is open its
   * trap owns the focus, so a `focus()` made during the tap is simply taken
   * back). Opened during render, so there is no frame in which it is mounted
   * but not open; the branch converges because after it the two agree.
   */
  const [view, setView] = useState<CelebrationView>(() => ({ missionId: null, open: false }))
  if (mission && missionId && (view.missionId !== missionId || !view.open)) {
    setView({ missionId, open: true })
  }
  const shown = view.missionId ? getMission(view.missionId) : undefined

  /** Focused on open. `autoFocus` does it; this is the belt to that braces. */
  const keepGoingRef = useRef<HTMLButtonElement | null>(null)

  /**
   * The name relation and the title's own id — see the naming note above.
   *
   * Two distinct ids from one `useId` because the `DialogTitle` must NOT be the
   * element the name points at: the whole title reads "🎉 BANNER RAISED!…", and
   * left to itself it takes the labelledby id straight out of `DialogContext`.
   */
  const ids = useId()
  const nameId = `${ids}-name`
  const titleId = `${ids}-title`

  const isCompact = useMediaQuery('(max-width:599.95px), (max-height:600px)')
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: 8 + i * 6.5,
        top: 15 + (i % 4) * 18,
        delay: (i % 7) * 0.12,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionId],
  )

  // Fanfare and the optional TTS, once per arriving mission. Unchanged, and
  // deliberately keyed on the PROP: one celebration, one fanfare.
  useEffect(() => {
    if (!mission) return
    playBannerRaiseFanfare()
    if (speak) {
      // Slight delay so the fanfare lands first.
      const t = setTimeout(() => speakStatus(mission.thankYou.line), 700)
      return () => clearTimeout(t)
    }
  }, [mission, speak])

  useEffect(() => {
    if (!view.open) return
    keepGoingRef.current?.focus()
  }, [view.open, view.missionId])

  if (!shown) return null

  const accent = shown.art.accent
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  /** Plain and readable, at a size a six-year-old can actually read. */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'

  const dismiss = () => {
    setView((prev) => (prev.open ? { ...prev, open: false } : prev))
    onDismiss()
  }

  /**
   * The view has finished leaving.
   *
   * `react-transition-group` cancels a pending exit when the view is reopened,
   * so this cannot fire for a view that is on screen again; the `prev.open`
   * check says so rather than relying on it, and the caller's own hand-off is
   * guarded on the child and the mission as well.
   */
  const handleExited = () => {
    setView((prev) => (prev.open ? prev : { missionId: null, open: false }))
    onExited?.()
  }

  return (
    <Dialog
      open={view.open}
      // The name: the location line in the title, and nothing else. Given
      // explicitly because MUI supplies this prop from `useId` when it is left
      // out — at the whole title — and a labelledby relation beats the
      // `aria-label` the name used to be written as.
      aria-labelledby={nameId}
      // Escape and a tap outside. MUI routes Escape to the TOPMOST modal, which
      // is what stops it closing the village board underneath instead.
      onClose={dismiss}
      // A short or narrow screen gets the whole screen: the 390×400 enlarged
      // case had nowhere to put a centred 568px column.
      fullScreen={isCompact}
      fullWidth
      maxWidth="sm"
      // The title, the recovery notice and the actions sit OUTSIDE the scrolling
      // region, so a long thank-you scrolls and the way out never moves.
      scroll="paper"
      disableRestoreFocus={Boolean(onExited)}
      transitionDuration={reduceMotion ? 0 : undefined}
      TransitionProps={{ onExited: handleExited }}
      // Above the village board (`modal`) and an open location visit
      // (`modal + 1`): this is the topmost view, and says so rather than
      // relying on mount order.
      sx={{ zIndex: (t) => t.zIndex.modal + 2 }}
      slotProps={{
        paper: {
          // No `aria-label` here: the name is the labelledby relation above, and
          // a second mechanism that loses to it is what hid the agreed name.
          sx: {
            position: 'relative',
            overflow: 'hidden',
            backgroundImage: 'none',
            bgcolor: isLincoln ? 'rgba(4,8,14,0.98)' : 'rgba(255,244,250,0.99)',
            border: `1px solid ${accent}66`,
            borderRadius: isCompact ? 0 : isLincoln ? '10px' : '18px',
          },
        },
      }}
    >
      {/* Sparkle burst — clipped to the paper, never over the scroll. */}
      <Box
        aria-hidden="true"
        sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
      >
        {sparkles.map((s, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              left: `${s.left}%`,
              top: `${s.top}%`,
              fontSize: '1.4rem',
              animation: `sbSparkle 1.4s ease-out ${s.delay}s forwards`,
              '@keyframes sbSparkle': {
                from: { transform: 'scale(0)', opacity: 1 },
                to: { transform: 'scale(1.4) translateY(-60px)', opacity: 0 },
              },
              // The banner and the thank-you are the celebration; the motion is
              // not. Nothing of the state goes with it.
              '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0 },
            }}
          >
            ✨
          </Box>
        ))}
      </Box>

      {/* Its own id, so it does not take the name's: the name is the location
          line inside it, not the "🎉 BANNER RAISED!" heading with it. */}
      <DialogTitle id={titleId} sx={{ textAlign: 'center', pb: 1 }}>
        <Box
          component="span"
          sx={{
            display: 'block',
            fontFamily: titleFont,
            fontSize: isLincoln ? '14px' : '1.4rem',
            fontWeight: 700,
            color: accent,
            textShadow: `0 0 18px ${accent}88`,
          }}
        >
          🎉 BANNER RAISED!
        </Box>
        <Box
          component="span"
          sx={{
            display: 'block',
            mt: 0.75,
            fontFamily: titleFont,
            fontSize: isLincoln ? '13px' : '1.05rem',
            fontWeight: 700,
            lineHeight: 1.45,
            color: isLincoln ? '#F7D774' : '#7a3f67',
          }}
        >
          {/* The name is this span, so it is exactly `<location> repaired`;
              the "!" is outside it and the line still reads the same. */}
          <Box component="span" id={nameId}>
            {shown.locationName} repaired
          </Box>
          !
        </Box>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}
      >
        <Box sx={{ width: '100%', maxWidth: 'min(360px, 100%)' }}>
          <StonebridgeLocationArt
            missionId={shown.id}
            art={shown.art}
            state="repaired"
            isLincoln={isLincoln}
            animateBanner
            height={isCompact ? 120 : 150}
          />
        </Box>

        {/* Canon character thank-you */}
        <Box
          sx={{
            width: '100%',
            p: 1.5,
            borderRadius: isLincoln ? '8px' : '16px',
            border: `1px solid ${accent}66`,
            background: isLincoln ? 'rgba(12,20,30,0.9)' : 'rgba(255,255,255,0.85)',
          }}
        >
          {/* The character's own words, in a plain readable face: this is the
              longest thing a child reads here. The short headings above keep
              the pixel theme. */}
          <Typography sx={{ fontFamily: bodyFont, fontSize: '14px', fontWeight: 700, color: accent, mb: 0.5 }}>
            {shown.thankYou.name}
          </Typography>
          <Typography
            sx={{
              fontFamily: bodyFont,
              fontSize: '15px',
              lineHeight: 1.55,
              color: isLincoln ? 'rgba(255,255,255,0.92)' : 'rgba(32,16,24,0.85)',
            }}
          >
            “{shown.thankYou.line}”
          </Typography>
        </Box>

        {/* Brief, skippable formation beat */}
        {shown.formationBeat && (
          <Typography
            sx={{
              fontFamily: bodyFont,
              fontSize: '14px',
              lineHeight: 1.5,
              color: isLincoln ? 'rgba(255,255,255,0.72)' : 'rgba(60,40,55,0.7)',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            {shown.formationBeat.name}: {shown.formationBeat.line}
          </Typography>
        )}
      </DialogContent>

      {/* ── The one recovery door, OUTSIDE the scrolling region ───────
          This view covers the board and the card, so the notice and the
          *Try again* they would have shown are unreachable underneath it. Put
          here rather than in the content above because a failure a child has
          to scroll to find is a failure they do not find. */}
      {(stale || readError || saveError || retrying) && (
        <Box sx={{ px: 2, pt: 1.5 }}>
          <StonebridgeRecoveryNotice
            isLincoln={isLincoln}
            stale={stale}
            readError={readError}
            saveError={saveError}
            retrying={retrying}
            onRetry={onRetry}
          />
        </Box>
      )}

      <DialogActions sx={{ justifyContent: 'center', px: 2, py: 1.5 }}>
        <Button
          // The focus lands here, and the trap keeps it in this view.
          autoFocus
          ref={keepGoingRef}
          onClick={dismiss}
          variant="outlined"
          sx={{
            minHeight: 44,
            px: 3,
            fontFamily: bodyFont,
            fontSize: '14px',
            fontWeight: 700,
            textTransform: 'none',
            color: isLincoln ? '#F7D774' : '#7a3f67',
            borderColor: `${accent}88`,
          }}
        >
          Keep going
        </Button>
      </DialogActions>
    </Dialog>
  )
}
