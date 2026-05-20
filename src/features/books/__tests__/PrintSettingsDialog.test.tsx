import { render, screen } from '@testing-library/react'
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
