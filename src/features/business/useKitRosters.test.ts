import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { addDocMock, updateDocMock, getDocMock, onSnapshotMock } = vi.hoisted(() => ({
  addDocMock: vi.fn(async (..._args: unknown[]) => ({ id: 'kit-new' })),
  updateDocMock: vi.fn(async (..._args: unknown[]) => undefined),
  getDocMock: vi.fn(),
  onSnapshotMock: vi.fn((..._args: unknown[]) => () => undefined),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  updateDoc: updateDocMock,
  getDoc: getDocMock,
  onSnapshot: onSnapshotMock,
  doc: vi.fn((_coll, id) => ({ __doc: id })),
  query: vi.fn((coll) => coll),
  orderBy: vi.fn(() => ({ __orderBy: true })),
}))

vi.mock('../../core/firebase/firestore', () => ({
  kitRostersCollection: vi.fn(() => ({ __collection: 'kitRosters' })),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

import type { KitRoster } from '../../core/types/business'
import { useKitRosters } from './useKitRosters'

/** Drive the stored onSnapshot success callback with fake docs. */
function emitSnapshot(rosters: KitRoster[]) {
  const onNext = onSnapshotMock.mock.calls[0][1] as (snap: unknown) => void
  onNext({
    docs: rosters.map((r) => ({ id: r.id, data: () => r })),
  })
}

beforeEach(() => {
  addDocMock.mockClear()
  updateDocMock.mockClear()
  getDocMock.mockReset()
  onSnapshotMock.mockReset()
  onSnapshotMock.mockReturnValue(() => undefined)
})

describe('useKitRosters', () => {
  it('lists rosters from the snapshot, id after the spread', async () => {
    const { result } = renderHook(() => useKitRosters())
    expect(result.current.loading).toBe(true)

    act(() => {
      emitSnapshot([
        {
          id: 'kit-1',
          childId: 'lincoln',
          source: 'kitBuilder',
          status: 'InProgress',
          vaultName: 'The Vault',
          heroName: 'Lincoln',
          heroLook: '',
          heroMove: '',
          defenders: [],
          invaders: [],
          winCondition: '',
          createdAt: '2026-07-17T00:00:00.000Z',
          updatedAt: '2026-07-17T00:00:00.000Z',
        },
      ])
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rosters).toHaveLength(1)
    expect(result.current.rosters[0].id).toBe('kit-1')
    expect(result.current.rosters[0].vaultName).toBe('The Vault')
  })

  it('creates a roster via addDoc, stamping source/status/timestamps', async () => {
    const { result } = renderHook(() => useKitRosters())

    let newId = ''
    await act(async () => {
      newId = await result.current.createRoster({
        childId: 'lincoln',
        vaultName: 'seed vault',
        heroName: 'lincoln',
        heroLook: 'green cape',
        heroMove: 'super jump',
        defenders: [{ id: 'd1', name: 'plants-turn-to-life', power: 'brings plants alive' }],
        invaders: [{ id: 'i1', name: 'small zombie', menace: 'sneaks in' }],
        winCondition: 'white flag',
      })
    })

    expect(newId).toBe('kit-new')
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.source).toBe('kitBuilder')
    expect(payload.status).toBe('InProgress') // defaulted
    expect(payload.vaultName).toBe('seed vault') // verbatim, no capitalization
    expect(payload.createdAt).toBeTruthy()
    expect(payload.updatedAt).toBeTruthy()
  })

  it('honors an explicit status on create', async () => {
    const { result } = renderHook(() => useKitRosters())
    await act(async () => {
      await result.current.createRoster({
        childId: 'lincoln',
        status: 'Complete',
        vaultName: 'V',
        heroName: '',
        heroLook: '',
        heroMove: '',
        defenders: [],
        invaders: [],
        winCondition: '',
      })
    })
    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('Complete')
  })

  it('updates a roster via updateDoc, re-stamping updatedAt', async () => {
    const { result } = renderHook(() => useKitRosters())
    await act(async () => {
      await result.current.updateRoster('kit-1', { vaultName: 'renamed' })
    })
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const patch = updateDocMock.mock.calls[0][1] as Record<string, unknown>
    expect(patch.vaultName).toBe('renamed')
    expect(patch.updatedAt).toBeTruthy()
  })

  it('gets a single roster, returning null when it does not exist', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false })
    const { result } = renderHook(() => useKitRosters())
    let got: KitRoster | null = { id: 'sentinel' } as KitRoster
    await act(async () => {
      got = await result.current.getRoster('missing')
    })
    expect(got).toBeNull()

    const roster = { id: 'kit-1', vaultName: 'The Vault' } as KitRoster
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => roster })
    await act(async () => {
      got = await result.current.getRoster('kit-1')
    })
    expect(got).toEqual(roster)
  })
})
