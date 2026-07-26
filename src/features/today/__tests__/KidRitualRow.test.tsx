import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import KidRitualRow from '../KidRitualRow'

function renderRow(props: Partial<React.ComponentProps<typeof KidRitualRow>> = {}) {
  return render(
    <KidRitualRow
      icon="📖"
      title="Prince Caspian"
      isLincoln={false}
      {...props}
    >
      <p>row body</p>
    </KidRitualRow>,
  )
}

function header(): HTMLElement {
  return screen.getByRole('button')
}

describe('KidRitualRow', () => {
  it('renders the title, subtitle, and body', () => {
    renderRow({ subtitle: "Talk about today's chapter" })

    expect(screen.getByText('Prince Caspian')).toBeInTheDocument()
    expect(screen.getByText("Talk about today's chapter")).toBeInTheDocument()
    expect(screen.getByText('row body')).toBeInTheDocument()
  })

  it('shows the done check when done, and never a checkbox', () => {
    renderRow({ done: true, defaultExpanded: false })

    expect(screen.getByRole('img', { name: 'done' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows no done check when not done', () => {
    renderRow()
    expect(screen.queryByRole('img', { name: 'done' })).not.toBeInTheDocument()
  })

  it('toggles aria-expanded on click', () => {
    renderRow({ defaultExpanded: true })

    expect(header()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles from the keyboard with Enter and Space', () => {
    renderRow({ defaultExpanded: true })

    expect(header()).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(header(), { key: 'Enter' })
    expect(header()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(header(), { key: ' ' })
    expect(header()).toHaveAttribute('aria-expanded', 'true')
  })

  it('ignores other keys', () => {
    renderRow({ defaultExpanded: true })

    fireEvent.keyDown(header(), { key: 'a' })
    fireEvent.keyDown(header(), { key: 'Escape' })
    fireEvent.keyDown(header(), { key: 'ArrowDown' })

    expect(header()).toHaveAttribute('aria-expanded', 'true')
  })

  it('points aria-controls at the body element', () => {
    renderRow()

    const controls = header().getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    const body = document.getElementById(controls!)
    expect(body).not.toBeNull()
    expect(body).toHaveTextContent('row body')
  })

  it('renders the anchor id even while collapsed (deep links survive)', () => {
    const { container } = renderRow({ anchorId: 'chapter', defaultExpanded: false })

    expect(header()).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('#chapter')).not.toBeNull()
  })

  it('follows defaultExpanded until the kid taps, then keeps their choice across re-render', () => {
    const { rerender } = render(
      <KidRitualRow icon="💭" title="A hard choice" isLincoln={false} defaultExpanded={false}>
        <p>row body</p>
      </KidRitualRow>,
    )
    expect(header()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'true')

    // A later render still passing defaultExpanded={false} must not slam it shut.
    rerender(
      <KidRitualRow icon="💭" title="A hard choice" isLincoln={false} defaultExpanded={false}>
        <p>row body</p>
      </KidRitualRow>,
    )
    expect(header()).toHaveAttribute('aria-expanded', 'true')
  })

  it('folds itself away when the caller flips defaultExpanded to false (no manual tap)', () => {
    const { rerender } = render(
      <KidRitualRow icon="📖" title="Prince Caspian" isLincoln={false} defaultExpanded>
        <p>row body</p>
      </KidRitualRow>,
    )
    expect(header()).toHaveAttribute('aria-expanded', 'true')

    rerender(
      <KidRitualRow icon="📖" title="Prince Caspian" isLincoln={false} defaultExpanded={false} done>
        <p>row body</p>
      </KidRitualRow>,
    )
    expect(header()).toHaveAttribute('aria-expanded', 'false')
  })

  it('alwaysOpen renders the body with no button role and ignores clicks and keys', () => {
    const { container } = render(
      <KidRitualRow icon="⛏️" title="Knowledge Mine" subtitle="12 min today" isLincoln={false} alwaysOpen>
        <p>row body</p>
      </KidRitualRow>,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('row body')).toBeInTheDocument()

    const headerRow = container.querySelector('.MuiStack-root')!
    fireEvent.click(headerRow)
    fireEvent.keyDown(headerRow, { key: 'Enter' })

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('row body')).toBeInTheDocument()
  })
})
