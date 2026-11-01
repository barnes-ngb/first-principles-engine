import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { expectKidLine, expectKidWording } from '../../../test/kidReadability'
import { STONEBRIDGE_MISSIONS, getMission } from './missions'
import type { StonebridgeProgressData } from './useStonebridgeProgress'
// `vi.mock` is hoisted above this, so the card renders against the stubbed hook.
import StonebridgeMissionCard from './StonebridgeMissionCard'

/**
 * Visiting a Stonebridge location — what a child can reach, operate and read.
 *
 * Rendered from the CARD down, deliberately: the card owns the board's open
 * state and the focus hand-off, the board owns the tiles and the visit, and the
 * visit owns the destinations. Testing the board in isolation would prove none
 * of the three seams this slice actually adds.
 *
 * What is NOT claimed here: layout at phone / tablet / desktop sizes and real
 * browser focus behaviour (Sol's independent pass), and nothing about live
 * Firestore — the hook is stubbed in this file. The companion
 * `StonebridgeVillage.noWrite.test.tsx` drives the real hook to prove that
 * visiting writes nothing.
 */

const fx = vi.hoisted(() => ({
  retry: vi.fn(),
  books: vi.fn(),
  forge: vi.fn(),
  data: null as unknown as StonebridgeProgressData,
}))

vi.mock('./useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.data,
}))

// The celebration is a full-screen overlay with audio of its own. Stubbed here
// to the one fact this file needs — which location's thank-you is playing —
// because this file is about the board and the visit. The overlay's OWN
// behaviour (Escape, the focus, the recovery door inside it) is asserted
// against the real component in `BannerRaiseCelebration.replay.test.tsx`, and
// its no-write behaviour against the real component in
// `StonebridgeVillage.noWrite.test.tsx`. Nothing about it is proven by a stub.
vi.mock('./BannerRaiseCelebration', () => ({
  default: ({ missionId }: { missionId: string | null }) =>
    missionId ? <div data-testid="thank-you-replay">{missionId}</div> : null,
}))

/** A source file with its comments stripped — what a child actually reads. */
const readRendered = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const OLD_BRIDGE = getMission('old_bridge')!
const LIBRARY_HUT = getMission('library_hut')!
const BANNER_HALL = getMission('banner_hall')!
const WATCHTOWER = getMission('watchtower')!
const ALL_MISSION_IDS = STONEBRIDGE_MISSIONS.map((m) => m.id)

const BASE: StonebridgeProgressData = {
  mission: OLD_BRIDGE,
  active: { missionId: OLD_BRIDGE.id, current: 2, target: 5, percent: 40, complete: false },
  completedMissions: [],
  raisedBanners: [],
  totalReadingActions: 2,
  justCompletedMissionId: null,
  clearJustCompleted: () => {},
  loading: false,
  stale: false,
  readError: false,
  saveError: false,
  retrying: false,
  retry: fx.retry,
}

/** Two locations rebuilt, part-way through the third. */
const PARTIAL: StonebridgeProgressData = {
  ...BASE,
  mission: LIBRARY_HUT,
  active: { missionId: LIBRARY_HUT.id, current: 3, target: 8, percent: 38, complete: false },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  totalReadingActions: 14,
}

/** The whole rally done, parked on the capstone. */
const FINAL: StonebridgeProgressData = {
  ...BASE,
  mission: BANNER_HALL,
  active: { missionId: BANNER_HALL.id, current: 18, target: 18, percent: 100, complete: true },
  completedMissions: ALL_MISSION_IDS,
  raisedBanners: ALL_MISSION_IDS,
  totalReadingActions: 74,
}

/** One mission finished and the next queued — the ordinary transition. */
const TRANSITION: StonebridgeProgressData = {
  ...BASE,
  mission: WATCHTOWER,
  active: { missionId: WATCHTOWER.id, current: 0, target: 6, percent: 0, complete: false },
  completedMissions: ['old_bridge'],
  raisedBanners: ['old_bridge'],
  totalReadingActions: 5,
}

/**
 * Report a reduced-motion preference.
 *
 * It is also what makes the dialog transitions instant, which is why the focus
 * assertions use it: the hand-off happens when a dialog has finished leaving,
 * and a zero-duration transition still fires that callback asynchronously, so
 * the ordering under test is real rather than skipped.
 */
function emulateReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const realMatchMedia = window.matchMedia

function renderCard(childId = 'lincoln') {
  return render(
    <StonebridgeMissionCard
      familyId="fam-1"
      childId={childId}
      isLincoln
      onOpenBooks={fx.books}
      onVisitForge={fx.forge}
    />,
  )
}

/** Open the board and return the control that opened it. */
function openBoard() {
  const opener = screen.getByText('🏰 Open Stonebridge')
  fireEvent.click(opener)
  return opener
}

function boardRegion() {
  return within(screen.getByRole('dialog', { name: 'Stonebridge Village' }))
}

/** The place's control in the readable list under the map. */
function tile(mission: { locationName: string }) {
  return boardRegion().getByRole('button', { name: new RegExp(`^Visit ${mission.locationName}\\.`) })
}

/**
 * The connected overview at the top of the board.
 *
 * Scoped, because the overview and the list tiles draw the SAME structures —
 * that is the point of one shared vocabulary — so a `structure-…` id is on the
 * board twice and an unscoped query would be ambiguous rather than wrong.
 */
function overview() {
  return within(boardRegion().getByRole('img', { name: /^Stonebridge village:/ }))
}

/**
 * Both dialogs are gone from the DOM.
 *
 * Asserted by TEXT rather than by role, on purpose: a modal that is still
 * animating out is still in the document, and `getByRole` would already report
 * it absent because its open sibling marks it `aria-hidden`. Text queries see
 * through that, so this cannot pass on a view that is merely hidden.
 */
async function expectEverythingClosed() {
  await waitFor(() => {
    expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
    expect(screen.queryByText('You fixed this place.')).not.toBeInTheDocument()
  })
}

beforeEach(() => {
  fx.retry.mockClear()
  fx.books.mockClear()
  fx.forge.mockClear()
  fx.data = BASE
  emulateReducedMotion(false)
})

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('the board at the start, part-way and finished', () => {
  it('shows every location, with one being fixed and the rest not started', () => {
    renderCard()
    openBoard()
    const board = boardRegion()

    expect(board.getByRole('button', { name: 'Visit The Old Bridge. Being fixed now.' })).toBeInTheDocument()
    expect(board.getByRole('button', { name: 'Visit The Watchtower. Not started yet.' })).toBeInTheDocument()
    // Every Bible location is on the board, and every one of them is a control.
    for (const mission of STONEBRIDGE_MISSIONS) {
      expect(tile(mission)).toBeInTheDocument()
    }
    expect(board.getByText('Read to repair your first location.')).toBeInTheDocument()
    expect(board.getByText('Your first banner is coming — keep reading!')).toBeInTheDocument()
  })

  it('part-way through, names the fixed ones as fixed and keeps the Banner Hall', () => {
    fx.data = PARTIAL
    renderCard()
    openBoard()
    const board = boardRegion()

    expect(board.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' })).toBeInTheDocument()
    expect(board.getByRole('button', { name: 'Visit The Library Hut. Being fixed now.' })).toBeInTheDocument()
    expect(board.getByText('🎌 Banner Hall')).toBeInTheDocument()
    expect(board.getByText('A banner for each place you fixed.')).toBeInTheDocument()
  })

  it('finished: the capstone is fixed, with no bar and no repair ask left', () => {
    fx.data = FINAL
    renderCard()

    // The card itself: repaired art, a warm done state, and no progress bar.
    expect(screen.getByText('You fixed each place.')).toBeInTheDocument()
    expect(screen.getByText('Your banners are all up.')).toBeInTheDocument()
    expect(screen.queryByText('18 / 18 done')).not.toBeInTheDocument()
    expect(screen.queryByText(BANNER_HALL.framing)).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'Banner Hall: an unbroken roof over a full row of banners, with its own banner raised.',
      }),
    ).toBeInTheDocument()

    openBoard()
    const board = boardRegion()
    // And the board: the capstone tile reads fixed, never "being fixed now".
    expect(board.getByRole('button', { name: 'Visit Banner Hall. Fixed.' })).toBeInTheDocument()
    expect(board.queryByRole('button', { name: /Being fixed now/ })).not.toBeInTheDocument()
    expect(board.getByText('Each banner is up. Well done.')).toBeInTheDocument()
    expect(board.getByText('You fixed each place.')).toBeInTheDocument()
  })

  it('an ordinary transition still shows the NEXT location as damaged', () => {
    fx.data = TRANSITION
    renderCard()

    // The finished one is behind him; the queued one is the work in hand.
    expect(screen.getByText(WATCHTOWER.framing)).toBeInTheDocument()
    expect(screen.getByText('0 / 6 done')).toBeInTheDocument()
    expect(screen.queryByText('You fixed each place.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'The Watchtower: the bells still hang at the top, the upper stair stops short, and there is no balcony.',
      }),
    ).toBeInTheDocument()

    openBoard()
    const board = boardRegion()
    expect(board.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' })).toBeInTheDocument()
    expect(board.getByRole('button', { name: 'Visit The Watchtower. Being fixed now.' })).toBeInTheDocument()
  })
})

describe('a visit says what is true of the place', () => {
  it('the location being fixed now: its framing, its count, and the real shelf', () => {
    renderCard()
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))

    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.getByText('You are fixing this now.')).toBeInTheDocument()
    expect(visit.getByText(OLD_BRIDGE.framing)).toBeInTheDocument()
    expect(visit.getByText('2 / 5 done')).toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'Open My Books' })).toBeInTheDocument()
  })

  it('a fixed location keeps its repaired look and replays its thank-you', () => {
    fx.data = PARTIAL
    renderCard()
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))

    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.getByText('You fixed this place.')).toBeInTheDocument()
    expect(visit.getByText(OLD_BRIDGE.thankYou.name)).toBeInTheDocument()
    expect(
      visit.getByRole('img', { name: /full deck with rails all the way across/ }),
    ).toBeInTheDocument()
    // A revisit is not a re-earn: there is no bar and nothing to finish.
    expect(visit.queryByText(/\d+ \/ \d+ done/)).not.toBeInTheDocument()
    expect(visit.queryByRole('button', { name: 'Open My Books' })).not.toBeInTheDocument()

    fireEvent.click(visit.getByRole('button', { name: 'Hear the thank you' }))
    expect(screen.getByTestId('thank-you-replay')).toHaveTextContent('old_bridge')
  })

  it('an upcoming location is honest, and offers nothing to unlock', () => {
    renderCard()
    openBoard()
    fireEvent.click(tile(BANNER_HALL))

    const visit = within(screen.getByRole('dialog', { name: 'Banner Hall' }))
    expect(visit.getByText('This place waits its turn.')).toBeInTheDocument()
    expect(visit.getByText('One place at a time.')).toBeInTheDocument()
    // No destination, no count, no thank-you it has not earned.
    expect(visit.queryByRole('button', { name: 'Open My Books' })).not.toBeInTheDocument()
    expect(visit.queryByRole('button', { name: 'Hear the thank you' })).not.toBeInTheDocument()
    expect(visit.queryByText(/\d+ \/ \d+ done/)).not.toBeInTheDocument()
    // And it is reachable and readable rather than an inert tile.
    expect(
      visit.getByRole('img', {
        name: 'Banner Hall: a gap in the roof, two banners hanging, and the rest of the hooks empty.',
      }),
    ).toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})

describe('keyboard, Escape and the focus the visit came from', () => {
  beforeEach(() => emulateReducedMotion(true))

  it('a tile opens with the keyboard, and closing gives the focus back to it', async () => {
    renderCard()
    openBoard()
    const bridgeTile = tile(OLD_BRIDGE)

    bridgeTile.focus()
    expect(bridgeTile).toHaveFocus()
    // A native button, so Enter is the browser's job and not a hand-rolled
    // keydown handler (which is what the old clickable Box needed).
    await userEvent.keyboard('{Enter}')

    const visit = screen.getByRole('dialog', { name: 'The Old Bridge' })
    fireEvent.click(within(visit).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
    })
    // The exact tile, not the top of the board.
    await waitFor(() => expect(tile(OLD_BRIDGE)).toHaveFocus())
  })

  it('Escape closes the visit, leaves the board open, and restores the tile', async () => {
    fx.data = PARTIAL
    renderCard()
    openBoard()
    const hutTile = tile(LIBRARY_HUT)
    hutTile.focus()
    fireEvent.click(hutTile)

    expect(screen.getByRole('dialog', { name: 'The Library Hut' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
    })
    // The board is still there — one Escape closed one layer.
    expect(screen.getByRole('dialog', { name: 'Stonebridge Village' })).toBeInTheDocument()
    await waitFor(() => expect(tile(LIBRARY_HUT)).toHaveFocus())
  })

  it('Escape on the board closes it and gives the focus back to its opener', async () => {
    renderCard()
    const opener = openBoard()
    await userEvent.keyboard('{Escape}')

    await expectEverythingClosed()
    expect(opener).toHaveFocus()
  })

  it('reopening the board opens it with no location already open', async () => {
    renderCard()
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', { name: 'Close' }),
    )
    await waitFor(() => {
      expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
    })

    fireEvent.click(boardRegion().getByRole('button', { name: 'Close Stonebridge village' }))
    await expectEverythingClosed()

    openBoard()
    expect(screen.getByRole('dialog', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
  })
})

describe('the two real destinations', () => {
  beforeEach(() => emulateReducedMotion(true))

  it('Open My Books calls the page once, AFTER the dialogs have closed', async () => {
    renderCard()
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', {
        name: 'Open My Books',
      }),
    )

    await waitFor(() => expect(fx.books).toHaveBeenCalledTimes(1))
    // The focus-stealing order this is really about: by the time the page is
    // asked to navigate, both dialogs are gone.
    await expectEverythingClosed()
    expect(fx.forge).not.toHaveBeenCalled()
  })

  it('the Forge offers the armor gallery, says so plainly, and leaves once', async () => {
    renderCard()
    openBoard()
    fireEvent.click(tile(getMission('the_forge')!))

    const visit = within(screen.getByRole('dialog', { name: 'The Forge' }))
    expect(visit.getByText('This opens your armor.')).toBeInTheDocument()
    fireEvent.click(visit.getByRole('button', { name: 'See your armor' }))

    await waitFor(() => expect(fx.forge).toHaveBeenCalledTimes(1))
    // Same contract: the gallery is focused only once nothing is trapping it.
    await expectEverythingClosed()
    expect(fx.books).not.toHaveBeenCalled()
  })

  it('offers the armor gallery at the Forge even while the Forge is upcoming', () => {
    // The narrative repair and the armor workshop are independent: the gallery
    // is available under its own rules, and visiting never grants a piece.
    renderCard()
    openBoard()
    fireEvent.click(tile(getMission('the_forge')!))

    const visit = within(screen.getByRole('dialog', { name: 'The Forge' }))
    expect(visit.getByText('This place waits its turn.')).toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'See your armor' })).toBeInTheDocument()
  })

  it('offers no destination the page did not give it', () => {
    render(<StonebridgeMissionCard familyId="fam-1" childId="lincoln" isLincoln />)
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))

    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.queryByRole('button', { name: 'Open My Books' })).not.toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})

describe('a child switch takes the previous child’s view with it', () => {
  it('closes the board, the visit and the replay, and refuses a stale tap', async () => {
    emulateReducedMotion(true)
    fx.data = PARTIAL
    const { rerender } = renderCard('lincoln')
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))
    // A thank-you replaying over Lincoln's board…
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', {
        name: 'Hear the thank you',
      }),
    )
    expect(screen.getByTestId('thank-you-replay')).toBeInTheDocument()

    // …and the app bar's chip moves to his brother.
    rerender(
      <StonebridgeMissionCard
        familyId="fam-1"
        childId="london"
        isLincoln
        onOpenBooks={fx.books}
        onVisitForge={fx.forge}
      />,
    )

    // The replay stops the moment the child does, not when it finishes.
    expect(screen.queryByTestId('thank-you-replay')).not.toBeInTheDocument()
    await expectEverythingClosed()
    // Nothing from the view that was replaced sends the brother anywhere.
    expect(fx.books).not.toHaveBeenCalled()
    expect(fx.forge).not.toHaveBeenCalled()

    // And his own board opens clean.
    openBoard()
    expect(screen.getByRole('dialog', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(screen.queryByText('You fixed this place.')).not.toBeInTheDocument()
  })
})

describe('recovery stays reachable in whatever view is on top', () => {
  it('an open visit carries the last-known label and a working Try again', () => {
    fx.data = { ...PARTIAL, stale: true, readError: true }
    renderCard()
    openBoard()
    fireEvent.click(tile(LIBRARY_HUT))

    const visit = within(screen.getByRole('dialog', { name: 'The Library Hut' }))
    expect(visit.getByText('Showing your last village.')).toBeInTheDocument()
    fireEvent.click(visit.getByRole('button', { name: 'Try again' }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })

  it('a save rejected WHILE a visit is open says so, with a door', () => {
    fx.data = { ...PARTIAL, saveError: true }
    renderCard()
    openBoard()
    fireEvent.click(tile(LIBRARY_HUT))

    const visit = within(screen.getByRole('dialog', { name: 'The Library Hut' }))
    expect(visit.getByText('Your village did not save.')).toBeInTheDocument()
    expect(visit.queryByText('Showing your last village.')).not.toBeInTheDocument()
    fireEvent.click(visit.getByRole('button', { name: 'Try again' }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })

  it('says nothing of the kind inside a visit when the read is current', () => {
    fx.data = PARTIAL
    renderCard()
    openBoard()
    fireEvent.click(tile(LIBRARY_HUT))

    const visit = within(screen.getByRole('dialog', { name: 'The Library Hut' }))
    expect(visit.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(visit.queryByText('Showing your last village.')).not.toBeInTheDocument()
  })
})

describe('a reduced-motion preference loses no state', () => {
  it('still opens the board and the visit, with everything it says', () => {
    emulateReducedMotion(true)
    fx.data = PARTIAL
    renderCard()
    openBoard()

    const board = boardRegion()
    expect(board.getByText('🎌 Banner Hall')).toBeInTheDocument()
    expect(board.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' })).toBeInTheDocument()

    fireEvent.click(tile(OLD_BRIDGE))
    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.getByText('You fixed this place.')).toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'Hear the thank you' })).toBeInTheDocument()
    expect(visit.getByRole('img', { name: /full deck with rails/ })).toBeInTheDocument()
  })
})

describe('the overview is the village, and the list is the way around it', () => {
  it('shows the connected place above the list, with nothing on it to tap', () => {
    fx.data = PARTIAL
    renderCard()
    openBoard()
    const board = boardRegion()

    // The picture, and the sentence that says where the way in is.
    expect(board.getByText('🗺️ Your Village')).toBeInTheDocument()
    expect(board.getByText('Pick a place from the list.')).toBeInTheDocument()
    expect(board.getByText('🏘️ Each Place')).toBeInTheDocument()
    expect(overview().getByTestId('village-roads')).toBeInTheDocument()
    expect(overview().getByTestId('village-river')).toBeInTheDocument()
    expect(overview().getByTestId('square-fountain-water')).toBeInTheDocument()

    // Exactly one control per place, and it is the list's — the hotspot grid
    // this replaced covered the buildings with its own labels at enlarged text.
    for (const mission of STONEBRIDGE_MISSIONS) {
      expect(board.getAllByRole('button', { name: new RegExp(`${mission.locationName}\\.`) })).toHaveLength(1)
    }
    expect(board.queryByRole('button', { name: /village map/ })).not.toBeInTheDocument()
  })

  it('draws each place in the state the list says it is in', () => {
    fx.data = PARTIAL
    renderCard()
    openBoard()

    // Fixed in the list, repaired in the picture — one derived value, two
    // renderings of it, and no second source of truth.
    expect(boardRegion().getByRole('button', { name: 'Visit The Old Bridge. Fixed.' })).toBeInTheDocument()
    expect(overview().getByTestId('structure-old_bridge-repaired')).toBeInTheDocument()
    expect(boardRegion().getByRole('button', { name: 'Visit The Library Hut. Being fixed now.' })).toBeInTheDocument()
    expect(overview().getByTestId('structure-library_hut-damaged')).toBeInTheDocument()
    // And the whole village is named in the picture's one description.
    const description = boardRegion()
      .getByRole('img', { name: /^Stonebridge village:/ })
      .getAttribute('aria-label')
    expect(description).toContain('Fixed so far: The Old Bridge, The Watchtower.')
  })

  it('finished: the picture and the list both read fixed, with nothing in hand', () => {
    fx.data = FINAL
    renderCard()
    openBoard()
    const board = boardRegion()

    expect(board.getAllByRole('button', { name: /^Visit .+\. Fixed\.$/ })).toHaveLength(
      STONEBRIDGE_MISSIONS.length,
    )
    expect(board.queryByRole('button', { name: /Being fixed now/ })).not.toBeInTheDocument()
    for (const mission of STONEBRIDGE_MISSIONS) {
      expect(overview().getByTestId(`structure-${mission.id}-repaired`)).toBeInTheDocument()
      expect(overview().queryByTestId(`structure-${mission.id}-damaged`)).not.toBeInTheDocument()
    }
  })

  it('a reduced-motion preference loses neither the picture nor what it says', () => {
    emulateReducedMotion(true)
    fx.data = PARTIAL
    renderCard()
    openBoard()

    expect(boardRegion().getByText('🗺️ Your Village')).toBeInTheDocument()
    expect(overview().getByTestId('village-roads')).toBeInTheDocument()
    expect(overview().getByTestId('structure-watchtower-repaired')).toBeInTheDocument()
    // The drawing is static, so there is nothing for the preference to turn
    // off — and nothing is withheld from someone who asked for less motion.
    expect(overview().getByTestId('village-land').querySelectorAll('animate')).toHaveLength(0)
    expect(boardRegion().getByRole('button', { name: 'Visit The Watchtower. Fixed.' })).toBeInTheDocument()
  })

  it('a child switch leaves the next child a clean board and picture', async () => {
    emulateReducedMotion(true)
    const { rerender } = renderCard('lincoln')
    openBoard()
    fireEvent.click(tile(OLD_BRIDGE))
    expect(screen.getByText('You are fixing this now.')).toBeInTheDocument()

    rerender(
      <StonebridgeMissionCard
        familyId="fam-1"
        childId="london"
        isLincoln
        onOpenBooks={fx.books}
        onVisitForge={fx.forge}
      />,
    )

    // The previous child's board and visit are gone, and nothing from them
    // sends the brother anywhere.
    await expectEverythingClosed()
    expect(fx.books).not.toHaveBeenCalled()
    expect(fx.forge).not.toHaveBeenCalled()

    openBoard()
    expect(overview().getByTestId('village-land')).toBeInTheDocument()
    expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
  })
})

describe('the new copy holds the kid readability bar', () => {
  it('every sentence a child reads in a visit', () => {
    expectKidLine('You fixed this place.', 'Stonebridge visit · repaired')
    expectKidLine('You are fixing this now.', 'Stonebridge visit · active')
    expectKidLine('This place waits its turn.', 'Stonebridge visit · upcoming')
    expectKidLine('One place at a time.', 'Stonebridge visit · one at a time')
    expectKidLine('This opens your armor.', 'Stonebridge visit · forge caption')
    // "every" is three syllables by the FEAT-178 proxy (e·ver·y), which is the
    // bar doing its job rather than a false positive: "each" is the word a
    // six-year-old reads. Both done-state sentences use it.
    expectKidLine('You fixed each place.', 'Stonebridge · rally finished')
    expectKidLine('Your banners are all up.', 'Stonebridge · banners all raised')
    expectKidLine('Each banner is up. Well done.', 'Stonebridge · Banner Hall done')
    expectKidLine('Pick a place from the list.', 'Stonebridge overview · where to go')
  })

  it('and the two headings over the picture and the list', () => {
    // Headings, so no full stop is demanded of them — but the words still have
    // to be words a six-year-old reads. "Each Place" rather than "Every
    // place": the proxy counts e·ver·y as three syllables, which is the bar
    // doing its job.
    expectKidWording('🗺️ Your Village', 'Stonebridge · overview heading')
    expectKidWording('🏘️ Each Place', 'Stonebridge · list heading')
  })

  it('and every label on a control', () => {
    expectKidWording('Hear the thank you', 'Stonebridge visit · replay button')
    expectKidWording('Open My Books', 'Stonebridge visit · books button')
    expectKidWording('See your armor', 'Stonebridge visit · forge button')
    expectKidWording('Close', 'Stonebridge visit · close button')
    expectKidWording('Keep going', 'Stonebridge replay · dismiss button')
  })

  it('and the retired wording does not come back', () => {
    // A later edit that reverts either sentence fails here rather than shipping
    // a word the proxy already rejected once.
    for (const file of [
      'src/features/avatar/stonebridge/StonebridgeVillage.tsx',
      'src/features/avatar/stonebridge/StonebridgeMissionCard.tsx',
      // The map carries kid copy of its own now, so it is held to the same bar.
      'src/features/avatar/stonebridge/VillageScene.tsx',
    ]) {
      expect(readRendered(file)).not.toContain('every place')
      expect(readRendered(file)).not.toContain('Every banner')
    }
  })
})
