import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import Page from '../../../components/Page'
import { useFamilyId } from '../../../core/auth/useAuth'
import { useActiveChild } from '../../../core/hooks/useActiveChild'
import { getChildAgeGroup } from '../../../core/profile/childIdentity'
import { useProfile } from '../../../core/profile/useProfile'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import StonebridgeQuickLinks from './StonebridgeQuickLinks'
import StonebridgeVillage from './StonebridgeVillage'
import { buildHeroAppearance } from './heroAppearance'
import {
  TownHeroFailure,
  TownHeroPhase,
  useTownHeroProfile,
} from './useTownHeroProfile'
import { useStonebridgeProgress } from './useStonebridgeProgress'
import { requestForgeFocus, FORGE_HOST_PATH } from './forgeFocusHandoff'
import StonebridgeMineInvitation from './StonebridgeMineInvitation'
import type { MineInvitation } from './mineInvitation'
import {
  STONEBRIDGE_BOOKS_PATH,
  STONEBRIDGE_MINE_PATH,
  STONEBRIDGE_TODAY_PATH,
} from './stonebridgeDestinations'
import {
  LibraryReturnDestination,
  LibraryReturnFocus,
  LibraryReturnOrigin,
  beginLibraryReturnFlow,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
  libraryReturnForOrigin,
  serveLibraryReturn,
  subscribeLibraryReturnFlow,
} from './libraryReturnFlow'

/**
 * Stonebridge, as a place you can walk into — the canonical `/stonebridge` page.
 *
 * ── What this adds, and what it deliberately does not ────────────────────────
 *
 * One nav entry opens the village the family already has. The town and every
 * action reachable from it are on screen on arrival: no *Open Stonebridge* to
 * find first, no modal behind a 3D hub, and no character render on this route at
 * all. It is the SAME village as the Hero Hub's board — the same
 * `StonebridgeVillage`, the same location visits, the same thank-yous and the
 * same recovery — shown as a page rather than as a dialog
 * (`presentation="page"`).
 *
 * The Hero Hub keeps everything it had. `/avatar` still hosts the armor, the
 * customizer, the tier ceremonies and its own village board, `My Hero`, `My
 * Books` and `Today` all stay exactly where they were, and nothing here replaces
 * a menu, changes a default or removes a path. This is a second door, not a
 * second village.
 *
 * ── One progress owner ───────────────────────────────────────────────────────
 *
 * This page calls `useStonebridgeProgress` and renders the board directly. It
 * does NOT render `StonebridgeMissionCard`, which calls the same hook: two
 * owners for one rendered journey would mean two subscriptions, two reconcile
 * effects and two write lanes for one child's village. Nothing here reads or
 * writes the XP / forge / diamond economy, and no mission math, schema or
 * eligibility rule is touched — the page is a presentation of what the hook
 * already derives.
 *
 * ── Whose village, and never a selection ─────────────────────────────────────
 *
 * It reads the child the app bar has already selected (`useActiveChild`) and
 * never sets one: a parent sees the currently selected child's village, and a
 * kid profile is locked to their own by that hook as everywhere else. Everything
 * the board holds is stamped `${familyId}_${childId}` and dropped during render
 * on a change, so a switch cannot leave the previous child's town standing.
 *
 * **"No child" is three different facts**, and saying the wrong one is a defect
 * rather than a wording choice: the read may have FAILED, it may not have
 * ANSWERED yet (the shared list resolves the selected id, so a cold read leaves
 * `activeChild` undefined while the id is already there), or it may have
 * answered that there is genuinely nobody. Only the last of those is *pick a
 * child*; the first offers the hook's own `retryLoad` and the second says it is
 * loading. See the `!childId` branch, which asks about failure first because a
 * failed read deliberately keeps `isLoading` true.
 *
 * ── The ordinary doors, and where they are compact ───────────────────────────
 *
 * My Books, Today and the armor are the same three destinations they have always
 * been, reachable from this page in every state of it. What changed is their
 * WEIGHT: on a healthy town they are one compact *Quick links* disclosure
 * (`StonebridgeQuickLinks`), because the same three actions are already in the
 * shell's navigation and three standing buttons pushed the village itself down
 * the screen. The owner's clarification named these three and not the left menu.
 *
 * When there is **no village on screen** — loading, failed, retrying, or no
 * child resolved — the three doors are rendered DIRECTLY instead, with no
 * disclosure to find first. That is the state in which a child needs an obvious
 * way out, so it is the state that keeps the plain strip. Same routes, same
 * Forge epoch hand-off, no new Library origin for ordinary Books.
 *
 * ── The child's own hero, standing in their village ──────────────────────────
 *
 * The town shows the child's SAVED character on the map: a flat, 2D paper-doll
 * of the saved record (`heroAppearance` / `StonebridgeHero`), never the hub's
 * 3D renderer, which this route still does not import. It comes from this
 * page's own profile read — `useTownHeroProfile`, which is this town's and is
 * bound to the family, the resolved child, the identity epoch and the raw scope
 * so a sibling's document can never be drawn here — and NOT from the shared
 * `useAvatarProfile`, which retains the last profile across a new scope and
 * normalises a missing or failed read into a default-looking profile. A
 * loading, missing, failed or mismatched read means **no hero**, said honestly,
 * with a read-only retry; the village, its places and the doors never wait for
 * it. The one `themeStyle` the page already read for its cosmetic look comes
 * from the same result, so there is one profile read on this route rather than
 * two.
 */
export default function StonebridgePage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { profile } = useProfile()
  /**
   * The child, and the STATE of the read that resolves them.
   *
   * The shell's chip is the only thing that changes the selection; this page
   * only reads it. All three values come from the one call `useActiveChild`
   * already makes — no second read, no new flag, and `retryLoad` is the
   * children-load owner's own door, not a re-read of this page's making. They
   * are told apart in the `!childId` branch below, where `activeChild` alone
   * cannot say whether there is nobody or whether nobody is KNOWN yet.
   */
  const {
    activeChild,
    isChildProfile,
    isLoading: childrenLoading,
    loadFailed: childrenLoadFailed,
    retryLoad,
  } = useActiveChild()
  const childId = activeChild?.id ?? ''

  /**
   * This town's OWN avatar-profile read — the theme AND the hero, from one
   * subscription.
   *
   * `useTownHeroProfile` replaces the shared `useAvatarProfile` on this route
   * only; every other caller of the shared hook is untouched. The reason is in
   * that module's header: the shared hook keeps the previous child's profile
   * across a new scope until the new snapshot lands, and turns a missing or
   * failed read into a default-looking profile — tolerable for a colour, and
   * not something a child's own face may be built from.
   *
   * `ready` is this page's readiness and nothing new: a child must be resolved
   * and the children read must not be unsettled or failed. While it is false
   * the read is idle — no subscription, and nothing on screen.
   */
  /**
   * The identity this page may act on: a resolved child from a settled read,
   * with a profile chosen.
   *
   * One expression, because two surfaces now depend on exactly it — the hero
   * read below, and the Mine invitation further down. An unsettled or FAILED
   * children read is not an identity, so neither is offered against one.
   */
  const identityReady =
    Boolean(childId) && profile !== null && !childrenLoading && !childrenLoadFailed

  const heroRead = useTownHeroProfile({
    familyId,
    childId,
    identityKey: profile ?? '',
    ready: identityReady,
  })
  /** Only ever a document proven to be this child's, from a settled read. */
  const heroDocument = heroRead.phase === TownHeroPhase.Ready ? heroRead.document : null

  /**
   * The retro look, or the softer one — cosmetic and nothing else.
   *
   * The same one-liner the Hero Hub uses, from the avatar profile's saved
   * `themeStyle` with the child's age group as the seed, so the town looks like
   * the rest of that child's hub. It is read-only and gates nothing: every
   * destination, control and capability on this page is identical either way.
   * A read that has not settled falls back to the age-group default exactly as
   * it did when the profile was `null`.
   */
  const isLincoln =
    (heroDocument?.profile.themeStyle ??
      (getChildAgeGroup(activeChild) === 'older' ? 'minecraft' : 'platformer')) === 'minecraft'

  /**
   * The saved record as validated appearance — recomputed only when the
   * DOCUMENT changes, never per render.
   *
   * Nothing here fetches an image, reads a photo or texture URL, generates
   * anything, or calls `getDailyArmorSession` (which may create or reset a
   * session). It reads what the hub's equip flow has already saved.
   */
  const heroAppearance = useMemo(
    () => (heroDocument ? buildHeroAppearance({ ...heroDocument, fallbackAgeGroup: getChildAgeGroup(activeChild) }) : null),
    [heroDocument, activeChild],
  )

  const {
    mission,
    active,
    completedMissions,
    raisedBanners,
    justCompletedMissionId,
    clearJustCompleted,
    loading,
    stale,
    readError,
    saveError,
    retrying,
    retry,
  } = useStonebridgeProgress(familyId, childId)

  const scopeKey = `${familyId}_${childId}`

  /**
   * A return from My Books that belongs to THIS entry.
   *
   * Subscribed at the flow's own store rather than passed down, because the
   * journey outlives the page that started it. `libraryReturnForOrigin` is what
   * keeps the two doors apart: a journey that left from the Hero Hub's board is
   * not this page's to serve, even for the right child in the right phase.
   */
  const flow = useSyncExternalStore(subscribeLibraryReturnFlow, getLibraryReturnFlow)
  const ownReturn = libraryReturnForOrigin(
    flow,
    { familyId, childId },
    LibraryReturnOrigin.Town,
  )
  /**
   * WHICH of this entry's two returns it is — by what the journey says it
   * focuses, never by where it went.
   *
   * A Books trip comes back to a location tile, which the board focuses; a Mine
   * trip comes back to the Square's invitation, which has no tile at all (its
   * `missionId` is empty by construction). Keeping them apart here is what stops
   * the board being handed an empty mission id to focus.
   */
  const squareReturn =
    ownReturn?.focus === LibraryReturnFocus.SquareInvitation ? ownReturn : null
  const pendingReturn = squareReturn ? null : ownReturn

  /**
   * Where the town's focus belongs, and which return it answered.
   *
   * `servedGeneration` is why the request can be adopted in the render phase
   * without becoming a loop: a generation is used once ever, so the condition
   * below is true exactly one render per journey. The flow itself is consumed
   * later — once the page's DOM has actually taken the focus — and if the
   * village read has failed and there is no board to focus, the request waits
   * for the existing *Try again* rather than being discarded or pretended to
   * have happened.
   */
  const [town, setTown] = useState<{
    scopeKey: string
    focusMissionId: string | null
    servedGeneration: number
  }>(() => ({ scopeKey, focusMissionId: null, servedGeneration: 0 }))
  if (town.scopeKey !== scopeKey) {
    setTown({ scopeKey, focusMissionId: null, servedGeneration: 0 })
  } else if (pendingReturn && town.servedGeneration !== pendingReturn.generation) {
    setTown({
      scopeKey,
      focusMissionId: pendingReturn.missionId,
      servedGeneration: pendingReturn.generation,
    })
  } else if (town.focusMissionId !== null && pendingReturn?.generation !== town.servedGeneration) {
    /**
     * The journey this focus was adopted for is no longer live — so the focus is
     * retired with it.
     *
     * Adoption happens in the render phase, and the village is only rendered
     * once the progress read has produced a board. While that read is held there
     * is a window in which this page holds an UNSERVED request and the module
     * has already ended the journey — a raw same-tick `A → B → A`, an unsettled
     * children read, a failed one. The generation guard on `serveLibraryReturn`
     * cannot help: it refuses the consume, but the focus would already have been
     * performed by then. So the request is dropped here instead, before the
     * recovered read can hand it to a board.
     *
     * `focusMissionId !== null` is exactly "adopted and not yet served", which is
     * why nothing else is undone: a focus that HAS been served already set it to
     * null, so the ordinary post-consumption state is never reverted, and this
     * page has no board to close — it is the board. `servedGeneration` is kept,
     * so a journey already answered cannot be adopted a second time.
     *
     * A served return cannot be mistaken for an expired one, and that rests on
     * `onFocusServed` consuming the flow and clearing this marker in two
     * ADJACENT synchronous statements: no render can land between them, so any
     * render that reads the flow as gone has the cleared marker queued with it.
     */
    setTown({ scopeKey, focusMissionId: null, servedGeneration: town.servedGeneration })
  }

  /**
   * The top of the town, focusable but not a tab stop.
   *
   * The page's answer to "where does the focus go when nothing moved" — the
   * board hands it here on a departure it refused on arrival, which is what a
   * dismissal gives back to the opener in the hub. The `isConnected` check is
   * the same one the card makes: a scope change can re-render this page into its
   * loading branch, where there is no board and this node is detached, and
   * focusing a node outside the document moves the focus to `body` while
   * reporting that it landed somewhere.
   */
  const townAnchorRef = useRef<HTMLElement | null>(null)
  const returnFocusToTown = () => {
    const anchor = townAnchorRef.current
    if (anchor?.isConnected) anchor.focus()
  }

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  /** One shape for the page's plain doors. */
  const doorSx = {
    minHeight: 44,
    px: 2,
    fontSize: '14px',
    fontWeight: 700,
    textTransform: 'none',
  } as const

  /**
   * The ordinary ways on, which are ordinary navigation and nothing else.
   *
   * ONE definition per destination, used by both the compact disclosure and the
   * direct fallback strip — so there is exactly one place that decides where
   * Books, Today and the armor are, whichever form the page is showing. None of
   * these creates a journey, writes anything or changes a capability: the shelf,
   * Today and the hub each keep their own existing rules about what is there
   * when the child arrives. In particular the Books link is plain navigation
   * with **no** library-return origin — a way back belongs to a journey that
   * started at a village location, not to an ordinary trip to the shelf.
   */
  const townLinks = [
    { label: 'My Books', onSelect: () => navigate(STONEBRIDGE_BOOKS_PATH) },
    { label: 'Today', onSelect: () => navigate(STONEBRIDGE_TODAY_PATH) },
    {
      label: 'My armor',
      onSelect: () => {
        // The armor lives on the hub, with the customizer and the ceremonies.
        // There is no `/forge` route and no second gallery: this leaves a
        // scoped, epoch-stamped request and the hub performs the same
        // reduced-motion scroll-and-focus its own Forge visit does, once its
        // DOM is there. A stale request is refused rather than served.
        //
        // Read HERE because here IS the tap: this door is a plain control on
        // the page — in the disclosure or in the fallback strip, both of which
        // are on the page itself with no view closing between the press and the
        // navigation. The village-mediated door below is the one that must be
        // handed the tap's reading instead of taking its own.
        requestForgeFocus({ familyId, childId, epoch: getLibraryIdentityEpoch() })
        navigate(FORGE_HOST_PATH)
      },
    },
  ] as const

  /**
   * The Square's invitation, taken — one temporary note and one navigation.
   *
   * The same module memory the Books door uses, with a typed destination and a
   * Square focus target instead of a location tile: there is no second store, no
   * URL state, nothing persisted and nothing written. The journey carries the
   * offer so the hub can revalidate it on arrival, and the epoch is the one the
   * invitation read AT the tap — a journey refused here still leaves the action
   * working, which is an ordinary trip to the Mine with no way back offered and
   * no suggestion to serve.
   */
  const openMineTrip = (invitation: MineInvitation, observedEpoch: number) => {
    beginLibraryReturnFlow({
      familyId,
      childId,
      // The Square is a landmark, not a mission: there is no tile to come back
      // to and the focus target says so.
      missionId: '',
      origin: LibraryReturnOrigin.Town,
      destination: LibraryReturnDestination.Mine,
      focus: LibraryReturnFocus.SquareInvitation,
      suggestion: invitation,
      observedEpoch,
    })
    navigate(STONEBRIDGE_MINE_PATH)
  }

  /**
   * The doors as a plain strip — the shape every state WITHOUT a village uses.
   *
   * A child who arrives at a village that will not load must still be able to
   * reach their books and their day, and must not have to open something first
   * to find out that they can.
   */
  const doors = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
      {townLinks.map((link) => (
        <Button key={link.label} variant="outlined" sx={doorSx} onClick={link.onSelect}>
          {link.label}
        </Button>
      ))}
    </Box>
  )

  /**
   * The page with no village on it yet: one sentence, one optional door back to
   * whatever failed, and the ordinary doors underneath.
   *
   * One shape for all four of those states rather than four copies of the same
   * markup, so the only thing that differs between them is what is TRUE — the
   * sentence, whether it is an alert, and whose retry it offers.
   */
  const plainPage = (
    sentence: string,
    options: { alert?: boolean; onRetry?: () => void } = {},
  ) => (
    <Page>
      <Typography component="h1" sx={{ fontFamily: titleFont, fontSize: '20px', fontWeight: 700 }}>
        🏰 Stonebridge Village
      </Typography>
      <Typography
        role={options.alert ? 'alert' : undefined}
        sx={{ fontSize: '14px', lineHeight: 1.45 }}
      >
        {sentence}
      </Typography>
      {options.onRetry && (
        <Box>
          <Button variant="outlined" sx={doorSx} onClick={options.onRetry}>
            Try again
          </Button>
        </Box>
      )}
      {doors}
    </Page>
  )

  if (!childId) {
    /**
     * There is no child to show a village FOR — and which of the three reasons
     * it is decides what this page may honestly say.
     *
     * `useActiveChild` resolves the child by looking the selected id up in the
     * shared children list, so on a COLD read the list is empty while the raw
     * selected id can already be populated: `activeChild` is `undefined` with
     * `isLoading` true. Reading only `activeChild` therefore told a family whose
     * list had not arrived yet to *pick a child* — an instruction they cannot
     * act on, with nothing to retry — when the honest answer was "not yet".
     *
     * **Failure is asked about FIRST, deliberately.** `useChildren` reports
     * `loadFailed` with `isLoading` still TRUE (a failed read is not an
     * answered one), so a loading-first branch would show *loading* for a read
     * that is never coming back, and gating the retry on `!isLoading` would
     * disable it forever. The three readings, in order:
     *
     *   1. **failed** — say so, and offer the children-load owner's own
     *      `retryLoad`. Nothing here re-reads anything itself.
     *   2. **unsettled** — say it is loading. Never an instruction.
     *   3. **settled, and still nobody** — the ordinary *pick a child*, which is
     *      the one state where choosing is a thing a parent can actually do.
     *
     * No flag, store, lookup or selection is added for any of this: the three
     * values are the ones `useActiveChild` already publishes, the retry is the
     * hook's own, and a child whose village is already known or cached never
     * reaches this branch at all.
     */
    if (childrenLoadFailed) {
      // The same sentence the village's own failure uses: to the reader it is
      // the same fact, and the difference between the two reads is not one a
      // six-year-old can act on. Which retry it offers is the difference that
      // matters, and that is wired here rather than said in words.
      return plainPage("Couldn't load your village.", { alert: true, onRetry: retryLoad })
    }
    if (childrenLoading) return plainPage('Loading your village…')
    return plainPage('Pick a child to see the village.')
  }

  if (loading || !mission || !active) {
    /**
     * Nothing to show yet. Either the village is still arriving, or a read or
     * persist failed and there is no earlier village to fall back on — which
     * says exactly that, in the sentence every other Stonebridge surface uses,
     * and offers the same one *Try again*. It never claims an empty village the
     * child never had, and the ordinary doors stay reachable underneath.
     */
    const failed = readError || saveError
    const sentence = retrying
      ? 'Trying again…'
      : failed
        ? "Couldn't load your village."
        : 'Loading your village…'
    return plainPage(sentence, {
      alert: failed,
      onRetry: failed || retrying ? retry : undefined,
    })
  }

  /**
   * Is this a healthy town — a current read, nothing being recovered?
   *
   * Two things hang off it, for the same reason. The quick links are compact
   * only here, and the plain strip comes back for a village that is stale,
   * failed, retrying or unsaved — those are the states in which the obvious way
   * to useful work matters more than the saved space. And the hero is shown only
   * here: a decorative character standing in a village whose numbers are not
   * fresh adds a claim to a screen that is already apologising.
   */
  const villageHealthy = profile !== null && !childrenLoading && !childrenLoadFailed && !stale && !readError && !saveError && !retrying

  /**
   * The hero handed to the board, or nothing at all.
   *
   * Withdrawn — not merely stopped — whenever there is no settled saved hero for
   * the child on screen: a loading, missing, failed or mismatched read, a
   * village in recovery, or a banner-raise celebration on top of the map. The
   * board applies its own activity gate on top of this (the places list, an open
   * visit, a replay, an unsettled scope), and the stage applies the browser's
   * (a hidden tab, a map scrolled out of view, a reduced-motion preference).
   */
  const hero =
    heroAppearance && villageHealthy && !justCompletedMissionId
      ? { appearance: heroAppearance, exposureKey: heroRead.exposureKey }
      : null

  return (
    <Page>
      <Box
        ref={(el: HTMLElement | null) => {
          townAnchorRef.current = el
        }}
        tabIndex={-1}
        sx={{ '&:focus': { outline: 'none' } }}
      >
        <StonebridgeVillage
          presentation="page"
          // A page is always open and never closes; the prop pair stays in the
          // contract because the modal needs it, and `onClose` is unreachable
          // here (no close control is rendered in this presentation).
          open
          onClose={() => {}}
          onReturnFocus={returnFocusToTown}
          scopeKey={scopeKey}
          isLincoln={isLincoln}
          completedMissions={completedMissions}
          raisedBanners={raisedBanners}
          currentMissionId={mission.id}
          active={active}
          stale={stale}
          readError={readError}
          saveError={saveError}
          retrying={retrying}
          onRetry={retry}
          // The village offers the destinations; this page performs them. A
          // village that navigated by itself would be a second place deciding
          // where Books lives.
          onOpenBooks={(fromMissionId, observedEpoch) => {
            // The temporary in-memory note that says the shelf was opened from
            // THIS entry, so the way back comes to this page and not to the hub.
            // Bound to the family and child this page is already rendering and
            // to the epoch observed at the tap; never written anywhere, never in
            // the URL, and it selects nobody. A note refused here still leaves
            // the door working — the shelf opens with no way back offered, which
            // is ordinary navigation.
            beginLibraryReturnFlow({
              familyId,
              childId,
              missionId: fromMissionId,
              origin: LibraryReturnOrigin.Town,
              observedEpoch,
            })
            navigate(STONEBRIDGE_BOOKS_PATH)
          }}
          // The epoch is the one observed at the TAP, handed over by the village
          // — never re-read here. Sampling it after the visit had closed was
          // exactly the hole: an `A → B → A` inside that transition left the
          // scope string unchanged, the fresh reading matched the moved epoch,
          // and the departure went through. The village now refuses it before
          // this is called at all, and the request this stamps carries the tap's
          // reading so the hub can refuse a stale arrival too.
          onVisitForge={(observedEpoch) => {
            requestForgeFocus({ familyId, childId, epoch: observedEpoch })
            navigate(FORGE_HOST_PATH)
          }}
          // The child's own saved hero, standing in their village. The board
          // owns only whether the map is currently exposed; this page owns
          // whether there is a hero to show at all.
          hero={hero}
          focusMissionId={town.focusMissionId}
          // Consumed once the page's DOM has the board and the focus has landed:
          // the journey is over, and the next arrival — however it happens — is
          // an ordinary one. The generation guard means a request that has been
          // replaced in the meantime consumes nothing.
          onFocusServed={() => {
            serveLibraryReturn(town.servedGeneration)
            setTown((prev) => ({ ...prev, focusMissionId: null }))
          }}
        />
      </Box>

      {/* ── The Square's one invitation into a Mine mode (UX-493) ───────
          Beside the town it belongs to, and a CHILD's offer only: a parent
          looking at this village needs no new launcher, and the Mine's own
          doors are unchanged for everybody. Mounted under the scope key, so
          the reads behind it are destroyed by a child change rather than
          carried into it, and absent entirely while the identity is
          unresolved or failed. */}
      {isChildProfile && identityReady && (
        <StonebridgeMineInvitation
          key={scopeKey}
          familyId={familyId}
          childId={childId}
          focusGeneration={squareReturn?.generation ?? 0}
          onFocusServed={(generation, landed) => {
            // A safe fallback, not a pretend one: if fresh evidence retired the
            // invitation while the child was away there is nothing to focus, so
            // the focus goes to the top of the town — the same place the board
            // hands it back to — and the journey is consumed either way.
            if (!landed) returnFocusToTown()
            serveLibraryReturn(generation)
          }}
          onOffer={openMineTrip}
        />
      )}

      {/* ── The hero read, said honestly ────────────────────────────────
          The village does not wait for this read and is not held by it, so the
          only thing owed is the truth plus one read-only door. A mismatched
          document is a different fact from a failed one and gets no retry: the
          document names somebody else, and re-reading says the same thing. The
          retry's own name is deliberately not *Try again* — the village has one
          of those, and two buttons with one name is one button nobody can aim
          at. Nothing here writes, creates or selects anything. */}
      {(childrenLoading || childrenLoadFailed) && (
        <Box sx={{ mt: 1 }}>
          <Typography role={childrenLoadFailed ? 'alert' : undefined} sx={{ fontSize: '14px' }}>
            {childrenLoadFailed ? "Couldn't confirm the selected child." : 'Checking the selected child…'}
          </Typography>
          {childrenLoadFailed && retryLoad && (
            <Button variant="outlined" sx={doorSx} onClick={retryLoad}>Reload children</Button>
          )}
        </Box>
      )}
      {(heroRead.phase === TownHeroPhase.Loading || heroRead.phase === TownHeroPhase.Missing ||
        (heroAppearance && (!heroDocument?.hasSavedFeatures || heroAppearance.defaulted.length > 0))) && (
        <Typography sx={{ mt: 1, fontSize: '14px', lineHeight: 1.45 }}>
          {heroRead.phase === TownHeroPhase.Loading
            ? 'Loading your saved hero…'
            : heroRead.phase === TownHeroPhase.Missing
              ? 'No saved hero yet. You can make one in My armor.'
              : 'Your saved hero uses some shared appearance defaults in this simplified 2D view.'}
        </Typography>
      )}
      {heroRead.phase === TownHeroPhase.Error && (
        <Box sx={{ mt: 1 }}>
          <Typography role="alert" sx={{ fontSize: '14px', lineHeight: 1.45 }}>
            {heroRead.failure === TownHeroFailure.Mismatch
              ? 'That hero is not yours.'
              : "Couldn't load your hero."}
          </Typography>
          {heroRead.failure === TownHeroFailure.Read && (
            <Button
              variant="outlined"
              sx={doorSx}
              disabled={heroRead.retrying}
              onClick={heroRead.retry}
            >
              Show my hero
            </Button>
          )}
        </Box>
      )}

      {/* ── The ordinary ways on ────────────────────────────────────────
          Compact on a healthy town — one disclosure, closed to begin with —
          and the plain three-door strip whenever the village itself is
          loading, stale, failed or unsaved. Same routes either way. */}
      {villageHealthy ? (
        <StonebridgeQuickLinks links={townLinks} isLincoln={isLincoln} scopeKey={`${scopeKey}|${profile}|${heroRead.exposureKey}`} />
      ) : (
        doors
      )}

      {/* The banner-raise, exactly as the Hero Hub card plays it: this page owns
          the progress read, so a completion observed here is a completion the
          child is looking at, and losing it would make the two entries two
          different villages. Not spoken — `speak` defaults to `false` for the
          automatic celebration, and only the *Hear the thank you* replay a child
          asks for reads aloud. It is handed the same honest state and the same
          one retry door, because it covers everything under it. */}
      <BannerRaiseCelebration
        missionId={justCompletedMissionId}
        isLincoln={isLincoln}
        onDismiss={clearJustCompleted}
        stale={stale}
        readError={readError}
        saveError={saveError}
        retrying={retrying}
        onRetry={retry}
      />
    </Page>
  )
}
