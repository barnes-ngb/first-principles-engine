import { describe, expect, it } from 'vitest'

import { expectKidLine } from '../../test/kidReadability'
import {
  questLeftItsChild,
  questOwnerLines,
  resolveQuestOwnerChildId,
} from './questSessionOwner'

/**
 * UX-339 — the rule behind the bind, on its own. The hook test beside this one
 * proves every write follows it; this proves the rule answers correctly with
 * and without a session, and that the sentence a ten-year-old reads is one he
 * can read.
 */
const LINCOLN = { childId: 'lincoln', childName: 'Lincoln' }

describe('resolveQuestOwnerChildId', () => {
  it('a running session wins over the live child', () => {
    expect(resolveQuestOwnerChildId(LINCOLN, 'london')).toBe('lincoln')
  })

  it('falls back to the live child with no session — the previous behaviour', () => {
    // The intro screen, the resume card and the eligibility reads all run with
    // no owner, and none of them changes.
    expect(resolveQuestOwnerChildId(null, 'london')).toBe('london')
    expect(resolveQuestOwnerChildId({ childId: '', childName: '' }, 'london')).toBe('london')
  })
})

describe('questLeftItsChild', () => {
  it('is true only when a session is running for someone else', () => {
    expect(questLeftItsChild(LINCOLN, 'london')).toBe(true)
    expect(questLeftItsChild(LINCOLN, 'lincoln')).toBe(false)
    expect(questLeftItsChild(null, 'london')).toBe(false)
  })

  it('says nothing before a child resolves at all', () => {
    expect(questLeftItsChild(LINCOLN, '')).toBe(false)
  })
})

describe('questOwnerLines', () => {
  it('names the child the quest will be saved for', () => {
    const lines = questOwnerLines('Lincoln')
    expect(lines.join(' ')).toContain('Lincoln')
    expect(lines).toHaveLength(2)
  })

  it('is readable by the boy looking at the screen', () => {
    // The shared kid bar. Both boys, whichever name lands in it.
    for (const name of ['Lincoln', 'London']) {
      for (const line of questOwnerLines(name)) {
        expectKidLine(line, `questOwnerLines(${name})`)
      }
    }
  })
})
