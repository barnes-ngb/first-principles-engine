import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUnsavedBookGuard } from '../../books/useUnsavedBookGuard'
import {
  DEPARTURE_LEAVE_LABEL,
  DEPARTURE_STAY_LABEL,
} from '../../books/unsavedBookDeparture'
import { STONEBRIDGE_TOWN_PATH } from './stonebridgeDestinations'

/**
 * The new nav entry is an ORDINARY departure — the editor's existing guard owns
 * it.
 *
 * ── Why this needs asserting at all ──────────────────────────────────────────
 *
 * `UX-473` put one blocker on the route rather than on the editor's four
 * `navigate` calls, precisely so that a door added later — the shell's nav, the
 * browser's Back — is covered without being told about. A new entry is the first
 * real test of that claim, and the way to break it is to reach for something
 * that is not the router: a raw `<a href>` (a full page load, which no blocker
 * can hold), a `window.history.pushState`, or a blocker of its own.
 *
 * So: the real `useUnsavedBookGuard` on a real data router, and the new entry as
 * a router link. Nothing here is Stonebridge-specific except the destination,
 * which is the point — the village entry is not special, and it adds no
 * competing guard.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const fx = vi.hoisted(() => ({ outstanding: true }))

/** Stable identity, so the blocker re-registers only when the answer changes. */
const hasOutstandingEdits = () => fx.outstanding

function Shell() {
  const location = useLocation()
  return (
    <div>
      <span data-testid="where">{location.pathname}</span>
      {/* The shell's nav entry, as the shell renders it: a router link. */}
      <Link to={STONEBRIDGE_TOWN_PATH}>Stonebridge</Link>
      <Outlet />
    </div>
  )
}

/** The editor, reduced to the one thing this file is about: its guard. */
function EditorRoute() {
  const guard = useUnsavedBookGuard({
    saveState: 'saving',
    hasUnsavedEdits: fx.outstanding,
    hasOutstandingEdits,
  })
  return (
    <div>
      <h1>Book editor</h1>
      {guard.held && (
        <div role="dialog" aria-label="Saving your book…">
          <button onClick={guard.stay}>{DEPARTURE_STAY_LABEL}</button>
          <button onClick={guard.leaveAnyway}>{DEPARTURE_LEAVE_LABEL}</button>
        </div>
      )}
    </div>
  )
}

/** A data router: `useBlocker` needs one, and `src/app/router.tsx` builds one. */
function renderEditor() {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: '/books/:bookId', element: <EditorRoute /> },
          { path: STONEBRIDGE_TOWN_PATH, element: <h1>Stonebridge Village</h1> },
        ],
      },
    ],
    { initialEntries: ['/books/book-1'] },
  )
  render(<RouterProvider router={router} />)
  return { router }
}

beforeEach(() => {
  fx.outstanding = true
})

describe('the Stonebridge entry is held by the editor’s own save guard', () => {
  it('holds the departure while an edit is outstanding', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('link', { name: 'Stonebridge' }))

    // Held by the existing blocker: the editor is still on screen, the village
    // was not reached, and the editor's own dialog is what is asking.
    await screen.findByRole('dialog', { name: 'Saving your book…' })
    expect(screen.getByTestId('where')).toHaveTextContent('/books/book-1')
    expect(screen.queryByRole('heading', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
  })

  it('Stay here keeps the editor, with the entry still usable afterwards', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('link', { name: 'Stonebridge' }))
    fireEvent.click(await screen.findByRole('button', { name: DEPARTURE_STAY_LABEL }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Saving your book…' })).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('where')).toHaveTextContent('/books/book-1')
    // Nothing was consumed: asking again asks again.
    fireEvent.click(screen.getByRole('link', { name: 'Stonebridge' }))
    await screen.findByRole('dialog', { name: 'Saving your book…' })
  })

  it('Leave anyway lets the held departure through to the village', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('link', { name: 'Stonebridge' }))
    fireEvent.click(await screen.findByRole('button', { name: DEPARTURE_LEAVE_LABEL }))

    await screen.findByRole('heading', { name: 'Stonebridge Village' })
    expect(screen.getByTestId('where')).toHaveTextContent(STONEBRIDGE_TOWN_PATH)
  })

  it('and with nothing outstanding it is ordinary navigation', async () => {
    // The negative control: the guard is the editor's, not the entry's, so an
    // editor with nothing to save does not hold anything.
    fx.outstanding = false
    renderEditor()
    fireEvent.click(screen.getByRole('link', { name: 'Stonebridge' }))

    await screen.findByRole('heading', { name: 'Stonebridge Village' })
    expect(screen.queryByRole('dialog', { name: 'Saving your book…' })).not.toBeInTheDocument()
  })
})

describe('nothing in this slice goes around the router', () => {
  it('the nav entry and the page use the router, not the browser', () => {
    // A raw `<a href>` is a full page load no blocker can hold, and a direct
    // history write bypasses the data router altogether. Neither appears in the
    // two files this slice adds a door to.
    for (const file of [
      'src/app/AppShell.tsx',
      'src/features/avatar/stonebridge/StonebridgePage.tsx',
    ]) {
      const source = read(file)
      expect(source, file).not.toMatch(/history\.(?:push|replace)State/)
      expect(source, file).not.toMatch(/window\.location\s*=|location\.(?:assign|replace)\(/)
      expect(source, file).not.toMatch(/<a\s+href=/)
      // And no second blocker competing with the editor's one.
      expect(source, file).not.toMatch(/useBlocker|beforeunload/)
    }
  })

  it('the shell renders its entries as router links', () => {
    const source = read('src/app/AppShell.tsx')
    expect(source).toContain('<NavLink')
    expect(source).toContain("to={item.to}")
  })
})
