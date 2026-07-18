import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { KitRoster } from '../../core/types/business'
import KitBuilderForm from './KitBuilderForm'
import type { NewKitRoster } from './useKitRosters'

function renderForm(roster?: KitRoster) {
  const onSave = vi.fn<(body: NewKitRoster, id?: string) => Promise<void>>(async () => undefined)
  const onCancel = vi.fn()
  render(<KitBuilderForm childId="lincoln" roster={roster} onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel }
}

describe('KitBuilderForm', () => {
  it('adds and removes defender and invader rows', async () => {
    const user = userEvent.setup({ delay: null })
    renderForm()

    // Empty states first.
    expect(screen.getByText(/No defenders yet/i)).toBeInTheDocument()
    expect(screen.getByText(/No invaders yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    expect(screen.getByLabelText(/Defender 1 name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Defender 2 name/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add an invader/i }))
    expect(screen.getByLabelText(/Invader 1 name/i)).toBeInTheDocument()

    // Remove the first defender — one row remains, relabeled 1.
    await user.click(screen.getAllByRole('button', { name: /remove defender/i })[0])
    expect(screen.getByLabelText(/Defender 1 name/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Defender 2 name/i)).not.toBeInTheDocument()
  })

  it('saves a Lincoln-shaped roster with all fields verbatim', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSave } = renderForm()

    await user.type(screen.getByLabelText(/Vault name/i), 'the seed safe')
    await user.type(screen.getByLabelText('Name'), 'lincoln')
    await user.type(screen.getByLabelText('Look'), 'green cape')
    await user.type(screen.getByLabelText(/Special move/i), 'super jump')

    // 2 defenders.
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    await user.type(screen.getByLabelText(/Defender 1 name/i), 'plants-turn-to-life')
    await user.type(screen.getByLabelText('Power'), 'brings plants alive')
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    await user.type(screen.getByLabelText(/Defender 2 name/i), 'Beacon shield')
    // second row's Power field
    await user.type(screen.getAllByLabelText('Power')[1], 'blocks the zombies')

    // 3 invaders.
    for (let i = 1; i <= 3; i += 1) {
      await user.click(screen.getByRole('button', { name: /add an invader/i }))
    }
    await user.type(screen.getByLabelText(/Invader 1 name/i), 'small zombie')
    await user.type(screen.getByLabelText(/Invader 2 name/i), 'big zombie')
    await user.type(screen.getByLabelText(/Invader 3 name/i), 'super-smart zombie')
    const menaces = screen.getAllByLabelText('Menace')
    await user.type(menaces[0], 'sneaks in')
    await user.type(menaces[1], 'smashes the fence')
    await user.type(menaces[2], 'plans an attack')

    await user.type(screen.getByLabelText(/Win condition/i), 'zombies pull the white flag')

    await user.click(screen.getByRole('button', { name: /save kit/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [body, id] = onSave.mock.calls[0] as [NewKitRoster, string | undefined]
    expect(id).toBeUndefined() // create, not edit
    expect(body.childId).toBe('lincoln')
    expect(body.vaultName).toBe('the seed safe') // lowercase preserved, no autocorrect
    expect(body.heroName).toBe('lincoln')
    expect(body.heroLook).toBe('green cape')
    expect(body.heroMove).toBe('super jump')
    expect(body.defenders).toHaveLength(2)
    expect(body.defenders[0]).toMatchObject({ name: 'plants-turn-to-life', power: 'brings plants alive' })
    expect(body.defenders[1]).toMatchObject({ name: 'Beacon shield', power: 'blocks the zombies' })
    expect(body.invaders).toHaveLength(3)
    expect(body.invaders.map((i) => i.name)).toEqual(['small zombie', 'big zombie', 'super-smart zombie'])
    expect(body.invaders[2].menace).toBe('plans an attack')
    expect(body.winCondition).toBe('zombies pull the white flag')
    expect(body.status).toBe('InProgress')
  }, 15000) // heavy multi-field interaction — generous timeout under full-file load

  it('stores an odd-spelling/lowercase name unchanged', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSave } = renderForm()

    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    await user.type(screen.getByLabelText(/Defender 1 name/i), 'zombieee eatr')
    await user.type(screen.getByLabelText('Power'), 'chomps')

    await user.click(screen.getByRole('button', { name: /save kit/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [body] = onSave.mock.calls[0] as [NewKitRoster]
    expect(body.defenders[0].name).toBe('zombieee eatr') // no spell-fix, no capitalization
  })

  it('drops only entirely-empty rows, keeping partially-filled ones', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSave } = renderForm()

    // One filled-name-only defender, one totally empty.
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    await user.type(screen.getByLabelText(/Defender 1 name/i), 'namey')
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    // Defender 2 left blank.

    await user.click(screen.getByRole('button', { name: /save kit/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [body] = onSave.mock.calls[0] as [NewKitRoster]
    expect(body.defenders).toHaveLength(1)
    expect(body.defenders[0].name).toBe('namey')
    expect(body.defenders[0].power).toBe('')
  })

  it('edits an existing roster and passes its id back on save', async () => {
    const user = userEvent.setup({ delay: null })
    const existing: KitRoster = {
      id: 'kit-9',
      childId: 'lincoln',
      source: 'kitBuilder',
      status: 'InProgress',
      vaultName: 'Old Vault',
      heroName: 'H',
      heroLook: '',
      heroMove: '',
      defenders: [{ id: 'd1', name: 'Sunny', power: 'shines' }],
      invaders: [],
      winCondition: '',
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    }
    const { onSave } = renderForm(existing)

    // Seeded defender is present.
    expect(screen.getByDisplayValue('Sunny')).toBeInTheDocument()

    const vault = screen.getByLabelText(/Vault name/i)
    await user.clear(vault)
    await user.type(vault, 'New Vault')

    // Flip status to Ready.
    await user.click(screen.getByLabelText(/Status/i))
    await user.click(await screen.findByRole('option', { name: 'Ready' }))

    await user.click(screen.getByRole('button', { name: /save kit/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [body, id] = onSave.mock.calls[0] as [NewKitRoster, string]
    expect(id).toBe('kit-9')
    expect(body.vaultName).toBe('New Vault')
    expect(body.status).toBe('Complete')
    expect(body.defenders).toHaveLength(1)
  })

  it('calls onCancel without saving', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSave, onCancel } = renderForm()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not tamper with a fully-empty roster save (empty lists are valid)', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSave } = renderForm()
    await user.click(screen.getByRole('button', { name: /save kit/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [body] = onSave.mock.calls[0] as [NewKitRoster]
    expect(body.defenders).toEqual([])
    expect(body.invaders).toEqual([])
    expect(body.vaultName).toBe('')
  })
})
