import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { allVillageSurfaces, villageSurface, type VillageSurface } from './villageSurface'

/**
 * The village's panels are readable — computed, not eyeballed.
 *
 * ── Why a calculation and not a colour literal ───────────────────────────────
 *
 * The defect this pins was a pair nobody had put side by side: the panel's
 * background comes from the CHILD's cosmetic look and the text's colour was
 * inherited from the PARENT's app theme, so a light theme behind the retro board
 * rendered `rgba(0,0,0,0.87)` on `rgba(6,10,16,0.97)` — black on black, found in
 * a browser. Asserting "the foreground is `#e0e0e0`" would restate today's
 * choice and catch nothing; a later edit to either half would pass it while
 * reintroducing exactly this bug.
 *
 * So this computes the real WCAG 2.x contrast ratio of every declared pair. The
 * backgrounds are near-opaque rather than opaque, so each one is composited over
 * BOTH possible pages — a white one and a black one — and both results must
 * clear the bar. 4.5:1 is the AA threshold for body text, which is what the
 * inheriting lines are.
 *
 * It is a readability floor, not a design review: layout at phone / tablet /
 * desktop and enlarged text are Sol's pass.
 */

/** AA for body text. Every pair here clears it with a lot of room. */
const AA_BODY = 4.5

type Rgb = { r: number; g: number; b: number; a: number }

function parse(colour: string): Rgb {
  const hex = colour.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgb = colour
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (!rgb) throw new Error(`villageSurface: cannot read the colour "${colour}"`)
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]),
  }
}

/** Flatten a translucent colour onto an opaque one. */
function over(top: Rgb, under: Rgb): Rgb {
  return {
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  }
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [light, dark] = a >= b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }

/** The worst the pair can read on any page it could sit on. */
function worstRatio(surface: VillageSurface): number {
  const fg = parse(surface.fg)
  const bg = parse(surface.bg)
  return Math.min(ratio(fg, over(bg, WHITE)), ratio(fg, over(bg, BLACK)))
}

describe('every village surface is readable on any page it can sit on', () => {
  it('has pairs to check at all', () => {
    // The floor the rest of this file stands on: a scan that reads nothing
    // reports PASS on everything.
    expect(allVillageSurfaces().length).toBe(4)
  })

  for (const kind of ['board', 'visit'] as const) {
    for (const [look, isLincoln] of [
      ['the retro look', true],
      ['the softer look', false],
    ] as const) {
      it(`${kind} · ${look} clears AA for body text`, () => {
        const surface = villageSurface(isLincoln, kind)
        expect(worstRatio(surface), `${surface.fg} on ${surface.bg}`).toBeGreaterThanOrEqual(
          AA_BODY,
        )
      })
    }
  }

  it('and the app theme’s own text colour would NOT have', () => {
    // The positive control, and the actual browser reading from the report: this
    // is what the inheriting lines used to get on the retro board, so the test
    // can fail — it is not a bar everything passes.
    const inherited: VillageSurface = {
      bg: villageSurface(true, 'board').bg,
      fg: 'rgba(0,0,0,0.87)',
    }
    // Composited over the panel it sat on, not over the page.
    const panel = over(parse(inherited.bg), WHITE)
    const text = over(parse(inherited.fg), panel)
    expect(ratio(text, panel)).toBeLessThan(AA_BODY)
  })
})

describe('the frames all take their foreground from that one definition', () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

  /**
   * The other half: a readable pair proves nothing if a frame still paints a
   * background and leaves the text to inherit. Each of the three frames is
   * checked for BOTH halves coming from `villageSurface`.
   */
  it('the board, in both presentations, and the location visit', () => {
    const village = read('src/features/avatar/stonebridge/StonebridgeVillage.tsx')
    expect(village).toContain("villageSurface(isLincoln, 'board')")
    // The page's region and the dialog's Paper — two frames, one pair each.
    expect(village.match(/bgcolor: frame\.bg/g)).toHaveLength(2)
    expect(village.match(/color: frame\.fg/g)).toHaveLength(2)

    const visit = read('src/features/avatar/stonebridge/StonebridgeLocationDialog.tsx')
    expect(visit).toContain("villageSurface(isLincoln, 'visit')")
    expect(visit).toContain('bgcolor: surface.bg')
    expect(visit).toContain('color: surface.fg')
  })

  it('and none of them spells a panel colour by hand any more', () => {
    // A second copy of one of these values is how the pair comes apart again.
    for (const file of [
      'src/features/avatar/stonebridge/StonebridgeVillage.tsx',
      'src/features/avatar/stonebridge/StonebridgeLocationDialog.tsx',
    ]) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      for (const surface of allVillageSurfaces()) {
        expect(code, `${file} hard-codes ${surface.bg}`).not.toContain(surface.bg)
      }
    }
  })
})
