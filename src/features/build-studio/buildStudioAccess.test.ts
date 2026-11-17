import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { UserProfile } from '../../core/types/enums'
import {
  BuildStudioAccess,
  buildStudioCanEdit,
  buildStudioIsOpen,
  OptInStatus,
  resolveBuildStudioAccess,
  type BuildStudioAccessInput,
} from './buildStudioAccess'

/**
 * The access boundary (LOCAL-BUILD-001) — the half of this feature that is an
 * acceptance requirement rather than a nicety.
 *
 * Every case below is a state a browser makes awkward to reach and a test
 * makes trivial: a read that has not answered, a read that FAILED, a children
 * list belonging to the previous family, a child profile asking about his
 * brother, a settings document whose own `childId` disagrees with its path.
 *
 * POSITIVE CONTROL: change the last line of `resolveBuildStudioAccess` from
 * `Closed` to `ChildBuild` and the unknown-profile case fails; delete the
 * `optIn.childId !== childId` line and the sibling-read case fails.
 */

const LINCOLN = 'child-lincoln'
const LONDON = 'child-london'

/** A fully-open state. Each test changes exactly ONE thing about it. */
function openForChild(childId = LINCOLN): BuildStudioAccessInput {
  return {
    familyId: 'family-1',
    profile: UserProfile.Lincoln,
    isChildProfile: true,
    childId,
    resolvedChild: { id: childId },
    childrenLoading: false,
    childrenLoadFailed: false,
    childrenFamilyId: 'family-1',
    optIn: { status: OptInStatus.Ready, enabled: true, childId },
  }
}

describe('the opt-in is the ONE thing that opens the door', () => {
  it('opens for a child profile whose own opt-in says yes', () => {
    expect(resolveBuildStudioAccess(openForChild())).toBe(BuildStudioAccess.ChildBuild)
  })

  it('closes when the opt-in says no, with everything else identical', () => {
    const input = openForChild()
    expect(
      resolveBuildStudioAccess({
        ...input,
        optIn: { ...input.optIn, enabled: false },
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('closes on a MISSING opt-in, which reads as not enabled', () => {
    const input = openForChild()
    expect(
      resolveBuildStudioAccess({
        ...input,
        // What `useBuildStudioOptIn` reports for a document that is not there.
        optIn: { status: OptInStatus.Ready, enabled: false, childId: LINCOLN },
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('opens the PARENT view, read-only, on the same opt-in', () => {
    const access = resolveBuildStudioAccess({
      ...openForChild(),
      profile: UserProfile.Parents,
      isChildProfile: false,
    })
    expect(access).toBe(BuildStudioAccess.ParentView)
    expect(buildStudioIsOpen(access)).toBe(true)
    // The whole point of the second verdict: a parent may look and not edit.
    expect(buildStudioCanEdit(access)).toBe(false)
  })

  it('lets only the child build', () => {
    expect(buildStudioCanEdit(BuildStudioAccess.ChildBuild)).toBe(true)
    expect(buildStudioCanEdit(BuildStudioAccess.ParentView)).toBe(false)
    expect(buildStudioCanEdit(BuildStudioAccess.Closed)).toBe(false)
    expect(buildStudioCanEdit(BuildStudioAccess.Unsettled)).toBe(false)
  })
})

describe('unsettled is not closed, and failed is not empty', () => {
  it('waits while the children read has not answered', () => {
    expect(
      resolveBuildStudioAccess({ ...openForChild(), childrenLoading: true }),
    ).toBe(BuildStudioAccess.Unsettled)
  })

  it('waits while the opt-in read has not answered', () => {
    const input = openForChild()
    expect(
      resolveBuildStudioAccess({
        ...input,
        optIn: { status: OptInStatus.Loading, enabled: false, childId: null },
      }),
    ).toBe(BuildStudioAccess.Unsettled)
  })

  it('REFUSES rather than waits when the children read failed', () => {
    // `useChildren` keeps `isLoading` true beside a failure, so the order of
    // these two checks is load-bearing: reported as unsettled this would spin
    // forever where a refusal is the honest answer.
    expect(
      resolveBuildStudioAccess({
        ...openForChild(),
        childrenLoading: true,
        childrenLoadFailed: true,
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('REFUSES rather than waits when the opt-in read failed', () => {
    const input = openForChild()
    expect(
      resolveBuildStudioAccess({
        ...input,
        optIn: { status: OptInStatus.Failed, enabled: false, childId: LINCOLN },
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('neither verdict draws a door', () => {
    expect(buildStudioIsOpen(BuildStudioAccess.Unsettled)).toBe(false)
    expect(buildStudioIsOpen(BuildStudioAccess.Closed)).toBe(false)
  })
})

describe('identity has to resolve, exactly', () => {
  it('closes when the child id resolves to no child object', () => {
    expect(
      resolveBuildStudioAccess({ ...openForChild(), resolvedChild: null }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('closes when the resolved object is a DIFFERENT child', () => {
    // The unknown-profile-child case: a child profile whose name matched no
    // document, or a stale selected id. Never "probably him".
    expect(
      resolveBuildStudioAccess({
        ...openForChild(),
        resolvedChild: { id: LONDON },
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('closes when the children list belongs to another family', () => {
    expect(
      resolveBuildStudioAccess({ ...openForChild(), childrenFamilyId: 'family-2' }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('closes with no family and with no profile', () => {
    expect(resolveBuildStudioAccess({ ...openForChild(), familyId: null })).toBe(
      BuildStudioAccess.Closed,
    )
    expect(resolveBuildStudioAccess({ ...openForChild(), profile: null })).toBe(
      BuildStudioAccess.Closed,
    )
  })

  it('closes on an empty child id', () => {
    expect(resolveBuildStudioAccess({ ...openForChild(), childId: '' })).toBe(
      BuildStudioAccess.Closed,
    )
  })
})

describe('shared family auth is family access, not sibling authorisation', () => {
  it("refuses an opt-in READ that was made for the other child", () => {
    // The `A → B → A` shape: the id being asked about is unchanged, so only the
    // read's own `childId` can say the answer is about somebody else.
    const input = openForChild(LINCOLN)
    expect(
      resolveBuildStudioAccess({
        ...input,
        optIn: { status: OptInStatus.Ready, enabled: true, childId: LONDON },
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('refuses a child profile whose flag and profile disagree', () => {
    expect(
      resolveBuildStudioAccess({
        ...openForChild(),
        isChildProfile: true,
        profile: UserProfile.Parents,
      }),
    ).toBe(BuildStudioAccess.Closed)
  })

  it('opens for the OTHER child profile on his own opt-in', () => {
    // Capability, never a name: London is not special-cased in either
    // direction. His own opt-in opens his own studio.
    expect(
      resolveBuildStudioAccess({
        ...openForChild(LONDON),
        profile: UserProfile.London,
      }),
    ).toBe(BuildStudioAccess.ChildBuild)
  })
})

describe('the rule cannot key on who the child IS', () => {
  /**
   * Structural, not remembered. `BuildStudioAccessInput` has no name, age,
   * grade, avatar, working level or calibration in it, so a future edit cannot
   * quietly start reading one — it would have to add the field first, and this
   * test is where that gets noticed.
   */
  const SOURCE = readFileSync(resolve(__dirname, 'buildStudioAccess.ts'), 'utf8')
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('reads a non-trivial source (guards this scan itself)', () => {
    expect(code).toContain('resolveBuildStudioAccess')
    expect(code.length).toBeGreaterThan(500)
  })

  it.each([
    'name',
    'age',
    'ageGroup',
    'grade',
    'birthdate',
    'avatar',
    'workingLevel',
    'skillSnapshot',
    'isLincoln',
    'learnerModel',
  ])('never mentions %s', (banned) => {
    expect(code.toLowerCase()).not.toContain(banned.toLowerCase())
  })
})
