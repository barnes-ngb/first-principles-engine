import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NewWatchVideo } from './useWatchLibrary'

const { useChildrenMock } = vi.hoisted(() => ({ useChildrenMock: vi.fn() }))
vi.mock('../../core/hooks/useChildren', () => ({ useChildren: useChildrenMock }))

import WatchVetInForm from './WatchVetInForm'

const ID = 'dQw4w9WgXcQ'

beforeEach(() => {
  useChildrenMock.mockReturnValue({
    children: [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ],
  })
})

function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('WatchVetInForm', () => {
  it('keeps save disabled until a valid id + title are present', () => {
    render(<WatchVetInForm onSave={vi.fn()} />)
    const save = screen.getByRole('button', { name: /add to library/i })
    expect(save).toBeDisabled()

    typeInto(/youtube link or video id/i, `https://youtu.be/${ID}`)
    expect(save).toBeDisabled() // still needs a title

    typeInto(/title/i, 'How people first made cities')
    expect(save).toBeEnabled()
  })

  it('rejects a fractional minutes value that would round to 0', () => {
    render(<WatchVetInForm onSave={vi.fn()} />)
    typeInto(/youtube link or video id/i, ID)
    typeInto(/title/i, 'Castles')
    typeInto(/planned minutes/i, '0.1')
    expect(screen.getByRole('button', { name: /add to library/i })).toBeDisabled()
    typeInto(/planned minutes/i, '12')
    expect(screen.getByRole('button', { name: /add to library/i })).toBeEnabled()
  })

  it('rejects a non-YouTube paste with an honest message and no valid id', () => {
    render(<WatchVetInForm onSave={vi.fn()} />)
    typeInto(/youtube link or video id/i, 'https://evil.com/watch?v=dQw4w9WgXcQ')
    expect(screen.getByText(/not a valid youtube link or id/i)).toBeInTheDocument()
    typeInto(/title/i, 'Anything')
    expect(screen.getByRole('button', { name: /add to library/i })).toBeDisabled()
  })

  it('shows the extracted id as confirmation for a valid paste', () => {
    render(<WatchVetInForm onSave={vi.fn()} />)
    typeInto(/youtube link or video id/i, `https://www.youtube.com/watch?v=${ID}&t=10s`)
    expect(screen.getByText(new RegExp(`video id: ${ID}`, 'i'))).toBeInTheDocument()
  })

  it('saves a WatchVideo with the extracted id, parent title, minutes, subject default, and both scope', async () => {
    const onSave = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<WatchVetInForm onSave={onSave} />)

    typeInto(/youtube link or video id/i, `https://www.youtube.com/watch?v=${ID}`)
    typeInto(/title/i, 'How people first made cities')
    typeInto(/planned minutes/i, '14')
    await user.click(screen.getByRole('button', { name: /add to library/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      youtubeId: ID,
      title: 'How people first made cities',
      plannedMinutes: 14,
      subjectBucket: 'SocialStudies', // History default
      childId: 'both', // default scope (D7)
      addedBy: 'parent',
    })
  })

  it('scopes to a single child and includes the optional why', async () => {
    const onSave = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<WatchVetInForm onSave={onSave} />)

    typeInto(/youtube link or video id/i, ID) // bare id also accepted
    typeInto(/title/i, 'Castles')
    typeInto(/why we're watching/i, 'He asked about knights')
    await user.click(screen.getByText('Lincoln'))
    await user.click(screen.getByText('Science'))
    await user.click(screen.getByRole('button', { name: /add to library/i }))

    expect(onSave).toHaveBeenCalledWith({
      youtubeId: ID,
      title: 'Castles',
      plannedMinutes: 12,
      subjectBucket: 'Science',
      childId: 'lincoln',
      addedBy: 'parent',
      why: 'He asked about knights',
    })
  })
})

// ── FEAT-129: the same form is the editor ───────────────────────────────────

import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import type { WatchVideo } from '../../core/types'

const existing: WatchVideo = {
  id: 'watch-1',
  youtubeId: ID,
  title: 'How people first made cities',
  plannedMinutes: 14,
  subjectBucket: 'SocialStudies',
  childId: 'lincoln',
  addedBy: 'shelly',
  why: 'He asked about knights',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
}

describe('WatchVetInForm — edit mode (FEAT-129)', () => {
  it('prefills every curated field from the entry being edited', () => {
    render(<WatchVetInForm initial={existing} onSave={vi.fn()} />)

    expect(screen.getByText('Edit video')).toBeInTheDocument()
    expect(screen.getByLabelText(/youtube link or video id/i)).toHaveValue(ID)
    expect(screen.getByLabelText(/title/i)).toHaveValue('How people first made cities')
    expect(screen.getByLabelText(/planned minutes/i)).toHaveValue(14)
    expect(screen.getByLabelText(/why we're watching/i)).toHaveValue('He asked about knights')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })

  it('saves the edited fields and KEEPS the original curator', async () => {
    const onSave = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<WatchVetInForm initial={existing} onSave={onSave} />)

    typeInto(/title/i, 'How the first cities were built')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSave).toHaveBeenCalledWith({
      youtubeId: ID,
      title: 'How the first cities were built',
      plannedMinutes: 14,
      subjectBucket: 'SocialStudies',
      childId: 'lincoln',
      addedBy: 'shelly', // provenance is an audit trail, not a last-toucher stamp
      why: 'He asked about knights',
    })
  })

  it('re-validates the link on edit — a malformed URL cannot be saved either', () => {
    render(<WatchVetInForm initial={existing} onSave={vi.fn()} />)
    typeInto(/youtube link or video id/i, 'https://evil.com/watch?v=dQw4w9WgXcQ')

    expect(screen.getByText(/not a valid youtube link or id/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('re-validates minutes on edit — a value that rounds to 0 cannot be saved', () => {
    render(<WatchVetInForm initial={existing} onSave={vi.fn()} />)
    typeInto(/planned minutes/i, '0.4')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('clearing the note actually clears it (sends an empty why, not an omitted one)', async () => {
    const onSave = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<WatchVetInForm initial={existing} onSave={onSave} />)

    typeInto(/why we're watching/i, '')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // An omitted key would leave the stored note in place on a merge write.
    expect(onSave.mock.calls[0][0]).toHaveProperty('why', '')
  })

  it('keeps the edited values on screen after saving (the caller closes the editor)', async () => {
    const onSave = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<WatchVetInForm initial={existing} onSave={onSave} />)

    typeInto(/title/i, 'Renamed')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // The add form resets itself for the next vet-in; the editor must not — a
    // blanked form would read as "the edit was lost".
    expect(screen.getByLabelText(/title/i)).toHaveValue('Renamed')
  })

  it('offers Cancel only when the caller supplies one', () => {
    const onCancel = vi.fn()
    const { unmount } = render(<WatchVetInForm initial={existing} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()

    render(<WatchVetInForm onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
  })
})

// ── FEAT-129: the subject vocabulary is the shared constant ─────────────────

describe('WatchVetInForm — subject vocabulary', () => {
  it('offers ONLY SubjectBucket values — a free-text subject is unreachable', () => {
    render(<WatchVetInForm onSave={vi.fn()} />)

    const valid = new Set(Object.values(SubjectBucket).map((s) => SubjectBucketLabel[s]))
    // Every subject chip's label must come from the shared enum's label map, so
    // a hand-typed subject can never reach `watchLibrary` (and slice-2 hours
    // credit always lands in a real bucket).
    for (const label of ['Social Studies', 'Science', 'Art', 'Math']) {
      expect(valid.has(label)).toBe(true)
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('the saved subjectBucket is a member of the SubjectBucket constant', async () => {
    const onSave = vi.fn<(v: NewWatchVideo) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<WatchVetInForm onSave={onSave} />)

    typeInto(/youtube link or video id/i, ID)
    typeInto(/title/i, 'Volcanoes')
    await user.click(screen.getByText('Science'))
    await user.click(screen.getByRole('button', { name: /add to library/i }))

    const saved = onSave.mock.calls[0][0].subjectBucket
    expect(Object.values(SubjectBucket)).toContain(saved)
  })
})
