import { describe, expect, it } from 'vitest'

import {
  buildDeleteActivityPrompt,
  deleteFailureNotice,
  DELETE_ACTIVITY_MENU_LABEL,
  positionPhrase,
} from './removeActivityCopy'

describe('positionPhrase', () => {
  it('names the place in the program\'s own unit word', () => {
    expect(
      positionPhrase({ name: 'GATB Math', currentPosition: 12, totalUnits: 40, unitLabel: 'lesson' }),
    ).toBe('lesson 12 of 40')
    expect(
      positionPhrase({ name: 'Chapter book', currentPosition: 3, totalUnits: 9, unitLabel: 'chapter' }),
    ).toBe('chapter 3 of 9')
  })

  it('defaults to "lesson" when the program has no unit word', () => {
    expect(positionPhrase({ name: 'X', currentPosition: 4, totalUnits: 10 })).toBe('lesson 4 of 10')
  })

  it('drops the "of N" half when the total is unknown or zero', () => {
    expect(positionPhrase({ name: 'X', currentPosition: 4 })).toBe('lesson 4')
    expect(positionPhrase({ name: 'X', currentPosition: 4, totalUnits: 0 })).toBe('lesson 4')
  })

  it('reads position 0 as no place at all, never "lesson 0"', () => {
    expect(positionPhrase({ name: 'X', currentPosition: 0, totalUnits: 40 })).toBeNull()
    expect(positionPhrase({ name: 'X' })).toBeNull()
  })
})

describe('buildDeleteActivityPrompt', () => {
  const workbook = {
    name: 'GATB Math',
    currentPosition: 12,
    totalUnits: 40,
    unitLabel: 'lesson',
    completed: false,
  }

  it('says the word "delete", says there is no undo, and names the position that goes with it', () => {
    const prompt = buildDeleteActivityPrompt(workbook)
    expect(prompt.title).toBe('Delete "GATB Math" permanently?')
    expect(prompt.whatGoes).toContain('lesson 12 of 40')
    expect(prompt.whatGoes).toContain('no undo')
    expect(prompt.confirmLabel).toBe('Delete permanently')
  })

  it('never says "remove" — the label the audit named as the dishonest one', () => {
    const prompt = buildDeleteActivityPrompt(workbook)
    const allCopy = [prompt.title, prompt.whatGoes, prompt.whatStays, prompt.gentlerPath ?? '']
    for (const line of allCopy) {
      expect(line.toLowerCase()).not.toContain('remove')
    }
    expect(DELETE_ACTIVITY_MENU_LABEL.toLowerCase()).not.toContain('remove')
  })

  it('says what SURVIVES the delete: recorded days are not touched', () => {
    const prompt = buildDeleteActivityPrompt(workbook)
    expect(prompt.whatStays).toContain('logged')
    expect(prompt.whatStays).toMatch(/doesn't change your records/)
  })

  it('offers "Mark as complete" as the gentler path that already exists', () => {
    expect(buildDeleteActivityPrompt(workbook).gentlerPath).toContain('Mark as complete')
  })

  it('drops the gentler path once the program is already complete', () => {
    expect(buildDeleteActivityPrompt({ ...workbook, completed: true }).gentlerPath).toBeUndefined()
  })

  it('drops the position clause entirely on a program with no saved place', () => {
    const prompt = buildDeleteActivityPrompt({ name: 'Morning Prayer', completed: false })
    expect(prompt.whatGoes).toBe('This deletes "Morning Prayer" for good. There\'s no undo.')
    expect(prompt.whatGoes).not.toContain('lesson')
    // The honest half still shows — it is true of every program, not just workbooks.
    expect(prompt.whatStays).toContain('logged')
  })
})

describe('deleteFailureNotice', () => {
  it('names what failed, that nothing was lost, and what to do (UX-83 shape)', () => {
    const notice = deleteFailureNotice('GATB Math')
    expect(notice).toContain('GATB Math')
    expect(notice).toContain('still in your curriculum')
    expect(notice).toContain('nothing was lost')
    expect(notice).toMatch(/try again/)
  })
})
