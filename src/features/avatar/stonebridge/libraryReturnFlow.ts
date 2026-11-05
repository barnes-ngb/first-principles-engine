/**
 * The temporary way back from My Books to the village a child left from.
 *
 * ── What this is, and what it deliberately is not ────────────────────────────
 *
 * A child who taps *Open My Books* inside a Stonebridge location visit lands on
 * the real shelf — the same `/books` the nav item reaches, with the same books,
 * the same reader and the same editor. Before this module there was no way back
 * except the nav, which is a different place: the shelf's own exits all go to
 * the shelf, and the shelf's only onward doors are books. So the village was a
 * door that only opened one way.
 *
 * This is the one piece that was missing: a **temporary, in-memory** note that
 * the shelf was opened FROM a village location, so the shelf can offer one
 * explicit way back. It is:
 *
 *   • **in memory only** — never localStorage, never a URL, never route state,
 *     and never a document. A refresh, a copied link, a new tab and a direct
 *     `/books` all have no flow at all, and fall back to ordinary navigation
 *     with no return control. Nothing here can be *recreated* from anything a
 *     browser keeps, which is the whole reason it is not in the URL: a marker a
 *     child can paste is a marker that outlives the thing it describes.
 *   • **bound to a family, a child and a monotonic generation** — a scope change
 *     ends it permanently, including `A → B → A` (see below), and a stale
 *     callback holding an old generation cannot act or revive it.
 *   • **consumed once** — the return is served exactly one time, by the village
 *     board that opens for it.
 *   • **free** — no Firestore access of any kind lives in this file. Reaching
 *     the shelf through the village writes nothing that reaching it from the nav
 *     would not, and the return writes nothing either. The village's own reading
 *     progress, the hours a creative session logs and the XP a read awards are
 *     all untouched: they belong to the surfaces that already own them.
 *
 * ── Why `A → B → A` has to be caught at the store, not at the render ─────────
 *
 * The flow is invalidated by a child switch because the shelf, the reader and
 * the editor are all child-scoped: a return offered to the child now on screen,
 * for a journey another child started, is the `FIX-220` class of defect in a new
 * place. The obvious test — compare the rendered `activeChildId` — cannot see
 * the case that matters. Two synchronous writes in one handler (`setActiveChildId('B')`
 * then `setActiveChildId('A')`, which `BookshelfPage.handleResumeDraft` can
 * legitimately produce) are batched into **one** render that still reads `A`, so
 * a render-level comparison sees nothing happen at all while the shelf
 * underneath it has re-read for somebody else and back.
 *
 * So the invalidation is subscribed at the shared `activeChildStore` — the
 * boundary every switch actually crosses, synchronously, once per write — and it
 * lives in THIS module rather than in a component, so it holds whether or not
 * anything is mounted to watch. Once ended, a flow is gone: coming back to `A`
 * does not restore it, because nothing anywhere is still holding it. That is
 * what "permanently" means here.
 *
 * ── What it never does ───────────────────────────────────────────────────────
 *
 * It never selects a child. The village hands over the family and child it was
 * already rendering for; if they do not match the scope asking, there is no live
 * flow and no return control — a return is refused, never *made* possible by
 * moving the child under it. `BookshelfPage`'s existing authorised draft-resume
 * switch is untouched: the flow does not block it and adds no competing guard to
 * it; that switch simply ends the flow like any other.
 */
import {
  getActiveChildId,
  subscribeActiveChildId,
} from '../../../core/hooks/activeChildStore'

/** Where a return goes: the Hero Hub, which hosts the village board. */
export const LIBRARY_RETURN_VILLAGE_PATH = '/avatar'

/**
 * Has the child asked to go back yet?
 *
 * `away` — on the shelf (or somewhere the shelf leads), with the way back
 * offered. `returning` — the way back was taken, and the village board owes one
 * open-with-focus, which it serves once.
 */
export const LibraryReturnPhase = {
  Away: 'away',
  Returning: 'returning',
} as const
export type LibraryReturnPhase =
  (typeof LibraryReturnPhase)[keyof typeof LibraryReturnPhase]

export interface LibraryReturnFlow {
  /** The family the village was open for. */
  readonly familyId: string
  /** The child the village was open for. Never written, only compared. */
  readonly childId: string
  /** The location the child left from — the tile a return focuses. */
  readonly missionId: string
  /**
   * Monotonic, never reused, bumped on every new flow.
   *
   * A callback captured in one render holds the generation it was rendered with,
   * so a tap that lands after a switch (or after a second journey started) is
   * refused by identity rather than by hoping the component re-rendered first.
   */
  readonly generation: number
  readonly phase: LibraryReturnPhase
}

/** The scope a surface is asking on behalf of — its OWN family and child. */
export interface LibraryReturnScope {
  familyId: string
  childId: string
}

let flow: LibraryReturnFlow | null = null
/** Never decremented and never reset: a generation is used once, ever. */
let generations = 0
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

/**
 * End the flow. Irreversible: there is no undo and no second copy to restore
 * from, which is what makes `A → B → A` and Back/Forward safe.
 */
export function endLibraryReturnFlow(): void {
  if (!flow) return
  flow = null
  notify()
}

/**
 * The child left a village location for the shelf.
 *
 * Refuses an unsettled scope — an empty family or child id is "we do not know
 * yet", and a flow bound to nothing would match the next person to arrive.
 * Replaces any earlier flow, with a fresh generation, so the most recent
 * journey is the only one that can be returned from.
 */
export function beginLibraryReturnFlow(origin: {
  familyId: string
  childId: string
  missionId: string
}): LibraryReturnFlow | null {
  if (!origin.familyId || !origin.childId) return null
  generations += 1
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
 * Pure, and takes the flow as an argument rather than reading the module, so a
 * component can derive it from the value it subscribed with — deriving from a
 * fresh read instead would be a second source of truth for the same render.
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
 * Take the way back.
 *
 * Guarded on the generation the caller was rendered with: a tap from a view the
 * scope has moved out from under — a switch during an async boundary, a second
 * journey started in another tab of the same session — finds no matching flow
 * and sends nobody anywhere. Returns the flow when the request is accepted, so
 * the caller navigates only on a real one.
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
 *
 * Consumes the request: one return per journey, so a board reopened later —
 * however it was opened — is an ordinary board with no focus taken from it.
 * Guarded on the generation for the same reason the request is.
 */
export function serveLibraryReturn(generation: number): boolean {
  if (!flow) return false
  if (flow.generation !== generation) return false
  if (flow.phase !== LibraryReturnPhase.Returning) return false
  flow = null
  notify()
  return true
}

// ── Where the flow survives, and where it ends ──────────────────────────────

/** The village itself: the flow is created here and returns here. */
const EXACT_PATHS = new Set([LIBRARY_RETURN_VILLAGE_PATH, '/books', '/stickers'])

/**
 * Everything under the shelf: the editor, the reader, the per-page review, the
 * sight-word pages and the create flows. `/books-about-me` is deliberately NOT
 * matched — it is the monthly-review reader, a different feature with a
 * different shelf — which is why this is `'/books/'` with the slash and an
 * exact `'/books'` beside it, rather than a `startsWith('/books')`.
 */
const PREFIXES = ['/books/']

/**
 * Does being at this path keep a live flow?
 *
 * The rule is a whitelist, not a blacklist: the flow survives the village, the
 * shelf and the places the shelf leads, and **anything else ends it**. A child
 * who goes to Today, the Knowledge Mine or Barnes Bros has left the journey, and
 * a way back offered after that is a way back to something they are no longer
 * doing.
 *
 * It is evaluated on each location CHANGE, so the village path a flow is born on
 * is not re-tested while nothing has moved — and arriving back at the village by
 * any other route ends the flow, because the journey is over either way.
 */
export function pathKeepsLibraryReturnFlow(pathname: string): boolean {
  const path = pathname.replace(/[?#].*$/, '')
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  if (EXACT_PATHS.has(trimmed)) return true
  return PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

/**
 * End the flow if this scope or this location is no longer the one it belongs
 * to. Called from the shell, which is the one thing mounted above every route
 * transition; the child-switch half is below and needs nothing mounted at all.
 */
export function reconcileLibraryReturnFlow(scope: {
  familyId: string
  pathname: string
}): void {
  if (!flow) return
  if (flow.familyId !== scope.familyId) {
    endLibraryReturnFlow()
    return
  }
  if (!pathKeepsLibraryReturnFlow(scope.pathname)) endLibraryReturnFlow()
}

/**
 * The child-switch half, subscribed at the shared store rather than at a render.
 *
 * Registered once, at import, and never torn down: a rule that only holds while
 * some component happens to be mounted is a rule with a hole in it, and this one
 * has to hold during the exact moment a surface is unmounting. Every write to
 * the active child notifies synchronously, so a same-tick `A → B → A` is seen as
 * TWO notifications — and the first of them, reading `B`, already ends the flow
 * that `A` started. By the time the batched render happens there is nothing left
 * to revive.
 */
subscribeActiveChildId(() => {
  if (!flow) return
  if (getActiveChildId() !== flow.childId) endLibraryReturnFlow()
})
