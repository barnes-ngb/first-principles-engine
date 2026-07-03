import { describe, expect, it } from 'vitest'

import {
  helpCardDocId,
  helpCardKey,
  normalizeHelpCardLabel,
  qualifiesForHelpCard,
} from './helpCard'

describe('normalizeHelpCardLabel', () => {
  it('strips a trailing minutes suffix', () => {
    expect(normalizeHelpCardLabel('Phonics — short i (15m)')).toBe('Phonics — short i')
    expect(normalizeHelpCardLabel('Math facts')).toBe('Math facts')
  })
})

describe('helpCardKey / helpCardDocId', () => {
  it('is identical for a plan-item title and the stored checklist label (minutes ignored)', () => {
    const planItem = { label: 'Phonics — short i', subjectBucket: 'Reading' }
    const checklistItem = { label: 'Phonics — short i (15m)', subjectBucket: 'Reading' }
    expect(helpCardKey(planItem)).toBe(helpCardKey(checklistItem))
    expect(helpCardDocId('c1', planItem)).toBe(helpCardDocId('c1', checklistItem))
  })

  it('namespaces by child and subject', () => {
    expect(helpCardDocId('c1', { label: 'Facts', subjectBucket: 'Math' })).toBe('c1__math__facts')
    expect(helpCardDocId('c2', { label: 'Facts', subjectBucket: 'Math' })).not.toBe(
      helpCardDocId('c1', { label: 'Facts', subjectBucket: 'Math' }),
    )
  })
})

describe('qualifiesForHelpCard', () => {
  it('accepts a must-do Reading item', () => {
    expect(
      qualifiesForHelpCard({ label: 'Phonics', subjectBucket: 'Reading', category: 'must-do' }),
    ).toBe(true)
  })

  it('accepts an mvdEssential Math item', () => {
    expect(
      qualifiesForHelpCard({ label: 'Math facts', subjectBucket: 'Math', mvdEssential: true }),
    ).toBe(true)
  })

  it('rejects non-Reading/Math buckets', () => {
    expect(
      qualifiesForHelpCard({ label: 'Handwriting', subjectBucket: 'LanguageArts', category: 'must-do' }),
    ).toBe(false)
    expect(
      qualifiesForHelpCard({ label: 'Nature walk', subjectBucket: 'Science', mvdEssential: true }),
    ).toBe(false)
  })

  it('rejects choose / routine items', () => {
    expect(qualifiesForHelpCard({ label: 'Reading Eggs', subjectBucket: 'Reading', category: 'choose' })).toBe(
      false,
    )
  })

  it('rejects prayer/scripture even in a qualifying bucket', () => {
    expect(
      qualifiesForHelpCard({ label: 'Scripture reading', subjectBucket: 'Reading', category: 'must-do' }),
    ).toBe(false)
  })

  it('rejects skipped items', () => {
    expect(
      qualifiesForHelpCard({ label: 'Math', subjectBucket: 'Math', category: 'must-do', skipped: true }),
    ).toBe(false)
  })
})
