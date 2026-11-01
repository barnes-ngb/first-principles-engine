import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LocationScene } from './LocationScenes'
import StonebridgeLocationArt from './StonebridgeLocationArt'
import { describeArt } from './locationArtDescriptions'
import { STONEBRIDGE_MISSIONS, getMission } from './missions'

/**
 * Every Stonebridge location, before and after — proven by SHAPE, not colour.
 *
 * The art this replaces for six of the seven said "broken" with a greyscale
 * filter and "fixed" with a glow, over the same emoji. A child who cannot tell
 * those apart saw one picture twice. So the assertions here are deliberately
 * about structure: which parts of the drawing exist in which state, which parts
 * do NOT move between the two, and which parts are there in **both** because
 * the Bible already says so (the bells ring, the hearth burns).
 *
 * This is a DOM proof, not a visual one. How it reads on a phone, a tablet and
 * a desktop — and whether the silhouettes are actually legible at 96px and in
 * greyscale — is Sol's independent pass and is not claimed here.
 */

/** The geometry that only exists in one of the two states. */
const ONLY_IN: Record<string, { damaged: string[]; repaired: string[] }> = {
  watchtower: {
    damaged: ['watchtower-stair-short', 'watchtower-balcony-posts'],
    repaired: ['watchtower-stair-full', 'watchtower-balcony'],
  },
  library_hut: {
    damaged: ['library-roof-gap'],
    repaired: ['library-roof-whole', 'library-books'],
  },
  the_forge: {
    damaged: ['forge-bay-open'],
    repaired: ['forge-canopy', 'forge-tool-rack'],
  },
  lantern_path: {
    damaged: ['lantern-posts-partial'],
    repaired: ['lantern-posts-full'],
  },
  beacon_hill: {
    damaged: ['beacon-bowl-cold', 'beacon-signal-torn'],
    repaired: ['beacon-flame', 'beacon-signal-assembly'],
  },
  banner_hall: {
    damaged: ['hall-roof-gap', 'hall-empty-hooks'],
    repaired: ['hall-roof-whole'],
  },
  old_bridge: {
    damaged: ['bridge-deck-gapped', 'bridge-temporary-plank', 'bridge-rail-stubs'],
    repaired: ['bridge-deck-continuous', 'bridge-rails'],
  },
}

/**
 * The things the Bible says are ALREADY working, which a repair therefore
 * cannot be the arrival of. Drawn in both states, so the picture cannot imply
 * that reading is what turns the lights on.
 */
const ALREADY_WORKING: Record<string, string> = {
  watchtower: 'watchtower-bells',
  the_forge: 'forge-hearth-fire',
  old_bridge: 'bridge-piers',
}

function scene(missionId: string, state: 'damaged' | 'repaired') {
  const { container, unmount } = render(<LocationScene missionId={missionId} state={state} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error(`LocationScene(${missionId}) rendered no svg`)
  return { svg, container, unmount }
}

describe('each location is two different pictures, not one picture twice', () => {
  for (const mission of STONEBRIDGE_MISSIONS) {
    // The Old Bridge keeps its own dedicated scene in the card and the visit
    // (see StonebridgeLocationArt), but the map draws it from this vocabulary
    // like everything else — so its structure is held to the same bar here.
    it(`${mission.locationName}: the repair changes the geometry`, () => {
      const only = ONLY_IN[mission.id]
      expect(only, `${mission.id} has no structural proof listed`).toBeDefined()

      const damaged = scene(mission.id, 'damaged')
      expect(within(damaged.container).getByTestId(`structure-${mission.id}-damaged`)).toBeInTheDocument()
      for (const id of only.damaged) {
        expect(within(damaged.container).getByTestId(id)).toBeInTheDocument()
      }
      for (const id of only.repaired) {
        expect(within(damaged.container).queryByTestId(id)).not.toBeInTheDocument()
      }
      // Nothing is "fixed" until the completed list says so, and the banner is
      // the canon mark of that — so it is absent here, in every location.
      expect(within(damaged.container).queryByTestId('structure-banner')).not.toBeInTheDocument()
      damaged.unmount()

      const repaired = scene(mission.id, 'repaired')
      expect(within(repaired.container).getByTestId(`structure-${mission.id}-repaired`)).toBeInTheDocument()
      for (const id of only.repaired) {
        expect(within(repaired.container).getByTestId(id)).toBeInTheDocument()
      }
      for (const id of only.damaged) {
        expect(within(repaired.container).queryByTestId(id)).not.toBeInTheDocument()
      }
      expect(within(repaired.container).getByTestId('structure-banner')).toBeInTheDocument()
    })
  }
})

describe('it is the same place, from the same place', () => {
  for (const mission of STONEBRIDGE_MISSIONS) {
    it(`${mission.locationName}: the camera and the setting do not move`, () => {
      const damaged = scene(mission.id, 'damaged')
      const viewBox = damaged.svg.getAttribute('viewBox')
      const setting = within(damaged.container).getByTestId('location-scene-setting')
      const before = setting.children.length
      const already = ALREADY_WORKING[mission.id]
      if (already) {
        expect(within(damaged.container).getByTestId(already)).toBeInTheDocument()
      }
      damaged.unmount()

      const repaired = scene(mission.id, 'repaired')
      // Same camera — a before-and-after that re-frames the scene is not one.
      expect(viewBox).toBe('0 0 240 110')
      expect(repaired.svg.getAttribute('viewBox')).toBe(viewBox)
      // Same sky, same hills, same ground line. Only the light on them
      // changes, which is why this counts shapes rather than comparing markup.
      expect(within(repaired.container).getByTestId('location-scene-setting').children.length).toBe(
        before,
      )
      if (already) {
        expect(within(repaired.container).getByTestId(already)).toBeInTheDocument()
      }
    })
  }
})

describe('the repair adds, and never takes away', () => {
  it('counts what grew: shelves, banners, lanterns and planks', () => {
    const shelves = (state: 'damaged' | 'repaired') => {
      const s = scene('library_hut', state)
      const n = within(s.container).getByTestId('library-shelves').querySelectorAll('rect').length
      s.unmount()
      return n
    }
    expect(shelves('damaged')).toBe(1)
    expect(shelves('repaired')).toBe(3)

    const banners = (state: 'damaged' | 'repaired') => {
      const s = scene('banner_hall', state)
      const n = within(s.container).getByTestId('hall-banners').querySelectorAll('path').length
      s.unmount()
      return n
    }
    expect(banners('damaged')).toBe(2)
    expect(banners('repaired')).toBe(6)

    const lanterns = (state: 'damaged' | 'repaired') => {
      const s = scene('lantern_path', state)
      const n = within(s.container).queryAllByTestId('lantern-head').length
      s.unmount()
      return n
    }
    // The near ones are lit already (the Bible says so); the far markers are
    // what the repair brings, so the count goes up and nothing goes out.
    expect(lanterns('damaged')).toBe(2)
    expect(lanterns('repaired')).toBe(5)

    const gapped = scene('old_bridge', 'damaged')
    // Nine planks of twelve slots, plus the one board laid over the widest gap.
    expect(
      within(gapped.container).getByTestId('bridge-deck-gapped').querySelectorAll('rect'),
    ).toHaveLength(10)
    expect(
      within(gapped.container).getByTestId('bridge-rail-stubs').querySelectorAll('rect'),
    ).toHaveLength(2)
    gapped.unmount()

    const whole = scene('old_bridge', 'repaired')
    // One unbroken deck plus its seams — no slot left open to step through —
    // and a rail the whole way across on six posts.
    expect(
      within(whole.container).getByTestId('bridge-deck-continuous').querySelectorAll('rect'),
    ).toHaveLength(13)
    expect(
      within(whole.container).getByTestId('bridge-rails').querySelectorAll('rect'),
    ).toHaveLength(7)
  })
})

describe('nothing is fetched, generated or animated', () => {
  for (const state of ['damaged', 'repaired'] as const) {
    it(`${state}: one hand-written static SVG per location`, () => {
      for (const mission of STONEBRIDGE_MISSIONS) {
        const { container, unmount } = scene(mission.id, state)
        expect(container.querySelectorAll('image')).toHaveLength(0)
        expect(container.querySelectorAll('animate, animateTransform')).toHaveLength(0)
        expect(container.innerHTML).not.toMatch(/https?:|url\(/)
        unmount()
      }
    })
  }
})

describe('the picture has words, and they describe the structure', () => {
  it('names the structure on screen for every location, in both states', () => {
    for (const mission of STONEBRIDGE_MISSIONS) {
      for (const repaired of [false, true]) {
        const sentence = describeArt(mission.id, mission.locationName, repaired)
        expect(sentence.startsWith(`${mission.locationName}: `)).toBe(true)
        // The generic fallback is a safety net for a location with no drawing
        // yet. Every mission has one, so no mission may land on it.
        expect(sentence).not.toBe(`${mission.locationName}: fixed, with its banner raised.`)
        expect(sentence).not.toBe(`${mission.locationName}: still waiting to be fixed.`)
      }
    }
  })

  it('carries that name at the card height and the larger view', () => {
    const watchtower = getMission('watchtower')!
    const { unmount } = render(
      <StonebridgeLocationArt
        missionId={watchtower.id}
        art={watchtower.art}
        state="damaged"
        isLincoln
        height={96}
      />,
    )
    expect(
      screen.getByRole('img', {
        name: 'The Watchtower: the bells still hang at the top, the upper stair stops short, and there is no balcony.',
      }),
    ).toBeInTheDocument()
    unmount()

    render(
      <StonebridgeLocationArt
        missionId={watchtower.id}
        art={watchtower.art}
        state="repaired"
        isLincoln
        height={200}
      />,
    )
    expect(
      screen.getByRole('img', {
        name: 'The Watchtower: a full stair climbing to a railed signal balcony, with its banner raised.',
      }),
    ).toBeInTheDocument()
    // The scene itself is decorative to a screen reader — one name, not two.
    expect(screen.getByTestId('watchtower-balcony').closest('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
