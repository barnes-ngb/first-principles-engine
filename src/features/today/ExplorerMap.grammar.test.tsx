import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getDocsMock = vi.fn()
vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({})),
}))

import ExplorerMap from './ExplorerMap'

function exploredDoc(date: string) {
  return { data: () => ({ date, checklist: [{ label: 'Quest', completed: true }] }) }
}

/** Mon + Tue explored, viewed on Wednesday → 2 explored, 3 still ahead. */
function renderMap(childName?: string) {
  getDocsMock.mockResolvedValue({ docs: [exploredDoc('2026-08-17'), exploredDoc('2026-08-18')] })
  render(
    <ExplorerMap
      familyId="f1"
      childId="c1"
      weekStart="2026-08-17"
      todayDate="2026-08-19"
      childName={childName}
    />,
  )
}

// One remaining-count grammar across kid surfaces (UX-75): "{n} {noun} to go".
// The old "{n} to discover..." left the remaining count with no noun at all.
describe('ExplorerMap — the remaining count carries its noun (UX-75)', () => {
  it("Lincoln's map counts biomes on both sides of the sentence", async () => {
    renderMap('Lincoln')
    expect(await screen.findByText('2 biomes explored! 3 biomes to go!')).toBeTruthy()
    expect(screen.queryByText(/to discover/)).toBeNull()
  })

  it("London's map counts dinos on both sides of the sentence", async () => {
    renderMap('London')
    expect(await screen.findByText('2 dinos hatched! 3 dinos to go!')).toBeTruthy()
    expect(screen.queryByText(/to discover/)).toBeNull()
  })

  it('the default map counts days on both sides of the sentence', async () => {
    renderMap()
    expect(await screen.findByText('2 days explored! 3 days to go!')).toBeTruthy()
    expect(screen.queryByText(/to discover/)).toBeNull()
  })
})

// ── FEAT-161 (UX-81): zero left is not the same as all done ─────────────────
//
// `remainingCount` counts only days from today forward, so viewing the week on
// a Saturday makes it zero without the week being full — which rendered
// "4 biomes explored! 0 biomes to go!". Neither number is a scolding; the week
// simply wrapped where it wrapped.

describe('ExplorerMap — a wrapped week never says "0 to go" (UX-81)', () => {
  /** Mon–Thu explored, viewed on Saturday → nothing ahead, week not full. */
  function renderWrapped(childName?: string) {
    getDocsMock.mockResolvedValue({
      docs: ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'].map(exploredDoc),
    })
    render(
      <ExplorerMap
        familyId="f1"
        childId="c1"
        weekStart="2026-08-17"
        todayDate="2026-08-22"
        childName={childName}
      />,
    )
  }

  it('reports what happened rather than a zero remainder', async () => {
    renderWrapped('Lincoln')
    expect(await screen.findByText('4 biomes explored this week!')).toBeTruthy()
    expect(screen.queryByText(/0 biomes to go/)).toBeNull()
    expect(screen.queryByText(/to go/)).toBeNull()
  })

  it("London's wrapped week reads the same way", async () => {
    renderWrapped('London')
    expect(await screen.findByText('4 dinos hatched this week!')).toBeTruthy()
    expect(screen.queryByText(/0 dinos to go/)).toBeNull()
  })

  it('a genuinely full week still gets the full-week celebration', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
        '2026-08-20',
        '2026-08-21',
      ].map(exploredDoc),
    })
    render(
      <ExplorerMap
        familyId="f1"
        childId="c1"
        weekStart="2026-08-17"
        todayDate="2026-08-22"
        childName="Lincoln"
      />,
    )
    expect(await screen.findByText('Full map explored! Legendary week!')).toBeTruthy()
  })
})
