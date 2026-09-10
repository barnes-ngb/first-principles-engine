/**
 * What a child change means on the Barnes Bros business tab — UX-329.
 *
 * `BusinessPage` has no `ChildSelector` of its own, so until UX-324 made the
 * app-bar chip a switcher the active child could not change while a form on
 * this page was mounted. Two forms held child-scoped drafts and wrote with the
 * LIVE child, and they need **opposite** answers — which is the whole point of
 * the five-verdict vocabulary this run introduced. Both answers live here so
 * the contrast is stated once rather than argued twice.
 *
 *  - **`SaleEntryForm` RESETS.** A chip and a price are an intent: no sale has
 *    been recorded for anybody, re-entering it is two taps, and the sales log
 *    beside the form already shows the new operator's entries. Carrying it
 *    would append one child's sale to the other's `businessLog`, where it
 *    counts toward that child's goal thermometer.
 *  - **`KitBuilderForm` BINDS.** A roster is a cast a kid typed out — a vault,
 *    a hero, four defenders, three invaders, in his own words, stored verbatim.
 *    Clearing that to make an attribution safe would destroy the work to
 *    protect it. So a NEW roster is stamped with the child it was started for
 *    and saved to him whatever the header says afterwards, which is the answer
 *    `CreateSightWordBook` already gives an in-flight story (UX-324, round 1).
 *    An EDIT was already bound: `KitBuilderSection` passes the roster's own
 *    `childId`, never the active one.
 *
 * Copy is kid-facing on both — this is the boys' surface — and is held to the
 * shared readability bar in `src/test/kidReadability.ts`. Names are
 * interpolated from the family's own children, never a literal.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The line shown when a child change dropped a half-entered sale.
 *
 * `null` when there was nothing entered — an untouched form needs no
 * announcement — and `null` with no name, because "that sale was not saved"
 * without saying whose is the same silence in fewer words.
 */
export function droppedSaleNotice(
  hadEntry: boolean,
  previousChildName?: string,
): string | null {
  if (!hadEntry) return null
  if (!previousChildName) return 'That sale was not saved.'
  return `That sale for ${previousChildName} was not saved.`
}

/**
 * The line shown while a new, unsaved kit roster belongs to a child other than
 * the one the header is on — said BEFORE Save is tapped, not in a receipt
 * afterwards. `null` when the header still agrees with the roster, and `null`
 * when there is no name to give, since an unnamed warning is not a warning.
 */
export function rosterOwnerNotice(
  rosterChildId: string,
  activeChildId: string,
  rosterChildName?: string,
): string | null {
  if (rosterChildId === activeChildId) return null
  if (!rosterChildName) return null
  return `This kit will be saved for ${rosterChildName}.`
}
