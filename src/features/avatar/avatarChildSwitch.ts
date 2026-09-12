/**
 * What a child change means on the two avatar surfaces — UX-331 / UX-332.
 *
 * Both are **RESET** in the `UX-329` vocabulary, and both were reachable
 * before the header switcher came back on (`FIX-231`): the Hero Hub renders
 * its own child chips, and `AvatarPhotoUpload` sits inside it. What the
 * switcher did was widen the reach — the chip is now on every screen, so the
 * change can arrive while a parent is looking at something else entirely.
 *
 *  - **`AvatarPhotoUpload` RESETS the staged photo (UX-331).** A cropped
 *    preview awaiting *Transform!* is an intent, not work: nothing has been
 *    written for anybody, the file is two taps away on the device it came
 *    from, and `handleExtract` reads the live `childId` prop — so the picture
 *    staged while looking at one boy would seed the **other** boy's
 *    `characterFeatures` and `photoUrl`, and spend one paid `extractFeatures`
 *    call against his weekly art quota doing it. Binding it instead would mean
 *    silently writing a face to a child the parent is no longer looking at,
 *    which is the surprise this exists to prevent rather than a smaller
 *    version of it. (`useCreativeTimer` binds because real minutes had already
 *    elapsed; `CreateSightWordBook` binds because a paid call had already been
 *    spent. Here nothing has happened yet — which is exactly the line.)
 *
 *    A transform **already in flight** is untouched and needs no rule:
 *    `handlePhotoTransform` is a `useCallback` over `[familyId, childId, …]`,
 *    so the call carries the child it was started for in its own closure and
 *    lands there whatever the header does next. It is the *staged* photo, which
 *    outlives every render, that had no owner.
 *
 *  - **`MyAvatarPage` RESETS the tuner draft and a captured screenshot
 *    (UX-332).** The screenshot is the one that crosses a rail: `saveToPortfolio`
 *    writes an `artifacts` document stamped with the live `childId` and titled
 *    with the live child's name, while the PNG in `screenshotData` is a picture
 *    of the previous boy's character — so one boy's armor would be filed in his
 *    brother's portfolio under his brother's name. `localProportions` re-seeds
 *    on its own (the profile listener writes it from the new child's saved
 *    customization before `loading` clears), but `heroAnimationTuning` and
 *    `armorDebugValues` never did, so a tuning session begun for one boy was
 *    still overlaid on the other. All of it is cheap to redo — retake the shot,
 *    re-drag the sliders — so RESET, with the loss said out loud.
 *
 * Copy is written for whoever is holding the phone: the Hero Hub is the boys'
 * own screen and a parent reaches these same controls, so the sentences are
 * plain and name the children rather than ranking them. Names are looked up by
 * the caller from the family's own children — identity, never a literal name
 * gate.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The line shown when a child change dropped a photo staged for *Transform!*.
 *
 * `null` when nothing was staged — a notice on every chip tap is one nobody
 * reads by the time it matters (the `armorAwardSwitchNotice` rule, UX-336).
 *
 * It says explicitly that **nothing was spent**, because the one thing a
 * person cannot check from the screen is whether that tap cost them a paid
 * generation out of the week's art budget. It did not: the photo is dropped
 * before the call, so the counter never moves.
 */
export function stagedPhotoSwitchNotice(
  hadStagedPhoto: boolean,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (!hadStagedPhoto) return null
  const whose = previousChildName ? ` for ${previousChildName}` : ''
  const nowOn = nextChildName ? ` Pick it again to use it for ${nextChildName}.` : ''
  return `The photo you'd picked${whose} was cleared — it wasn't used, and nothing was spent from this week's art budget.${nowOn}`
}

/** The Hero Hub draft state a child change clears. Structural, so it tests alone. */
export interface HeroHubDraft {
  /** A captured screenshot awaiting save / share (`null` when there is none). */
  hasScreenshot: boolean
  /** Whether the character tuner panel is open and being dragged. */
  tunerOpen: boolean
}

/**
 * Is there anything on the Hero Hub a child change would actually take away?
 *
 * A closed tuner and no screenshot is an untouched page, and an untouched page
 * gets no sentence. The tuner counts by being **open** rather than by comparing
 * proportions: the sliders write to `localProportions` on every drag and the
 * saved value they are compared against belongs to the child who is leaving, so
 * "did this differ" is a question about the wrong document. Open means someone
 * was tuning.
 */
export function heroHubDraftIsEmpty(draft: HeroHubDraft): boolean {
  return !draft.hasScreenshot && !draft.tunerOpen
}

/**
 * The line shown when a child change cleared a Hero Hub draft.
 *
 * Names what went, because the two losses are not the same size: a screenshot
 * is a pose that has to be set up again, and a tuner session is a few sliders.
 * `null` when there was nothing to lose.
 */
export function heroHubSwitchNotice(
  draft: HeroHubDraft,
  previousChildName?: string,
  nextChildName?: string,
): string | null {
  if (heroHubDraftIsEmpty(draft)) return null
  const whose = previousChildName ? `${previousChildName}'s` : 'the previous'
  const what = draft.hasScreenshot && draft.tunerOpen
    ? 'picture and the sliders you were adjusting were'
    : draft.hasScreenshot
      ? 'picture was'
      : 'sliders you were adjusting were'
  const nowOn = nextChildName ? ` You're looking at ${nextChildName} now.` : ''
  return `The ${whose} ${what} cleared — nothing was saved.${nowOn}`
}
