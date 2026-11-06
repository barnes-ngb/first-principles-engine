import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StonebridgeQuickLinks from './StonebridgeQuickLinks'

describe('compact useful-work disclosure', () => {
  it('starts compact, controls a real hidden panel, exposes native doors and delegates their existing actions', () => {
    const select = vi.fn()
    render(<StonebridgeQuickLinks isLincoln scopeKey="family/a/epoch1" links={[
      { label: 'My Books', onSelect: select }, { label: 'Today', onSelect: vi.fn() }, { label: 'My armor', onSelect: vi.fn() },
    ]} />)
    const toggle = screen.getByRole('button', { name: 'Quick links' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(panel).toHaveAttribute('hidden')
    expect(screen.queryByRole('button', { name: 'My Books' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(panel).not.toHaveAttribute('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    expect(select).toHaveBeenCalledTimes(1)
    fireEvent.click(toggle)
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('resets on child/profile/epoch movement, even when the same child returns', () => {
    const links = [{ label: 'My Books', onSelect: vi.fn() }]
    const { rerender } = render(<StonebridgeQuickLinks isLincoln scopeKey="family/a/parent/epoch1" links={links} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quick links' }))
    rerender(<StonebridgeQuickLinks isLincoln scopeKey="family/a/kid/epoch2" links={links} />)
    expect(screen.getByRole('button', { name: 'Quick links' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'My Books' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quick links' }))
    rerender(<StonebridgeQuickLinks isLincoln scopeKey="family/a/parent/epoch3" links={links} />)
    expect(screen.getByRole('button', { name: 'Quick links' })).toHaveAttribute('aria-expanded', 'false')
  })
})
