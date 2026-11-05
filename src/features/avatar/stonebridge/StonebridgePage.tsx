import { useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import Page from '../../../components/Page'
import { useFamilyId } from '../../../core/auth/useAuth'
import { useActiveChild } from '../../../core/hooks/useActiveChild'
import { getChildAgeGroup } from '../../../core/profile/childIdentity'
import { useAvatarProfile } from '../useAvatarProfile'
import BannerRaiseCelebration from './BannerRaiseCelebration'
import StonebridgeVillage from './StonebridgeVillage'
import { useStonebridgeProgress } from './useStonebridgeProgress'
import { requestForgeFocus, FORGE_HOST_PATH } from './forgeFocusHandoff'
import {
  STONEBRIDGE_BOOKS_PATH,
  STONEBRIDGE_TODAY_PATH,
} from './stonebridgeDestinations'
import {
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
 * never sets one: a parent sees the currently selected child's village, a kid
 * profile is locked to their own by that hook as everywhere else, and a page
 * with nobody selected says so instead of choosing for anyone. Everything the
 * board holds is stamped `${familyId}_${childId}` and dropped during render on a
 * change, so a switch cannot leave the previous child's town standing.
 *
 * ── The ordinary doors ───────────────────────────────────────────────────────
 *
 * My Books, Today and the armor are offered as plain navigation at the foot of
 * the page — including while the village read is loading or has failed, which is
 * the one state where a child could otherwise be stuck on a page with nothing on
 * it. That fallback says the village did not load; it never says the child has
 * no village.
 */
export default function StonebridgePage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  // The shell's chip is the only thing that changes this; the page only reads it.
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''

  /**
   * The retro look, or the softer one — cosmetic and nothing else.
   *
   * The same one-liner the Hero Hub uses, from the avatar profile's saved
   * `themeStyle` with the child's age group as the seed, so the town looks like
   * the rest of that child's hub. It is read-only and gates nothing: every
   * destination, control and capability on this page is identical either way.
   */
  const avatarProfile = useAvatarProfile(familyId, childId || undefined)
  const isLincoln =
    (avatarProfile?.themeStyle ??
      (getChildAgeGroup(activeChild) === 'older' ? 'minecraft' : 'platformer')) === 'minecraft'

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
  const pendingReturn = libraryReturnForOrigin(
    flow,
    { familyId, childId },
    LibraryReturnOrigin.Town,
  )

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
   * Rendered in every state of this page, including a failed read: a child who
   * arrives at a village that will not load must still be able to reach their
   * books and their day. None of these creates a journey, writes anything or
   * changes a capability — the shelf, Today and the hub each keep their own
   * existing rules about what is there when the child arrives.
   */
  const doors = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
      <Button variant="outlined" sx={doorSx} onClick={() => navigate(STONEBRIDGE_BOOKS_PATH)}>
        My Books
      </Button>
      <Button variant="outlined" sx={doorSx} onClick={() => navigate(STONEBRIDGE_TODAY_PATH)}>
        Today
      </Button>
      <Button
        variant="outlined"
        sx={doorSx}
        onClick={() => {
          // The armor lives on the hub, with the customizer and the ceremonies.
          // There is no `/forge` route and no second gallery: this leaves a
          // scoped, epoch-stamped request and the hub performs the same
          // reduced-motion scroll-and-focus its own Forge visit does, once its
          // DOM is there. A stale request is refused rather than served.
          //
          // Read HERE because here IS the tap: this door is a plain control on
          // the page with no view closing between the press and the navigation.
          // The village-mediated door below is the one that must be handed the
          // tap's reading instead of taking its own.
          requestForgeFocus({ familyId, childId, epoch: getLibraryIdentityEpoch() })
          navigate(FORGE_HOST_PATH)
        }}
      >
        My armor
      </Button>
    </Box>
  )

  /** Nobody is selected — said plainly, and never chosen on their behalf. */
  if (!childId) {
    return (
      <Page>
        <Typography component="h1" sx={{ fontFamily: titleFont, fontSize: '20px', fontWeight: 700 }}>
          🏰 Stonebridge Village
        </Typography>
        <Typography sx={{ fontSize: '14px', lineHeight: 1.45 }}>
          Pick a child to see the village.
        </Typography>
        {doors}
      </Page>
    )
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
    return (
      <Page>
        <Typography component="h1" sx={{ fontFamily: titleFont, fontSize: '20px', fontWeight: 700 }}>
          🏰 Stonebridge Village
        </Typography>
        <Typography role={failed ? 'alert' : undefined} sx={{ fontSize: '14px', lineHeight: 1.45 }}>
          {sentence}
        </Typography>
        {(failed || retrying) && (
          <Box>
            <Button variant="outlined" sx={doorSx} onClick={retry}>
              Try again
            </Button>
          </Box>
        )}
        {doors}
      </Page>
    )
  }

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
      {doors}

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
