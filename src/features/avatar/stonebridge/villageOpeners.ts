/**
 * The village's place CONTROLS — one vocabulary, and one registry.
 *
 * ── Why the vocabulary is here ───────────────────────────────────────────────
 *
 * A place can now be opened from two control sets — the buildings on the map,
 * and the readable Places list — and only ONE of them is active at a time. Two
 * sets written out twice would be two chances to word the same fact differently,
 * and the wording is the accessible name a child's screen reader reads out:
 * *Visit The Library Hut. Being fixed now.* So the name and its condition are
 * built here and both sets call the same function. A child who switches from the
 * map to the list hears the same sentence about the same place.
 *
 * ── Why the registry is here ─────────────────────────────────────────────────
 *
 * Everything that returns the focus in this feature returns it to *the control a
 * view was opened from* — a closed location visit, a dismissed thank-you, a
 * return from My Books. That used to be a plain `Map<missionId, node>` filled by
 * ref callbacks, which is exactly right while there is one control per place and
 * wrong the moment there are two possible ones, because the two share a key:
 *
 *   • on a switch from the map to the list React mounts the new control and
 *     unmounts the old one in the same commit, and the old one's `ref(null)`
 *     **would null out the replacement** if it fired second — the focus would
 *     then land nowhere, with nothing to say it had not;
 *   • a node that is still IN the map but no longer in the document is worse
 *     than a missing one: `focus()` on a detached element quietly moves the
 *     focus to `document.body` while every caller believes it landed.
 *
 * So `register` only ever drops a key whose node it still holds AND which is
 * detached, `resolve` refuses to hand back a detached node (and forgets it), and
 * the two focus calls are separate on purpose:
 *
 *   • {@link OpenerRegistry.focus} is *the exact opener or nothing* — what a
 *     return from My Books needs, because a request naming a place that is not
 *     on this board must take no focus at all rather than grab something near
 *     it;
 *   • {@link OpenerRegistry.focusOrFallback} is *the exact opener, or the
 *     current visible equivalent* — what a closing visit or thank-you needs,
 *     because the keyboard has to land somewhere and `document.body` is not
 *     somewhere.
 *
 * Pure presentation: no Firestore, no progress, no persistence. Nothing here
 * reads or writes anything, and the view it names is transient component state
 * rather than a stored preference.
 */
import { VillageLocationState } from './computeStonebridgeProgress'

/**
 * Which control set is live — transient presentation state, never stored.
 *
 * `Map` is the drawing with a native button over each building; `Places` is the
 * readable list with a full-size tile per place. Exactly one of them carries
 * tab stops at a time, so there is never a second set of seven controls for the
 * same seven places.
 */
export const VillagePlacesView = {
  /** Tap the building itself, on the picture. */
  Map: 'map',
  /** The readable list, with every name and condition written out. */
  Places: 'places',
} as const
export type VillagePlacesView = (typeof VillagePlacesView)[keyof typeof VillagePlacesView]

/**
 * What is true of this place, in the child's own words.
 *
 * The three sentences the board has always used. They are a full sentence each
 * because they are read out as the second half of a control's name.
 */
export function placeCondition(state: VillageLocationState): string {
  if (state === VillageLocationState.Repaired) return 'Fixed.'
  if (state === VillageLocationState.Active) return 'Being fixed now.'
  return 'Not started yet.'
}

/** A place control's whole accessible name: which place, and its condition. */
export function placeControlName(locationName: string, state: VillageLocationState): string {
  return `Visit ${locationName}. ${placeCondition(state)}`
}

/** The least a node has to be for the registry to hand it the focus. */
export interface FocusableOpener {
  readonly isConnected: boolean
  focus: () => void
}

/** Where the focus actually went. */
export type OpenerFocusResult = 'opener' | 'fallback' | 'none'

export interface OpenerRegistry<T extends FocusableOpener = HTMLElement> {
  /** A control mounted (`node`) or unmounted (`null`) for this place. */
  register: (missionId: string, node: T | null) => void
  /** The live control for this place, or `null` if there isn't one on screen. */
  resolve: (missionId: string | null) => T | null
  /** Focus the exact control, or do nothing at all. */
  focus: (missionId: string | null) => OpenerFocusResult
  /** Focus the exact control, or the current visible equivalent. */
  focusOrFallback: (missionId: string | null, fallback: () => void) => OpenerFocusResult
  /** How many live controls are registered — for a test, not for behaviour. */
  size: () => number
}

export function createOpenerRegistry<
  T extends FocusableOpener = HTMLElement,
>(): OpenerRegistry<T> {
  const nodes = new Map<string, T>()

  const register = (missionId: string, node: T | null) => {
    if (node) {
      nodes.set(missionId, node)
      return
    }
    // An unmounting control's cleanup. Drop the key ONLY if what we are holding
    // is that same, now-detached node: when the two control sets swap, the
    // replacement may already have registered, and nulling it here would leave
    // the place with no opener while a perfectly good one is on screen.
    const held = nodes.get(missionId)
    if (held && !held.isConnected) nodes.delete(missionId)
  }

  const resolve = (missionId: string | null): T | null => {
    if (!missionId) return null
    const held = nodes.get(missionId)
    if (!held) return null
    // Detached is as good as gone — and worse to focus. Forget it, so a later
    // caller gets an honest "there is nothing there" instead of a silent miss.
    if (!held.isConnected) {
      nodes.delete(missionId)
      return null
    }
    return held
  }

  const focus = (missionId: string | null): OpenerFocusResult => {
    const node = resolve(missionId)
    if (!node) return 'none'
    node.focus()
    return 'opener'
  }

  const focusOrFallback = (
    missionId: string | null,
    fallback: () => void,
  ): OpenerFocusResult => {
    if (focus(missionId) === 'opener') return 'opener'
    fallback()
    return 'fallback'
  }

  return { register, resolve, focus, focusOrFallback, size: () => nodes.size }
}
