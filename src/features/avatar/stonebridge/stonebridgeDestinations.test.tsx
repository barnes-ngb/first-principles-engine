import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import BookshelfPage from '../../books/BookshelfPage'
import { routes } from '../../../app/router'
import {
  FORGE_GALLERY_ANCHOR_ID,
  STONEBRIDGE_BOOKS_PATH,
  focusForgeGallery,
} from './stonebridgeDestinations'

/**
 * The two destinations a Stonebridge visit offers, traced to the real things.
 *
 * ── Why the route table, and not a rendered screen ───────────────────────────
 *
 * "Open My Books reaches the shelf" is a claim about **which component the app
 * mounts for `/books`**. A test that rendered its own `<Route path="/books">`
 * with a stub would prove the opposite of what it claimed — it would pass
 * against a path the app does not have, which is exactly the failure mode the
 * planner-boundary suite (`UX-269`) exists to catch. So this reads the app's
 * exported route table and checks the element at that path IS
 * `BookshelfPage`, the same import `src/app/router.tsx` mounts.
 *
 * ── And why the page's wiring is read as source ──────────────────────────────
 *
 * `MyAvatarPage` is a 1,900-line host with Three.js and a Firestore profile
 * behind it; mounting it would make this a suite about mocking. The two facts
 * that matter are small, literal and local to one call site: the Books
 * destination is `navigate(STONEBRIDGE_BOOKS_PATH)` and **nothing else**, and
 * the page contains no active-child write at all. Both are read from the file
 * that renders them, the `kidLockWording` precedent.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const AVATAR_PAGE = 'src/features/avatar/MyAvatarPage.tsx'

interface RouteNode {
  path?: string
  element?: unknown
  children?: RouteNode[]
}

function findRoute(nodes: readonly RouteNode[], path: string): RouteNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node
    const inChildren = node.children ? findRoute(node.children, path) : undefined
    if (inChildren) return inChildren
  }
  return undefined
}

describe('Open My Books lands on the app’s real bookshelf', () => {
  it('is a path in the route table, mounting the actual BookshelfPage', () => {
    const route = findRoute(routes as readonly RouteNode[], STONEBRIDGE_BOOKS_PATH)
    expect(route, `${STONEBRIDGE_BOOKS_PATH} is not in the app's route table`).toBeDefined()
    // The element the app mounts there, by component identity.
    const element = route?.element as { type?: unknown } | undefined
    expect(element?.type).toBe(BookshelfPage)
  })

  it('is NOT behind the parent-only guard, and is not a reader deep link', () => {
    // A child reaching the shelf is the whole point; and the destination is the
    // shelf, never a particular book's reader — which book, or whether to read
    // at all, is the shelf's choice.
    const parentOnly = (routes as readonly RouteNode[])
      .flatMap((node) => node.children ?? [])
      .filter((node) => !node.path && node.children)
      .flatMap((node) => node.children ?? [])
      .map((node) => node.path)
    expect(parentOnly).not.toContain(STONEBRIDGE_BOOKS_PATH)
    expect(STONEBRIDGE_BOOKS_PATH).not.toMatch(/:bookId|\/read/)
  })

  it('the page navigates there and sets no active child', () => {
    const source = read(AVATAR_PAGE)
    expect(source).toContain('onOpenBooks={() => navigate(STONEBRIDGE_BOOKS_PATH)}')
    // The whole page, not just this call site: the active child is READ here
    // (`useActiveChild`) and changed only by the app bar's chip (UX-425).
    expect(source).not.toMatch(/setActiveChild/)
  })
})

describe('the Forge visit reaches the one real armor gallery', () => {
  it('the page wraps the gallery in the anchor, focusable but not a tab stop', () => {
    const source = read(AVATAR_PAGE)
    expect(source).toContain('id={FORGE_GALLERY_ANCHOR_ID}')
    expect(source).toContain('tabIndex={-1}')
    expect(source).toContain('onVisitForge={() => focusForgeGallery()}')
    // One gallery, one anchor — no second copy of forge state anywhere.
    expect(source.match(/<ArmorPieceGallery/g)).toHaveLength(1)
    expect(source.match(/id=\{FORGE_GALLERY_ANCHOR_ID\}/g)).toHaveLength(1)
  })

  it('scrolls to it and leaves the keyboard focus ON it', () => {
    const gallery = document.createElement('div')
    gallery.id = FORGE_GALLERY_ANCHOR_ID
    gallery.tabIndex = -1
    const scrollIntoView = vi.fn()
    gallery.scrollIntoView = scrollIntoView
    document.body.appendChild(gallery)

    try {
      expect(focusForgeGallery(document, window)).toBe(true)
      // Visible and reachable: in the document, not hidden behind a modal's
      // `aria-hidden`, and holding the focus.
      expect(gallery.isConnected).toBe(true)
      expect(gallery.closest('[aria-hidden="true"]')).toBeNull()
      expect(document.activeElement).toBe(gallery)
      // `focus()` scrolls on its own, so the scroll must not be undone by it.
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    } finally {
      gallery.remove()
    }
  })

  it('honours a reduced-motion preference with an instant scroll', () => {
    const gallery = document.createElement('div')
    gallery.id = FORGE_GALLERY_ANCHOR_ID
    gallery.tabIndex = -1
    const scrollIntoView = vi.fn()
    gallery.scrollIntoView = scrollIntoView
    document.body.appendChild(gallery)
    const reducedView = {
      matchMedia: (q: string) => ({ matches: q.includes('prefers-reduced-motion') }),
    } as unknown as Window

    try {
      expect(focusForgeGallery(document, reducedView)).toBe(true)
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
      expect(document.activeElement).toBe(gallery)
    } finally {
      gallery.remove()
    }
  })

  it('reports honestly when the gallery is not on the page', () => {
    // A parent profile, or an error boundary standing in for the gallery: a
    // no-op is not reported as a move.
    expect(document.getElementById(FORGE_GALLERY_ANCHOR_ID)).toBeNull()
    expect(focusForgeGallery(document, window)).toBe(false)
  })
})
