import { describe, expect, it } from 'vitest'
import { DRAWN_AS_LABEL, drawnAsLine } from '../revisedPromptLine'

describe('drawnAsLine (FEAT-195)', () => {
  it('says what the picture maker was actually asked to draw', () => {
    expect(
      drawnAsLine('Mario', 'a stocky man in red overalls with a big mustache', 'parent'),
    ).toBe(`${DRAWN_AS_LABEL} a stocky man in red overalls with a big mustache`)
  })

  it('stays quiet when the ask went through unchanged', () => {
    expect(drawnAsLine('a cute puppy', 'a cute puppy', 'parent')).toBeNull()
    expect(drawnAsLine('a cute puppy', 'A Cute   Puppy', 'parent')).toBeNull()
  })

  it('stays quiet when the server sent nothing — an older deploy says nothing, not "unchanged"', () => {
    expect(drawnAsLine('a cute puppy', undefined, 'parent')).toBeNull()
    expect(drawnAsLine('a cute puppy', '   ', 'parent')).toBeNull()
  })

  it('never shows for a kid — it explains a rule they did not ask about', () => {
    expect(drawnAsLine('Mario', 'a stocky man in red overalls', 'kid')).toBeNull()
  })

  it('trims a very long revision — it is a footnote, not the prompt log', () => {
    const line = drawnAsLine('Mario', 'x'.repeat(400), 'parent')
    expect(line).not.toBeNull()
    expect(line!.length).toBeLessThan(200)
    expect(line!.endsWith('…')).toBe(true)
  })
})
