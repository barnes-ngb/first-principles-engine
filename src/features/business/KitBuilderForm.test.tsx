import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { KitArtRef, KitRoster } from '../../core/types/business'
import KitBuilderForm from './KitBuilderForm'
import type { NewKitRoster } from './useKitRosters'

function renderForm(roster?: KitRoster) {
  const onSave = vi.fn<(body: NewKitRoster, id?: string) => Promise<void>>(async () => undefined)
  const onCancel = vi.fn()
  render(<KitBuilderForm childId="lincoln" roster={roster} onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel }
}

const artRef = (url: string): KitArtRef => ({
  url,
  storagePath: `families/f/generated-images/${url}.png`,
  generatedAt: '2026-07-18T00:00:00.000Z',
})

function renderArtForm(
  roster: KitRoster,
  opts: {
    canGenerateArt?: boolean
    onGenerateArt?: ReturnType<typeof vi.fn>
    capReached?: boolean
    remainingArt?: number
  } = {},
) {
  const onSave = vi.fn<(body: NewKitRoster, id?: string) => Promise<void>>(async () => undefined)
  const onCancel = vi.fn()
  const onGenerateArt =
    opts.onGenerateArt ??
    vi.fn<(key: string, c: { name: string; descriptor: string }) => Promise<KitArtRef | null>>(
      async () => artRef('new'),
    )
  render(
    <KitBuilderForm
      childId="lincoln"
      roster={roster}
      onSave={onSave}
      onCancel={onCancel}
      canGenerateArt={opts.canGenerateArt ?? true}
      onGenerateArt={onGenerateArt}
      capReached={opts.capReached ?? false}
      remainingArt={opts.remainingArt ?? Infinity}
    />,
  )
  return { onSave, onCancel, onGenerateArt }
}

const savedRoster = (over: Partial<KitRoster> = {}): KitRoster => ({
  id: 'kit-1',
  childId: 'lincoln',
  source: 'kitBuilder',
  status: 'InProgress',
  vaultName: 'Vault',
  heroName: 'Zappy',
  heroLook: 'green pea',
  heroMove: 'shoots sparks',
  defenders: [
    { id: 'd1', name: 'Thorny', power: 'grows thorns' },
    { id: 'd2', name: 'Sappy', power: 'sticky sap' },
  ],
  invaders: [{ id: 'i1', name: 'Digger', menace: 'digs under' }],
  winCondition: 'win',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
  ...over,
})

// Bulk text entry goes through fireEvent.change (one synchronous re-render per
// field) instead of userEvent.type (a re-render PER KEYSTROKE across every
// repeating row). The value still flows through the component's onChange, so
// the "stored verbatim, no autocorrect" claim is proven identically — just far
// cheaper under CI's slower, parallel load. Clicks stay on userEvent.
function typeInto(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } })
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

    typeInto(screen.getByLabelText(/Vault name/i), 'the seed safe')
    typeInto(screen.getByLabelText('Name'), 'lincoln')
    typeInto(screen.getByLabelText('Look'), 'green cape')
    typeInto(screen.getByLabelText(/Special move/i), 'super jump')

    // 2 defenders.
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    typeInto(screen.getByLabelText(/Defender 1 name/i), 'plants-turn-to-life')
    typeInto(screen.getByLabelText('Power'), 'brings plants alive')
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    typeInto(screen.getByLabelText(/Defender 2 name/i), 'Beacon shield')
    // second row's Power field
    typeInto(screen.getAllByLabelText('Power')[1], 'blocks the zombies')

    // 3 invaders.
    for (let i = 1; i <= 3; i += 1) {
      await user.click(screen.getByRole('button', { name: /add an invader/i }))
    }
    typeInto(screen.getByLabelText(/Invader 1 name/i), 'small zombie')
    typeInto(screen.getByLabelText(/Invader 2 name/i), 'big zombie')
    typeInto(screen.getByLabelText(/Invader 3 name/i), 'super-smart zombie')
    const menaces = screen.getAllByLabelText('Menace')
    typeInto(menaces[0], 'sneaks in')
    typeInto(menaces[1], 'smashes the fence')
    typeInto(menaces[2], 'plans an attack')

    typeInto(screen.getByLabelText(/Win condition/i), 'zombies pull the white flag')

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
  }, 15000) // heavy multi-field interaction — margin retained though fireEvent.change keeps it well under

  it('stores an odd-spelling/lowercase name unchanged', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSave } = renderForm()

    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    typeInto(screen.getByLabelText(/Defender 1 name/i), 'zombieee eatr')
    typeInto(screen.getByLabelText('Power'), 'chomps')

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
    typeInto(screen.getByLabelText(/Defender 1 name/i), 'namey')
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

    // fireEvent.change replaces the field value in one shot — no separate clear.
    typeInto(screen.getByLabelText(/Vault name/i), 'New Vault')

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

  // ── Art pipeline (FEAT-88) ────────────────────────────────────

  it('shows no art affordances without the art props', () => {
    renderForm(savedRoster())
    expect(screen.queryAllByRole('button', { name: /make sticker/i })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /make stickers for the rest/i })).not.toBeInTheDocument()
  })

  it('renders a "Make sticker" button per character when art is enabled', () => {
    renderArtForm(savedRoster())
    // hero + 2 defenders + 1 invader = 4
    expect(screen.getAllByRole('button', { name: /make sticker$/i })).toHaveLength(4)
  })

  it('generating one character calls onGenerateArt with its key + verbatim words, then shows the thumbnail', async () => {
    const user = userEvent.setup({ delay: null })
    const onGenerateArt = vi.fn<
      (key: string, c: { name: string; descriptor: string }) => Promise<KitArtRef | null>
    >(async () => artRef('https://img/hero.png'))
    renderArtForm(savedRoster({ defenders: [], invaders: [] }), { onGenerateArt })

    await user.click(screen.getByRole('button', { name: /make sticker$/i }))

    await waitFor(() => expect(onGenerateArt).toHaveBeenCalledTimes(1))
    expect(onGenerateArt.mock.calls[0][0]).toBe('hero')
    expect(onGenerateArt.mock.calls[0][1]).toEqual({ name: 'Zappy', descriptor: 'green pea, shoots sparks' })
    // Thumbnail appears from the returned ref.
    await waitFor(() =>
      expect(screen.getByAltText(/Zappy sticker/i)).toHaveAttribute('src', 'https://img/hero.png'),
    )
  })

  it('a failed generation shows an honest error and keeps existing art', async () => {
    const user = userEvent.setup({ delay: null })
    const onGenerateArt = vi.fn(async () => null) // failure
    renderArtForm(
      savedRoster({
        defenders: [],
        invaders: [],
        art: { hero: artRef('https://img/OLD.png') },
      }),
      { onGenerateArt },
    )

    // Existing art shown, button reads "Regenerate".
    expect(screen.getByAltText(/Zappy sticker/i)).toHaveAttribute('src', 'https://img/OLD.png')
    await user.click(screen.getByRole('button', { name: /regenerate/i }))

    await waitFor(() => expect(screen.getByText(/couldn't make that sticker/i)).toBeInTheDocument())
    // Prior art is not lost.
    expect(screen.getByAltText(/Zappy sticker/i)).toHaveAttribute('src', 'https://img/OLD.png')
  })

  it('disables "Make sticker" for an entirely-empty character row', async () => {
    const user = userEvent.setup({ delay: null })
    renderArtForm(savedRoster({ defenders: [], invaders: [] }))
    await user.click(screen.getByRole('button', { name: /add a defender/i }))
    // The new empty defender's Make sticker button is disabled.
    const buttons = screen.getAllByRole('button', { name: /make sticker$/i })
    // hero (has content) enabled, new empty defender disabled.
    const disabled = buttons.filter((b) => (b as HTMLButtonElement).disabled)
    expect(disabled).toHaveLength(1)
  })

  it('the batch button confirms the count and never auto-generates', async () => {
    const user = userEvent.setup({ delay: null })
    const onGenerateArt = vi.fn(async () => artRef('x'))
    renderArtForm(savedRoster(), { onGenerateArt })

    // 4 characters, none with art → "the rest (4)".
    const batch = screen.getByRole('button', { name: /make stickers for the rest \(4\)/i })
    // Nothing generated just by rendering.
    expect(onGenerateArt).not.toHaveBeenCalled()

    await user.click(batch)
    // A confirm dialog states the exact count — no generation yet.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/make 4 images\?/i)
    expect(onGenerateArt).not.toHaveBeenCalled()

    // Cancel (scoped to the dialog) → still nothing generated.
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }))
    expect(onGenerateArt).not.toHaveBeenCalled()

    // Confirm → generates once per character. (findByRole waits out the MUI
    // dialog close transition that briefly aria-hides the background.)
    await user.click(await screen.findByRole('button', { name: /make stickers for the rest \(4\)/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^make 4$/i }))
    await waitFor(() => expect(onGenerateArt).toHaveBeenCalledTimes(4))
  })

  it('labels the button "Regenerate" once a character has art', () => {
    renderArtForm(savedRoster({ defenders: [], invaders: [], art: { hero: artRef('u') } }))
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /make sticker$/i })).not.toBeInTheDocument()
  })

  it('shows thumbnails to a read-only viewer but no generate buttons', () => {
    // Kid/read-only path: canGenerateArt false, but the roster has art.
    renderArtForm(
      savedRoster({
        defenders: [],
        invaders: [],
        art: { hero: artRef('https://img/hero.png') },
      }),
      { canGenerateArt: false },
    )
    // The thumbnail still renders (the kid sees his cast)…
    expect(screen.getByAltText(/Zappy sticker/i)).toHaveAttribute('src', 'https://img/hero.png')
    // …but no paid generate/regenerate button, and no batch button.
    expect(screen.queryByRole('button', { name: /make sticker$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /make stickers for the rest/i })).not.toBeInTheDocument()
  })

  it('opens a lightbox with the full-size sticker + name when the thumbnail is tapped (kid-safe)', async () => {
    const user = userEvent.setup()
    // Read-only viewer (canGenerateArt false) still gets to open the bigger view.
    renderArtForm(
      savedRoster({ defenders: [], invaders: [], art: { hero: artRef('https://img/hero.png') } }),
      { canGenerateArt: false },
    )
    await user.click(screen.getByRole('button', { name: /view zappy sticker larger/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Zappy')).toBeInTheDocument()
    expect(within(dialog).getByAltText(/Zappy sticker/i)).toHaveAttribute(
      'src',
      'https://img/hero.png',
    )
    // Viewing is for everyone; the action stays gated — no Regenerate for a read-only viewer.
    expect(within(dialog).queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument()
  })

  // ── Daily art cap (FEAT-94) ───────────────────────────────────

  it('bounds the batch to the remaining daily allowance, not the character count', async () => {
    const user = userEvent.setup({ delay: null })
    const onGenerateArt = vi.fn(async () => artRef('x'))
    // 4 characters with no art, but only 2 generations left today.
    renderArtForm(savedRoster(), { onGenerateArt, remainingArt: 2 })

    // The button + dialog advertise the allowance-bounded count, not 4.
    const batch = screen.getByRole('button', { name: /make stickers for the rest \(2\)/i })
    await user.click(batch)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/make 2 images\?/i)

    await user.click(within(dialog).getByRole('button', { name: /^make 2$/i }))
    // Exactly the allowance is spent — the big roster can't blow past the cap.
    await waitFor(() => expect(onGenerateArt).toHaveBeenCalledTimes(2))
  })

  it('an uncapped parent batch generates every remaining character', async () => {
    const user = userEvent.setup({ delay: null })
    const onGenerateArt = vi.fn(async () => artRef('x'))
    // Default remainingArt is Infinity (parent) → all 4 generate.
    renderArtForm(savedRoster(), { onGenerateArt })

    await user.click(screen.getByRole('button', { name: /make stickers for the rest \(4\)/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^make 4$/i }))
    await waitFor(() => expect(onGenerateArt).toHaveBeenCalledTimes(4))
  })

  it('at the daily cap: no generate buttons, a friendly non-shaming nudge instead', () => {
    renderArtForm(savedRoster({ defenders: [], invaders: [] }), { capReached: true })
    // The cap swaps the paid buttons for a warm message — never a hard error.
    expect(screen.queryByRole('button', { name: /make sticker$/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /make stickers for the rest/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/that's a lot of art today! ask a grown-up if you need more/i),
    ).toBeInTheDocument()
  })

  it('at the daily cap: existing art thumbnails still show (viewing is never capped)', () => {
    renderArtForm(
      savedRoster({ defenders: [], invaders: [], art: { hero: artRef('https://img/hero.png') } }),
      { capReached: true },
    )
    expect(screen.getByAltText(/Zappy sticker/i)).toHaveAttribute('src', 'https://img/hero.png')
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument()
  })

  it('does not show the cap nudge to a read-only viewer who never had generate access', () => {
    // canGenerateArt false → capReached is moot; no nudge, no buttons.
    renderArtForm(savedRoster({ defenders: [], invaders: [] }), {
      canGenerateArt: false,
      capReached: true,
    })
    expect(
      screen.queryByText(/that's a lot of art today/i),
    ).not.toBeInTheDocument()
  })

  it('the lightbox Regenerate button is gated on canGenerate and calls onGenerateArt', async () => {
    const user = userEvent.setup()
    const onGenerateArt = vi.fn(async () => artRef('https://img/new.png'))
    renderArtForm(
      savedRoster({ defenders: [], invaders: [], art: { hero: artRef('https://img/hero.png') } }),
      { canGenerateArt: true, onGenerateArt },
    )
    await user.click(screen.getByRole('button', { name: /view zappy sticker larger/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /regenerate/i }))
    await waitFor(() =>
      expect(onGenerateArt).toHaveBeenCalledWith(
        'hero',
        expect.objectContaining({ name: 'Zappy' }),
      ),
    )
  })
})
