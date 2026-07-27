import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import RequireParent from '../../components/RequireParent'
import WatchLibraryPage from './WatchLibraryPage'
import { routes } from '../../app/router'

const canEditRef = { current: true }

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ canEdit: canEditRef.current }),
}))
vi.mock('./WatchLibraryTab', () => ({
  default: () => <div data-testid="watch-library-tab">library</div>,
}))

function renderAt(canEdit: boolean) {
  canEditRef.current = canEdit
  return render(
    <MemoryRouter initialEntries={['/watch']}>
      <Routes>
        <Route element={<RequireParent />}>
          <Route path="/watch" element={<WatchLibraryPage />} />
        </Route>
        <Route path="/dashboard" element={<div data-testid="bounced">dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

type RouteNode = { path?: string; element?: unknown; children?: RouteNode[] }

/** Walk the real route table looking for a path inside a RequireParent group. */
function findParentGatedPaths(nodes: RouteNode[], inGuard = false): string[] {
  const found: string[] = []
  for (const node of nodes) {
    const guarded =
      inGuard ||
      (node.element != null &&
        (node.element as { type?: unknown }).type === RequireParent)
    if (guarded && node.path) found.push(node.path)
    if (node.children) found.push(...findParentGatedPaths(node.children, guarded))
  }
  return found
}

/**
 * FEAT-132: `/watch` is the Watch Library's own home. Route-gated as well as
 * component-gated — `WatchLibraryTab` carries its own `canEdit` check, but the
 * route must not even offer the destination to a kid.
 */
describe('WatchLibraryPage — /watch route (FEAT-132)', () => {
  it('renders the library for a parent', () => {
    renderAt(true)
    expect(screen.getByTestId('watch-library-tab')).toBeInTheDocument()
  })

  it('bounces a kid off the route entirely', () => {
    renderAt(false)
    expect(screen.queryByTestId('watch-library-tab')).not.toBeInTheDocument()
    expect(screen.getByTestId('bounced')).toBeInTheDocument()
  })

  it('registers /watch under RequireParent in the real route table', () => {
    expect(findParentGatedPaths(routes as RouteNode[])).toContain('/watch')
  })
})
