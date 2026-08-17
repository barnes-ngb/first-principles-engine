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
