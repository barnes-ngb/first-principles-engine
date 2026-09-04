import { describe, expect, it } from 'vitest'

import {
  DraftOwner,
  OTHER_CHILD_DRAFT_KID_LINE,
  UNKNOWN_DRAFT_OWNER_LINE,
  draftOwnerLabel,
  planDraftResume,
  resolveDraftOwnership,
} from '../draftOwnership'
import { expectKidLine } from '../../../test/kidReadability'

// FEAT-188 / UX-108 — the resume rule, as a pure decision.
//
// The bug this closes: a parent shelf lists every child's drafts, and since
// FEAT-173 the active profile is the chat's whole context, so tapping London's
// half-made story while Lincoln is active wrote a Lincoln-shaped story into
// London's book. The owner's answer (2026-09-04) is to switch the header to
// the draft's child and resume — not to refuse.

const CHILDREN = [
  { id: 'child-lincoln', name: 'Lincoln' },
  { id: 'child-london', name: 'London' },
]

describe('resolveDraftOwnership — whose draft is this', () => {
  it('is the active child\'s when the ids match', () => {
    const o = resolveDraftOwnership({ childId: 'child-lincoln' }, 'child-lincoln', CHILDREN)
    expect(o.kind).toBe(DraftOwner.Active)
    expect(o.childName).toBe('Lincoln')
  })

  it('is another child\'s when they differ — resolved through `children`, not a name', () => {
    const o = resolveDraftOwnership({ childId: 'child-london' }, 'child-lincoln', CHILDREN)
    expect(o.kind).toBe(DraftOwner.Other)
    expect(o.childId).toBe('child-london')
    expect(o.childName).toBe('London')
  })

  it('is unknown for a childId the family no longer has', () => {
    const o = resolveDraftOwnership({ childId: 'child-deleted' }, 'child-lincoln', CHILDREN)
    expect(o.kind).toBe(DraftOwner.Unknown)
    expect(o.childName).toBeUndefined()
  })

  it('is unknown — never the active child — for a book with no childId at all', () => {
    const o = resolveDraftOwnership({}, 'child-lincoln', CHILDREN)
    expect(o.kind).toBe(DraftOwner.Unknown)
  })
})

describe('draftOwnerLabel — the card says whose it is', () => {
  it('names the child', () => {
    expect(
      draftOwnerLabel(resolveDraftOwnership({ childId: 'child-london' }, 'child-lincoln', CHILDREN)),
    ).toBe("London's draft")
  })

  it('names nobody when there is nobody to name', () => {
    expect(
      draftOwnerLabel(resolveDraftOwnership({ childId: 'gone' }, 'child-lincoln', CHILDREN)),
    ).toBeNull()
  })
})

describe('planDraftResume — switch, resume, or say why not', () => {
  const parent = { isChildProfile: false }
  const kid = { isChildProfile: true }

  it('resumes the active child\'s own draft without touching the switch', () => {
    const plan = planDraftResume(
      resolveDraftOwnership({ childId: 'child-lincoln' }, 'child-lincoln', CHILDREN),
      parent,
    )
    expect(plan).toEqual({ canResume: true, switchToChildId: null, blockedLine: null })
  })

  it('switches to the draft\'s child first, then resumes (parent)', () => {
    const plan = planDraftResume(
      resolveDraftOwnership({ childId: 'child-london' }, 'child-lincoln', CHILDREN),
      parent,
    )
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBe('child-london')
    expect(plan.blockedLine).toBeNull()
  })

  it('refuses a draft whose child is gone — never a silent write for the active child', () => {
    const plan = planDraftResume(
      resolveDraftOwnership({ childId: 'gone' }, 'child-lincoln', CHILDREN),
      parent,
    )
    expect(plan.canResume).toBe(false)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBe(UNKNOWN_DRAFT_OWNER_LINE)
  })

  it('never offers a kid the switch — `setActiveChildId` is a no-op for them', () => {
    const plan = planDraftResume(
      resolveDraftOwnership({ childId: 'child-london' }, 'child-lincoln', CHILDREN),
      kid,
    )
    expect(plan.canResume).toBe(false)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBe(OTHER_CHILD_DRAFT_KID_LINE)
  })

  it('still lets a kid resume their own draft', () => {
    const plan = planDraftResume(
      resolveDraftOwnership({ childId: 'child-london' }, 'child-london', CHILDREN),
      kid,
    )
    expect(plan).toEqual({ canResume: true, switchToChildId: null, blockedLine: null })
  })
})

describe('the kid refusal is held to the shared readability bar', () => {
  it('reads at a six-year-old\'s level', () => {
    expectKidLine(OTHER_CHILD_DRAFT_KID_LINE, 'OTHER_CHILD_DRAFT_KID_LINE')
  })
})
