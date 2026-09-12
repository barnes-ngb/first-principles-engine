import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityConfig } from '../../core/types'

const { saveResource } = vi.hoisted(() => ({ saveResource: vi.fn() }))
vi.mock('../../core/firebase/activityConfigWrites', () => ({ addActivityConfig: saveResource }))
vi.mock('../../core/firebase/firestore', () => ({}))
import PlannerAddItemDialog from './PlannerAddItemDialog'
import AddActivityDialog from '../progress/AddActivityDialog'

const config: ActivityConfig = {
  id: 'r1', childId: 'c1', name: 'Math book', type: 'workbook', subjectBucket: 'Math',
  defaultMinutes: 20, frequency: 'daily', sortOrder: 1, scannable: true,
  completed: false, createdAt: '', updatedAt: '',
}
const props = () => ({
  familyId: 'f1', childId: 'c1', childName: 'Lincoln', dayLabel: 'Monday, 2026-09-14', applied: false,
  configs: [config], loading: false, error: null,
  onAdd: vi.fn().mockResolvedValue(undefined), onVideo: vi.fn(), onClose: vi.fn(), onResourceSaved: vi.fn(),
})
beforeEach(() => { saveResource.mockReset().mockResolvedValue('new-id') })

describe('Planner Add item', () => {
  it('names the child and date, filters sibling resources, and requires the scheduling tap', async () => {
    const p = props()
    render(<PlannerAddItemDialog {...p} configs={[config, { ...config, id: 'sibling', childId: 'c2', name: 'Sibling book' }]} />)
    expect(screen.getByText('Add item · Lincoln')).toBeInTheDocument()
    expect(screen.getByText('Monday, 2026-09-14')).toBeInTheDocument()
    expect(screen.getByText(/Apply the plan to save/)).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('combobox'))
    const list = within(screen.getByRole('listbox'))
    expect(list.queryByText(/Sibling book/)).not.toBeInTheDocument()
    fireEvent.click(list.getByRole('option', { name: /Math book/ }))
    expect(p.onAdd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add to day' }))
    await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce())
    expect(p.onAdd).toHaveBeenCalledExactlyOnceWith(config)
  })

  it('retains a failed resource form, then saves to Curriculum before scheduling separately', async () => {
    const p = props()
    saveResource.mockRejectedValueOnce(new Error('offline'))
    render(<PlannerAddItemDialog {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create new resource' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New book' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Curriculum' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your entries are still here')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('New book')
    fireEvent.click(screen.getByRole('button', { name: 'Save to Curriculum' }))
    await screen.findByText(/New book is saved in Curriculum/)
    expect(saveResource).toHaveBeenLastCalledWith('f1', expect.objectContaining({ childId: 'c1', name: 'New book', defaultMinutes: 20 }))
    expect(p.onAdd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add to day' }))
    await waitFor(() => expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-id', childId: 'c1' })))
  })

  it('keeps a failed day addition available to retry without recreating its resource', async () => {
    const p = props()
    p.onAdd.mockRejectedValueOnce(new Error('Could not save the day'))
    render(<PlannerAddItemDialog {...p} applied />)
    expect(screen.getByText('Adds directly to this day’s checklist.')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: /Math book/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to day' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the day')
    expect(p.onClose).not.toHaveBeenCalled()
    expect(saveResource).not.toHaveBeenCalled()
  })

  it('gates Curriculum actions on loading or a failed read', () => {
    const p = props()
    const view = render(<PlannerAddItemDialog {...p} loading />)
    expect(screen.getByRole('button', { name: 'Create new resource' })).toBeDisabled()
    view.rerender(<PlannerAddItemDialog {...p} error="offline" />)
    expect(screen.getByRole('button', { name: 'Add to day' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load Curriculum')
  })

  it('keeps a pending resource save bound when the host switches child or week', async () => {
    let finish!: (id: string) => void
    saveResource.mockImplementation(() => new Promise<string>(resolve => { finish = resolve }))
    const p = props()
    const view = render(<PlannerAddItemDialog key="c1/week1" {...p} dayLabel={undefined} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Original resource' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Curriculum' }))
    view.rerender(<PlannerAddItemDialog key="c2/week2" {...p} childId="c2" childName="London" dayLabel={undefined} />)
    await act(async () => finish('saved-id'))
    expect(saveResource).toHaveBeenCalledExactlyOnceWith('f1', expect.objectContaining({ childId: 'c1', name: 'Original resource' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(p.onClose).not.toHaveBeenCalled()
    expect(p.onResourceSaved).not.toHaveBeenCalled()
    expect(p.onAdd).not.toHaveBeenCalled()
  })

  it('clears the shared form on a child change and keeps an in-flight save with its original owner', async () => {
    let finish!: () => void
    const onAdd = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const onClose = vi.fn()
    const view = render(<AddActivityDialog open childId="c1" nextSortOrder={1} onAdd={onAdd} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Lincoln book' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    view.rerender(<AddActivityDialog open childId="c2" nextSortOrder={1} onAdd={onAdd} onClose={onClose} />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    // The sentence comes from `progress/addActivityOwnership.ts` since FIX-232,
    // which merged this fix with UX-335's: the reset is still this PR's `key`
    // remount, and the WORDS are now the shared rule's, so the two runs' copy
    // cannot drift. This call site passes no `childName`, so the unnamed
    // variant is correct here — Curriculum's does, and names both boys.
    expect(screen.getByRole('alert')).toHaveTextContent(/was cleared/)
    expect(screen.getByRole('alert')).toHaveTextContent(/never added/)
    await act(async () => finish())
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ childId: 'c1', name: 'Lincoln book' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
