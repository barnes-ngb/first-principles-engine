import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ArtHelpSheet, { ArtHelpButton, GenerateHint } from '../ArtHelpSheet'
import { artHelp, styleBlurb } from '../artHelpContent'

const CAPPED = { limit: 100, remaining: 37, capped: true }
const UNCAPPED = { limit: 100, remaining: Infinity, capped: false }

describe('ArtHelpSheet — audience is capability, never a name', () => {
  it('renders the kid words for a kid profile', () => {
    render(
      <ArtHelpSheet
        surface="stickers"
        open
        onClose={() => {}}
        audience="kid"
        budget={CAPPED}
      />,
    )

    expect(screen.getByText(artHelp('stickers', 'kid').title)).toBeInTheDocument()
    expect(screen.getByText('Type a few words. Get one sticker.')).toBeInTheDocument()
    // ...and not the fuller parent explanation of the same door.
    expect(screen.queryByText(/turns a few typed words into one cut-out picture/i)).toBeNull()
    // No child's name reaches the copy — the kid text says "you".
    expect(screen.queryByText(/lincoln|london/i)).toBeNull()
  })

  it('renders the fuller parent words for a parent', () => {
    render(
      <ArtHelpSheet
        surface="stickers"
        open
        onClose={() => {}}
        audience="parent"
        budget={UNCAPPED}
      />,
    )

    expect(screen.getByText(/turns a few typed words into one cut-out picture/i)).toBeInTheDocument()
    expect(screen.queryByText('Type a few words. Get one sticker.')).toBeNull()
  })
})

describe('ArtHelpSheet — the live budget', () => {
  it('prints what is actually left, not a number baked into the copy', () => {
    render(
      <ArtHelpSheet
        surface="stickers"
        open
        onClose={() => {}}
        audience="kid"
        budget={{ limit: 100, remaining: 37, capped: true }}
      />,
    )
    expect(screen.getByText('You have 37 left this week.')).toBeInTheDocument()
  })

  it('tells a parent they are not capped', () => {
    render(
      <ArtHelpSheet
        surface="stickers"
        open
        onClose={() => {}}
        audience="parent"
        budget={UNCAPPED}
      />,
    )
    expect(
      screen.getByText(
        'You are not capped. The weekly budget applies to a child signed in as themselves.',
      ),
    ).toBeInTheDocument()
  })
})

describe('ArtHelpSheet — what each look does', () => {
  it('lists every sticker look with a blurb derived from its recipe', () => {
    render(
      <ArtHelpSheet surface="sketch" open onClose={() => {}} audience="parent" budget={CAPPED} />,
    )
    // The Blocky/Minecraft look names the recipe's own flat-per-face shading.
    expect(screen.getByText(styleBlurb('minecraft', 'parent'))).toBeInTheDocument()
    expect(screen.getByText(styleBlurb('fantasy', 'parent'))).toBeInTheDocument()
  })

  it('explains show-the-whole-picture only on the book-images sheet (FEAT-177)', () => {
    const { unmount } = render(
      <ArtHelpSheet
        surface="bookImages"
        open
        onClose={() => {}}
        audience="parent"
        budget={CAPPED}
      />,
    )
    expect(screen.getByText(/blurred, enlarged copy of itself/i)).toBeInTheDocument()
    unmount()

    render(
      <ArtHelpSheet surface="stickers" open onClose={() => {}} audience="parent" budget={CAPPED} />,
    )
    expect(screen.queryByText(/blurred, enlarged copy of itself/i)).toBeNull()
  })
})

describe('ArtHelpSheet — it closes, and it never generates', () => {
  it('closes from the X and from "Got it"', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ArtHelpSheet
        surface="kitArt"
        open
        onClose={onClose}
        audience="parent"
        budget={CAPPED}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('offers nothing that could spend a picture', () => {
    render(
      <ArtHelpSheet surface="stickers" open onClose={() => {}} audience="kid" budget={CAPPED} />,
    )
    // Two buttons, both of which only close it. The sheet is copy.
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['Close', 'Got it'])
  })

  it('renders nothing when closed', () => {
    render(
      <ArtHelpSheet
        surface="stickers"
        open={false}
        onClose={() => {}}
        audience="kid"
        budget={CAPPED}
      />,
    )
    expect(screen.queryByText(artHelp('stickers', 'kid').title)).toBeNull()
  })
})

describe('ArtHelpButton / GenerateHint', () => {
  it('opens the sheet from a labelled "?"', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ArtHelpButton onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'How this works' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('says what a tap makes, with a live count for a batch', () => {
    const { unmount } = render(<GenerateHint door="makeSticker" audience="kid" />)
    expect(screen.getByText('Makes 1 sticker. Uses 1 art.')).toBeInTheDocument()
    unmount()

    render(<GenerateHint door="illustrateBook" audience="kid" count={10} />)
    expect(screen.getByText('Makes 10 pictures. Uses 10 art.')).toBeInTheDocument()
  })
})
