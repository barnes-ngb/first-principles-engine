import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, Child, DayLog } from '../../core/types'

// Spy on the XP writer to prove a watch completion earns NO XP (D6).
const addXpEventMock = vi.fn(() => Promise.resolve(0))
vi.mock('../../core/xp/addXpEvent', () => ({
  addXpEvent: (...args: unknown[]) => addXpEventMock(...args),
}))

import KidChecklist from './KidChecklist'

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Item', completed: false, category: 'must-do', ...overrides }
}

function renderKid(mustDo: ChecklistItem[], onWatchOpen = vi.fn()) {
  const persist = vi.fn()
  const dayLog = { id: '2026-07-19', date: '2026-07-19', checklist: mustDo } as unknown as DayLog
  const child = { id: 'c1', name: 'Lincoln' } as unknown as Child
  render(
    <MemoryRouter>
      <KidChecklist
        mustDo={mustDo}
        choose={[]}
        checklist={mustDo}
        maxChoices={2}
        isLincoln
        isMvd={false}
        gateUnlocked
        gateThreshold={3}
        mustDoCompleted={0}
        mustDoSkipped={0}
        mustDoDone={false}
        mustDoRemaining={mustDo.length}
        dailyXp={0}
        selectedChoices={new Set()}
        onToggleChoice={vi.fn()}
        dayLog={dayLog}
        child={child}
        familyId="f1"
        today="2026-07-19"
        persistDayLogImmediate={persist}
        onCaptureOpen={vi.fn()}
        onXpToast={vi.fn()}
        onWatchOpen={onWatchOpen}
      />
    </MemoryRouter>,
  )
  return { persist }
}

describe('KidChecklist — Watch Vehicle (FEAT-103)', () => {
  beforeEach(() => addXpEventMock.mockClear())

  it('renders a Watch button that opens the player for a planned watch item', () => {
    const onWatchOpen = vi.fn()
    renderKid(
      [makeItem({ label: 'Watch: History (12m)', itemType: 'watch', watchVideoId: 'v1' })],
      onWatchOpen,
    )
    fireEvent.click(screen.getByRole('button', { name: /watch/i }))
    expect(onWatchOpen).toHaveBeenCalledTimes(1)
    expect(onWatchOpen.mock.calls[0][0].watchVideoId).toBe('v1')
  })

  it('completing a watch item via the checkbox awards NO XP (D6)', () => {
    const { persist } = renderKid([
      makeItem({ label: 'Watch: History (12m)', itemType: 'watch', watchVideoId: 'v1' }),
    ])
    // Toggle the item complete via its checkbox.
    fireEvent.click(screen.getByRole('checkbox'))
    // It still completes (hours ride the checklist path)…
    expect(persist).toHaveBeenCalledTimes(1)
    // …but no XP is awarded for a watch completion.
    expect(addXpEventMock).not.toHaveBeenCalled()
  })

  it('completing a NORMAL item still awards XP (characterization — guard is watch-only)', () => {
    renderKid([makeItem({ label: 'Math practice', itemType: 'workbook' })])
    fireEvent.click(screen.getByRole('checkbox'))
    expect(addXpEventMock).toHaveBeenCalledTimes(1)
  })
})
