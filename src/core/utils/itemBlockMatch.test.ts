import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayBlock } from '../types'
import { DayBlockType, SubjectBucket } from '../types/enums'
import { itemMatchesBlock } from './itemBlockMatch'

// The prior inline matcher in TodayChecklist.tsx, reproduced verbatim so the
// extracted helper can be proven to behave identically (DATA-14 parity).
const priorMatch = (item: ChecklistItem, block: DayBlock): boolean => {
  const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
  const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
  const matchesTitle =
    block.title != null &&
    (block.title === titleClean ||
      titleClean.toLowerCase().includes(block.title.toLowerCase()))
  return Boolean(matchesLabel || matchesTitle)
}

const item = (label: string): ChecklistItem => ({ label, completed: true })
const block = (over: Partial<DayBlock>): DayBlock => ({
  type: DayBlockType.Reading,
  ...over,
})

describe('itemMatchesBlock (DATA-14 shared matcher)', () => {
  it('matches when the block title equals the item label with the (Nm) suffix stripped', () => {
    expect(itemMatchesBlock(item('Reading Eggs (45m)'), block({ title: 'Reading Eggs' }))).toBe(true)
  })

  it('matches case-insensitively when the cleaned label contains the block title', () => {
    expect(itemMatchesBlock(item('Morning Reading Eggs (30m)'), block({ title: 'reading eggs' }))).toBe(true)
  })

  it("matches when a block's own checklist carries an entry with the same label", () => {
    const b = block({
      title: 'Something Else',
      checklist: [{ label: 'Handwriting page (15m)', completed: false }],
    })
    expect(itemMatchesBlock(item('Handwriting page (15m)'), b)).toBe(true)
  })

  it('does not match an unrelated block (carried-over item with no counterpart)', () => {
    expect(itemMatchesBlock(item('Handwriting page (15m)'), block({ title: 'Reading Eggs' }))).toBe(false)
  })

  it('does not match when the block has no title and no checklist', () => {
    expect(itemMatchesBlock(item('Reading Eggs (45m)'), block({ subjectBucket: SubjectBucket.Reading }))).toBe(false)
  })

  it('parity: agrees with the prior TodayChecklist inline matcher across cases', () => {
    const items = [
      item('Reading Eggs (45m)'),
      item('Morning Reading Eggs (30m)'),
      item('Handwriting page (15m)'),
      item('Math'),
      item('Plain label'),
    ]
    const blocks = [
      block({ title: 'Reading Eggs' }),
      block({ title: 'reading eggs' }),
      block({ title: 'Math', checklist: [{ label: 'Handwriting page (15m)', completed: false }] }),
      block({ subjectBucket: SubjectBucket.Reading }),
      block({ title: 'Plain label' }),
    ]
    for (const it of items) {
      for (const bl of blocks) {
        expect(itemMatchesBlock(it, bl)).toBe(priorMatch(it, bl))
      }
    }
  })
})
