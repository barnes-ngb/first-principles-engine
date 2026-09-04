import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// UX-147 — FEAT-178 said "every paid door carries a hint and a ?". The 2026-09
// audit walked them door by door and found four bare: the Story Guide's one-tap
// up-to-14-call generate, both Reimagine buttons, the editor's sticker picker,
// and the review chat's "Change this". Each is capped, so none can overspend —
// each could still surprise.
//
// The Story Guide's two cases used to live at the top of this file. FEAT-187
// retired that wizard (one "Make a book" door, two choices), so its door is
// gone rather than fixed; the hint and "?" it grew in FEAT-182 went with it.
// The Generate chat keeps its own — see `BookGenerateChat.test.tsx`.

import DrawingChoiceDialog from '../DrawingChoiceDialog'

// ── The two Reimagine doors ─────────────────────────────────────

const capturedFile = new File(['x'], 'drawing.png', { type: 'image/png' })

describe('UX-147 — the Reimagine doors say what they spend', () => {
  it('hints under the raw-photo Reimagine, and offers a "?"', async () => {
    const user = userEvent.setup()
    render(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={vi.fn()}
        processing={false}
        artAudience="parent"
        onOpenArtHelp={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Reimagine'))

    expect(screen.getByText('Reimagine intensity')).toBeTruthy()
    expect(screen.getByText(/1 paid image call/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /how this works/i })).toBeTruthy()
  })

  it('hints under the post-cleanup Reimagine too', async () => {
    const user = userEvent.setup()
    render(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={vi.fn()}
        onPickPostCleanup={vi.fn()}
        resultPreviewUrl="blob:cleaned"
        resultIsCleaned
        processing={false}
        artAudience="parent"
        onOpenArtHelp={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Reimagine as a picture'))

    expect(screen.getByText(/1 paid image call/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /how this works/i })).toBeTruthy()
  })

  it('gives a kid the kid wording, on capability and never a name', async () => {
    const user = userEvent.setup()
    render(
      <DrawingChoiceDialog
        open
        capturedFile={capturedFile}
        capturedPreviewUrl="blob:preview"
        onClose={vi.fn()}
        onChoose={vi.fn()}
        processing={false}
        artAudience="kid"
        onOpenArtHelp={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Reimagine'))

    expect(screen.getByText('Makes 1 picture. Uses 1 art.')).toBeTruthy()
    expect(screen.queryByText(/paid image call/)).toBeNull()
  })
})
