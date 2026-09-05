/**
 * FEAT-199 — the card actually renders the family's chips, and logs their bucket.
 *
 * `quickLogChips.test.ts` pins the rule; this pins that `KidExtraLogger` obeys
 * it. Both assertions here fail against `main`, where the six chips are a
 * literal array inside the component: "Packing boxes" is not on the row, and
 * nothing the row can offer writes `PracticalArts`.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityConfig, DayLog } from '../../core/types'
import KidExtraLogger from './KidExtraLogger'

const PACKING: ActivityConfig = {
  id: 'cfg-packing',
  name: 'Packing boxes',
  type: 'routine',
  subjectBucket: 'PracticalArts',
  defaultMinutes: 30,
  frequency: 'daily',
  childId: 'both',
  sortOrder: 5,
  completed: false,
  scannable: false,
  quickLog: true,
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:00.000Z',
}

const configs: ActivityConfig[] = [PACKING]

vi.mock('../shelly-chat/useChatActivityConfigs', () => ({
  useChatActivityConfigs: () => configs,
}))

type AnyCall = (...args: unknown[]) => Promise<void>
const addXpEvent = vi.fn<AnyCall>(async () => undefined)
const addDiamondEvent = vi.fn<AnyCall>(async () => undefined)
vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: (...a: unknown[]) => addXpEvent(...a) }))
vi.mock('../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: (...a: unknown[]) => addDiamondEvent(...a),
}))

const DAY: DayLog = {
  id: 'lincoln__2026-09-05',
  childId: 'lincoln',
  date: '2026-09-05',
  checklist: [],
} as unknown as DayLog

function renderLogger(persist = vi.fn()) {
  render(
    <KidExtraLogger
      dayLog={DAY}
      persistDayLogImmediate={persist}
      familyId="fam-1"
      childId="lincoln"
      today="2026-09-05"
    />,
  )
  return persist
}

describe('KidExtraLogger — the family chips (FEAT-199)', () => {
  beforeEach(() => {
    addXpEvent.mockClear()
    addDiamondEvent.mockClear()
  })

  it("offers the family's flagged activity beside the built-in chips", async () => {
    const user = userEvent.setup()
    renderLogger()
    await user.click(screen.getByRole('button', { name: /Add More Work/i }))

    expect(screen.getByText('Packing boxes')).toBeInTheDocument()
    // The escape hatch survives, and the defaults are still there.
    expect(screen.getByText('🎮 Other')).toBeInTheDocument()
    expect(screen.getByText('📚 Reading')).toBeInTheDocument()
  })

  it('logs a packing session as PracticalArts, not Other', async () => {
    const user = userEvent.setup()
    const persist = renderLogger()
    await user.click(screen.getByRole('button', { name: /Add More Work/i }))
    await user.click(screen.getByText('Packing boxes'))
    await user.click(screen.getByText('30 min'))
    await user.click(screen.getByRole('button', { name: /Save It!/i }))

    await waitFor(() => expect(persist).toHaveBeenCalled())
    const written = persist.mock.calls[0][0] as DayLog
    const item = written.checklist?.[0]
    expect(item?.subjectBucket).toBe('PracticalArts')
    expect(item?.label).toBe('Packing boxes (30m)')
    // The write is otherwise untouched by this run: same source, same shape.
    expect(item?.source).toBe('manual')
    expect(item?.completed).toBe(true)
    expect(item?.estimatedMinutes).toBe(30)
  })

  it('still awards the same XP and diamonds for an extra activity', async () => {
    const user = userEvent.setup()
    renderLogger()
    await user.click(screen.getByRole('button', { name: /Add More Work/i }))
    await user.click(screen.getByText('Packing boxes'))
    await user.click(screen.getByText('15 min'))
    await user.click(screen.getByRole('button', { name: /Save It!/i }))

    await waitFor(() => expect(addDiamondEvent).toHaveBeenCalled())
    expect(addXpEvent).toHaveBeenCalledWith(
      'fam-1', 'lincoln', 'MANUAL_AWARD', 5,
      'extra_Packing boxes_2026-09-05-xp',
      { reason: 'Packing boxes' },
    )
    expect(addDiamondEvent.mock.calls[0][0]).toMatchObject({
      amount: 2,
      childId: 'lincoln',
      familyId: 'fam-1',
      reason: 'Packing boxes',
    })
  })
})
