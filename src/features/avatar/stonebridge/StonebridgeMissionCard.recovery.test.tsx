import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectKidLine, expectKidWording } from '../../../test/kidReadability'
import type { StonebridgeProgressData } from './useStonebridgeProgress'
import { getMission } from './missions'
// `vi.mock` is hoisted above this, so the card renders against the stubbed hook.
import StonebridgeMissionCard from './StonebridgeMissionCard'

/**
 * What a child SEES when Stonebridge cannot read or cannot save.
 *
 * Small and deliberately about the words and the one control: a failed read
 * says so and offers a retry, a last-known village is labelled as last-known,
 * and a rejected save does not pass for a save. Phone / tablet / desktop layout
 * acceptance is independent (Sol) and is not claimed here.
 *
 * Every new sentence is also put through the FEAT-186 kid bar, because copy a
 * six-year-old cannot read is not a recovery path.
 */

const fx = vi.hoisted(() => ({
  retry: vi.fn(),
  data: null as unknown as StonebridgeProgressData,
}))

vi.mock('./useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.data,
}))

// The celebration is a full-screen overlay with audio + TTS of its own; it is
// not what this file is about.
vi.mock('./BannerRaiseCelebration', () => ({ default: () => null }))

const MISSION = getMission('library_hut')!

const LOADED: StonebridgeProgressData = {
  mission: MISSION,
  active: { missionId: MISSION.id, current: 3, target: 8, percent: 38, complete: false },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  totalReadingActions: 14,
  justCompletedMissionId: null,
  clearJustCompleted: () => {},
  loading: false,
  stale: false,
  readError: false,
  saveError: false,
  retrying: false,
  retry: fx.retry,
}

const NOTHING: StonebridgeProgressData = {
  ...LOADED,
  mission: null,
  active: null,
  completedMissions: [],
  raisedBanners: [],
  totalReadingActions: null,
  loading: true,
}

function renderCard() {
  render(<StonebridgeMissionCard familyId="fam-1" childId="lincoln" isLincoln />)
}

beforeEach(() => {
  fx.retry.mockClear()
  fx.data = LOADED
})

describe('Stonebridge card — a read that failed', () => {
  it('with no earlier village, says it could not load and offers one retry', () => {
    fx.data = { ...NOTHING, loading: false, readError: true }
    renderCard()

    expect(screen.getByText("Couldn't load your village.")).toBeInTheDocument()
    expect(screen.queryByText('Loading your mission…')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })

  it('still shows the quiet placeholder while it is only loading, with no retry', () => {
    fx.data = NOTHING
    renderCard()

    expect(screen.getByText('Loading your mission…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('keeps the earned village on screen and labels it as the last one', () => {
    fx.data = { ...LOADED, stale: true, readError: true }
    renderCard()

    // The banners he earned are still there…
    expect(screen.getByText('🚩 2 banners raised')).toBeInTheDocument()
    expect(screen.getByText('3 / 8 done')).toBeInTheDocument()
    // …and the card does not pretend the numbers are fresh.
    expect(screen.getByText('Showing your last village.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('carries the same honest label onto the open village board', () => {
    fx.data = { ...LOADED, stale: true, readError: true }
    renderCard()

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))

    // The Banner Hall still celebrates what he rebuilt — those banners are
    // earned — but the board does not claim to be a current read.
    expect(screen.getByText('🎌 Banner Hall')).toBeInTheDocument()
    expect(screen.getAllByText('Showing your last village.')).toHaveLength(2)
  })

  it('leaves the board unlabelled when the read is current', () => {
    renderCard()

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))

    expect(screen.getByText('🎌 Banner Hall')).toBeInTheDocument()
    expect(screen.queryByText('Showing your last village.')).not.toBeInTheDocument()
  })
})

describe('Stonebridge card — a save that was rejected', () => {
  it('says the village did not save, and keeps the retry reachable', () => {
    fx.data = { ...LOADED, saveError: true }
    renderCard()

    expect(screen.getByText('Your village did not save.')).toBeInTheDocument()
    expect(screen.queryByText('Showing your last village.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })

  it('says both things when the read is stale AND the save was rejected', () => {
    fx.data = { ...LOADED, stale: true, readError: true, saveError: true }
    renderCard()

    expect(screen.getByText('Your village did not save.')).toBeInTheDocument()
    expect(screen.getByText('Showing your last village.')).toBeInTheDocument()
    // One door, not two competing ones.
    expect(screen.getAllByRole('button', { name: /try again/i })).toHaveLength(1)
  })
})

describe('Stonebridge card — a healthy card says none of it', () => {
  it('shows no notice and no retry when the read and the save are fine', () => {
    renderCard()

    expect(screen.getByText('3 / 8 done')).toBeInTheDocument()
    expect(screen.queryByText('Showing your last village.')).not.toBeInTheDocument()
    expect(screen.queryByText('Your village did not save.')).not.toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your village.")).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })
})

/**
 * The board is a full-screen overlay over the card, so everything the card says
 * about a failure is BEHIND it: Sol's browser pass found the stale label on the
 * board with the card's *Try again* intercepted by the overlay, and a save
 * rejected while the board was open saying nothing at all. These assert the
 * board's own copy and its own door, scoped to the board region.
 */
describe('the open village board carries its own recovery', () => {
  function openBoard() {
    renderCard()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    return within(screen.getByRole('dialog', { name: 'Stonebridge Village' }))
  }

  it('shows the last-known label and a working Try again inside the board', () => {
    fx.data = { ...LOADED, stale: true, readError: true }
    const board = openBoard()

    expect(board.getByText('Showing your last village.')).toBeInTheDocument()
    const retryInBoard = board.getByRole('button', { name: /try again/i })
    fireEvent.click(retryInBoard)
    expect(fx.retry).toHaveBeenCalledTimes(1)
    // The board still celebrates what he rebuilt — the art and the hall stay.
    expect(board.getByText('🎌 Banner Hall')).toBeInTheDocument()
    expect(board.getByText('🚩 2 banners raised — look what you\'ve rebuilt!')).toBeInTheDocument()
  })

  it('reports a save rejected WHILE the board is open, with a door', () => {
    // The reported dead end: `stale` is false (the read is fine), so the board
    // said nothing and offered nothing.
    fx.data = { ...LOADED, saveError: true }
    const board = openBoard()

    expect(board.getByText('Your village did not save.')).toBeInTheDocument()
    expect(board.queryByText('Showing your last village.')).not.toBeInTheDocument()
    fireEvent.click(board.getByRole('button', { name: /try again/i }))
    expect(fx.retry).toHaveBeenCalledTimes(1)
  })

  it('says it is trying rather than implying fresh data or a save', () => {
    fx.data = { ...LOADED, stale: true, retrying: true }
    const board = openBoard()

    expect(board.getByText('Trying again…')).toBeInTheDocument()
    expect(board.getByText('Showing your last village.')).toBeInTheDocument()
    expect(board.queryByText('Your village did not save.')).not.toBeInTheDocument()
  })

  it('says nothing of the kind when the read is current', () => {
    const board = openBoard()

    expect(board.getByText('🎌 Banner Hall')).toBeInTheDocument()
    expect(board.queryByText('Showing your last village.')).not.toBeInTheDocument()
    expect(board.queryByText('Your village did not save.')).not.toBeInTheDocument()
    expect(board.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })
})

describe('a Retry in flight is labelled as a Retry in flight', () => {
  it('on the card, over last-known data', () => {
    fx.data = { ...LOADED, stale: true, retrying: true }
    renderCard()

    expect(screen.getByText('Trying again…')).toBeInTheDocument()
    expect(screen.getByText('Showing your last village.')).toBeInTheDocument()
  })

  it('on the card, with nothing to show yet', () => {
    fx.data = { ...NOTHING, loading: false, retrying: true }
    renderCard()

    expect(screen.getByText('Trying again…')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your village.")).not.toBeInTheDocument()
    expect(screen.queryByText('Loading your mission…')).not.toBeInTheDocument()
    // The door stays reachable in case the retry never comes back.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('the new copy holds the kid readability bar', () => {
  it('every sentence and the two labels', () => {
    expectKidLine("Couldn't load your village.", 'Stonebridge · nothing to show')
    expectKidLine('Showing your last village.', 'Stonebridge · stale notice')
    expectKidLine('Your village did not save.', 'Stonebridge · save failed')
    expectKidWording('Trying again…', 'Stonebridge · retry in flight')
    expectKidWording('Try again', 'Stonebridge · retry button')
  })
})
