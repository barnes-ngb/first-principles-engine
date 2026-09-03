import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { resolveChildAgeGroup } from '../../../core/profile/childIdentity'
import type { Child } from '../../../core/types'
import { OLDER_QUESTIONS, YOUNGER_QUESTIONS, useStoryGuide } from '../useStoryGuide'

// FEAT-183 / UX-152 (B5) — the guided-story question set is an age split, not
// a name one.
//
// Before: `useStoryGuide(isLincoln)` → `LINCOLN_QUESTIONS : LONDON_QUESTIONS`.
// A third child got the younger set because he isn't called "Lincoln". Same
// two sets, same content — only the key and the constant names changed.

const NOW = new Date('2026-09-03T12:00:00Z')

const LINCOLN = { id: 'c-lincoln', name: 'Lincoln', birthdate: '2015-09-30' } as Child
const LONDON = { id: 'c-london', name: 'London', birthdate: '2020-02-20' } as Child
const ROWAN = { id: 'c-rowan', name: 'Rowan', birthdate: '2015-04-04' } as Child
const MAEVE = { id: 'c-maeve', name: 'Maeve', birthdate: '2020-04-04' } as Child

/** What `StoryGuidePage` does: resolve the group, then hand it to the hook. */
function guideFor(child: Child) {
  const { result } = renderHook(() => useStoryGuide(resolveChildAgeGroup(child, NOW)))
  return result.current
}

describe('useStoryGuide — the question set follows the age group (B5)', () => {
  it('gives an older, differently-named child the older set', () => {
    expect(guideFor(ROWAN).questions).toEqual(OLDER_QUESTIONS)
  })

  it('gives a younger, differently-named child the younger set', () => {
    expect(guideFor(MAEVE).questions).toEqual(YOUNGER_QUESTIONS)
  })

  it('leaves Lincoln on the set he has today', () => {
    expect(guideFor(LINCOLN).questions).toEqual(OLDER_QUESTIONS)
  })

  it('leaves London on the set he has today', () => {
    expect(guideFor(LONDON).questions).toEqual(YOUNGER_QUESTIONS)
  })

  it('keys the brief’s theme the same way', () => {
    expect(guideFor(ROWAN).assembleBrief('c-rowan', 11, []).theme).toBe('minecraft')
    expect(guideFor(MAEVE).assembleBrief('c-maeve', 6, []).theme).toBe('storybook')
    // Unchanged for both boys.
    expect(guideFor(LINCOLN).assembleBrief('c-lincoln', 10, []).theme).toBe('minecraft')
    expect(guideFor(LONDON).assembleBrief('c-london', 6, []).theme).toBe('storybook')
  })

  it('did not change either set’s content — only which child reads it', () => {
    expect(OLDER_QUESTIONS[0]!.text).toBe('Who is the hero of your story?')
    expect(YOUNGER_QUESTIONS[0]!.text).toBe('Who is in your story?')
  })
})
