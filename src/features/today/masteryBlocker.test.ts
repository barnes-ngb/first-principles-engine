import { describe, it, expect } from 'vitest'
import type { ChecklistItem } from '../../core/types/planning'
import type { ConceptualBlock } from '../../core/types/evaluation'
import { SubjectBucket } from '../../core/types/enums'
import { buildGotItReinforcement, buildStuckBlock } from './masteryBlocker'
import { mergeBlock } from '../../core/utils/blockerLifecycle'

function mkItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    label: 'Short-i/e practice page',
    completed: true,
    subjectBucket: SubjectBucket.Reading,
    ...overrides,
  }
}

describe('buildStuckBlock', () => {
  it('creates a parent-sourced ADDRESS_NOW block', () => {
    const partial = buildStuckBlock(mkItem(), '2026-04-21T10:00:00Z')
    expect(partial).not.toBeNull()
    expect(partial?.source).toBe('parent')
    expect(partial?.status).toBe('ADDRESS_NOW')
    expect(partial?.evidence).toContain('Stuck on 2026-04-21')
    expect(partial?.id).toBeTruthy()
  })

  it('uses skillTags when present', () => {
    const partial = buildStuckBlock(
      mkItem({ skillTags: ['phonics.short-i-vs-e' as unknown as never] }),
      '2026-04-21T10:00:00Z',
    )
    expect(partial?.id).toBe('phonics-short-i-vs-e')
  })

  it('falls back to subject+label when no skillTags', () => {
    const partial = buildStuckBlock(
      mkItem({ label: 'Short-i words', subjectBucket: SubjectBucket.Reading }),
      '2026-04-21T10:00:00Z',
    )
    // label "Short-i words" + subject "Reading" → "reading.short-i-words"
    expect(partial?.id).toBe('reading-short-i-words')
  })

  it('returns null for an item with no label', () => {
    const partial = buildStuckBlock(
      { label: '', completed: true } as ChecklistItem,
      '2026-04-21T10:00:00Z',
    )
    expect(partial).toBeNull()
  })
})

describe('buildGotItReinforcement', () => {
  it('emits nothing when no existing block matches the item', () => {
    const partial = buildGotItReinforcement(mkItem(), [], '2026-04-21T10:00:00Z')
    expect(partial).toBeNull()
  })

  it('emits a RESOLVING nudge when an existing block matches the item', () => {
    const stuck = buildStuckBlock(mkItem(), '2026-04-15T10:00:00Z')!
    const merged = mergeBlock([], stuck as Parameters<typeof mergeBlock>[1])

    const partial = buildGotItReinforcement(mkItem(), merged, '2026-04-21T10:00:00Z')
    expect(partial).not.toBeNull()
    expect(partial?.status).toBe('RESOLVING')
    expect(partial?.source).toBe('parent')
    expect(partial?.evidence).toContain('Got it on 2026-04-21')
  })
})

describe('mastery chip → merge helper integration', () => {
  const ts1 = '2026-04-15T10:00:00Z'
  const ts2 = '2026-04-16T10:00:00Z'
  const ts3 = '2026-04-21T10:00:00Z'

  it('Stuck → merges a fresh block; second Stuck reinforces, not duplicates', () => {
    const existing: ConceptualBlock[] = []
    const first = buildStuckBlock(mkItem(), ts1)!
    const afterFirst = mergeBlock(existing, first as Parameters<typeof mergeBlock>[1])
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst[0].sessionCount).toBe(1)

    const second = buildStuckBlock(mkItem(), ts2)!
    const afterSecond = mergeBlock(afterFirst, second as Parameters<typeof mergeBlock>[1])
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond[0].sessionCount).toBe(2)
  })

  it('Stuck then Got it same session: second tap reinforces the block (no duplicate)', () => {
    const stuck = buildStuckBlock(mkItem(), ts1)!
    const afterStuck = mergeBlock([], stuck as Parameters<typeof mergeBlock>[1])
    expect(afterStuck).toHaveLength(1)

    const gotIt = buildGotItReinforcement(mkItem(), afterStuck, ts3)
    expect(gotIt).not.toBeNull()
    const afterGotIt = mergeBlock(afterStuck, gotIt as Parameters<typeof mergeBlock>[1])
    expect(afterGotIt).toHaveLength(1)
    expect(afterGotIt[0].status).toBe('RESOLVING')
    expect(afterGotIt[0].sessionCount).toBe(2)
  })
})
