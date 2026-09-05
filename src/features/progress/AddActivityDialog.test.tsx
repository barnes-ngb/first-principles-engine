/**
 * FEAT-199 — the parent side of the quick-log row.
 *
 * Two assertions, both failing against `main`: `PracticalArts` was not on the
 * hand-kept subject list (so *packing* could not be filed as practical work
 * anywhere in the app), and there was no way to mark an activity as one the
 * kids may quick-log.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { NewActivityConfig } from '../../core/hooks/useActivityConfigs'
import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import AddActivityDialog from './AddActivityDialog'

function open(onAdd = vi.fn()) {
  render(
    <AddActivityDialog
      open
      childId="lincoln"
      nextSortOrder={7}
      onAdd={onAdd}
      onClose={vi.fn()}
    />,
  )
  return onAdd
}

describe('AddActivityDialog — subjects (FEAT-199)', () => {
  it('offers every subject bucket, derived from the enum', () => {
    open()
    for (const bucket of Object.values(SubjectBucket)) {
      expect(
        screen.getByText(SubjectBucketLabel[bucket]),
        `missing subject option: ${bucket}`,
      ).toBeInTheDocument()
    }
  })

  it('files a packing activity as PracticalArts', async () => {
    const user = userEvent.setup()
    const onAdd = open()
    await user.type(screen.getByLabelText('Name'), 'Packing boxes')
    await user.click(screen.getByText('Practical Arts'))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    const payload = onAdd.mock.calls[0][0] as NewActivityConfig
    expect(payload.subjectBucket).toBe('PracticalArts')
    expect(payload.name).toBe('Packing boxes')
  })
})

describe('AddActivityDialog — the quick-log flag (FEAT-199)', () => {
  it('omits the flag entirely when the parent leaves it off', async () => {
    const user = userEvent.setup()
    const onAdd = open()
    await user.type(screen.getByLabelText('Name'), 'GATB Math')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const payload = onAdd.mock.calls[0][0] as NewActivityConfig
    // Omitted, not `false`: `addActivityConfig` spreads this straight into
    // `setDoc`, and Firestore rejects an explicit `undefined`.
    expect('quickLog' in payload).toBe(false)
  })

  it('carries quickLog: true when the parent turns it on', async () => {
    const user = userEvent.setup()
    const onAdd = open()
    await user.type(screen.getByLabelText('Name'), 'Packing boxes')
    const quickLogRow = screen
      .getByText(/Show on the kids.+I Did More/i)
      .parentElement as HTMLElement
    await user.click(within(quickLogRow).getByText('Yes'))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const payload = onAdd.mock.calls[0][0] as NewActivityConfig
    expect(payload.quickLog).toBe(true)
  })
})
