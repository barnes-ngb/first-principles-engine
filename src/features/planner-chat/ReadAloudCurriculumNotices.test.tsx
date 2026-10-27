import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ReadAloudCurriculumNotices from './ReadAloudCurriculumNotices'

const NARNIA = { id: 'readaloud-lion-witch-wardrobe', name: 'Read-aloud: The Lion, the Witch and the Wardrobe' }

describe('ReadAloudCurriculumNotices (FEAT-243)', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(
      <ReadAloudCurriculumNotices showAdd={false} onAdd={vi.fn()} earlierRows={[]} onConfirmFinish={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the one-tap add', () => {
    const onAdd = vi.fn()
    render(<ReadAloudCurriculumNotices showAdd onAdd={onAdd} earlierRows={[]} onConfirmFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to Curriculum' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('an earlier book is offered back, and nothing is written before the confirm', async () => {
    const onConfirmFinish = vi.fn().mockResolvedValue(undefined)
    render(
      <ReadAloudCurriculumNotices showAdd={false} onAdd={vi.fn()} earlierRows={[NARNIA]} onConfirmFinish={onConfirmFinish} />,
    )
    expect(screen.getByText('The Lion, the Witch and the Wardrobe is still in Curriculum. Mark it finished?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark finished' }))
    const dialog = await screen.findByRole('dialog')
    expect(onConfirmFinish).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark finished' }))
    await waitFor(() => expect(onConfirmFinish).toHaveBeenCalledWith(NARNIA))
  })

  it('"Not yet" writes nothing', async () => {
    const onConfirmFinish = vi.fn()
    render(
      <ReadAloudCurriculumNotices showAdd={false} onAdd={vi.fn()} earlierRows={[NARNIA]} onConfirmFinish={onConfirmFinish} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark finished' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not yet' }))
    expect(onConfirmFinish).not.toHaveBeenCalled()
  })
})
