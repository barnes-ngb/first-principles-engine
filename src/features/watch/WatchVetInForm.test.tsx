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
