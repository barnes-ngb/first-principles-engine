/**
 * UX-267 — the minutes dropdown must show whatever value a routine actually
 * holds, including one outside the canonical 15-minute steps (a hand-entered
 * or legacy 37m), and must never rewrite it just because the dialog opened.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import EditRoutinesDialog from './EditRoutinesDialog'

function routine(overrides: Partial<ActivityConfig> = {}): ActivityConfig {
  const now = new Date().toISOString()
  return {
    id: 'r1',
    name: 'Prayer and Scripture',
    type: 'routine',
    subjectBucket: 'Other',
    defaultMinutes: 20,
    frequency: 'daily',
    childId: 'both',
    sortOrder: 1,
    completed: false,
    scannable: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ActivityConfig
}

describe('EditRoutinesDialog — minutes dropdown (UX-267)', () => {
  it('shows a canonical value (20m) and preserves it on save without touching', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <EditRoutinesDialog open routines={[routine({ defaultMinutes: 20 })]} onSave={onSave} onClose={vi.fn()} />,
    )

    expect(screen.getByText('20m')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][0].defaultMinutes).toBe(20)
  })

  it('shows a non-canonical value (37m) and preserves it on save without touching', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <EditRoutinesDialog open routines={[routine({ defaultMinutes: 37 })]} onSave={onSave} onClose={vi.fn()} />,
    )

    expect(screen.getByText('37m')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][0].defaultMinutes).toBe(37)
  })

  it('offers the 15-minute steps plus the legacy 10/20 values', async () => {
    const user = userEvent.setup()
    render(
      <EditRoutinesDialog open routines={[routine({ defaultMinutes: 20 })]} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    await user.click(screen.getByText('20m'))
    for (const label of ['10m', '15m', '20m', '30m', '45m', '60m', '90m']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
  })
})
