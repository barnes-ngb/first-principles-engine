import { describe, expect, it } from 'vitest'

import {
  DraftOwner,
  OTHER_CHILD_DRAFT_KID_LINE,
  UNKNOWN_DRAFT_OWNER_LINE,
  draftOwnerLabel,
  inFlightDraftNotice,
  planDraftResume,
  resolveDraftOwnership,
} from './draftOwnership'
import type { DraftOwnership, NamedChild } from './draftOwnership'

const lincoln: NamedChild = { id: 'child-lincoln', name: 'Lincoln' }
const london: NamedChild = { id: 'child-london', name: 'London' }
const children: readonly NamedChild[] = [lincoln, london]

// --- resolveDraftOwnership ---

describe('resolveDraftOwnership', () => {
  it('returns Active when book childId matches activeChildId', () => {
    const result = resolveDraftOwnership(
      { childId: 'child-lincoln' },
      'child-lincoln',
      children,
    )
    expect(result.kind).toBe(DraftOwner.Active)
    expect(result.childId).toBe('child-lincoln')
    expect(result.childName).toBe('Lincoln')
  })

  it('returns Other when book childId is a different known child', () => {
    const result = resolveDraftOwnership(
      { childId: 'child-london' },
      'child-lincoln',
      children,
    )
    expect(result.kind).toBe(DraftOwner.Other)
    expect(result.childId).toBe('child-london')
    expect(result.childName).toBe('London')
  })

  it('returns Unknown for a childId not in the family', () => {
    const result = resolveDraftOwnership(
      { childId: 'deleted-child' },
      'child-lincoln',
      children,
    )
    expect(result.kind).toBe(DraftOwner.Unknown)
    expect(result.childId).toBe('deleted-child')
    expect(result.childName).toBeUndefined()
  })

  it('returns Unknown for a book with no childId', () => {
    const result = resolveDraftOwnership({}, 'child-lincoln', children)
    expect(result.kind).toBe(DraftOwner.Unknown)
    expect(result.childId).toBe('')
  })

  it('returns Unknown for an empty string childId', () => {
    const result = resolveDraftOwnership(
      { childId: '' },
      'child-lincoln',
      children,
    )
    expect(result.kind).toBe(DraftOwner.Unknown)
  })

  it('returns Unknown when children list is empty', () => {
    const result = resolveDraftOwnership(
      { childId: 'child-lincoln' },
      'child-lincoln',
      [],
    )
    expect(result.kind).toBe(DraftOwner.Unknown)
  })
})

// --- draftOwnerLabel ---

describe('draftOwnerLabel', () => {
  it('returns possessive label when childName is present', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Active,
      childId: 'child-lincoln',
      childName: 'Lincoln',
    }
    expect(draftOwnerLabel(ownership)).toBe("Lincoln's draft")
  })

  it('returns null when childName is undefined', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Unknown,
      childId: 'deleted',
    }
    expect(draftOwnerLabel(ownership)).toBeNull()
  })
})

// --- planDraftResume ---

describe('planDraftResume', () => {
  it('allows resume for Active ownership (parent)', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Active,
      childId: 'child-lincoln',
      childName: 'Lincoln',
    }
    const plan = planDraftResume(ownership, { isChildProfile: false })
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBeNull()
  })

  it('allows resume for Active ownership (kid)', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Active,
      childId: 'child-lincoln',
      childName: 'Lincoln',
    }
    const plan = planDraftResume(ownership, { isChildProfile: true })
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBeNull()
  })

  it('blocks Unknown with UNKNOWN_DRAFT_OWNER_LINE', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Unknown,
      childId: 'deleted',
    }
    const plan = planDraftResume(ownership, { isChildProfile: false })
    expect(plan.canResume).toBe(false)
    expect(plan.blockedLine).toBe(UNKNOWN_DRAFT_OWNER_LINE)
  })

  it('parent on Other child: can resume with switch', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Other,
      childId: 'child-london',
      childName: 'London',
    }
    const plan = planDraftResume(ownership, { isChildProfile: false })
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBe('child-london')
    expect(plan.blockedLine).toBeNull()
  })

  it('kid on Other child: blocked with kid line', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Other,
      childId: 'child-london',
      childName: 'London',
    }
    const plan = planDraftResume(ownership, { isChildProfile: true })
    expect(plan.canResume).toBe(false)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBe(OTHER_CHILD_DRAFT_KID_LINE)
  })
})

// --- inFlightDraftNotice ---

describe('inFlightDraftNotice', () => {
  it('returns null when no draft', () => {
    expect(inFlightDraftNotice(null, 'child-lincoln')).toBeNull()
  })

  it('returns null when draft child matches active child', () => {
    expect(
      inFlightDraftNotice(
        { childId: 'child-lincoln', childName: 'Lincoln' },
        'child-lincoln',
      ),
    ).toBeNull()
  })

  it('returns notice when draft child differs from active child', () => {
    const notice = inFlightDraftNotice(
      { childId: 'child-london', childName: 'London' },
      'child-lincoln',
    )
    expect(notice).toContain('London')
    expect(notice).toContain("London's books")
  })

  it('returns null when draft has empty childName', () => {
    expect(
      inFlightDraftNotice(
        { childId: 'child-london', childName: '' },
        'child-lincoln',
      ),
    ).toBeNull()
  })
})
