/**
 * *"For Lincoln."* — the one wording for **whose record this page is about**,
 * `FEAT-237` / `UX-426`.
 *
 * `UX-425` removed the ten in-page `ChildSelector`s and left the shell's chip
 * as the only child control. On most of those pages nothing was lost, because
 * the page's own heading already names the child — *"Lincoln's Curriculum"*,
 * *"Evaluate Lincoln"*, *"Lincoln's Skill Snapshot"*. On five it was: the
 * heading is *Today* / *Plan My Week* / *Review* / *Weekly Review* / the
 * disposition empty state, and the selector was doing the naming by being
 * there. Removing it would have left a write control with nothing near it
 * saying who it writes about.
 *
 * That is `UX-313`'s rule — *a records surface names its target before the tap,
 * never in the receipt* — and the answer there was a sentence, not a second
 * control. This is the same answer, said once so five pages cannot word it five
 * ways.
 *
 * It is **copy**. It reads no document, writes none, and offers no way to
 * change the child: the chip in the shell is the one place that happens.
 */

/**
 * @param childName the active child's name, exactly as stored — never a
 *   pronoun. Both boys are he/him and neither is named here on purpose: this
 *   sentence is about the child the page is on, whoever that is.
 */
export function activeChildLine(childName: string): string {
  return `For ${childName}.`
}

/** What the line says while the family's children are still loading. */
export const ACTIVE_CHILD_LINE_LOADING = 'Loading…'

/**
 * The line has a hint after it on the surfaces a parent may be *looking* for
 * the old selector on. One sentence, no link and no control — the chip is at
 * the top of every screen, and a second route to it here would be `UX-425`
 * again.
 */
export const ACTIVE_CHILD_SWITCH_HINT = 'Change child from the name at the top of the screen.'
