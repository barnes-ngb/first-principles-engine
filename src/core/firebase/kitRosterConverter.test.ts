import { describe, expect, it, vi } from 'vitest'

import type { KitRoster } from '../types/business'

// firestore.ts calls initializeFirestore() at module load and uses collection/doc
// inside its helpers. Mock the firebase surface so importing the module (for the
// real converter) doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
}))
vi.mock('./firebase', () => ({ app: {} }))

import { kitRosterConverter } from './firestore'

const NOW = '2026-07-17T00:00:00.000Z'

function snapshotOf(data: Record<string, unknown>, id: string) {
  return { id, data: () => data } as unknown as Parameters<
    typeof kitRosterConverter.fromFirestore
  >[0]
}

describe('kitRosterConverter', () => {
  it('round-trips a full roster, taking the document id from the snapshot', () => {
    const roster: KitRoster = {
      id: 'ignored-on-write',
      childId: 'lincoln',
      source: 'kitBuilder',
      status: 'Complete',
      vaultName: 'The Seed Safe',
      heroName: 'Lincoln',
      heroLook: 'green cape',
      heroMove: 'super jump',
      defenders: [
        { id: 'd1', name: 'plants-turn-to-life', power: 'brings plants alive' },
        { id: 'd2', name: 'Beacon shield', power: 'blocks the zombies' },
      ],
      invaders: [
        { id: 'i1', name: 'small zombie', menace: 'sneaks in' },
        { id: 'i2', name: 'super-smart zombie', menace: 'plans an attack' },
      ],
      winCondition: 'zombies pull the white flag',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = kitRosterConverter.toFirestore(roster)
    const back = kitRosterConverter.fromFirestore(
      snapshotOf(wire as Record<string, unknown>, 'kit-1'),
      {},
    )

    expect(back.id).toBe('kit-1')
    expect(back.vaultName).toBe('The Seed Safe')
    expect(back.heroName).toBe('Lincoln')
    expect(back.status).toBe('Complete')
    expect(back.defenders).toHaveLength(2)
    expect(back.invaders).toHaveLength(2)
    expect(back.defenders[0]).toMatchObject({ name: 'plants-turn-to-life', power: 'brings plants alive' })
    expect(back.winCondition).toBe('zombies pull the white flag')
  })

  it('round-trips a roster with empty lists (partial save is valid)', () => {
    const roster: KitRoster = {
      id: 'x',
      childId: 'lincoln',
      source: 'kitBuilder',
      status: 'InProgress',
      vaultName: 'The Vault',
      heroName: '',
      heroLook: '',
      heroMove: '',
      defenders: [],
      invaders: [],
      winCondition: '',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = kitRosterConverter.toFirestore(roster) as Record<string, unknown>
    const back = kitRosterConverter.fromFirestore(snapshotOf(wire, 'kit-2'), {})

    expect(back.defenders).toEqual([])
    expect(back.invaders).toEqual([])
    expect(back.status).toBe('InProgress')
  })

  it('accepts a target-exceeding roster (7 defenders — weird is canon)', () => {
    const defenders = Array.from({ length: 7 }, (_, i) => ({
      id: `d${i}`,
      name: `Defender ${i}`,
      power: `power ${i}`,
    }))
    const roster: KitRoster = {
      id: 'x',
      childId: 'lincoln',
      source: 'kitBuilder',
      status: 'InProgress',
      vaultName: 'Big Cast',
      heroName: 'Hero',
      heroLook: '',
      heroMove: '',
      defenders,
      invaders: [],
      winCondition: '',
      createdAt: NOW,
      updatedAt: NOW,
    }

    const wire = kitRosterConverter.toFirestore(roster) as Record<string, unknown>
    const back = kitRosterConverter.fromFirestore(snapshotOf(wire, 'kit-3'), {})

    expect(back.defenders).toHaveLength(7)
  })

  it('strips undefined optional fields (resumeBeat) on write', () => {
    const roster: KitRoster = {
      id: 'x',
      childId: 'lincoln',
      source: 'kitBuilder',
      status: 'InProgress',
      vaultName: 'V',
      heroName: '',
      heroLook: '',
      heroMove: '',
      defenders: [],
      invaders: [],
      winCondition: '',
      createdAt: NOW,
      updatedAt: NOW,
      // resumeBeat intentionally absent
    }

    const wire = kitRosterConverter.toFirestore(roster) as Record<string, unknown>
    expect('resumeBeat' in wire).toBe(false)
  })
})
