import { describe, expect, it } from 'vitest'

import { expectKidLine, expectKidWording } from '../../../test/kidReadability'
import {
  MAKE_BOOK_DOOR_LABEL,
  MAKE_BOOK_DOOR_TITLE,
  MakeBookChoice,
  makeBookChoices,
} from '../makeBookDoor'

// FEAT-187 / UX-102 — the shelf had three ways to make a book and five verbs
// for the act. The owner decision is one door, two choices. This suite holds
// the copy itself: one verb per choice, one line saying what happens next, and
// the kid wording under the same readability bar the FEAT-178 help sheets use.

describe('makeBookChoices — the shape of the door', () => {
  it('offers exactly the two choices, in order, to both audiences', () => {
    for (const audience of ['kid', 'parent'] as const) {
      const choices = makeBookChoices(audience)
      expect(choices.map((c) => c.id), audience).toEqual([
        MakeBookChoice.Myself,
        MakeBookChoice.WithShelly,
      ])
    }
  })

  it('gives every choice a label and a what-happens-next line', () => {
    for (const audience of ['kid', 'parent'] as const) {
      for (const choice of makeBookChoices(audience)) {
        expect(choice.label.trim(), `${audience}/${choice.id} label`).not.toBe('')
        expect(choice.next.trim(), `${audience}/${choice.id} next`).not.toBe('')
        expect(choice.next.trim().endsWith('.'), `${audience}/${choice.id} next`).toBe(true)
      }
    }
  })

  it('says the audiences differently — the kid copy is not the parent copy', () => {
    const kid = makeBookChoices('kid')
    const parent = makeBookChoices('parent')
    for (let i = 0; i < kid.length; i++) {
      expect(kid[i].next).not.toBe(parent[i].next)
    }
  })

  it('uses one verb per choice — no "Create", no "Generate"', () => {
    for (const audience of ['kid', 'parent'] as const) {
      for (const choice of makeBookChoices(audience)) {
        expect(choice.label, `${audience}/${choice.id}`).not.toMatch(/create|generate/i)
      }
    }
    expect(MAKE_BOOK_DOOR_TITLE).not.toMatch(/create|generate/i)
    expect(MAKE_BOOK_DOOR_LABEL).not.toMatch(/create|generate/i)
  })

  it('never names the retired Story Guide', () => {
    for (const audience of ['kid', 'parent'] as const) {
      for (const choice of makeBookChoices(audience)) {
        expect(`${choice.label} ${choice.next}`).not.toMatch(/story guide/i)
      }
    }
  })
})

describe('makeBookChoices — the kid readability bar', () => {
  it('holds for every kid label and line', () => {
    expectKidWording(MAKE_BOOK_DOOR_TITLE, 'door title')
    expectKidWording(MAKE_BOOK_DOOR_LABEL, 'door label')
    for (const choice of makeBookChoices('kid')) {
      expectKidWording(choice.label, `kid/${choice.id} label`)
      expectKidLine(choice.next, `kid/${choice.id} next`)
    }
  })
})
