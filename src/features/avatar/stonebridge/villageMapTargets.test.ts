import { describe, expect, it } from 'vitest'

import {
  MAP_TARGET_INSET,
  MAP_TARGET_MIN_PICTURE_WIDTH,
  MAP_WIDTH,
  SQUARE_CELL,
  VILLAGE_MAP,
  VILLAGE_MAP_GRID,
  mapTargetRect,
  mapTargetSizeAt,
} from './villageMapLayout'

/**
 * The map's tap targets, as geometry — and what geometry cannot claim.
 *
 * Every target is derived from the cell its building is drawn in, so these are
 * the properties that make "tap the building" true rather than approximately
 * true *in the geometry*: the target is centred on the building, it is inside
 * the picture, no two of the fractional boxes overlap or even touch, and the
 * arithmetic works out above 44 × 44 CSS px at the picture widths this design
 * expects.
 *
 * **This proves the arithmetic, and nothing about the layout.** The widths
 * below are COMPUTED from the container chain, not read off a screen; whether
 * the picture really is that wide on a 390 × 844 phone, a 768 × 1024 tablet, a
 * 1280 × 900 desktop or at enlarged text — and whether a ring is visible, a
 * target is covered by something else, or the page scrolls sideways — is a real
 * viewport pass and is Sol's. A unit test of a percentage cannot measure a
 * button, and this file does not pretend to. Nothing here is enforced by the
 * styling either: the component sets no minimum picture width and watches no
 * box, so these are the properties of the formula the targets are positioned
 * by, checked against the sizes that formula is expected to be given.
 */

const CELL = VILLAGE_MAP_GRID

/**
 * The picture widths this design expects, narrowest first — derived by hand
 * from the container chain (page container padding, then the board's own), not
 * measured in a browser.
 */
const PICTURE_WIDTHS = [
  // A 320px phone, inside the page container and the board's own padding.
  256,
  // A 390px phone, same chain.
  326,
  // The cap the picture's own `maxWidth` sets, however wide the screen is.
  460,
]

describe('a target is the place it is drawn on', () => {
  it('is centred on its own cell, so the tap lands on the building', () => {
    for (const cell of VILLAGE_MAP) {
      const rect = mapTargetRect(cell.col, cell.row)
      const centreX = rect.leftPct + rect.widthPct / 2
      const centreY = rect.topPct + rect.heightPct / 2
      const cellCentreX = (((cell.col - 1) * CELL.unitWidth + CELL.unitWidth / 2) / MAP_WIDTH) * 100
      const cellCentreY =
        (((cell.row - 1) * CELL.unitHeight + CELL.unitHeight / 2) /
          (CELL.rows * CELL.unitHeight)) *
        100
      expect(centreX, `${cell.missionId} is off its cell horizontally`).toBeCloseTo(cellCentreX, 6)
      expect(centreY, `${cell.missionId} is off its cell vertically`).toBeCloseTo(cellCentreY, 6)
    }
  })

  it('stays inside the picture, so no ring is clipped by its border', () => {
    for (const cell of VILLAGE_MAP) {
      const rect = mapTargetRect(cell.col, cell.row)
      expect(rect.leftPct).toBeGreaterThan(0)
      expect(rect.topPct).toBeGreaterThan(0)
      expect(rect.leftPct + rect.widthPct).toBeLessThan(100)
      expect(rect.topPct + rect.heightPct).toBeLessThan(100)
    }
  })

  it('leaves the Square alone — it has no mission and no way in', () => {
    // The one cell with a structure and no target over it. Tapping the fountain
    // must do nothing, because there is nothing for a repair to turn on there.
    const squares = VILLAGE_MAP.filter(
      (cell) => cell.col === SQUARE_CELL.col && cell.row === SQUARE_CELL.row,
    )
    expect(squares).toHaveLength(0)
  })
})

describe('no two targets overlap, or even touch', () => {
  it('every pair is clear of every other pair', () => {
    const rects = VILLAGE_MAP.map((cell) => ({
      id: cell.missionId,
      ...mapTargetRect(cell.col, cell.row),
    }))

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        const apart =
          a.leftPct + a.widthPct <= b.leftPct ||
          b.leftPct + b.widthPct <= a.leftPct ||
          a.topPct + a.heightPct <= b.topPct ||
          b.topPct + b.heightPct <= a.topPct
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true)
      }
    }
  })

  it('and the gap between two neighbours is the inset, twice over', () => {
    // Not a styling detail: two targets that shared an edge would make a tap on
    // the boundary ambiguous and would put two focus rings on top of each
    // other. The gap is the one thing that is decided here, so it is asserted —
    // between side-by-side cells and between stacked ones.
    const left = mapTargetRect(1, 1)
    const right = mapTargetRect(2, 1)
    const sideGapUnits = ((right.leftPct - (left.leftPct + left.widthPct)) / 100) * MAP_WIDTH
    expect(sideGapUnits).toBeCloseTo(MAP_TARGET_INSET.x * 2, 6)

    const above = mapTargetRect(1, 1)
    const below = mapTargetRect(1, 2)
    const stackGapUnits =
      ((below.topPct - (above.topPct + above.heightPct)) / 100) * (CELL.rows * CELL.unitHeight)
    expect(stackGapUnits).toBeCloseTo(MAP_TARGET_INSET.y * 2, 6)
  })
})

describe('44 × 44 is arithmetic here, and measurement in a browser', () => {
  it('names the width at which the fractional box reaches 44 on its own', () => {
    // Derived, not chosen — the height is the binding dimension because a cell
    // is wider than it is tall. It is a reading of this formula and not a
    // minimum anything enforces: no styling consults it, and each target
    // carries its own unconditional 44px CSS floor regardless of it.
    expect(MAP_TARGET_MIN_PICTURE_WIDTH).toBe(213)
    const atThreshold = mapTargetSizeAt(MAP_TARGET_MIN_PICTURE_WIDTH)
    expect(atThreshold.width).toBeGreaterThanOrEqual(44)
    expect(atThreshold.height).toBeGreaterThanOrEqual(44)
  })

  it('and one pixel narrower really does fall below it', () => {
    // The positive control: the threshold is the actual boundary OF THIS
    // FORMULA, not a round number that happens to pass. What a narrower
    // picture then looks like is the CSS floor's business and a browser's to
    // report — nothing is claimed about it here.
    expect(mapTargetSizeAt(MAP_TARGET_MIN_PICTURE_WIDTH - 1).height).toBeLessThan(44)
  })

  it('clears it at the picture widths this design expects', () => {
    for (const width of PICTURE_WIDTHS) {
      const size = mapTargetSizeAt(width)
      expect(width, `${width}px picture is below the derived threshold`).toBeGreaterThanOrEqual(
        MAP_TARGET_MIN_PICTURE_WIDTH,
      )
      expect(size.width, `${width}px picture: target too narrow`).toBeGreaterThanOrEqual(44)
      expect(size.height, `${width}px picture: target too short`).toBeGreaterThanOrEqual(44)
    }
  })
})
