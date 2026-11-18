/**
 * Who may open the Build Studio, and in which of its two modes
 * (LOCAL-BUILD-001).
 *
 * ── One rule, read by every door ───────────────────────────────────────────
 *
 * The nav entry, the route guard and the page itself all call this, so they
 * cannot disagree about whether the door is open — the `RequireKnowledgeMineAccess`
 * precedent, where the nav item and the guard share one predicate for exactly
 * that reason.
 *
 * ── Capability, never a name ────────────────────────────────────────────────
 *
 * `CLAUDE.md`'s rail, and here it is structural rather than remembered: look at
 * {@link BuildStudioAccessInput}. There is no `name`, no `age`, no `ageGroup`,
 * no `grade`, no avatar, no working level, no skill snapshot and no calibration
 * in it — not ignored, **absent**, so a future edit cannot quietly start
 * keying on one. The ONE thing that opens the door is an explicit per-child
 * opt-in a parent confirmed, and `buildStudioAccess.test.ts` pins that by
 * flipping nothing but the opt-in and asserting the verdict moves.
 *
 * ── It fails closed, and "unsettled" is not "closed" ───────────────────────
 *
 * Three ways to be refused and they are deliberately not one answer:
 *
 *   • `Unsettled` — a read has not answered yet. No access, and NO refusal on
 *     screen: bouncing an eligible child mid-load is the defect the Mine guard
 *     avoids by waiting for `loaded`.
 *   • `Closed` — the reads answered and the door is shut. This also covers a
 *     read that FAILED, because a failed read is not an affirmative empty
 *     result (the `useBusinessGoal` defect, `CLAUDE.md`'s GATE verdict). An
 *     unknown settings document, an unknown profile-child resolution and a
 *     children list belonging to another family all land here.
 *   • A child profile that resolves to a DIFFERENT child than the one being
 *     asked about is `Closed` too. Shared family auth is family access, not
 *     sibling authorisation: London signed in on London's profile cannot open
 *     Lincoln's studio, and the test asserts it rather than the comment.
 *
 * ── Enrolment is the capability; profile matching is only identity ─────────
 *
 * The two questions are separate and are answered separately. The per-child
 * opt-in is what opens the CHILD's editor. `profileChildResolved` only answers
 * *whose record is this*, and it is required of a child profile because
 * `useActiveChild` falls back to the selected id when a profile matches no
 * document — so a sibling's id can satisfy every other check. The parent's
 * read-only view needs the identity and the family, not the enrolment: she is
 * the one who grants it, and she must be able to see saved versions after
 * turning it off.
 */

import { UserProfile } from '../../core/types/enums'

/** What the caller knows, and nothing else. */
export const BuildStudioAccess = {
  /** A read has not answered. Wait; say nothing. */
  Unsettled: 'unsettled',
  /** Refused. Everything that is not an affirmative yes. */
  Closed: 'closed',
  /** The child may edit and save their own game. */
  ChildBuild: 'child-build',
  /** A parent may look at this child's versions. No editing controls. */
  ParentView: 'parent-view',
} as const
export type BuildStudioAccess =
  (typeof BuildStudioAccess)[keyof typeof BuildStudioAccess]

/** How the opt-in read came back. `Failed` is its own answer, never `false`. */
export const OptInStatus = {
  Loading: 'loading',
  Ready: 'ready',
  Failed: 'failed',
} as const
export type OptInStatus = (typeof OptInStatus)[keyof typeof OptInStatus]

export interface BuildStudioOptInRead {
  status: OptInStatus
  /** Only meaningful when `status` is `Ready`. */
  enabled: boolean
  /**
   * The child the read was MADE for. Compared against the child being asked
   * about, so a read still in flight from the previous child cannot authorise
   * the next one — the `A → B → A` case, where the id alone is unchanged.
   */
  childId: string | null
}

/**
 * Everything the rule may look at.
 *
 * Deliberately a flat bag of facts rather than hooks: the rule is pure, so the
 * nav, the guard and the page can each answer it from what they already hold,
 * and a test can put it in any state including the ones a browser makes hard
 * to reach.
 */
export interface BuildStudioAccessInput {
  /** The signed-in family, or null/empty when there is none. */
  familyId: string | null | undefined
  /** The selected user profile. */
  profile: UserProfile | null
  /** `useActiveChild().isChildProfile`. */
  isChildProfile: boolean
  /** The child this question is about. */
  childId: string
  /**
   * The resolved child object for `childId`, from the children list.
   *
   * Only its `id` is read — see the module docstring. It is a parameter at all
   * so the rule can require that the list actually RESOLVED the id, which is
   * what "the logged-in profile resolves to that exact existing child" means.
   */
  resolvedChild: { id: string } | null | undefined
  /** `useActiveChild().isLoading`. */
  childrenLoading: boolean
  /** `useActiveChild().loadFailed` — a failed read, not an empty family. */
  childrenLoadFailed?: boolean
  /** Which family's read produced the children list. */
  childrenFamilyId?: string | null
  /**
   * `useActiveChild().profileChildResolved` — did this id come from the
   * PROFILE's own identity mapping, or from the fallback?
   *
   * The reason this is a separate input from `resolvedChild`: `useActiveChild`
   * falls back to `selectedChildId` when a child profile matches no document,
   * so `resolvedChild.id === childId` can be perfectly true about a SIBLING.
   * Anything other than an explicit `true` is treated as not proven.
   */
  profileChildResolved?: boolean
  /** The opt-in document for `childId`. */
  optIn: BuildStudioOptInRead
}

/**
 * The one answer. Pure; no hooks, no I/O, no clock.
 */
export function resolveBuildStudioAccess(
  input: BuildStudioAccessInput,
): BuildStudioAccess {
  const {
    familyId,
    profile,
    isChildProfile,
    childId,
    resolvedChild,
    childrenLoading,
    childrenLoadFailed,
    childrenFamilyId,
    profileChildResolved,
    optIn,
  } = input

  // No family, no profile — nothing to decide against, and neither is a state
  // that waits: an unauthenticated visit is refused, not pending.
  if (!familyId) return BuildStudioAccess.Closed
  if (!profile) return BuildStudioAccess.Closed

  // A failed children read is checked BEFORE the loading flag, because
  // `useChildren` keeps `isLoading` true beside a failure so a surface that
  // gates on an unsettled identity keeps gating. Reporting that as `Unsettled`
  // would leave a spinner forever where a refusal is the honest answer.
  if (childrenLoadFailed) return BuildStudioAccess.Closed
  if (childrenLoading) return BuildStudioAccess.Unsettled

  // The answered list must be THIS family's. A list left over from the
  // previous family resolves ids that mean nothing here.
  if (childrenFamilyId !== undefined && childrenFamilyId !== familyId) {
    return BuildStudioAccess.Closed
  }

  if (!childId) return BuildStudioAccess.Closed
  // The resolved object must BE the resolved id. An unknown profile-child
  // resolution — a child profile whose name matches no document, a stale
  // selected id — arrives here as a missing or mismatched object, and is
  // refused rather than treated as "probably him".
  if (!resolvedChild || resolvedChild.id !== childId) {
    return BuildStudioAccess.Closed
  }

  // ── Identity has to be AFFIRMATIVE, not merely consistent ─────────────
  //
  // `useActiveChild` falls back to `selectedChildId` when a child profile
  // matches no `children` document, so the check above can be satisfied by a
  // SIBLING's record: London signed in with no London document, Lincoln
  // selected and opted in, every id agreeing, and the editor opening on
  // Lincoln's game. Only the profile's own identity mapping settles it, and an
  // unreported answer counts as unproven.
  if (profileChildResolved !== true) return BuildStudioAccess.Closed

  // ── The parent's read-only view is not gated on enrolment ─────────────
  //
  // Enrolment is what opens the CHILD's editor. A parent who has not enabled it
  // yet is exactly the person who needs the door — gating her on `enabled`
  // removed the nav entry and redirected the route on first use, so the only
  // way to turn it on was a Settings tab she had no reason to visit. It also
  // hid versions a child had already saved the moment she turned it off, which
  // is the one thing she must always be able to look at.
  //
  // So: resolved family, resolved child, parents profile → `ParentView`. That
  // view has no editing controls, and the opt-in state is something it SHOWS.
  // The opt-in read still has to have answered, because the view reports it.
  if (!isChildProfile) {
    if (profile !== UserProfile.Parents) return BuildStudioAccess.Closed
    if (optIn.status === OptInStatus.Loading) return BuildStudioAccess.Unsettled
    return BuildStudioAccess.ParentView
  }

  // ── The child's editor, which the opt-in alone opens ──────────────────
  //
  // Last, because it is the only affirmative input and must not be reachable
  // while anything above it is unsettled.
  if (optIn.status === OptInStatus.Failed) return BuildStudioAccess.Closed
  if (optIn.status === OptInStatus.Loading) return BuildStudioAccess.Unsettled
  // A read made for another child never authorises this one.
  if (optIn.childId !== childId) return BuildStudioAccess.Closed
  if (optIn.enabled !== true) return BuildStudioAccess.Closed

  // `isChildProfile` is a boolean a caller passes, and the two child profiles
  // are the only ones it may mean.
  if (profile !== UserProfile.Lincoln && profile !== UserProfile.London) {
    return BuildStudioAccess.Closed
  }
  return BuildStudioAccess.ChildBuild
}

/**
 * Is the child's own editor open, as opposed to the parent's view?
 *
 * The enrolment state a PARENT view reports is read from the opt-in directly —
 * this is only about the editor.
 */
export const buildStudioChildEnrolled = (optIn: BuildStudioOptInRead, childId: string): boolean =>
  optIn.status === OptInStatus.Ready && optIn.childId === childId && optIn.enabled === true

/** May this verdict open the editor at all? */
export const buildStudioCanEdit = (access: BuildStudioAccess): boolean =>
  access === BuildStudioAccess.ChildBuild

/** Should a door be drawn for this verdict? */
export const buildStudioIsOpen = (access: BuildStudioAccess): boolean =>
  access === BuildStudioAccess.ChildBuild || access === BuildStudioAccess.ParentView
