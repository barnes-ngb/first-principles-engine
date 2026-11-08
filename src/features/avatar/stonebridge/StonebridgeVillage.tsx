import { useEffect, useId, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'

import StonebridgeLocationArt from './StonebridgeLocationArt'
import StonebridgeLocationDialog from './StonebridgeLocationDialog'
import StonebridgeRecoveryNotice, { type StonebridgeRecoveryState } from './StonebridgeRecoveryNotice'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import VillageStepsHelp from './VillageStepsHelp'
import VillageScene, { type VillageSceneHero } from './VillageScene'
import { getMission } from './missions'
import { getLibraryIdentityEpoch } from './libraryReturnFlow'
import {
  deriveVillageBoard,
  VillageLocationState,
  type MissionComputation,
} from './computeStonebridgeProgress'
import type { StonebridgeDestinations } from './stonebridgeDestinations'
import { villageSurface } from './villageSurface'
import { VILLAGE_STEPS_LINE, villageStepsCompact, villageStepsLabel } from './villageStepsCopy'
import {
  VillagePlacesView,
  createOpenerRegistry,
  placeCondition,
  placeControlName,
  type OpenerRegistry,
} from './villageOpeners'
import { kidPalette } from '../../../app/tokens'

/**
 * How the board is shown — the same board either way.
 *
 * `modal` is the legacy Hero-Hub presentation: a `fullScreen` Dialog over the
 * mission card, with Escape, a backdrop, a focus trap and a close control.
 * `page` is the canonical `/stonebridge` town page: the identical body, rendered
 * in the route's own DOM, with no dialog to open, dismiss or escape — so there
 * is nothing to close and no `onEntered`/`onExited` to wait for.
 *
 * Only the OUTER frame differs. The location visit and the replayed thank-you
 * are real modals in both, and every focus hand-off still happens on a view's
 * own `onExited` rather than on the tap (see the component header).
 */
export type StonebridgeVillagePresentation = 'modal' | 'page'

/**
 * The two ways to pick a place, in the order they are offered.
 *
 * Both controls are rendered in both views, so the one a child just pressed is
 * still under their finger (and under the keyboard) afterwards. `name` is the
 * accessible name and contains the visible word, so saying "places" works for
 * someone driving the screen by voice.
 */
const PLACES_VIEW_CHOICES = [
  { view: VillagePlacesView.Map, label: '🗺️ Map', name: 'Show the map' },
  { view: VillagePlacesView.Places, label: '🏘️ Places', name: 'Show the places list' },
] as const

/**
 * What the board needs to show a hero — the appearance and its exposure.
 *
 * The `exposed` half of `VillageSceneHero` is deliberately NOT here: it is this
 * component's answer, not the caller's, because only the board knows whether a
 * visit, a replay or the places list is currently in front of the map.
 */
export type StonebridgeVillageHero = Omit<VillageSceneHero, 'exposed'>

interface StonebridgeVillageProps extends StonebridgeRecoveryState, StonebridgeDestinations {
  open: boolean
  /** Modal over the Hero Hub card, or the canonical town page. */
  presentation?: StonebridgeVillagePresentation
  /**
   * Close the board.
   *
   * Never called in `page` presentation: a page is not dismissible, so it
   * renders no close control and a departure performs on the location visit's
   * exit instead of on the board's.
   */
  onClose: () => void
  /**
   * Nobody is going anywhere: put the focus back where the caller keeps it.
   *
   * In `modal` presentation that is the control that opened the board, and it
   * is separate from {@link onClose} and called from the board's own exit,
   * because **a focus call made during the tap is taken straight back** — the
   * dialog's focus trap is still mounted and enabled until React has committed
   * the close, and it pulls any outside focus back inside. It is also not called
   * at all when the board is closing on its way to a destination, which is the
   * other half of "one thing moves the focus at a time".
   *
   * In `page` presentation nothing closes, so it is called from the refusal path
   * only — and the caller points it at something on the page (its own heading),
   * which is the page's equivalent of handing the keyboard back rather than
   * leaving it on `document.body`.
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
   * A location tile to put the focus on once the board is actually there.
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
   * The child's own saved hero, drawn standing in the village.
   *
   * Optional and absent by default, so the Hero Hub's board renders exactly
   * what it rendered before. The caller (the canonical town page) owns the READ
   * and decides whether there is a hero at all — a loading, missing, failed or
   * mismatched profile is handed over as nothing. This component owns only the
   * **activity gate**: whether the map is the live control set, and whether a
   * location visit, a replayed thank-you or an unsettled scope is covering it.
   * Everything else about the motion belongs to `StonebridgeHeroStage`.
   */
  hero?: StonebridgeVillageHero | null
  /**
   * The focus hand-off above has happened (or had no tile to land on).
   *
   * Called once, so the request is consumed exactly once however it turned out —
   * a tile that is not there must not leave a request behind to fire at the next
   * board. In `modal` presentation the moment is the dialog's own `onEntered`;
   * in `page` presentation there is no such event and waiting for one would hang
   * the request forever, so it is the first commit in which the page's real DOM
   * holds this child's board.
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
   * The scope string alone cannot answer this boundary: the view takes time to
   * close, whatever the departure creates is created only once it has, and an
   * `A → B → A` inside that window leaves `scopeKey` reading `A` again with the
   * reads underneath having gone to someone else and back. There is nothing yet
   * for a store subscription to cancel, so the tap carries a monotonic token
   * instead and the departure is refused if it moved — for BOTH destinations,
   * and the token is then handed to the host rather than re-read there.
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
 * The Stonebridge village board — the one board, shown two ways.
 *
 * ── Two presentations, one village ───────────────────────────────────────────
 *
 * `modal` (the original) is the full-screen Dialog opened from the Hero-Hub
 * mission card. `page` is the canonical `/stonebridge` town page, which renders
 * the identical body in the route's own DOM: the town and every reachable action
 * are there on arrival, with no second *Open Stonebridge* to find and no 3D
 * character on the page.
 *
 * The body is one value (`boardBody`) and the frame is the only difference, so
 * there is no second village to keep in step — and no second progress owner
 * either: this component reads nothing, and whichever host renders it is the one
 * that called `useStonebridgeProgress`.
 *
 * What the page does NOT get is the dialog's machinery, because a page has none:
 * no focus trap, no backdrop, no Escape, no close control, no `onEntered` and no
 * `onExited`. So the two moments that waited on the board's transitions are
 * moved rather than dropped — a departure performs on the LOCATION VISIT's exit
 * (the last modal transition in play on a page), and a return's focus hand-off
 * runs on the first commit in which the page's real DOM holds this child's
 * board. The modal path is untouched on both.
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
 * ── The map, the list, and why only one of them is live ──────────────────────
 *
 * The board opens with `VillageScene` — the seven locations drawn once, in one
 * landscape, with the Square and the roads that join them — and the plain list
 * of places underneath. **Both can be the way in, and exactly one of them is at
 * a time**, chosen by the *Map* / *Places* control above the list:
 *
 *   • **Map** puts a native button over each building (that file explains the
 *     geometry and why nothing is labelled on the art) and renders the places
 *     below as a **legend**: names, conditions and the live counter as plain
 *     text in normal flow, with no card, no border and no tab stop, so nothing
 *     down there invites a tap it cannot answer;
 *   • **Places** is the list as it has always been — a full-size tile per place
 *     — with the picture back to being only a picture.
 *
 * So there are never two tab stops for one place, and never a place a child can
 * see but not reach. The view is **transient presentation state**: no stored
 * preference, no child flag, nothing added to the schema, and a real route
 * remount simply starts on the map again.
 *
 * Both sets call the same `openLocation`, carry the same accessible name from
 * the same `placeControlName`, and register into the same registry of visible
 * place controls (`villageOpeners`) — which is what lets every focus hand-off
 * below name a PLACE and get whichever control is currently showing it. The
 * exact control a visit was opened from gets the focus back when it is still on
 * screen; when it genuinely is not, the live *Map* / *Places* control is the
 * fallback, because the one thing a closing view may not do is leave the
 * keyboard on `document.body`.
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
  presentation = 'modal',
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
  hero = null,
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
  /** This board's state is the current child's — the page focus gate below. */
  const scopeSettled = view.scopeKey === scopeKey
  const isPage = presentation === 'page'

  /**
   * Which control set is live — the map's buildings, or the readable list.
   *
   * Presentation and nothing else: not a stored preference, not a child flag,
   * not a schema field. It is deliberately NOT reset when the child changes —
   * it is a fact about this screen rather than about a child, and resetting it
   * under the keyboard would move the focus for no reason — and a real route
   * remount starts on the map again, which the two controls and the caption
   * above the picture say plainly rather than silently.
   */
  const [placesView, setPlacesView] = useState<VillagePlacesView>(VillagePlacesView.Map)
  /**
   * The one registry of VISIBLE place controls, by mission id.
   *
   * Filled by whichever set is on screen (see `villageOpeners` for why a plain
   * `Map` is not enough once two sets share a key), so a closed visit asks for
   * a PLACE and gets the control that is currently showing it.
   */
  const [openers] = useState<OpenerRegistry>(createOpenerRegistry)
  /** The two view controls, so a fallback has something real to land on. */
  const viewButtonRefs = useRef<Map<VillagePlacesView, HTMLElement | null>>(new Map())
  /** The place control a closing visit should return the focus to. */
  const tileToFocusRef = useRef<string | null>(null)
  /** The repaired tile an open replay came from, for when it closes. */
  const replayTileRef = useRef<string | null>(null)
  /** A destination the board is closing on its way to. */
  const pendingLeaveRef = useRef<PendingLeave | null>(null)
  /** The board was dismissed, so the focus goes back to its opener on exit. */
  const pendingDismissRef = useRef(false)
  /**
   * The return request this board has already served, in `page` presentation.
   *
   * The modal path cannot serve twice because its moment is one event. A page
   * has no event, so the hand-off runs from an effect — and the latch is what
   * makes "once per journey" structural rather than a consequence of the
   * caller's state landing before the effect runs again.
   */
  const pageFocusServedRef = useRef<string | null>(null)

  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  /** Short headings keep the pixel theme… */
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  /** …and everything else is plain and at least 14px (12px for small print). */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'

  /**
   * The frame's background AND its foreground, from one definition.
   *
   * Most of the text below names no colour and inherits — the subtitle, *Your
   * Village*, *Pick a place from the list.*, *Each Place*, every tile's
   * condition and counter, the Banner Hall body, each banner's name. Inheriting
   * meant inheriting the APP THEME's text colour onto a panel chosen by the
   * CHILD's look, which is black on black for a parent's light theme over the
   * retro board. `villageSurface` is where that pair is decided, for both looks
   * and both presentations; nothing that already names a colour is touched.
   */
  const frame = villageSurface(isLincoln, 'board')
  /** The one accent a focus ring, a live view control and a target are drawn in. */
  const accentRing = isLincoln ? kidPalette.xpGreen : '#7a3f67'
  /** The map carries the tab stops in this render; the list is plain rows. */
  const mapIsLive = placesView === VillagePlacesView.Map

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

  /**
   * The id of the visible step legend, so the one tile that shows a COMPACT
   * number can point at the line that gives it its unit.
   *
   * It is a description and not part of the control's name on purpose: the
   * accessible name of a place control is `placeControlName` in both control
   * sets, and a name that grew a count on the list but not on the map would be
   * the two sets saying different things about the same place.
   */
  const stepsLegendId = useId()
  /**
   * There is a repair in progress to count — so the legend, the line and the
   * optional help are shown. A finished rally has no number and gets none of
   * them (the warm done state below is what it has instead).
   */
  const showSteps = !!active && !allRepaired

  /** The location the visit dialog is rendering — through its exit, too. */
  const shownMission = live?.shown ? getMission(live.shown) : undefined
  const shownState = shownMission
    ? board.find((entry) => entry.mission.id === shownMission.id)?.state
    : undefined
  const visitOpen = open && !!live?.selected && live.selected === live.shown

  const recovery: StonebridgeRecoveryState = { stale, readError, saveError, retrying, onRetry }

  /**
   * May the hero's decorative motion run RIGHT NOW?
   *
   * The board's half of the cancellation rule, and all of it is state this
   * component already holds:
   *
   *   • `scopeSettled` — this board's state still belongs to the child on
   *     screen. A scope change drops it in the render phase, and the hero's
   *     exposure is withdrawn in the same render rather than one frame later;
   *   • `mapIsLive` — the places list is the live control set instead, so there
   *     is no map on screen to walk across;
   *   • no open location visit and no replayed thank-you — both are real modals
   *     that cover the map, so motion underneath them would be motion nobody
   *     can see, running timers nobody asked for. This is also why no visible
   *     travel to a building is promised: the dialog opens immediately and the
   *     map goes behind it;
   *   • the board is actually open — in `modal` presentation a closed dialog is
   *     not an exposure at all. A page is always open.
   *
   * It does not consider the village's own `stale` / recovery state: the hero
   * comes from a DIFFERENT read, and the caller withdraws it when THAT read is
   * loading, missing or failed.
   */
  const heroExposed =
    scopeSettled && mapIsLive && !live?.shown && !live?.replay && (isPage || open)

  /**
   * One opener for both control sets.
   *
   * The map's buildings and the list's tiles call exactly this, so a visit is
   * the same visit however it was opened and there is no second way in to keep
   * in step.
   */
  const openLocation = (missionId: string) => {
    setView({ scopeKey, selected: missionId, shown: missionId, replay: null })
  }

  /**
   * Give the keyboard back to the control a view was opened from.
   *
   * The exact one while it is still on screen — which is the whole promise, and
   * is what the registry's `isConnected` check protects: focusing a node that
   * has been unmounted moves the focus to `document.body` while reporting that
   * it landed somewhere. When there genuinely is no control for that place any
   * more, the live *Map* / *Places* control is the current visible equivalent:
   * it is in normal flow immediately above the places, it is never unmounted by
   * a view change, and it is somewhere rather than nowhere.
   *
   * This is for the hand-offs a MOUNTED board owes — a closed visit, a
   * dismissed thank-you. A return from My Books does not use it, on purpose:
   * that request names a place, and a place this board does not have must take
   * no focus at all rather than grab the nearest thing to it.
   */
  const returnFocusToPlace = (missionId: string | null) => {
    openers.focusOrFallback(missionId, () => {
      const viewButton = viewButtonRefs.current.get(placesView)
      if (viewButton?.isConnected) viewButton.focus()
    })
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

  /**
   * A departure was refused on arrival — so the focus has to land somewhere.
   *
   * The board (or the visit, on a page) is gone, `disableRestoreFocus` means MUI
   * moved nothing on its way out, and the refusal paths below used to simply
   * return: the keyboard was left on `document.body`, with the next Tab starting
   * again at the top of the page. Refusing the navigation was right; stranding
   * the focus was not.
   *
   * It goes to the caller's own anchor — the control that opened this board in
   * the hub, the page's heading on the town page — exactly the element a plain
   * dismissal gives it back to. That element belongs to whoever is on screen
   * NOW: the host re-renders for the current child, so this is the current
   * scope's anchor and never the old child's detached node (the caller checks it
   * is still in the document before focusing it, because a scope change can
   * re-render the host into a branch that has no anchor at all). Nothing else
   * happens: no visit is reopened, no board is reopened, no child is changed and
   * no journey is created — the only thing the refusal still owes is the focus.
   */
  const refuseLeave = () => {
    onReturnFocus?.()
  }

  /**
   * Perform the destination a view was closing on its way to.
   *
   * One definition, two moments: the board's own exit in `modal` presentation
   * and the location visit's exit on a page (whichever of them is the LAST modal
   * transition to finish, because until one is over its focus trap owns the
   * focus and MUI still has the rest of the page `aria-hidden` — a
   * scroll-and-focus run then is both taken back and invisible).
   *
   * ── The boundary both destinations are held to ─────────────────────────────
   *
   * The tap and the arrival are different moments, and BOTH checks are about the
   * gap between them:
   *
   *   • the **scope** the view was rendered for must still be the scope on
   *     screen — a tap from a view that has since been replaced sends nobody
   *     anywhere;
   *   • the **identity epoch observed at the tap** must not have moved. The
   *     scope string alone cannot answer this: a raw `A → B → A` inside the
   *     closing transition leaves `scopeKey` reading `A` again while the reads
   *     underneath went to the brother and back.
   *
   * The epoch check used to be applied to the Books departure only, on the
   * reasoning that the Forge "starts nothing". That was wrong for the canonical
   * town page, whose armor door is a NAVIGATION carrying a scoped request — and
   * it sampled a fresh epoch of its own after the close, so the moved identity
   * was invisible to it and a non-reduced-motion `A → B → A` still reached
   * `/avatar`. Both destinations are guarded here, at the one moment that knows
   * what was tapped, and the tap's epoch is handed to the host so a host that
   * has to carry the departure across a route stamps it with the TAP's reading
   * rather than with a later one.
   *
   * A refusal moves nothing but the focus: no navigation, no request, no journey
   * — `refuseLeave` hands the keyboard back to the caller's own connected anchor
   * exactly as a dismissal does.
   */
  const performPendingLeave = () => {
    const pending = pendingLeaveRef.current
    pendingLeaveRef.current = null
    if (!pending) return
    // A tap from a view that has since been replaced sends nobody anywhere…
    if (pending.scopeKey !== scopeKey) {
      refuseLeave()
      return
    }
    // …and neither does one whose identity moved while the view closed, even
    // where the scope string has come back to what it was.
    if (pending.identityEpoch !== getLibraryIdentityEpoch()) {
      refuseLeave()
      return
    }
    if (pending.destination === 'books') {
      onOpenBooks?.(pending.missionId, pending.identityEpoch)
      return
    }
    onVisitForge?.(pending.identityEpoch)
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
   * In `modal` presentation the nested dialog's transition completes BEFORE the
   * board's (React runs a child's effects first, so its exit starts first),
   * which is what lets the two hand-offs stay separate: this one returns the
   * focus to the tile, and the board's own exit — below — is the only thing that
   * performs a destination. When a destination is pending the tile is skipped
   * entirely, because that tile is about to be unmounted with the board.
   *
   * On a PAGE there is no board exit behind this one, so this is the last modal
   * transition in play and the destination is performed here instead. Same rule,
   * one moment later or earlier: never on the tap.
   */
  const handleLocationExited = () => {
    const tile = tileToFocusRef.current
    tileToFocusRef.current = null
    setView((prev) => (prev.scopeKey === scopeKey ? { ...prev, shown: null } : prev))
    // On the way somewhere real, the focus belongs at the destination and this
    // tile is about to be unmounted with the board.
    if (pendingLeaveRef.current) {
      // On a PAGE this visit was the only thing trapping the focus — there is no
      // board transition behind it — so its exit is the last safe moment and the
      // departure is performed here. In `modal` presentation nothing changes:
      // the board's own exit is still the one place it happens.
      if (isPage) performPendingLeave()
      return
    }
    if (tile) returnFocusToPlace(tile)
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
    returnFocusToPlace(tile)
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
    // A page has nothing to close, so the visit's own exit is what performs the
    // departure (`handleLocationExited`). The modal closes the board, as before.
    if (!isPage) onClose()
  }

  /**
   * The board has finished closing — the one place either hand-off happens, in
   * `modal` presentation. (A page never closes; see `handleLocationExited`.)
   *
   * A destination is performed here rather than on the tap because until the
   * transition is over the dialog still traps the focus and MUI still has the
   * rest of the page marked `aria-hidden`: a scroll-and-focus run then is both
   * taken back and invisible.
   */
  const handleBoardExited = () => {
    const dismissed = pendingDismissRef.current
    pendingDismissRef.current = false
    if (pendingLeaveRef.current) {
      performPendingLeave()
      return
    }
    if (dismissed) onReturnFocus?.()
  }

  /**
   * The board has finished OPENING — the only safe moment to hand the focus to
   * a tile in `modal` presentation, for the same reason every other hand-off in
   * this file waits: until the transition is over the dialog's focus trap is
   * still settling and MUI still owns where the focus lands.
   *
   * Only ever for a return from My Books, and only for the child the board
   * belongs to. The focus goes to whichever control is currently showing that
   * place — the map's building or the list's tile, whichever set is live, since
   * both register into the one registry. The request is consumed either way: a
   * mission id with no control on the board (an unknown place) leaves the focus
   * where MUI put it — the board itself — which is ordinary behaviour and not a
   * failure worth a message, and is why this takes no fallback.
   */
  const handleBoardEntered = () => {
    if (!focusMissionId) return
    if (!live) return
    openers.focus(focusMissionId)
    onFocusServed?.()
  }

  /**
   * A scope change under an open page, with a departure already asked for.
   *
   * On a page the location visit is unmounted OUTRIGHT by the render-phase reset
   * — there is no `open → false` transition, so no `onExited` runs and the
   * pending departure would sit in its ref with the focus left on
   * `document.body`. It is dropped here instead, and the focus is handed back
   * exactly as a refusal on arrival hands it back.
   *
   * Page-only on purpose: in `modal` presentation the board itself closes on a
   * scope change and its own exit already refuses the departure, which is the
   * one place that may move the focus — doing it here as well would focus into a
   * dialog whose trap is still closing, and the call would simply be taken back.
   */
  useEffect(() => {
    if (!isPage) return
    const pending = pendingLeaveRef.current
    if (!pending || pending.scopeKey === scopeKey) return
    pendingLeaveRef.current = null
    onReturnFocus?.()
  }, [isPage, scopeKey, onReturnFocus])

  /**
   * The page's half of the return focus hand-off.
   *
   * A page has no `onEntered` to wait for, and waiting for one would hold a
   * return request forever. The equivalent moment is the first COMMIT in which
   * the real page DOM holds this child's board — which is what an effect is: it
   * runs after the controls are in the document, so the registry is filled and the
   * node can genuinely take the focus. Everything else about the rule is the
   * modal's:
   *
   *   • **only for the current child** — `scopeSettled` is the same render-phase
   *     reset the board uses, so a request is never served against a board that
   *     still belongs to the previous child;
   *   • **only when there is a page to serve it** — the host renders this
   *     component only once the village read has produced a board, so a failed
   *     or unsettled read reaches no effect at all and the request waits for the
   *     existing *Try again* rather than being thrown away or faked;
   *   • **once, whatever the outcome** — an unknown place consumes the request
   *     and leaves the focus where it was, exactly as the modal does, and the
   *     latch means a re-render cannot serve the same journey twice.
   *
   * What it lands ON is whichever control is showing that place in the live
   * view, from the same registry the modal path reads.
   */
  useEffect(() => {
    if (!isPage) return
    if (!focusMissionId || !scopeSettled) return
    const token = `${scopeKey}:${focusMissionId}`
    if (pageFocusServedRef.current === token) return
    pageFocusServedRef.current = token
    openers.focus(focusMissionId)
    onFocusServed?.()
  }, [isPage, focusMissionId, scopeSettled, scopeKey, onFocusServed, openers])

  /**
   * The board itself — identical in both presentations.
   *
   * Extracted so the two frames below are the ONLY difference between a page and
   * a modal. A page that re-implemented the body would be a second village to
   * keep in step, which is the one thing this slice is not allowed to create.
   */
  const boardBody = (
    <>
        <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, pt: 2, pb: 6, width: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Box>
              <Typography
                // A page's own title is a heading; inside the dialog the
                // accessible name is the paper's `aria-label` and this stays the
                // paragraph it has always been.
                component={isPage ? 'h1' : 'p'}
                sx={{ fontFamily: titleFont, fontSize: isLincoln ? '14px' : '20px', fontWeight: 700 }}
              >
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
            {/* A page is not dismissible — there is nothing behind it to go
                back to, and a ✕ that navigated somewhere would be a second
                answer to "where does this page lead" on top of the host's own
                controls. The modal keeps its close exactly as it was. */}
            {!isPage && (
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
            )}
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

              In the Map view it is also the way in: a native button over each
              building, siblings of the drawing, no label on the art (see
              `VillageScene`). It is not a second source of truth either —
              `board` is the same derived value the list renders from, and the
              targets open the same `openLocation` the tiles do. */}
          <VillageScene
            board={board}
            isLincoln={isLincoln}
            // The caller's hero, with this board's activity gate applied. No
            // hero, no layer — and the hub's board passes none.
            hero={hero ? { ...hero, exposed: heroExposed } : null}
            interactive={mapIsLive}
            onOpenLocation={openLocation}
            registerTarget={(missionId, node) => openers.register(missionId, node)}
          />

          {/* ── Map or list — one live set of place controls ────────────
              Two ways to pick a place and only ever ONE of them carrying tab
              stops. Both controls are rendered in both views, so switching
              never pulls the focus out from under the child who switched: the
              button they pressed is still the button they are on. It sits
              between the picture and the places so that whichever view is
              live, the other one is next to what it would replace. */}
          <Box
            role="group"
            aria-label="Map or list"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}
          >
            {PLACES_VIEW_CHOICES.map(({ view, label, name }) => {
              const live = placesView === view
              return (
                <Box
                  key={view}
                  component="button"
                  type="button"
                  ref={(node: HTMLElement | null) => {
                    viewButtonRefs.current.set(view, node)
                  }}
                  // A toggle, said as one: pressed is the view you are in.
                  aria-pressed={live}
                  aria-label={name}
                  onClick={() => setPlacesView(view)}
                  sx={{
                    // A 44px target, like every other control on this board.
                    minHeight: 44,
                    px: 1.5,
                    fontFamily: titleFont,
                    fontSize: isLincoln ? '11px' : '14px',
                    fontWeight: 700,
                    color: isLincoln ? '#F7D774' : '#7a3f67',
                    background: live
                      ? isLincoln
                        ? 'rgba(126,252,32,0.16)'
                        : 'rgba(122,63,103,0.12)'
                      : 'transparent',
                    border: `${live ? 2 : 1}px solid ${live ? accentRing : 'rgba(120,120,120,0.4)'}`,
                    borderRadius: isLincoln ? '8px' : '14px',
                    cursor: 'pointer',
                    '&:focus-visible': { outline: `3px solid ${accentRing}`, outlineOffset: 2 },
                  }}
                >
                  {label}
                </Box>
              )
            })}
          </Box>

          {/* ── The places, written out ─────────────────────────────────
              Every place, its name and its condition, in normal flow and at a
              readable size — in BOTH views, because a name a child can only
              get at by hovering a building is not a name they have.

              The two views say it in deliberately different visual languages,
              because only one of them can be tapped. In the Places view each
              row IS the control and looks like one: a bordered, raised card
              with the art on it. In the Map view the controls are on the
              picture and this is a **legend** — plain text lines, no border,
              no panel, no rounding, no shadow, no hover and no pointer. Real
              phone and tablet screenshots of the first attempt showed why that
              matters: the legend was drawn as bordered accent cards, a child
              taps one, and nothing happens. A thing that looks like a button
              and is not one is worse than no affordance at all. */}
          <Typography
            sx={{ fontFamily: titleFont, fontSize: isLincoln ? '12px' : '17px', fontWeight: 700, mb: 1 }}
          >
            🏘️ Each Place
          </Typography>

          {/* ── What the numbers below are ──────────────────────────────
              The compact `3 / 8 steps` on the place being fixed now is the
              only number on this board, and in the Map view it is a line of
              plain text in a legend. This is the visible unit legend that
              gives it its word, in BOTH views and above both of them, so the
              digits are never the whole explanation.

              Three things, in the order a child needs them: the number said
              in full, the one sentence that says what feeds it, and an
              optional *What adds steps?* It is here in the board's own flow
              rather than on a tile, because a help control inside a place
              button would make one tap mean two things. */}
          {showSteps && active && (
            <Box data-testid="village-steps" sx={{ mb: 1.5 }}>
              <Typography
                id={stepsLegendId}
                sx={{
                  fontFamily: bodyFont,
                  fontSize: '14px',
                  fontWeight: 700,
                  lineHeight: 1.45,
                  overflowWrap: 'break-word',
                }}
              >
                {villageStepsLabel(active.current, active.target)}
              </Typography>
              <Typography
                sx={{
                  fontFamily: bodyFont,
                  fontSize: '14px',
                  lineHeight: 1.45,
                  overflowWrap: 'break-word',
                  opacity: 0.85,
                  mt: 0.25,
                }}
              >
                {VILLAGE_STEPS_LINE}
              </Typography>
              <VillageStepsHelp isLincoln={isLincoln} scopeKey={scopeKey} />
            </Box>
          )}

          {mapIsLive ? (
            <Box
              component="ul"
              // One handle for "the places, written out", in both views — so a
              // test can tell a place's own row from the same name on a banner
              // in the hall below.
              data-testid="village-places"
              sx={{
                listStyle: 'none',
                m: 0,
                // No panel and no inset of its own: the legend is text in the
                // board's own flow, not a container sitting on it.
                p: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                // Space is the only separation there is — no rule, no edge and
                // no cell — so the columns get a little more of it than the
                // rows do to keep two names on one line apart.
                rowGap: 1,
                columnGap: 2,
              }}
            >
              {board.map(({ mission, state }) => {
                const isActive = state === VillageLocationState.Active
                return (
                  <Box
                    component="li"
                    key={mission.id}
                    // Two readable lines and nothing else. No border, no
                    // background, no rounding, no shadow, no hover and no
                    // pointer cursor: this is the one place on the board that
                    // must not look operable, because it is not.
                    sx={{ minWidth: 0 }}
                  >
                    <Typography
                      component="span"
                      sx={{
                        display: 'block',
                        fontFamily: titleFont,
                        fontSize: isLincoln ? '12px' : '15px',
                        fontWeight: 700,
                        lineHeight: 1.45,
                        // Allowed to wrap rather than shrink: this row is the
                        // readable half of the design, and enlarged text is
                        // exactly what it is for.
                        overflowWrap: 'break-word',
                        color: isLincoln ? '#F7D774' : '#7a3f67',
                      }}
                    >
                      {mission.locationName}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{
                        display: 'block',
                        fontFamily: bodyFont,
                        fontSize: '13px',
                        lineHeight: 1.4,
                        // Not dimmed for an upcoming place: a tile may be
                        // muted, a sentence a child has to read may not.
                        opacity: 0.85,
                        mt: 0.25,
                      }}
                    >
                      {/* The same sentence the control's own name ends with,
                          and — on the one place being fixed now — the compact
                          count with its unit, so this line is readable on its
                          own when the legend above has scrolled away. */}
                      {placeCondition(state)}
                      {isActive && active
                        ? ` ${villageStepsCompact(active.current, active.target)}`
                        : ''}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          ) : (
            <Box
              data-testid="village-places"
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

                return (
                  <Box
                    key={mission.id}
                    component="button"
                    type="button"
                    ref={(el: HTMLElement | null) => {
                      openers.register(mission.id, el)
                    }}
                    onClick={() => openLocation(mission.id)}
                    // Says which place and what state it is in — the visible
                    // label underneath is the same two facts, for everyone
                    // else, and the map's target says it identically.
                    aria-label={placeControlName(mission.locationName, state)}
                    // An `aria-label` REPLACES the content, so the compact
                    // count drawn inside this button is not in its name. The
                    // place being fixed now is therefore DESCRIBED by the
                    // legend above — the number reaches a screen reader
                    // without this control set's name growing past the map
                    // target's, which is the one thing both sets share.
                    aria-describedby={isActive && showSteps ? stepsLegendId : undefined}
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
                        outline: `3px solid ${accentRing}`,
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
                          {villageStepsCompact(active.current, active.target)}
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
          )}

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
    </>
  )

  return (
    <>
      {isPage ? (
        /* The town page's frame: the same body in the route's own DOM.
           `role="region"` with the board's existing name keeps one addressable
           landmark for it, as the dialog's `aria-label` does in the modal — and
           there is no focus trap, no backdrop and no Escape, because none of
           those belong to a page. The host owns the surrounding chrome. */
        <Box
          role="region"
          aria-label="Stonebridge Village"
          sx={{
            bgcolor: frame.bg,
            // Stated, not inherited — see `villageSurface`.
            color: frame.fg,
            borderRadius: isLincoln ? '8px' : '16px',
          }}
        >
          {boardBody}
        </Box>
      ) : (
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
                bgcolor: frame.bg,
                // A Paper carries the THEME's text colour by default, which is
                // the half a dark board on a light theme got wrong. The same
                // pair as the page frame, from the same definition.
                color: frame.fg,
              },
            },
          }}
        >
          {boardBody}
        </Dialog>
      )}

      {/* One location, visited. A real modal in BOTH presentations — over the
          board in the hub, over the page on the town route — and it carries the
          same honest recovery, because everything under it is unreachable. */}
      {shownMission && shownState && (
        <StonebridgeLocationDialog
          open={visitOpen}
          mission={shownMission}
          state={shownState}
          active={active}
          // Whose visit this is: the only state the visit holds of its own is
          // the step help's open/closed, and it closes with the scope rather
          // than outliving a child change inside a view that is about to go.
          scopeKey={scopeKey}
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
