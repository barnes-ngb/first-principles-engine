import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { CurriculumSection, sectionForType } from '../progress/curriculumGrouping'
import { planRename } from '../progress/renameActivity'
import {
  READ_ALOUD_DEFAULT_MINUTES,
  buildReadAloudConfig,
  earlierReadAloudPrompt,
  isReadAloudConfig,
  openEarlierReadAloudRows,
  readAloudChapterLine,
  readAloudConfigDocId,
  readAloudRowName,
} from './readAloudCurriculum'

const DARK_SEA = {
  id: 'dark-sea',
  title: 'On the Edge of the Dark Sea of Darkness',
  author: 'Andrew Peterson',
}
const NARNIA = { id: 'lion-witch-wardrobe', title: 'The Lion, the Witch and the Wardrobe', author: 'C. S. Lewis' }
const NOW = '2026-10-27T12:00:00.000Z'

describe('the read-aloud row (FEAT-243 / UX-470)', () => {
  it('has one deterministic id per book', () => {
    expect(readAloudConfigDocId('dark-sea')).toBe('readaloud-dark-sea')
    expect(buildReadAloudConfig(DARK_SEA, NOW).id).toBe(readAloudConfigDocId(DARK_SEA.id))
    expect(buildReadAloudConfig(DARK_SEA, NOW).id).toBe(buildReadAloudConfig(DARK_SEA, 'later').id)
  })

  it('is a shared routine, named so a parent recognises it, linked to its book', () => {
    const row = buildReadAloudConfig(DARK_SEA, NOW)
    expect(row).toMatchObject({
      name: 'Read-aloud: On the Edge of the Dark Sea of Darkness',
      type: 'routine',
      subjectBucket: 'Reading',
      defaultMinutes: READ_ALOUD_DEFAULT_MINUTES,
      frequency: 'daily',
      childId: 'both',
      block: 'readaloud',
      completed: false,
      scannable: false,
      chapterBookId: 'dark-sea',
    })
    expect(READ_ALOUD_DEFAULT_MINUTES).toBe(20)
    expect(isReadAloudConfig(row)).toBe(true)
  })

  it('carries NO chapter counter — the owner declined a second one', () => {
    const row = buildReadAloudConfig(DARK_SEA, NOW)
    expect(row).not.toHaveProperty('currentPosition')
    expect(row).not.toHaveProperty('totalUnits')
    expect(row).not.toHaveProperty('unitLabel')
    expect(row.type).not.toBe('workbook')
    expect(row.type).not.toBe('strand')
  })

  it('lands in a Curriculum section (the exhaustive partition)', () => {
    expect(sectionForType(buildReadAloudConfig(DARK_SEA, NOW).type)).toBe(CurriculumSection.Routines)
  })

  it('a rename of the row is not flagged as a duplicate of itself', () => {
    const row = buildReadAloudConfig(DARK_SEA, NOW)
    const plan = planRename(row, 'Dark Sea', undefined, [row])
    expect(plan.refusal).toBe('')
    expect(plan.duplicateNotice).toBe('')
  })

  it('a blank title still names the row', () => {
    expect(readAloudRowName('  ')).toBe('Read-aloud')
  })
})

describe('openEarlierReadAloudRows — a new book never closes the old one', () => {
  const dark = buildReadAloudConfig(DARK_SEA, NOW)
  const narnia = buildReadAloudConfig(NARNIA, NOW)
  const prayer = { id: 'p', completed: false } as ActivityConfig

  it('offers the earlier book back, still active', () => {
    expect(openEarlierReadAloudRows([dark, narnia, prayer], 'dark-sea').map((c) => c.id)).toEqual([
      'readaloud-lion-witch-wardrobe',
    ])
  })

  it('offers nothing for the current book, a finished one, or a non-read-aloud row', () => {
    expect(openEarlierReadAloudRows([dark, prayer], 'dark-sea')).toEqual([])
    expect(openEarlierReadAloudRows([dark, { ...narnia, completed: true }], 'dark-sea')).toEqual([])
  })

  it('the prompt names the book by its own title', () => {
    expect(earlierReadAloudPrompt(narnia)).toBe(
      'The Lion, the Witch and the Wardrobe is still in Curriculum. Mark it finished?',
    )
  })
})

describe('readAloudChapterLine — read from bookProgress, per child', () => {
  const base = { totalChapters: 58 }

  it('names the child and the chapter from bookProgress', () => {
    expect(readAloudChapterLine({ ...base, lastChapterAnswered: 7 }, 'Lincoln')).toBe('Lincoln: chapter 7 of 58')
  })

  it('changes when bookProgress does (positive control)', () => {
    const before = readAloudChapterLine({ ...base, lastChapterAnswered: 7 }, 'Lincoln')
    const after = readAloudChapterLine({ ...base, lastChapterAnswered: 8 }, 'Lincoln')
    expect(after).toBe('Lincoln: chapter 8 of 58')
    expect(after).not.toBe(before)
  })

  it('each boy reads his own chapter — never averaged', () => {
    expect(readAloudChapterLine({ ...base, lastChapterAnswered: 7 }, 'Lincoln')).toContain('7')
    expect(readAloudChapterLine({ ...base, lastChapterAnswered: 3 }, 'London')).toBe('London: chapter 3 of 58')
  })

  it('a started, finished, or unreadable record says only what it knows', () => {
    expect(readAloudChapterLine({ ...base }, 'London')).toBe('London: not started · 58 chapters')
    expect(readAloudChapterLine({ ...base, completedAt: NOW }, 'London')).toBe('London: finished')
    expect(readAloudChapterLine({ totalChapters: 0 }, 'London')).toBeNull()
    expect(readAloudChapterLine(null, 'London')).toBeNull()
  })
})
