import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import SectionCard from './SectionCard'

function Disclosure() {
  const [expanded, onChange] = useState(false)
  return <SectionCard title="Notes" disclosure={{ expanded, onChange, summary: 'Saved context' }}>
    <input aria-label="Draft" defaultValue="" />
  </SectionCard>
}

describe('SectionCard disclosure', () => {
  it('keeps existing cards expanded when no disclosure is supplied', () => {
    render(<SectionCard title="Existing"><button>Save</button></SectionCard>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Existing' })).toBeInTheDocument()
  })

  it('opens from the keyboard and retains an unfinished draft when collapsed', async () => {
    const user = userEvent.setup()
    render(<Disclosure />)
    const toggle = screen.getByRole('button', { name: /Notes/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument()
    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Keep this note' } })
    await user.click(toggle)
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument())
    await user.click(toggle)
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep this note')
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute('aria-labelledby', toggle.id)
  })
})
