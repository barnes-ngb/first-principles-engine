import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import HeroLauncherTiles from '../HeroLauncherTiles'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

function renderTiles(props: { isLincoln?: boolean; hideMine?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <HeroLauncherTiles
        isLincoln={props.isLincoln ?? true}
        hideMine={props.hideMine ?? false}
      />
    </MemoryRouter>,
  )
}

describe('HeroLauncherTiles', () => {
  it('shows all three tiles for Lincoln (Mine, Workshop, Books)', () => {
    renderTiles({ isLincoln: true, hideMine: false })

    expect(screen.getByTestId('hero-launcher-mine')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-workshop')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-books')).toBeInTheDocument()

    expect(screen.getByText('Knowledge Mine')).toBeInTheDocument()
    expect(screen.getByText('Workshop')).toBeInTheDocument()
    expect(screen.getByText('My Books')).toBeInTheDocument()
  })

  it('hides the Knowledge Mine tile for London (hideMine=true)', () => {
    renderTiles({ isLincoln: false, hideMine: true })

    expect(screen.queryByTestId('hero-launcher-mine')).toBeNull()
    expect(screen.getByTestId('hero-launcher-workshop')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-books')).toBeInTheDocument()
  })

  it('routes to /quest when Knowledge Mine tile is tapped', () => {
    navigateMock.mockClear()
    renderTiles({ isLincoln: true })

    fireEvent.click(screen.getByTestId('hero-launcher-mine'))
    expect(navigateMock).toHaveBeenCalledWith('/quest')
  })

  it('routes to /workshop when Workshop tile is tapped', () => {
    navigateMock.mockClear()
    renderTiles({ isLincoln: true })

    fireEvent.click(screen.getByTestId('hero-launcher-workshop'))
    expect(navigateMock).toHaveBeenCalledWith('/workshop')
  })

  it('routes to /books when My Books tile is tapped', () => {
    navigateMock.mockClear()
    renderTiles({ isLincoln: true })

    fireEvent.click(screen.getByTestId('hero-launcher-books'))
    expect(navigateMock).toHaveBeenCalledWith('/books')
  })
})
