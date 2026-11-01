import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import OldBridgeScene from './OldBridgeScene'
import StonebridgeLocationArt from './StonebridgeLocationArt'
import { getMission } from './missions'

/**
 * The Old Bridge before and after — proven by SHAPE, not by colour.
 *
 * The art this replaces for one location said "broken" with a greyscale filter
 * and "fixed" with a glow, over the same emoji. A child who cannot tell those
 * apart saw one picture twice. So the assertions here are deliberately about
 * structure: which parts of the drawing exist in which state, and that the
 * camera and the scenery around them do not move between the two.
 *
 * This is a DOM proof, not a visual one. How it reads on a phone, a tablet and
 * a desktop is Sol's independent pass and is not claimed here.
 */

const OLD_BRIDGE = getMission('old_bridge')!
const WATCHTOWER = getMission('watchtower')!

function scene(state: 'damaged' | 'repaired') {
  const { container } = render(<OldBridgeScene state={state} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('OldBridgeScene rendered no svg')
  return { svg, container }
}

describe('the unfinished crossing', () => {
  it('has holes in its deck, one board laid over the gap, and no rails', () => {
    const { container } = scene('damaged')

    const deck = screen.getByTestId('old-bridge-deck-gapped')
    // Thirteen plank slots, three of them simply not there — the river shows
    // through, because nothing is drawn over it.
    expect(deck.querySelectorAll('rect')).toHaveLength(11) // 10 planks + 1 temporary board
    expect(screen.getByTestId('old-bridge-temporary-plank')).toBeInTheDocument()

    // Two surviving posts and no rail between them.
    expect(screen.getByTestId('old-bridge-rail-stubs')).toBeInTheDocument()
    expect(screen.queryByTestId('old-bridge-rails')).not.toBeInTheDocument()
    expect(screen.queryByTestId('old-bridge-banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('old-bridge-deck-continuous')).not.toBeInTheDocument()

    // Nothing fetched, nothing generated: one hand-written SVG.
    expect(container.querySelectorAll('image')).toHaveLength(0)
    expect(container.innerHTML).not.toMatch(/https?:|url\(/)
  })
})

describe('the repaired bridge', () => {
  it('has a continuous deck, a rail the whole way across, and the banner', () => {
    scene('repaired')

    const deck = screen.getByTestId('old-bridge-deck-continuous')
    // One unbroken deck plus its seams — no slot left open to step through.
    expect(deck.querySelectorAll('rect')).toHaveLength(15)
    expect(screen.queryByTestId('old-bridge-temporary-plank')).not.toBeInTheDocument()
    expect(screen.queryByTestId('old-bridge-deck-gapped')).not.toBeInTheDocument()

    const rails = screen.getByTestId('old-bridge-rails')
    // Two rail bars and six posts, where the unfinished bridge had two stubs.
    expect(rails.querySelectorAll('rect')).toHaveLength(8)
    expect(screen.queryByTestId('old-bridge-rail-stubs')).not.toBeInTheDocument()
    expect(screen.getByTestId('old-bridge-banner')).toBeInTheDocument()
  })
})

describe('it is the same bridge, from the same place', () => {
  it('keeps the camera and the scenery identical in both states', () => {
    /** The parts of the drawing the repair does not touch. */
    const scenery = () => ({
      valley: screen.getByTestId('old-bridge-valley').children.length,
      river: screen.getByTestId('old-bridge-river').children.length,
      banks: screen.getByTestId('old-bridge-banks').children.length,
      piers: screen.getByTestId('old-bridge-piers').children.length,
    })

    const damaged = scene('damaged')
    const viewBox = damaged.svg.getAttribute('viewBox')
    const before = scenery()
    // Removed so the queries below see one scene, not two.
    damaged.container.remove()

    const repaired = scene('repaired')
    // Same camera — a before-and-after that re-frames the scene is not one.
    expect(viewBox).toBe('0 0 240 110')
    expect(repaired.svg.getAttribute('viewBox')).toBe(viewBox)
    // Same river, same banks, same two timber piers. Only the light on them
    // changes, which is why this counts shapes rather than comparing markup.
    expect(scenery()).toEqual(before)
  })
})

describe('the picture has words', () => {
  it('describes the structure, at the card height and the larger view', () => {
    const { unmount } = render(
      <StonebridgeLocationArt
        missionId={OLD_BRIDGE.id}
        art={OLD_BRIDGE.art}
        state="damaged"
        isLincoln
        height={96}
      />,
    )
    expect(
      screen.getByRole('img', {
        name: 'The Old Bridge: planks missing from the deck, no rails, one board laid across the gap.',
      }),
    ).toBeInTheDocument()
    unmount()

    render(
      <StonebridgeLocationArt
        missionId={OLD_BRIDGE.id}
        art={OLD_BRIDGE.art}
        state="repaired"
        isLincoln
        height={200}
      />,
    )
    expect(
      screen.getByRole('img', {
        name: 'The Old Bridge: a full deck with rails all the way across, and the banner flying.',
      }),
    ).toBeInTheDocument()
    // The scene itself is decorative to a screen reader — one name, not two.
    expect(screen.getByTestId('old-bridge-deck-continuous').closest('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})

describe('every other location keeps the art it had', () => {
  it('draws the emoji motif, chosen by mission id and never by emoji', () => {
    const { container } = render(
      <StonebridgeLocationArt
        missionId={WATCHTOWER.id}
        art={WATCHTOWER.art}
        state="damaged"
        isLincoln
        height={96}
      />,
    )

    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText(WATCHTOWER.art.emoji)).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'The Watchtower: still waiting to be fixed.' }),
    ).toBeInTheDocument()
  })
})
