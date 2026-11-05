import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'

import StonebridgeLocationArt from './StonebridgeLocationArt'
import StonebridgeLocationDialog from './StonebridgeLocationDialog'
import StonebridgeRecoveryNotice, { type StonebridgeRecoveryState } from './StonebridgeRecoveryNotice'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import VillageScene from './VillageScene'
import { getMission } from './missions'
import { getLibraryIdentityEpoch } from './libraryReturnFlow'
import {
  deriveVillageBoard,
  VillageLocationState,
  type MissionComputation,
} from './computeStonebridgeProgress'
import type { StonebridgeDestinations } from './stonebridgeDestinations'
import { kidPalette } from '../../../app/tokens'

interface StonebridgeVillageProps extends StonebridgeRecoveryState, StonebridgeDestinations {
  open: boolean
  /** Close the board. */
  onClose: () => void
  /**
   * The board has finished closing and nobody is going anywhere: put the focus
   * back on the control that opened it.
   *
   * Separate from {@link onClose}, and called from the board's own exit, because
   * **a focus call made during the tap is taken straight back** — the dialog's
   * focus trap is still mounted and enabled until React has committed the close,
   * and it pulls any outside focus back inside. It is also not called at all
   * when the board is closing on its way to a destination, which is the other
   * half of "one thing moves the focus at a time".
   */
  onReturnFocus?: () => void
  isLincoln: boolean
  /**
   * `${familyId}_${childId}` — whose village this is.
   *
   * Everything a visit holds is scoped to it: a change of child or family
   * closes the board, the open location and the replay in the SAME render, and
   * a destination tap left over from the previous child's open view is refused
   * rather than performed for the child now on screen.
   */
  scopeKey: string
  /** Completed (repaired) mission ids, in completion order. */
  completedMissions: string[]
  /** Raised banner location ids — drives the Banner Hall section. */
  raisedBanners: string[]
  /** Id of the in-focus mission (the active tile). */
  currentMissionId: string
  /** Derived counters for the active mission (null if every location is repaired). */
  active: MissionComputation | null
  /**
   * A location tile to put the focus on once the board has finished opening.
   *
   * Set only when the board is being opened to serve a return from My Books:
   * the child asked to come back to a place, so the focus belongs on that place
   * rather than on the top of a board they have to find their way down again.
   * Nothing else about the board changes — no location visit is opened, nothing
   * is claimed to be repaired, and no progress is read or written. A board
   * opened any other way passes `null` and behaves exactly as it always has.
   */
  focusMissionId?: string | null
  /**
   * The focus hand-off above has happened (or had no tile to land on).
   *
   * Called once, from the board's own `onEntered`, so the request is consumed
   * exactly once however it turned out — a tile that is not there must not
   * leave a request behind to fire at the next board.
   */
  onFocusServed?: () => void
}

/** What a visit is on its way to, and whose visit it was. */
type PendingLeave = {
  scopeKey: string
  destination: 'books' | 'forge'
  /** The location the child was looking at when they left it. */
  missionId: string
  /**
   * The observed identity epoch at the moment of the TAP.
   *
   * The scope string alone cannot answer this boundary: the board takes time to
   * close, the journey is created only once it has, and an `A → B → A` inside
   * that window leaves `scopeKey` reading `A` again with the shelf underneath
   * having re-read for someone else and back. There is no flow yet for the
   * store subscription to cancel, so the tap carries a monotonic token instead
   * and the departure is refused if it moved.
   */
  identityEpoch: number
}

/**
 * Everything an open board holds, stamped with the child it belongs to.
 *
 * `selected` is the location the visit is OPEN for; `shown` is the location the
 * visit dialog is still RENDERING. They differ for exactly as long as a closing
 * visit takes to animate out, and the pair is what keeps the dialog mounted
 * through its own exit — unmounting it on the tap would skip the transition,
 * and with it the one callback that can safely return the focus to the tile
 * (while a dialog is open its focus trap owns the focus, so a focus call made
 * during the tap is simply taken back).
 */
interface VillageView {
  scopeKey: string
  selected: string | null
  shown: string | null
  replay: string | null
}

/**
 * Full-screen Stonebridge village board, opened from the Hero-Hub mission card.
 *
 * Shows every Bible location with state derived read-only from progress:
 *  • Repaired → repaired structure + raised banner; the visit replays that character's thank-you.
 *  • Active   → highlighted with its progress bar; the visit offers the real bookshelf.
 *  • Upcoming → shown muted as anticipation (one active mission at a time).
 *
 * A Banner Hall section tallies the banners raised so far — the "look what you've
 * rebuilt" payoff — and says so plainly once every location is fixed. The board
 * never reads or writes the XP / forge / diamond economy: opening it, visiting a
 * location and replaying a thank-you all write nothing.
 *
 * ── The overview, and the list under it ──────────────────────────────────────
 *
 * The board opens with `VillageScene` — the seven locations drawn once, in one
 * landscape, with the Square and the roads that join them — and the plain list
 * of places underneath. The picture is **noninteractive** (see that file for the
 * enlarged-text finding that settled it), so the list is the one and only way
 * into a location: one control per place, each a full-size target naming its
 * place and its condition, and the focus comes back to the exact tile a visit
 * was opened from.
 *
 * ── Why this is a Dialog and the tiles are buttons ───────────────────────────
 *
 * It used to be a `position: fixed` Box at `z-index: 9000` with `role="dialog"`
 * and clickable `<Box>` tiles. Both had to go to put a location view on top of
 * it. A hand-rolled overlay at 9000 is **above** every MUI modal (1300), so a
 * nested dialog would have rendered *behind* the board; and a clickable Box is
 * not focusable, not operable by Enter or Space, and not announced as a
 * control, so "tap the tile" was mouse-only and there was no focus to return a
 * visit to. Now the board is a real `fullScreen` Dialog — one focus trap,
 * Escape, and a backdrop MUI owns — and every tile is a native `<button>` with
 * an accessible name that states the location's condition.
 *
 * ── Recovery, and the focus hand-off ─────────────────────────────────────────
 *
 * A read or save failure is reported here as well as on the card, because the
 * board covers the card (`UX-474`); now that a visit covers the board, the same
 * notice and the same *Try again* travel to the topmost view too.
 *
 * Focus is moved by exactly ONE thing at a time. MUI's own focus restore is off
 * on all three views this file opens — the board, the location visit and the
 * replayed thank-you — and instead: a closed visit puts the focus back on the
 * tile it came from, a closed replay puts it back on the repaired tile it was
 * played from, a dismissed board hands it back to the caller's opener, a board
 * closed on the way to a destination hands it to the destination, a departure
 * REFUSED on arrival hands it back to the caller's opener as a dismissal does
 * (`refuseLeave` — refusing the navigation must not also strand the keyboard on
 * `document.body`), and a board OPENED to serve a return from My Books puts it
 * on the place the child asked to come back to (`focusMissionId`).
 *
 * **Every one of those happens on the view's own `onExited`, never on the tap.**
 * Until a modal's transition is over its focus trap still owns the focus and
 * MUI still has the rest of the page `aria-hidden`, so a `focus()` made during
 * the tap is taken straight back — and the armor gallery would be focused while
 * it was still hidden.
 */
export default function StonebridgeVillage({
  open,
  onClose,
  onReturnFocus,
  isLincoln,
  scopeKey,
  completedMissions,
  raisedBanners,
  currentMissionId,
  active,
  stale = false,
  readError = false,
  saveError = false,
  retrying = false,
  onRetry,
  onOpenBooks,
  onVisitForge,
  focusMissionId = null,
  onFocusServed,
}: StonebridgeVillageProps) {
  /**
   * The open visit and the replay, stamped with the child they belong to.
   *
   * One state value and one conditional render-phase update, so there is no
   * frame in which the previous child's open location is on the new child's
   * board — the `useStonebridgeProgress` precedent, for the same reason (an
   * effect would leave exactly that frame open, and this repo's lint forbids
   * the set-state-in-effect shape).
   */
  const [view, setView] = useState<VillageView>(() => ({
    scopeKey,
    selected: null,
    shown: null,
    replay: null,
  }))
  if (view.scopeKey !== scopeKey) {
    setView({ scopeKey, selected: null, shown: null, replay: null })
  }
  const live = view.scopeKey === scopeKey ? view : null

  /** Tiles, by mission id, so a closed visit can give the focus back. */
  const tileRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  /** The tile a closing visit should return the focus to. */
  const tileToFocusRef = useRef<string | null>(null)
  /** The repaired tile an open replay came from, for when it closes. */
  const replayTileRef = useRef<string | null>(null)
  /** A destination the board is closing on its way to. */
  const pendingLeaveRef = useRef<PendingLeave | null>(null)
  /** The board was dismissed, so the focus goes back to its opener on exit. */
  const pendingDismissRef = useRef(false)

  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  /** Short headings keep the pixel theme… */
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  /** …and everything else is plain and at least 14px (12px for small print). */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const board = deriveVillageBoard(completedMissions, currentMissionId)
  const bannerCount = raisedBanners.length
  /**
   * Every location is fixed, including the one the rally is parked on.
   *
   * Derived from the data that is already there — the last mission stays
   * `currentMissionId` once complete — so there is no new stored flag, and a
   * normal transition (a finished mission whose successor has queued) still
   * reads as a damaged next location, because that successor is not in
   * `completedMissions`.
   */
  const allRepaired = completedMissions.includes(currentMissionId)

  /** The location the visit dialog is rendering — through its exit, too. */
  const shownMission = live?.shown ? getMission(live.shown) : undefined
  const shownState = shownMission
    ? board.find((entry) => entry.mission.id === shownMission.id)?.state
    : undefined
  const visitOpen = open && !!live?.selected && live.selected === live.shown

  const recovery: StonebridgeRecoveryState = { stale, readError, saveError, retrying, onRetry }

  const openLocation = (missionId: string) => {
    setView({ scopeKey, selected: missionId, shown: missionId, replay: null })
  }

  /**
   * Done looking.
   *
   * The open visit and the replay are dropped with the board, so coming back —
   * or coming back as a different child — opens a board with nothing already
   * open on it.
   */
  const dismiss = () => {
    tileToFocusRef.current = null
    pendingLeaveRef.current = null
    pendingDismissRef.current = true
    setView({ scopeKey, selected: null, shown: null, replay: null })
    onClose()
  }

  const closeLocation = () => {
    if (!live) return
    // `shown` is kept so the dialog transitions out instead of vanishing; the
    // tile it came from is remembered for the moment that transition ends.
    tileToFocusRef.current = live.selected
    setView({ ...live, selected: null })
  }

  /**
   * The visit has finished closing.
   *
   * The nested dialog's transition completes BEFORE the board's (React runs a
   * child's effects first, so its exit starts first), which is what lets the
   * two hand-offs stay separate: this one returns the focus to the tile, and
   * the board's own exit — below — is the only thing that performs a
   * destination. When a destination is pending the tile is skipped entirely,
   * because that tile is about to be unmounted with the board.
   */
  const handleLocationExited = () => {
    const tile = tileToFocusRef.current
    tileToFocusRef.current = null
    setView((prev) => (prev.scopeKey === scopeKey ? { ...prev, shown: null } : prev))
    // On the way somewhere real, the focus belongs at the destination and this
    // tile is about to be unmounted with the board.
    if (pendingLeaveRef.current) return
    if (tile) tileRefs.current.get(tile)?.focus()
  }

  /** Replay a repaired location's saved thank-you. Writes nothing. */
  const replayThanks = () => {
    if (!live?.selected) return
    // The visit closes with it: the replay is itself a modal and would mark an
    // open location visit `aria-hidden` — two stacked views where one will do.
    // The tile is remembered now, while it is certain, rather than worked out
    // later from whatever happens to be in state.
    tileToFocusRef.current = null
    replayTileRef.current = live.selected
    setView({ ...live, selected: null, replay: live.selected })
  }

  /**
   * The replay was acknowledged.
   *
   * Synchronous, and guarded on the child **and on the mission it was shown
   * for**, so an acknowledgement that arrives for a replay which is no longer
   * the one on screen clears nothing.
   */
  const dismissReplay = () => {
    const replayed = live?.replay ?? null
    if (!replayed) return
    setView((prev) =>
      prev.scopeKey === scopeKey && prev.replay === replayed ? { ...prev, replay: null } : prev,
    )
  }

  /**
   * The replay has finished leaving — put the focus back on the repaired tile.
   *
   * On the exit and not on the tap, for the reason every focus hand-off in this
   * file is: until the transition is over the celebration is a modal whose trap
   * owns the focus, so a `focus()` made during the tap is taken straight back.
   * By here the board's trap is the one in force again and the tile is inside
   * it. A newer replay on screen owns its own focus and is left alone.
   */
  const handleReplayExited = () => {
    const tile = replayTileRef.current
    replayTileRef.current = null
    if (!tile || live?.replay) return
    tileRefs.current.get(tile)?.focus()
  }

  /**
   * Leave for a real destination.
   *
   * Stamped with the child whose board asked for it, and refused on arrival if
   * the child has changed in the meantime — a tap from an open view that has
   * since been replaced must not send the child now on screen anywhere.
   */
  const leaveFor = (destination: 'books' | 'forge') => {
    if (!live?.selected) return
    pendingLeaveRef.current = {
      scopeKey,
      destination,
      missionId: live.selected,
      identityEpoch: getLibraryIdentityEpoch(),
    }
    pendingDismissRef.current = false
    tileToFocusRef.current = null
    setView({ ...live, selected: null, replay: null })
    onClose()
  }

  /**
   * A departure was refused on arrival — so the focus has to land somewhere.
   *
   * The board is gone, `disableRestoreFocus` means MUI moved nothing on its way
   * out, and the refusal paths below used to simply return: the keyboard was
   * left on `document.body`, with the next Tab starting again at the top of the
   * page. Refusing the navigation was right; stranding the focus was not.
   *
   * It goes to the caller's opener — the control that opened this board, handed
   * over as `onReturnFocus`, exactly the element a plain dismissal gives it
   * back to. That element belongs to whoever is on screen NOW: the hub re-renders
   * for the current child, so this is the current scope's opener and never the
   * old child's detached node (the caller checks it is still in the document
   * before focusing it, because a scope change can re-render the hub into a
   * branch that has no opener at all). Nothing else happens: no visit is
   * reopened, no board is reopened, no child is changed and no journey is
   * created — the only thing the refusal still owes is the focus.
   */
  const refuseLeave = () => {
    onReturnFocus?.()
  }

  /**
   * The board has finished closing — the one place either hand-off happens.
   *
   * A destination is performed here rather than on the tap because until the
   * transition is over the dialog still traps the focus and MUI still has the
   * rest of the page marked `aria-hidden`: a scroll-and-focus run then is both
   * taken back and invisible.
   */
  const handleBoardExited = () => {
    const pending = pendingLeaveRef.current
    const dismissed = pendingDismissRef.current
    pendingLeaveRef.current = null
    pendingDismissRef.current = false
    if (pending) {
      // A tap from a view that has since been replaced sends nobody anywhere.
      if (pending.scopeKey !== scopeKey) {
        refuseLeave()
        return
      }
      if (pending.destination === 'books') {
        // …and neither does one whose identity moved while the board closed,
        // even where the scope string has come back to what it was. Applied to
        // the Books departure, which is the one that creates a journey; the
        // Forge keeps its existing behaviour exactly — it focuses a gallery on
        // this page under the gallery's own rules and starts nothing.
        if (pending.identityEpoch !== getLibraryIdentityEpoch()) {
          refuseLeave()
          return
        }
        onOpenBooks?.(pending.missionId, pending.identityEpoch)
      } else onVisitForge?.()
      return
    }
    if (dismissed) onReturnFocus?.()
  }

  /**
   * The board has finished OPENING — the only safe moment to hand the focus to
   * a tile, for the same reason every other hand-off in this file waits: until
   * the transition is over the dialog's focus trap is still settling and MUI
   * still owns where the focus lands.
   *
   * Only ever for a return from My Books, and only for the child the board
   * belongs to. The request is consumed either way: a mission id with no tile on
   * the board (an unknown place) leaves the focus where MUI put it — the board
   * itself — which is ordinary behaviour and not a failure worth a message.
   */
  const handleBoardEntered = () => {
    if (!focusMissionId) return
    if (!live) return
    tileRefs.current.get(focusMissionId)?.focus()
    onFocusServed?.()
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={dismiss}
        fullScreen
        transitionDuration={reduceMotion ? 0 : undefined}
        TransitionProps={{ onEntered: handleBoardEntered, onExited: handleBoardExited }}
        // The focus hand-off is this component's job on every path (see the
        // header), so MUI must not also move it.
        disableRestoreFocus
        slotProps={{
          paper: {
            // The board's own controls stay addressable apart from the card's
            // identical ones underneath it.
            'aria-label': 'Stonebridge Village',
            sx: {
              backgroundImage: 'none',
              bgcolor: isLincoln ? 'rgba(6,10,16,0.97)' : 'rgba(255,247,252,0.98)',
            },
          },
        }}
      >
        <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, pt: 2, pb: 6, width: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '14px' : '20px', fontWeight: 700 }}>
                🏰 Stonebridge Village
              </Typography>
              <Typography
                sx={{ fontFamily: bodyFont, fontSize: '14px', lineHeight: 1.45, opacity: 0.8, mt: 0.5 }}
              >
                {allRepaired
                  ? 'You fixed each place.'
                  : bannerCount > 0
                    ? `🚩 ${bannerCount} banner${bannerCount === 1 ? '' : 's'} raised — look what you've rebuilt!`
                    : 'Read to repair your first location.'}
              </Typography>
            </Box>
            <IconButton
              onClick={dismiss}
              aria-label="Close Stonebridge village"
              sx={{
                // A 44px target, not a 34px one.
                minWidth: 44,
                minHeight: 44,
                fontFamily: titleFont,
                fontSize: isLincoln ? '14px' : '18px',
                color: isLincoln ? kidPalette.xpGreen : '#7a3f67',
              }}
            >
              ✕
            </IconButton>
          </Box>

          {/* ── Honest recovery, INSIDE the board ───────────────────────
              The board covers the card, so the card's notice and its Try again
              are behind it: a child who opened the village during a failed read
              could read a stale label with no reachable door, and a save
              rejected while the board was open said nothing at all. Both states
              and the one door live here too — and travel on into an open
              location visit, which covers this. Nothing about the art, the
              tiles or the Banner Hall changes — the banners below are earned
              and are still shown. */}
          <StonebridgeRecoveryNotice isLincoln={isLincoln} {...recovery} />

          {/* ── The village, as one place ───────────────────────────────
              At the top of the board, because this is what a child came to
              see: the Square, the river, the roads, and every location in the
              same landscape. It sits BELOW the recovery notice only because a
              failure a child has to scroll past is a failure they do not find.

              A picture and nothing more — no hotspot, no label, no control (see
              `VillageScene`). It is not a second source of truth either:
              `board` is the same derived value the list renders from. */}
          <VillageScene board={board} isLincoln={isLincoln} />

          {/* ── The readable list — the whole way around the village ───
              The plain list of places with the condition of each one written
              out, and the one set of controls: full-size targets, named
              dialogs, and the focus handed back to the exact tile. */}
          <Typography
            sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '17px', fontWeight: 700, mb: 1 }}
          >
            🏘️ Each Place
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 1.5,
            }}
          >
            {board.map(({ mission, state }) => {
              const repaired = state === VillageLocationState.Repaired
              const isActive = state === VillageLocationState.Active
              const upcoming = state === VillageLocationState.Upcoming
              const accent = mission.art.accent
              const condition = repaired
                ? 'Fixed.'
                : isActive
                  ? 'Being fixed now.'
                  : 'Not started yet.'

              return (
                <Box
                  key={mission.id}
                  component="button"
                  type="button"
                  ref={(el: HTMLElement | null) => {
                    tileRefs.current.set(mission.id, el)
                  }}
                  onClick={() => openLocation(mission.id)}
                  // Says which place and what state it is in — the visible
                  // label underneath is the same two facts, for everyone else.
                  aria-label={`Visit ${mission.locationName}. ${condition}`}
                  sx={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    p: 1,
                    borderRadius: isLincoln ? '8px' : '16px',
                    border: `1px solid ${isActive ? accent : repaired ? `${accent}66` : 'rgba(120,120,120,0.3)'}`,
                    background: isLincoln ? 'rgba(16,24,32,0.75)' : 'rgba(255,255,255,0.7)',
                    opacity: upcoming ? 0.6 : 1,
                    cursor: 'pointer',
                    boxShadow: isActive ? `0 0 14px ${accent}55` : 'none',
                    transition: 'opacity 0.3s ease, box-shadow 0.3s ease',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    '&:focus-visible': {
                      outline: `3px solid ${isLincoln ? kidPalette.xpGreen : '#7a3f67'}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <StonebridgeLocationArt
                    missionId={mission.id}
                    art={mission.art}
                    state={repaired ? 'repaired' : 'damaged'}
                    isLincoln={isLincoln}
                    height={96}
                  />
                  {/* Spans, not paragraphs: the tile is a <button>, whose
                      content model is phrasing content. The name keeps the
                      pixel theme — it is two or three words — and is allowed
                      to wrap rather than shrink on a narrow phone. */}
                  <Typography
                    component="span"
                    sx={{
                      display: 'block',
                      fontFamily: titleFont,
                      fontSize: isLincoln ? '12px' : '15px',
                      fontWeight: 700,
                      lineHeight: 1.45,
                      overflowWrap: 'break-word',
                      mt: 0.75,
                      color: isLincoln ? '#F7D774' : '#7a3f67',
                    }}
                  >
                    {mission.locationName}
                  </Typography>

                  {/* State row */}
                  {repaired && (
                    <Typography
                      component="span"
                      sx={{ display: 'block', fontFamily: bodyFont, fontSize: '13px', lineHeight: 1.4, opacity: 0.85, mt: 0.25 }}
                    >
                      ✓ Fixed · tap to see it
                    </Typography>
                  )}
                  {isActive && active && (
                    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                      <Box
                        component="span"
                        sx={{
                          display: 'block',
                          position: 'relative',
                          height: isLincoln ? 8 : 12,
                          borderRadius: isLincoln ? '2px' : '6px',
                          background: isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            display: 'block',
                            position: 'absolute',
                            inset: 0,
                            width: `${active.percent}%`,
                            background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                            transition: 'width 0.6s ease',
                            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                          }}
                        />
                      </Box>
                      <Typography
                        component="span"
                        sx={{ display: 'block', fontFamily: bodyFont, fontSize: '13px', fontWeight: 700, opacity: 0.85, mt: 0.25, textAlign: 'right' }}
                      >
                        {active.current} / {active.target}
                      </Typography>
                    </Box>
                  )}
                  {upcoming && (
                    <Typography
                      component="span"
                      sx={{ display: 'block', fontFamily: bodyFont, fontSize: '13px', lineHeight: 1.4, opacity: 0.8, mt: 0.25 }}
                    >
                      Coming soon
                    </Typography>
                  )}
                </Box>
              )
            })}
          </Box>

          {/* ── Banner Hall — your raised colors ─────────────────────── */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              borderRadius: isLincoln ? '8px' : '16px',
              border: `1px solid ${isLincoln ? 'rgba(245,197,66,0.4)' : 'rgba(232,160,191,0.4)'}`,
              background: isLincoln ? 'rgba(20,18,10,0.75)' : 'rgba(255,250,240,0.85)',
            }}
          >
            <Typography sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '17px', fontWeight: 700 }}>
              🎌 Banner Hall
            </Typography>
            <Typography
              sx={{ fontFamily: bodyFont, fontSize: '14px', lineHeight: 1.45, opacity: 0.8, mt: 0.5, mb: 1.5 }}
            >
              {/* The warm done state, from the completed list — not a new flag,
                  and not a bar that still has somewhere to go. */}
              {allRepaired ? 'Each banner is up. Well done.' : 'A banner for each place you fixed.'}
            </Typography>

            {bannerCount === 0 ? (
              <Typography
                sx={{ fontFamily: bodyFont, fontSize: '14px', lineHeight: 1.45, opacity: 0.75, fontStyle: 'italic' }}
              >
                Your first banner is coming — keep reading!
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {raisedBanners.map((id) => {
                  const m = getMission(id)
                  if (!m) return null
                  return (
                    <Box
                      key={id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.75,
                        borderRadius: isLincoln ? '6px' : '12px',
                        border: `1px solid ${m.art.accent}66`,
                        background: isLincoln ? 'rgba(12,20,30,0.85)' : 'rgba(255,255,255,0.8)',
                        boxShadow: `0 0 10px ${m.art.accent}33`,
                      }}
                    >
                      <Box aria-hidden="true" sx={{ fontSize: isLincoln ? '16px' : '20px', lineHeight: 1 }}>
                        {m.art.bannerEmoji}
                      </Box>
                      <Typography sx={{ fontFamily: bodyFont, fontSize: '13px', fontWeight: 700 }}>
                        {m.locationName}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            )}
          </Box>
        </Box>

        {/* Replay a repaired location's character thank-you. It is a modal of
            its own, so it portals out of here and stacks above the board; it
            stays a child of the board in the tree because it belongs to the
            board's life — closing the board takes it with it. */}
        <BannerRaiseCelebration
          missionId={live?.replay ?? null}
          isLincoln={isLincoln}
          // Read aloud, because here it was ASKED for: the only way this view
          // opens is *Hear the thank you* on a repaired location, and a child
          // who cannot yet read that paragraph tapped the control that says it
          // will be read. The prop defaults to `false` for the automatic
          // completion celebration, which nobody asked to be spoken.
          speak
          onDismiss={dismissReplay}
          onExited={handleReplayExited}
          {...recovery}
        />
      </Dialog>

      {/* One location, visited. Opens over the board; carries the same honest
          recovery, because everything under it is unreachable. */}
      {shownMission && shownState && (
        <StonebridgeLocationDialog
          open={visitOpen}
          mission={shownMission}
          state={shownState}
          active={active}
          isLincoln={isLincoln}
          reduceMotion={reduceMotion}
          onClose={closeLocation}
          onExited={handleLocationExited}
          onReplayThanks={replayThanks}
          onOpenBooks={onOpenBooks ? () => leaveFor('books') : undefined}
          onVisitForge={onVisitForge ? () => leaveFor('forge') : undefined}
          {...recovery}
        />
      )}
    </>
  )
}
