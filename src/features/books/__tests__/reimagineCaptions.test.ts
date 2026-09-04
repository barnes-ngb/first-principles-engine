import { describe, expect, it } from 'vitest'

import {
  REIMAGINE_LEFT_LABEL,
  REIMAGINE_RIGHT_LABEL,
  reimagineBand,
  reimagineCaption,
} from '../reimagineCaptions'
import { reimagineStyleFor } from '../useBackgroundReimagine'

// ── FEAT-193 / UX-161a: the slider says what it sends ───────────────────────
//
// All three captions described something the code does not do. "Keep my style"
// sent the full house watercolor recipe under "Follow the palette, line work,
// and shading described above exactly"; "Full reimagine" said "a polished
// cartoon style" and sent the comic recipe — heavy black ink and halftone dots.
//
// The routing half — three labelled bands resolving to two styles, two of them
// identical — is UX-161b and is deliberately untouched. These assertions hold
// the copy to whatever the routing currently is, so the two can never drift
// apart again.

/** What each base style's recipe actually says, at the server. */
const LOOK_WORDS: Record<string, RegExp> = {
  // `STYLE_RECIPES.storybook` — "warm hand-painted watercolor", "translucent
  // watercolor washes", "a soft, slightly uneven ink line".
  storybook: /watercolor/i,
  // `STYLE_RECIPES.comic` — "a heavy, confident black outline", "halftone dots".
  comic: /comic|halftone/i,
}

const SAMPLES = [0, 10, 25, 26, 50, 74, 75, 90, 100]

describe('every band names the look it actually sends', () => {
  it.each(SAMPLES)('intensity %i', (intensity) => {
    const style = reimagineStyleFor(intensity)
    expect(reimagineCaption(intensity)).toMatch(LOOK_WORDS[style])
  })

  it('never names the look it does NOT send', () => {
    for (const intensity of SAMPLES) {
      const style = reimagineStyleFor(intensity)
      const other = style === 'comic' ? 'storybook' : 'comic'
      expect(
        reimagineCaption(intensity),
        `intensity ${intensity} sends ${style} but its caption names ${other}`,
      ).not.toMatch(LOOK_WORDS[other])
    }
  })

  it('never promises to keep the child\'s own style', () => {
    // The prompt this caption rides in ends with "Follow the palette, line work,
    // and shading described above exactly", so no band can keep it.
    for (const intensity of SAMPLES) {
      expect(reimagineCaption(intensity), `intensity ${intensity}`).not.toMatch(
        /keeping their art style|keep(ing)? (your|their) own style/i,
      )
    }
  })

  it('never calls the comic band a cartoon style', () => {
    expect(reimagineCaption(100)).not.toMatch(/cartoon/i)
  })
})

describe('the slider ends name the two looks it reaches', () => {
  it('matches the style at each end', () => {
    expect(reimagineStyleFor(0)).toBe('storybook')
    expect(REIMAGINE_LEFT_LABEL).toMatch(LOOK_WORDS.storybook)
    expect(reimagineStyleFor(100)).toBe('comic')
    expect(REIMAGINE_RIGHT_LABEL).toMatch(LOOK_WORDS.comic)
  })

  it('makes neither of the two claims it used to', () => {
    for (const label of [REIMAGINE_LEFT_LABEL, REIMAGINE_RIGHT_LABEL]) {
      expect(label).not.toBe('Keep my style')
      expect(label).not.toBe('Full reimagine')
    }
  })
})

describe('the bands are the thresholds the hook labels a job with', () => {
  it.each([
    [0, 'light'],
    [25, 'light'],
    [26, 'medium'],
    [74, 'medium'],
    [75, 'full'],
    [100, 'full'],
  ] as const)('intensity %i is %s', (intensity, band) => {
    expect(reimagineBand(intensity)).toBe(band)
  })
})
