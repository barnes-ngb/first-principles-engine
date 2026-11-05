/**
 * The temporary way back from My Books to the village a child left from.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 *
 * A child who taps *Open My Books* in a Stonebridge location visit lands on the
 * real shelf. This module is the one note that says the shelf was opened FROM a
 * village location, so the shelf can offer one explicit way back. It is held in
 * module memory — never localStorage, never a URL, never route state, never a
 * document — so a refresh, a copied link, a new tab and a direct `/books` have
 * no flow at all and fall back to ordinary navigation.
 *
 * Module memory does NOT expire by itself: it outlives every screen, including a
 * logout that unmounts the whole routed shell. So everything below is about
 * ending it explicitly, from three channels that each see something the others
 * cannot:
 *
 *   1. **identity** (`observeLibraryReturnIdentity`) — the account, profile and
 *      selected child, observed above the auth/profile gates by
 *      `LibraryReturnScopeObserver` in `App.tsx`. It sees a logout, a profile
 *      exit, an unsettled gate and a resolved-child change, none of which the
 *      shell can report because the shell is gone by then. Its other half is
 *      `expireLibraryReturnForUnsettledIdentity`, reported from the scoped
 *      children read a surface already has: the selected ID survives a read
 *      that is unsettled or has FAILED — `activeChild` can still be the whole
 *      object from the previous answer — so that channel sees an identity go
 *      unknown while this one still reads the same string.
 *   2. **the shared active-child store** — synchronous, once per raw write, so a
 *      same-tick `A → B → A` is seen as two movements. React batches that into
 *      one render reading `A`; a render-level comparison sees nothing happen.
 *   3. **the route** (`reconcileLibraryReturnFlowPath`) — leaving the journey.
 *
 * Channels 1 and 2 both record **identity movement**, which bumps a monotonic
 * epoch and ends any flow. The epoch is also what guards the tap-to-close
 * boundary: the village captures it when the Books door is tapped and the
 * departure is refused if it moved before the dialog finished closing — the one
 * window in which no flow exists yet for the channels to cancel.
 *
 * It never selects a child. The village hands over the family and child it is
 * already rendering; a mismatch means no return, never a reason to move the
 * child under it. `BookshelfPage`'s authorised draft-resume switch is untouched:
 * the flow neither blocks it nor questions it, and that switch ends the flow
 * like any other identity movement.
 */
import { subscribeActiveChildId } from '../../../core/hooks/activeChildStore'

/** Where a return goes: the Hero Hub, which hosts the village board. */
export const LIBRARY_RETURN_VILLAGE_PATH = '/avatar'

/**
 * `away` — on the shelf or somewhere it leads, with the way back offered.
 * `returning` — the way back was taken, and the village board owes one
 * open-with-focus, which it serves once.
 */
export const LibraryReturnPhase = {
  Away: 'away',
  Returning: 'returning',
} as const
export type LibraryReturnPhase =
  (typeof LibraryReturnPhase)[keyof typeof LibraryReturnPhase]

export interface LibraryReturnFlow {
  readonly familyId: string
  readonly childId: string
  /** The location the child left from — the tile a return focuses. */
  readonly missionId: string
  /** Monotonic, never reused: a stale callback cannot act on an old one. */
  readonly generation: number
  readonly phase: LibraryReturnPhase
}

/** The scope a surface asks on behalf of — its OWN family and child. */
export interface LibraryReturnScope {
  familyId: string
  childId: string
}

let flow: LibraryReturnFlow | null = null
/** Never decremented and never reset: a generation is used once, ever. */
let generations = 0
/**
 * Has the current flow been observed OUTSIDE the village since it began?
 *
 * Module-level rather than part of the record so the record stays immutable and
 * no subscriber is woken for a fact nothing renders. It is what lets the village
 * path be the flow's birthplace and still end the flow when the child comes back
 * to the hub by ordinary navigation.
 */
let leftOrigin = false

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** The flow as it stands, for `useSyncExternalStore`. Stable between changes. */
export function getLibraryReturnFlow(): LibraryReturnFlow | null {
  return flow
}

export function subscribeLibraryReturnFlow(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** End the flow. Irreversible — there is no second copy to restore from. */
export function endLibraryReturnFlow(): void {
  leftOrigin = false
  if (!flow) return
  flow = null
  notify()
}

// ── Identity movement, and the epoch it counts ──────────────────────────────

/** The last identity actually observed, or `null` for "nothing yet". */
let observedIdentity: string | null = null
/** Monotonic count of observed identity movements. */
let identityEpoch = 0

/**
 * The epoch to carry across a delayed callback.
 *
 * Captured before the thing it guards — the village captures it on the tap that
 * closes the board, not when the board has closed — so the window between them
 * is covered even though no flow exists in it yet.
 */
export function getLibraryIdentityEpoch(): number {
  return identityEpoch
}

/** Record a movement: the epoch advances and any flow in hand is over. */
function moveIdentity(): void {
  identityEpoch += 1
  endLibraryReturnFlow()
}

/**
 * Observe the identity the gates grant, as one settled string.
 *
 * `''` means unknown — still loading, signed out, anonymous, or no profile
 * chosen. The two unresolved states must not be collapsed, exactly as
 * `useHandoffScopeWatch` splits them: **before** anything has resolved it is a
 * page still settling and a brand-new arrival must survive, while **after** one
 * has resolved it is a session ending, which moves the identity. So signing
 * straight back into the same account starts a new epoch holding nothing from
 * the session before it.
 */
export function observeLibraryReturnIdentity(identity: string): void {
  if (identity === '') {
    if (observedIdentity === null) return
    observedIdentity = null
    moveIdentity()
    return
  }
  if (observedIdentity === identity) return
  observedIdentity = identity
  moveIdentity()
}

/**
 * The scoped children read behind the identity has gone unknown — unsettled, or
 * FAILED — so the journey is over.
 *
 * This is the hole `observeLibraryReturnIdentity` cannot see. That key is built
 * from the SELECTED child id, which is a string in a shared store: it survives a
 * read that is still in flight and a read that rejected, and `useChildren` keeps
 * the previous answer's list beside the failure, so `activeChild` is still a
 * whole object whose id still matches the journey. Gating the control on that
 * (`LibraryReturnBanner`'s GATE verdict) only HIDES it — the flow is module
 * memory and sits there until something ends it, so clearing the flag an hour
 * later handed the old origin back.
 *
 * So the unknown read ends it, through the same `moveIdentity` every other
 * movement uses. That is deliberately more than clearing the flow: the epoch
 * advances too, so a departure captured at a tap before this — the board's
 * closing window — is refused rather than creating a journey against an identity
 * nobody can vouch for. Nothing here reads, writes, selects or retries anything;
 * it is told what a surface already knows.
 *
 * Irreversible, like every other movement: the read coming back is a page that
 * works again, not the journey resuming. A fresh, deliberate trip from the
 * village begins a new one against the epoch this bumped.
 */
export function expireLibraryReturnForUnsettledIdentity(): void {
  moveIdentity()
}

/**
 * The child left a village location for the shelf.
 *
 * Refuses an unsettled scope — an empty id is "we do not know yet", and a flow
 * bound to nothing would match whoever arrived next — and refuses a stale
 * `observedEpoch`, which is how an `A → B → A` during the board's closing
 * transition is rejected even though the scope string matches `A` again.
 */
export function beginLibraryReturnFlow(origin: {
  familyId: string
  childId: string
  missionId: string
  /** `getLibraryIdentityEpoch()` as read at the tap. */
  observedEpoch: number
}): LibraryReturnFlow | null {
  if (!origin.familyId || !origin.childId) return null
  if (origin.observedEpoch !== identityEpoch) return null
  generations += 1
  leftOrigin = false
  flow = {
    familyId: origin.familyId,
    childId: origin.childId,
    missionId: origin.missionId,
    generation: generations,
    phase: LibraryReturnPhase.Away,
  }
  notify()
  return flow
}

/**
 * Is this flow live for the scope asking, in the phase asked about?
 *
 * Pure, and takes the flow as an argument so a component derives it from the
 * value it subscribed with rather than from a second read of the module.
 */
export function liveLibraryReturnFlow(
  candidate: LibraryReturnFlow | null,
  scope: LibraryReturnScope,
  phase: LibraryReturnPhase = LibraryReturnPhase.Away,
): LibraryReturnFlow | null {
  if (!candidate) return null
  if (!scope.familyId || !scope.childId) return null
  if (candidate.familyId !== scope.familyId) return null
  if (candidate.childId !== scope.childId) return null
  if (candidate.phase !== phase) return null
  return candidate
}

/**
 * Take the way back. Guarded on the generation the caller was rendered with, so
 * a tap that lands after the scope moved finds no matching flow and the caller
 * never navigates. Returns the flow when accepted.
 */
export function requestLibraryReturn(generation: number): LibraryReturnFlow | null {
  if (!flow) return null
  if (flow.generation !== generation) return null
  if (flow.phase !== LibraryReturnPhase.Away) return null
  flow = { ...flow, phase: LibraryReturnPhase.Returning }
  notify()
  return flow
}

/**
 * The village board has opened for a return and put the focus where it belongs.
 * Consumes the request: one return per journey, so a board opened later is an
 * ordinary board.
 */
export function serveLibraryReturn(generation: number): boolean {
  if (!flow) return false
  if (flow.generation !== generation) return false
  if (flow.phase !== LibraryReturnPhase.Returning) return false
  flow = null
  leftOrigin = false
  notify()
  return true
}

// ── Where the flow survives, by route and by phase ──────────────────────────

function normalise(pathname: string): string {
  const path = pathname.replace(/[?#].*$/, '')
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** The Books-area routes the app actually mounts, named rather than prefixed. */
const BOOKS_AREA_EXACT = new Set([
  '/books',
  '/books/create-story',
  '/books/sight-words',
  // Retired wizard; the router redirects it to the shelf (FEAT-187).
  '/books/story-guide',
  '/stickers',
])

/** `/books/:bookId`, and its `read` / `review` children. Nothing deeper. */
const BOOK_ROUTE = /^\/books\/[^/]+(?:\/(?:read|review))?$/

/**
 * Is this one of the real routes the shelf opens?
 *
 * A whitelist of actual route shapes, not a `/books` prefix: `/books/x/extra`
 * and `/books-about-me` both render something else — the first is `NotFound`,
 * the second is the monthly-review reader — and a journey that survived either
 * would be offering a way back from a page that is not in it.
 */
export function isBooksAreaPath(pathname: string): boolean {
  const path = normalise(pathname)
  return BOOKS_AREA_EXACT.has(path) || BOOK_ROUTE.test(path)
}

/** The hub that hosts the village board. */
export function isVillagePath(pathname: string): boolean {
  return normalise(pathname) === LIBRARY_RETURN_VILLAGE_PATH
}

/**
 * A route transition: keep the flow only where its phase belongs.
 *
 *   • **away** — inside the Books area, or still standing where it began (the
 *     hub, before the first step into the shelf). Coming back to the hub by
 *     ordinary navigation ENDS it: the journey is over whether or not the way
 *     back was used, and an origin that outlives it would reopen the board on a
 *     later ordinary visit.
 *   • **returning** — at the hub, which is where it was going. Anywhere else
 *     means the return was abandoned — the village read failed and the child
 *     went back to the shelf, say — so it ends rather than waiting to fire at
 *     the next hub arrival.
 *
 * Called on each location change, so Back and Forward are ordinary changes:
 * stepping out ends the flow and stepping back in finds it already gone.
 */
export function reconcileLibraryReturnFlowPath(pathname: string): void {
  if (!flow) return
  if (flow.phase === LibraryReturnPhase.Returning) {
    if (!isVillagePath(pathname)) endLibraryReturnFlow()
    return
  }
  if (isBooksAreaPath(pathname)) {
    leftOrigin = true
    return
  }
  if (!leftOrigin && isVillagePath(pathname)) return
  endLibraryReturnFlow()
}

/**
 * The raw store channel, subscribed in the module so it holds with nothing
 * mounted — including during the frame a surface is unmounting. Every write to
 * the active child notifies synchronously and only when the value really
 * changed, so each notification is one movement.
 */
subscribeActiveChildId(moveIdentity)
