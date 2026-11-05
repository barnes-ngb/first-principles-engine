import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reading through the village costs exactly what reading costs.
 *
 * ── The claim, and why it needs a test at all ────────────────────────────────
 *
 * The loop is NOT write-free, and pretending it were would be the easy, wrong
 * assertion. A child who opens the shelf from Stonebridge and reads a book earns
 * the same XP, logs the same creative minutes and moves the same village bar as
 * a child who opened the shelf from the nav — because those writes belong to the
 * surfaces that already own them, and the village's reading bar is derived from
 * the ledger they write.
 *
 * What must be true is narrower and sharper: **the navigation adds nothing**. No
 * row, no event, no duplicate, and no change to the numbers. So this file pins
 * the one write surface the shelf itself mounts — the creative timer, which
 * writes to the compliance `hours` collection — and runs it twice: once with a
 * live Stonebridge journey in hand and once without. The written document must
 * be identical, and the rounding and the floor must be the REAL ones.
 *
 * ── Why the timer, and why these numbers ─────────────────────────────────────
 *
 * `useCreativeTimer.stopTimer` is the implementation, not a restatement of it:
 * under five raw minutes it writes NOTHING, and at or above that floor it rounds
 * **up** to the next five (`Math.ceil(raw / 5) * 5`). 27 minutes is used for the
 * same reason `UX-327` used it — comfortably inside a bucket, so the test's own
 * real milliseconds cannot drift it into the next one — and it must come out as
 * 30, not 27 and not 25. A "one minute is one minute" assertion would pass
 * against a rounding rule that had been quietly changed.
 *
 * The village's own reading progress is asserted to be free of this journey by
 * `StonebridgeVillage.noWrite.test.tsx`, which drives the real progress hook.
 */

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

const m = vi.hoisted(() => ({
  addDoc: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({
    id: 'hours-1',
  })),
  setDoc: vi.fn<(...args: unknown[]) => void>(),
  updateDoc: vi.fn<(...args: unknown[]) => void>(),
  deleteDoc: vi.fn<(...args: unknown[]) => void>(),
  runTransaction: vi.fn<(...args: unknown[]) => void>(),
  writeBatch: vi.fn<(...args: unknown[]) => void>(),
}))

vi.mock('firebase/firestore', () => ({ ...m }))
vi.mock('../../../core/firebase/firestore', () => ({ hoursCollection: () => ({}) }))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: LINCOLN,
    activeChildId: LINCOLN.id,
    children: [LINCOLN, LONDON],
    setActiveChildId: () => {},
    isChildProfile: false,
  }),
}))

import CreativeTimer from '../../../components/CreativeTimer'
import { SubjectBucket } from '../../../core/types/enums'
import {
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryReturnFlow,
} from './libraryReturnFlow'

const JOURNEY = { familyId: 'fam-1', childId: LINCOLN.id, missionId: 'library_hut' }

/** A source file with its prose removed — what the code actually does. */
const readCode = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/**
 * Start the shelf's own timer, let `minutes` of wall clock pass, and tap Done.
 *
 * Unmounted before it returns, because two mounted timers would both offer a
 * *Start* and the second run could not find its own.
 */
async function runTimerFor(minutes: number) {
  const user = userEvent.setup()
  const { unmount } = render(
    <CreativeTimer defaultSubject={SubjectBucket.Art} defaultDescription="Book creation" />,
  )
  await user.click(screen.getByRole('button', { name: /start/i }))
  await screen.findByRole('button', { name: /done/i })
  const started = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(started + minutes * 60_000)
  await user.click(screen.getByRole('button', { name: /done/i }))
  return unmount
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  m.addDoc.mockClear()
  m.setDoc.mockClear()
  m.updateDoc.mockClear()
  m.deleteDoc.mockClear()
  m.runTransaction.mockClear()
  m.writeBatch.mockClear()
  endLibraryReturnFlow()
})

describe('an eligible session writes the same row either way', () => {
  it('through the village: 27 minutes, rounded up to 30, for the right child', async () => {
    beginLibraryReturnFlow(JOURNEY)
    const unmount = await runTimerFor(27)

    await waitFor(() => expect(m.addDoc).toHaveBeenCalledTimes(1))
    expect(m.addDoc.mock.calls[0][1]).toMatchObject({
      childId: LINCOLN.id,
      minutes: 30,
      source: 'creative-timer',
      quickCapture: true,
    })
    // And the journey is not part of the bargain: a finished session neither
    // wrote it nor spent it, so the way back is still there.
    expect(getLibraryReturnFlow()).not.toBeNull()
    unmount()
  })

  it('and the same row, field for field, with no journey at all', async () => {
    beginLibraryReturnFlow(JOURNEY)
    const first = await runTimerFor(27)
    await waitFor(() => expect(m.addDoc).toHaveBeenCalledTimes(1))
    const throughTheVillage = m.addDoc.mock.calls[0][1]
    first()

    // The same session on the same day, reached from the nav like any other.
    m.addDoc.mockClear()
    vi.restoreAllMocks()
    localStorage.clear()
    endLibraryReturnFlow()
    const second = await runTimerFor(27)
    await waitFor(() => expect(m.addDoc).toHaveBeenCalledTimes(1))

    expect(m.addDoc.mock.calls[0][1]).toEqual(throughTheVillage)
    second()
  })

  it('writes exactly one row, and touches no other rail', async () => {
    beginLibraryReturnFlow(JOURNEY)
    const unmount = await runTimerFor(27)
    await waitFor(() => expect(m.addDoc).toHaveBeenCalledTimes(1))
    // No duplicate event, and nothing on any other write path.
    for (const name of ['setDoc', 'updateDoc', 'deleteDoc', 'runTransaction', 'writeBatch'] as const) {
      expect(m[name], `${name} was called`).not.toHaveBeenCalled()
    }
    unmount()
  })
})

describe('the five-minute floor is the real floor, journey or not', () => {
  it('writes nothing under it with a journey in hand', async () => {
    beginLibraryReturnFlow(JOURNEY)
    const unmount = await runTimerFor(4)
    await screen.findByText(/Keep creating/)
    expect(m.addDoc).not.toHaveBeenCalled()
    unmount()
  })

  it('and nothing under it without one', async () => {
    const unmount = await runTimerFor(4)
    await screen.findByText(/Keep creating/)
    expect(m.addDoc).not.toHaveBeenCalled()
    unmount()
  })
})

describe('the journey itself cannot write or persist anything', () => {
  it('has no datastore and no browser storage in it', () => {
    for (const file of [
      'src/features/avatar/stonebridge/libraryReturnFlow.ts',
      'src/features/avatar/stonebridge/useLibraryReturnScopeWatch.ts',
      'src/features/avatar/stonebridge/LibraryReturnBanner.tsx',
    ]) {
      const code = readCode(file)
      expect(code, file).not.toMatch(/firebase|firestore/i)
      expect(code, file).not.toMatch(
        /\b(?:setDoc|addDoc|updateDoc|deleteDoc|runTransaction|writeBatch)\s*\(/,
      )
      // Not storable, so not revivable: no `localStorage`, no `sessionStorage`,
      // no cookie, and nothing of it written into the URL.
      expect(code, file).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
      expect(code, file).not.toMatch(/searchParams|history\.(?:push|replace)State/)
    }
  })

  it('and selects no child anywhere along it', () => {
    for (const file of [
      'src/features/avatar/stonebridge/libraryReturnFlow.ts',
      'src/features/avatar/stonebridge/useLibraryReturnScopeWatch.ts',
      'src/features/avatar/stonebridge/LibraryReturnBanner.tsx',
      'src/features/avatar/stonebridge/StonebridgeMissionCard.tsx',
      'src/features/avatar/stonebridge/StonebridgeVillage.tsx',
      'src/features/avatar/stonebridge/StonebridgeLocationDialog.tsx',
    ]) {
      // The flow COMPARES the active child; nothing in it selects one. The
      // shared store's writer is `setActiveChildIdShared` and the hook's is
      // `setActiveChildId` — neither may appear in any of these.
      expect(readCode(file), file).not.toMatch(/setActiveChild/)
    }
  })
})
