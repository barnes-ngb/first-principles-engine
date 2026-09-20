import { describe, expect, it } from 'vitest'
import {
  DraftOwner,
  resolveDraftOwnership,
  draftOwnerLabel,
  planDraftResume,
  inFlightDraftNotice,
  UNKNOWN_DRAFT_OWNER_LINE,
  OTHER_CHILD_DRAFT_KID_LINE,
} from './draftOwnership'
import type { DraftOwnership, NamedChild, InFlightDraft } from './draftOwnership'

// ── Fixtures ──────────────────────────────────────────────────────────

const lincoln: NamedChild = { id: 'child-1', name: 'Lincoln' }
const london: NamedChild = { id: 'child-2', name: 'London' }
const family: ReadonlyArray<NamedChild> = [lincoln, london]

// ── resolveDraftOwnership ─────────────────────────────────────────────

describe('resolveDraftOwnership', () => {
  it('returns Active when the book belongs to the active child', () => {
    const result = resolveDraftOwnership({ childId: 'child-1' }, 'child-1', family)
    expect(result.kind).toBe(DraftOwner.Active)
    expect(result.childId).toBe('child-1')
    expect(result.childName).toBe('Lincoln')
  })

  it('returns Other when the book belongs to a different child', () => {
    const result = resolveDraftOwnership({ childId: 'child-2' }, 'child-1', family)
    expect(result.kind).toBe(DraftOwner.Other)
    expect(result.childId).toBe('child-2')
    expect(result.childName).toBe('London')
  })

  it('returns Unknown when the book has no childId', () => {
    const result = resolveDraftOwnership({}, 'child-1', family)
    expect(result.kind).toBe(DraftOwner.Unknown)
    expect(result.childId).toBe('')
    expect(result.childName).toBeUndefined()
  })

  it('returns Unknown when the book has an empty childId', () => {
    const result = resolveDraftOwnership({ childId: '' }, 'child-1', family)
    expect(result.kind).toBe(DraftOwner.Unknown)
    expect(result.childId).toBe('')
  })

  it('returns Unknown when the childId matches no family member', () => {
    const result = resolveDraftOwnership({ childId: 'deleted-child' }, 'child-1', family)
    expect(result.kind).toBe(DraftOwner.Unknown)
    expect(result.childId).toBe('deleted-child')
    expect(result.childName).toBeUndefined()
  })

  it('returns Unknown with an empty family', () => {
    const result = resolveDraftOwnership({ childId: 'child-1' }, 'child-1', [])
    expect(result.kind).toBe(DraftOwner.Unknown)
  })
})

// ── draftOwnerLabel ───────────────────────────────────────────────────

describe('draftOwnerLabel', () => {
  it('returns "Name\'s draft" when a child name is present', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Other,
      childId: 'child-2',
      childName: 'London',
    }
    expect(draftOwnerLabel(ownership)).toBe("London's draft")
  })

  it('returns null when there is no child name (Unknown)', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Unknown,
      childId: 'missing',
    }
    expect(draftOwnerLabel(ownership)).toBeNull()
  })
})

// ── planDraftResume ───────────────────────────────────────────────────

describe('planDraftResume', () => {
  it('allows resume with no switch for Active ownership', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Active,
      childId: 'child-1',
      childName: 'Lincoln',
    }
    const plan = planDraftResume(ownership, { isChildProfile: false })
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBeNull()
  })

  it('allows resume with switch for a parent on another child\'s draft', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Other,
      childId: 'child-2',
      childName: 'London',
    }
    const plan = planDraftResume(ownership, { isChildProfile: false })
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBe('child-2')
    expect(plan.blockedLine).toBeNull()
  })

  it('blocks a kid profile on another child\'s draft', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Other,
      childId: 'child-2',
      childName: 'London',
    }
    const plan = planDraftResume(ownership, { isChildProfile: true })
    expect(plan.canResume).toBe(false)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBe(OTHER_CHILD_DRAFT_KID_LINE)
  })

  it('blocks Unknown ownership for a parent', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Unknown,
      childId: 'deleted-child',
    }
    const plan = planDraftResume(ownership, { isChildProfile: false })
    expect(plan.canResume).toBe(false)
    expect(plan.blockedLine).toBe(UNKNOWN_DRAFT_OWNER_LINE)
  })

  it('blocks Unknown ownership for a kid profile', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Unknown,
      childId: 'deleted-child',
    }
    const plan = planDraftResume(ownership, { isChildProfile: true })
    expect(plan.canResume).toBe(false)
    expect(plan.blockedLine).toBe(UNKNOWN_DRAFT_OWNER_LINE)
  })

  it('allows Active for a kid profile (their own draft)', () => {
    const ownership: DraftOwnership = {
      kind: DraftOwner.Active,
      childId: 'child-1',
      childName: 'Lincoln',
    }
    const plan = planDraftResume(ownership, { isChildProfile: true })
    expect(plan.canResume).toBe(true)
    expect(plan.switchToChildId).toBeNull()
    expect(plan.blockedLine).toBeNull()
  })
})

// ── inFlightDraftNotice ───────────────────────────────────────────────

describe('inFlightDraftNotice', () => {
  it('returns null when there is no draft', () => {
    expect(inFlightDraftNotice(null, 'child-1')).toBeNull()
  })

  it('returns null when the draft belongs to the active child', () => {
    const draft: InFlightDraft = { childId: 'child-1', childName: 'Lincoln' }
    expect(inFlightDraftNotice(draft, 'child-1')).toBeNull()
  })

  it('returns a notice when the draft belongs to a different child', () => {
    const draft: InFlightDraft = { childId: 'child-2', childName: 'London' }
    const notice = inFlightDraftNotice(draft, 'child-1')
    expect(notice).toContain('London')
    expect(notice).toContain("London's books")
  })

  it('returns null when the draft has no childName', () => {
    const draft = { childId: 'child-2', childName: '' } as InFlightDraft
    expect(inFlightDraftNotice(draft, 'child-1')).toBeNull()
  })
})
