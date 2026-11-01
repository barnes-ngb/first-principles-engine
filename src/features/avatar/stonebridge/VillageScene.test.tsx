import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import VillageScene from './VillageScene'
import { deriveVillageBoard } from './computeStonebridgeProgress'
import { STONEBRIDGE_MISSIONS } from './missions'
import { SQUARE_CELL, VILLAGE_MAP, VILLAGE_MAP_GRID } from './villageMapLayout'

/**
 * The connected village overview — a picture of one place, and nothing else.
 *
 * Two things are claimed, and both are structural rather than visual:
 *
 *   • **it is one village.** Every Bible location is in it, the Square and its
 *     running fountain are in the middle, and the river, the banks and the
 *     roads that join them are drawn once for the whole scene — so the board is
 *     a village rather than a row of unrelated cards. Each location is drawn in
 *     the state the completed-mission list says it is in;
 *   • **there is nothing on it to operate.** No button, no hotspot, no overlaid
 *     label. That is the point: the hotspot grid this replaced put a label over
 *     every building, and at 390 × 400 with enlarged text the labels covered
 *     the buildings and "Watchtower" broke mid-word. The readable list below
 *     the picture is the whole navigation (see `StonebridgeVillage.visit`).
 *
 * What is NOT claimed: how it looks. Real layout at 390 / 768 / 1280 and
 * whether the silhouettes read in greyscale are Sol's independent pass.
 */

const ALL = STONEBRIDGE_MISSIONS.map((m) => m.id)

function renderOverview(completed: string[], currentMissionId: string) {
  return render(
    <VillageScene
      board={deriveVillageBoard(completed, currentMissionId)}
      isLincoln
    />,
  )
}

/** The picture, found by the one accessible name the whole drawing carries. */
function overview() {
  return screen.getByRole('img', { name: /^Stonebridge village:/ })
}

describe('the overview is one village, with every place in it', () => {
  it('draws the land, the river, the roads and the Square once', () => {
    renderOverview([], 'old_bridge')
    const picture = within(overview())

    // The things that make it connected rather than a collage.
    expect(picture.getByTestId('village-land')).toBeInTheDocument()
    expect(picture.getByTestId('village-river')).toBeInTheDocument()
    expect(picture.getByTestId('village-roads').querySelectorAll('path').length).toBeGreaterThan(5)
    expect(picture.getByTestId('village-square')).toBeInTheDocument()
    // The fountain runs — in this and in every other render, because the Bible
    // has it running already and there is no mission that could turn it on.
    expect(picture.getByTestId('square-fountain-water')).toBeInTheDocument()
  })

  it('gives every Bible location a cell, so none can be silently dropped', () => {
    // A mission added without a place in the layout would otherwise just not be
    // drawn, and the board would quietly stop being the whole village.
    expect(VILLAGE_MAP.map((cell) => cell.missionId).sort()).toEqual([...ALL].sort())
    // No two locations share a cell, and none lands on the Square's.
    const cells = VILLAGE_MAP.map((cell) => `${cell.col},${cell.row}`)
    expect(new Set(cells).size).toBe(cells.length)
    expect(cells).not.toContain(`${SQUARE_CELL.col},${SQUARE_CELL.row}`)
    // Every one of them is inside the grid the drawing is laid out on.
    expect(
      VILLAGE_MAP.every(
        (c) =>
          c.col >= 1 &&
          c.col <= VILLAGE_MAP_GRID.columns &&
          c.row >= 1 &&
          c.row <= VILLAGE_MAP_GRID.rows,
      ),
    ).toBe(true)
  })
})

describe('the overview shows each place in the state it is really in', () => {
  it('at the start: every place is the job waiting, and no banner is up', () => {
    renderOverview([], 'old_bridge')
    const picture = within(overview())

    for (const id of ALL) {
      expect(picture.getByTestId(`structure-${id}-damaged`)).toBeInTheDocument()
      expect(picture.queryByTestId(`structure-${id}-repaired`)).not.toBeInTheDocument()
    }
    expect(picture.queryAllByTestId('structure-banner')).toHaveLength(0)
  })

  it('part-way: the fixed ones are drawn repaired and the rest are not', () => {
    renderOverview(['old_bridge', 'watchtower'], 'library_hut')
    const picture = within(overview())

    // Geometry, not glow: a continuous deck and a signal balcony that the
    // unfinished versions of those two places do not have.
    expect(picture.getByTestId('structure-old_bridge-repaired')).toBeInTheDocument()
    expect(picture.getByTestId('bridge-deck-continuous')).toBeInTheDocument()
    expect(picture.getByTestId('structure-watchtower-repaired')).toBeInTheDocument()
    expect(picture.getByTestId('watchtower-balcony')).toBeInTheDocument()
    // The one in hand, and the ones whose turn has not come, are still the job
    // waiting — the picture never shows a place better than it is.
    expect(picture.getByTestId('structure-library_hut-damaged')).toBeInTheDocument()
    expect(picture.getByTestId('library-roof-gap')).toBeInTheDocument()
    expect(picture.getByTestId('structure-beacon_hill-damaged')).toBeInTheDocument()
    expect(picture.queryAllByTestId('structure-banner')).toHaveLength(2)
  })

  it('finished: the whole village is repaired, and still nothing has decayed', () => {
    // The rally parks on the capstone once it completes, so the last mission is
    // both `currentMissionId` and completed — and must read as fixed.
    renderOverview(ALL, 'banner_hall')
    const picture = within(overview())

    for (const id of ALL) {
      expect(picture.getByTestId(`structure-${id}-repaired`)).toBeInTheDocument()
      expect(picture.queryByTestId(`structure-${id}-damaged`)).not.toBeInTheDocument()
    }
    expect(picture.queryAllByTestId('structure-banner')).toHaveLength(ALL.length)
    // The fountain is the fountain and the piers are the piers, in the finished
    // village as in the first one.
    expect(picture.getByTestId('square-fountain-water')).toBeInTheDocument()
    expect(picture.getByTestId('bridge-piers')).toBeInTheDocument()
  })
})

describe('the picture has words, and no controls', () => {
  it('names the Square, the river, the Old Bridge and the ridge', () => {
    renderOverview([], 'old_bridge')
    const name = overview().getAttribute('aria-label') ?? ''

    for (const landmark of [
      'Square',
      'running fountain',
      'Watchtower',
      'Beacon Hill',
      'Library Hut',
      'Forge',
      'Banner Hall',
      'Lantern Path',
      'river',
      'Old Bridge',
    ]) {
      expect(name, `overview description is missing "${landmark}"`).toContain(landmark)
    }
    // Truthful about the restoration, and in the child's own terms.
    expect(name).toContain('Nothing is fixed yet.')
  })

  it('says what has been rebuilt so far, and only that', () => {
    renderOverview(['old_bridge', 'watchtower'], 'library_hut')
    const name = overview().getAttribute('aria-label') ?? ''
    expect(name).toContain('Fixed so far: The Old Bridge, The Watchtower.')
    expect(name).not.toContain('The Library Hut,')
  })

  it('carries no button, no hotspot and no overlaid label', () => {
    const { container } = renderOverview(['old_bridge'], 'watchtower')

    // The defect this design replaced: a tappable label over every building.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0)
    // No location name is painted on top of the drawing — the only place the
    // names appear is the description above and the list elsewhere on the board.
    for (const mission of STONEBRIDGE_MISSIONS) {
      expect(screen.queryByText(mission.locationName)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Village Square')).not.toBeInTheDocument()
  })

  it('points at the list in normal flow, above the picture', () => {
    renderOverview([], 'old_bridge')
    expect(screen.getByText('🗺️ Your Village')).toBeInTheDocument()
    // The caption is readable text in the document flow, not a tooltip and not
    // a label sitting on the art.
    const caption = screen.getByText('Pick a place from the list.')
    expect(caption).toBeInTheDocument()
    expect(overview()).not.toContainElement(caption)
  })
})

describe('nothing is fetched, generated or animated', () => {
  it('one hand-written static SVG, decorative under one name', () => {
    const { container } = renderOverview(['old_bridge'], 'watchtower')
    const svg = container.querySelector('svg')!

    // The name is the wrapper's, so the drawing itself is not a second label.
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('image')).toHaveLength(0)
    expect(container.querySelectorAll('animate, animateTransform')).toHaveLength(0)
    expect(svg.innerHTML).not.toMatch(/https?:|url\(/)
  })
})
