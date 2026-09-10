import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectKidLine } from '../../test/kidReadability'
import { droppedSaleNotice, rosterOwnerNotice } from './businessChildSwitch'
import KitBuilderForm from './KitBuilderForm'
import SaleEntryForm from './SaleEntryForm'

/**
 * UX-329 — the two business-tab editors, and the two OPPOSITE answers.
 *
 * `BusinessPage` has no `ChildSelector`, so neither of these forms could be
 * re-targeted before UX-324 made the app-bar chip a switcher. Both hold a
 * child-scoped draft; a pending sale is an intent and is dropped, a typed kit
 * roster is a kid's own work and is kept with the boy it was started for.
 *
 * Each block ends in the assertion that fails if the fix is reverted — the
 * dropped sale reappearing, or `onSave` carrying the live child's id.
 */

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

describe('the copy is kid copy — this is the boys’ surface', () => {
  it('holds both lines to the shared readability bar', () => {
    expectKidLine(droppedSaleNotice(true, 'Lincoln')!, 'droppedSaleNotice')
    expectKidLine(droppedSaleNotice(true)!, 'droppedSaleNotice, unnamed')
    expectKidLine(
      rosterOwnerNotice('lincoln', 'london', 'Lincoln')!,
      'rosterOwnerNotice',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(droppedSaleNotice(false, 'Lincoln')).toBeNull()
    // Same child: the header still agrees with the roster.
    expect(rosterOwnerNotice('lincoln', 'lincoln', 'Lincoln')).toBeNull()
    // No name to give — an unnamed warning is not a warning.
    expect(rosterOwnerNotice('lincoln', 'london')).toBeNull()
  })
})

describe('SaleEntryForm — a pending sale is dropped, not re-targeted', () => {
  const onLogSale = vi.fn()
  beforeEach(() => onLogSale.mockClear())

  it('clears the entry and says whose sale was not saved', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SaleEntryForm childId={LINCOLN.id} childName={LINCOLN.name} onLogSale={onLogSale} />,
    )

    await user.click(screen.getByRole('button', { name: /party kit/i }))
    expect(screen.getByDisplayValue('40')).toBeInTheDocument()

    rerender(
      <SaleEntryForm childId={LONDON.id} childName={LONDON.name} onLogSale={onLogSale} />,
    )

    expect(screen.queryByDisplayValue('40')).not.toBeInTheDocument()
    expect(screen.getByText('That sale for Lincoln was not saved.')).toBeInTheDocument()
  })

  it('leaves the Log button unreachable after the switch', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SaleEntryForm childId={LINCOLN.id} childName={LINCOLN.name} onLogSale={onLogSale} />,
    )
    await user.click(screen.getByRole('button', { name: /party kit/i }))
    expect(screen.getByRole('button', { name: /log/i })).toBeEnabled()

    rerender(
      <SaleEntryForm childId={LONDON.id} childName={LONDON.name} onLogSale={onLogSale} />,
    )

    // POSITIVE CONTROL — before the fix this button stayed live with Lincoln's
    // $40 behind it and appended the sale to London's businessLog.
    expect(screen.getByRole('button', { name: /log/i })).toBeDisabled()
    expect(onLogSale).not.toHaveBeenCalled()
  })

  it('logs the new operator’s own sale under the new operator', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SaleEntryForm childId={LINCOLN.id} childName={LINCOLN.name} onLogSale={onLogSale} />,
    )
    await user.click(screen.getByRole('button', { name: /party kit/i }))
    rerender(
      <SaleEntryForm childId={LONDON.id} childName={LONDON.name} onLogSale={onLogSale} />,
    )

    await user.click(screen.getByRole('button', { name: /add-on/i }))
    await user.click(screen.getByRole('button', { name: /^log sale$/i }))

    expect(onLogSale).toHaveBeenCalledTimes(1)
    const sale = onLogSale.mock.calls[0][0] as {
      childId: string
      amount: number
    }
    expect(sale.childId).toBe('london')
    expect(sale.amount).toBe(5)
    // Picking a chip is moving on: the notice about the dropped sale goes.
    expect(screen.queryByText(/was not saved/)).not.toBeInTheDocument()
  })

  it('says nothing when nothing had been entered', () => {
    const { rerender } = render(
      <SaleEntryForm childId={LINCOLN.id} childName={LINCOLN.name} onLogSale={onLogSale} />,
    )
    rerender(
      <SaleEntryForm childId={LONDON.id} childName={LONDON.name} onLogSale={onLogSale} />,
    )
    expect(screen.queryByText(/was not saved/)).not.toBeInTheDocument()
  })
})

describe('KitBuilderForm — a new roster stays with the boy who started it', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  beforeEach(() => {
    onSave.mockClear()
    onCancel.mockClear()
  })

  it('saves to the child it was started for, and says so before the tap', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <KitBuilderForm
        childId={LINCOLN.id}
        childName={LINCOLN.name}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    await user.type(screen.getByLabelText(/vault name/i), 'The Seed Vault')

    rerender(
      <KitBuilderForm
        childId={LONDON.id}
        childName={LONDON.name}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    // Nothing is discarded — a typed cast is the kid's own work.
    expect(screen.getByDisplayValue('The Seed Vault')).toBeInTheDocument()
    expect(screen.getByText('This kit will be saved for Lincoln.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save kit/i }))

    // POSITIVE CONTROL — before the fix this carried `childId: 'london'`, so
    // Lincoln's kit appeared on London's shelf with London named as the maker.
    expect(onSave).toHaveBeenCalledTimes(1)
    const [body] = onSave.mock.calls[0] as unknown as [{ childId: string; vaultName: string }]
    expect(body.childId).toBe('lincoln')
    expect(body.vaultName).toBe('The Seed Vault')
  })

  it('says nothing while the header still agrees with the roster', async () => {
    const user = userEvent.setup()
    render(
      <KitBuilderForm
        childId={LINCOLN.id}
        childName={LINCOLN.name}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )
    await user.type(screen.getByLabelText(/vault name/i), 'The Seed Vault')
    expect(screen.queryByText(/will be saved for/)).not.toBeInTheDocument()
  })
})
