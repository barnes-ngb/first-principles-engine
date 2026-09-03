import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrintSettingsDialog from '../PrintSettingsDialog'

describe('PrintSettingsDialog sight word options', () => {
  it('shows an explicit Off option and helper caption', () => {
    render(
      <PrintSettingsDialog
        open
        onClose={vi.fn()}
        onPrint={vi.fn()}
        hasSightWords
      />,
    )

    expect(screen.getByText('Sight word highlighting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument()
    expect(screen.getByText('Off prints normal text with no highlight or bold.')).toBeInTheDocument()
  })
})

describe('PrintSettingsDialog booklet help (FEAT-185)', () => {
  it('describes a saddle-stitched book — duplex flip, fold the stack, staple at the fold, cut on the line', () => {
    render(
      <PrintSettingsDialog
        open
        onClose={vi.fn()}
        onPrint={vi.fn()}
        hasSightWords={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Booklet (fold & staple)' }))
    const help = screen.getByText(/fold-in-half book/i)
    expect(help.textContent).toMatch(/5\.5 x 7/)
    expect(help.textContent).toMatch(/flip on the short edge/i)
    expect(help.textContent).toMatch(/fold the whole stack/i)
    expect(help.textContent).toMatch(/staple at the fold/i)
    expect(help.textContent).toMatch(/cut along the dashed line/i)
    // The old copy described stapling the edge of individually folded sheets —
    // a binding that does not produce a book.
    expect(screen.queryByText(/Fold each sheet in half/)).not.toBeInTheDocument()
  })
})
