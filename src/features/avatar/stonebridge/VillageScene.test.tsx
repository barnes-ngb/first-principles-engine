import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import VillageScene from './VillageScene'
import { deriveVillageBoard } from './computeStonebridgeProgress'
import { STONEBRIDGE_MISSIONS, getMission } from './missions'
import { SQUARE_CELL, VILLAGE_MAP, VILLAGE_MAP_GRID, mapTargetRect } from './villageMapLayout'

/**
 * The connected village overview — the picture of one place, and the way in.
 *
 * Three things are claimed, and all of them are structural rather than visual:
 *
 *   • **it is one village.** Every Bible location is in it, the Square and its
 *     running fountain are in the middle, and the river, the banks and the
 *     roads that join them are drawn once for the whole scene — so the board is
 *     a village rather than a row of unrelated cards. Each location is drawn in
 *     the state the completed-mission list says it is in;
 *   • **a picture is all it is until it is handed an opener.** With no
 *     `interactive` / `onOpenLocation` there is no button, no hotspot and no
 *     overlaid label anywhere on it — which is the Places view's contract, and
 *     the default;
 *   • **interactive, the targets are native buttons OUTSIDE the drawing.** The
 *     hotspot grid this design replaced put a readable label over every
 *     building, and at 390 × 400 with enlarged text the labels covered the
 *     buildings and "Watchtower" broke mid-word. So the targets carry no text
 *     at all: the whole name is the accessible name, the drawing keeps its one
 *     `aria-hidden` subtree under one description, and the names a child reads
 *     are in the list, in normal flow (see `StonebridgeVillage.visit`).
 *
 * What is NOT claimed: how it looks, or what anything measures. Real layout at
 * 390 / 768 / 1280 / enlarged, whether a ring is visible and whether the
 * silhouettes read in greyscale are Sol's independent pass.
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

/** The same scene with the Map view's targets on it. */
function renderInteractive(
  completed: string[],
  currentMissionId: string,
  onOpenLocation = vi.fn(),
  registerTarget?: (missionId: string, node: HTMLElement | null) => void,
) {
  const view = render(
    <VillageScene
      board={deriveVillageBoard(completed, currentMissionId)}
      isLincoln
      interactive
      onOpenLocation={onOpenLocation}
      registerTarget={registerTarget}
    />,
  )
  return { ...view, onOpenLocation }
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

describe('the picture, with no opener, has words and no controls', () => {
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

  it('and a scene handed no opener draws no target, even if asked to', () => {
    // `interactive` on its own cannot produce a control with nowhere to go.
    render(
      <VillageScene board={deriveVillageBoard([], 'old_bridge')} isLincoln interactive />,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Pick a place from the list.')).toBeInTheDocument()
  })
})

describe('the Map view: one native button per building, outside the drawing', () => {
  it('gives every place a target, named exactly as the list names it', () => {
    renderInteractive(['old_bridge'], 'library_hut')

    // Every drawn place, and nothing else — the Square has no mission, so it
    // has no control and tapping the fountain does nothing.
    expect(screen.getAllByRole('button')).toHaveLength(VILLAGE_MAP.length)
    expect(
      screen.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Visit The Library Hut. Being fixed now.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Visit Beacon Hill. Not started yet.' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Square/ })).not.toBeInTheDocument()
  })

  it('keeps the drawing one noninteractive picture under one name', () => {
    const { container } = renderInteractive([], 'old_bridge')
    const picture = overview()

    // The targets are SIBLINGS of the art: the picture is still one
    // `aria-hidden` subtree with one description, not a pile of named shapes.
    expect(within(picture).queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    for (const target of screen.getAllByRole('button')) {
      expect(picture.contains(target)).toBe(false)
      expect(picture.parentElement?.contains(target)).toBe(true)
    }
  })

  it('writes no word on the art — the whole name is the accessible name', () => {
    // The enlarged-text failure this design is answering: a label over a
    // building. A target has no text content of its own at any text size.
    renderInteractive(['old_bridge', 'watchtower'], 'library_hut')
    for (const target of screen.getAllByRole('button')) {
      expect(target.textContent).toBe('')
      expect(target).toHaveAttribute('aria-label')
      expect(target).not.toHaveAttribute('title')
    }
    for (const mission of STONEBRIDGE_MISSIONS) {
      expect(screen.queryByText(mission.locationName)).not.toBeInTheDocument()
    }
  })

  it('sits over the cell its building is drawn in', () => {
    renderInteractive([], 'old_bridge')
    for (const cell of VILLAGE_MAP) {
      const rect = mapTargetRect(cell.col, cell.row)
      const target = screen.getByTestId(`map-target-${cell.missionId}`)
      // Percentages of the picture, which is locked to the viewBox — so this
      // is the same box as the structure underneath it at every width. Read
      // numerically, and the unit is asserted separately: a target positioned
      // in pixels would be in the wrong place on every screen but one.
      for (const [prop, expected] of [
        ['left', rect.leftPct],
        ['top', rect.topPct],
        ['width', rect.widthPct],
        ['height', rect.heightPct],
      ] as const) {
        const written = target.style.getPropertyValue(prop)
        expect(written, `${cell.missionId} ${prop}`).toMatch(/%$/)
        expect(parseFloat(written), `${cell.missionId} ${prop}`).toBeCloseTo(expected, 4)
      }
    }
  })

  it('is a real button: a tap and the keyboard both open that place', async () => {
    const { onOpenLocation } = renderInteractive([], 'old_bridge')
    const forge = getMission('the_forge')!
    const target = screen.getByRole('button', { name: `Visit ${forge.locationName}. Not started yet.` })

    await userEvent.click(target)
    expect(onOpenLocation).toHaveBeenLastCalledWith('the_forge')

    // Native, so Enter and Space are the browser's and not a hand-rolled
    // keydown handler — and `type="button"` means neither submits anything.
    target.focus()
    expect(target).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onOpenLocation).toHaveBeenCalledTimes(3)
    expect(target).toHaveAttribute('type', 'button')
  })

  it('hands every mounted target to the caller’s registry, once', () => {
    const registered = new Map<string, HTMLElement | null>()
    renderInteractive([], 'old_bridge', vi.fn(), (missionId, node) => {
      registered.set(missionId, node)
    })
    for (const cell of VILLAGE_MAP) {
      expect(registered.get(cell.missionId), cell.missionId).toBe(
        screen.getByTestId(`map-target-${cell.missionId}`),
      )
    }
  })

  it('and reports every target as unmounted when the view goes', () => {
    // What the registry's cleanup rule is fed. The nodes are handed back as
    // `null` so a stale one can never be focused after the view changed.
    const calls: [string, HTMLElement | null][] = []
    const { unmount } = renderInteractive([], 'old_bridge', vi.fn(), (missionId, node) => {
      calls.push([missionId, node])
    })
    unmount()
    for (const cell of VILLAGE_MAP) {
      expect(
        calls.some(([id, node]) => id === cell.missionId && node === null),
        `${cell.missionId} was never reported as unmounted`,
      ).toBe(true)
    }
  })

  it('says to tap the map, in normal flow, and still names no place on it', () => {
    renderInteractive([], 'old_bridge')
    const caption = screen.getByText('Tap a place on the map.')
    expect(overview()).not.toContainElement(caption)
    expect(screen.queryByText('Pick a place from the list.')).not.toBeInTheDocument()
    // The picture's own description is unchanged — it is still the whole
    // village in one sentence, and it is still the drawing's only name.
    expect(overview().getAttribute('aria-label')).toContain('Stonebridge village:')
  })

  it('still draws each place in the state it is really in', () => {
    renderInteractive(['old_bridge'], 'watchtower')
    const picture = within(overview())
    expect(picture.getByTestId('structure-old_bridge-repaired')).toBeInTheDocument()
    expect(picture.getByTestId('structure-watchtower-damaged')).toBeInTheDocument()
    // And nothing was animated into existence by making it tappable.
    expect(overview().querySelectorAll('animate, animateTransform')).toHaveLength(0)
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
