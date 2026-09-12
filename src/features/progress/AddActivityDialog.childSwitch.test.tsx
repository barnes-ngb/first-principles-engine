/**
 * UX-335 — a typed activity must not be created for the other boy.
 *
 * `AddActivityDialog` holds the whole form in component state and does not
 * reset when its `childId` prop changes, while `handleAdd` stamps the LIVE
 * prop. So a workbook typed out for one boy — name, subject, minutes, cadence,
 * current lesson — plus a selector tap plus *Add* created that row on his
 * brother's curriculum, where it then plans every day and counts toward his day
 * budget.
 *
 * The last case is the positive control: with the render-time reset removed,
 * the typed name survives the switch and `onAdd` fires with Lincoln's workbook
 * under `childId: 'london'` — so that assertion fails. That is what makes this
 * evidence rather than description.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AddActivityDialog from './AddActivityDialog'

const NAMES: Record<string, string> = { lincoln: 'Lincoln', london: 'London' }
const childName = (id: string) => NAMES[id]

function view(childId: string, onAdd: () => void) {
  return (
    <AddActivityDialog
      open
      childId={childId}
      nextSortOrder={7}
      onAdd={onAdd}
      onClose={vi.fn()}
      childName={childName}
    />
  )
}

describe('AddActivityDialog — a child change clears the form (UX-335)', () => {
  it('drops a typed name when the child changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(view('lincoln', vi.fn()))

    await user.type(screen.getByLabelText('Name'), 'The Good and the Beautiful Math K')
    expect(screen.getByLabelText('Name')).toHaveValue('The Good and the Beautiful Math K')

    rerender(view('london', vi.fn()))

    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('names both boys and says the activity was never added', async () => {
    const user = userEvent.setup()
    const { rerender } = render(view('lincoln', vi.fn()))
    await user.type(screen.getByLabelText('Name'), 'Handwriting')

    rerender(view('london', vi.fn()))

    const notice = screen.getByText(/was cleared/i)
    expect(notice).toHaveTextContent('Lincoln')
    expect(notice).toHaveTextContent('London')
    expect(notice).toHaveTextContent(/never added/i)
  })

  it('raises no notice on an untouched dialog', () => {
    const { rerender } = render(view('lincoln', vi.fn()))
    rerender(view('london', vi.fn()))
    expect(screen.queryByText(/was cleared/i)).not.toBeInTheDocument()
  })

  it('POSITIVE CONTROL — Add after a switch cannot write the previous child’s row', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { rerender } = render(view('lincoln', onAdd))

    await user.type(screen.getByLabelText('Name'), 'The Good and the Beautiful Math K')
    rerender(view('london', onAdd))

    // Without the reset, the name is still in the field, Add is live, and this
    // tap fires `onAdd` with Lincoln's workbook stamped `childId: 'london'`.
    // With it the field is empty, so Add is disabled and `handleAdd`'s own name
    // guard refuses besides — the defect is unreachable rather than unlikely.
    const add = screen.getByRole('button', { name: /^add$/i })
    expect(add).toBeDisabled()
    // Forced past the disabled attribute, because "disabled" is a UI fact and
    // the claim here is about the WRITE: even reached directly, the handler
    // has nothing of Lincoln's left to send.
    fireEvent.click(add)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('still creates the row for the child actually on screen', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(view('london', onAdd))

    await user.type(screen.getByLabelText('Name'), 'Explode the Code')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: 'Explode the Code', childId: 'london' })
  })
})
