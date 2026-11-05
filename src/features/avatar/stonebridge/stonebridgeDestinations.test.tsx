import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import BookshelfPage from '../../books/BookshelfPage'
import MyAvatarPage from '../MyAvatarPage'
import StonebridgePage from './StonebridgePage'
import TodayPage from '../../today/TodayPage'
import { routes } from '../../../app/router'
import { VillageLocationState } from './computeStonebridgeProgress'
import { STONEBRIDGE_MISSIONS, getMission } from './missions'
import { FORGE_HOST_PATH } from './forgeFocusHandoff'
import {
  FORGE_GALLERY_ANCHOR_ID,
  LIBRARY_MISSION_ID,
  STONEBRIDGE_BOOKS_PATH,
  STONEBRIDGE_TODAY_PATH,
  STONEBRIDGE_TOWN_PATH,
  focusForgeGallery,
  offersBooksDoor,
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

/**
 * The same file with its comments removed — the CODE, for any claim about what a
 * module imports, renders or calls.
 *
 * A structural claim asked of the raw text is answered by the prose that
 * explains the structure, which is how the first draft of the block below
 * reported "the page renders the mission card" against the sentence saying it
 * deliberately does not.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

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
    expect(source).toContain('navigate(STONEBRIDGE_BOOKS_PATH)')
    // The whole page, not just this call site: the active child is READ here
    // (`useActiveChild`) and changed only by the app bar's chip (UX-425).
    // The Library return flow does not weaken this — it compares the child it
    // was given and never writes one.
    expect(source).not.toMatch(/setActiveChild/)
  })

  it('and the one other thing it does on the way is the temporary return note', () => {
    // The destination is unchanged; what is added is in-memory only. Read as
    // source for the same reason the rest of this suite is: mounting a
    // 1,900-line host with Three.js behind it would make this a suite about
    // mocking. The note's BEHAVIOUR — scope, epoch, expiry — is asserted
    // against the real module in `libraryReturnFlow.test.ts` and through a real
    // router in `libraryReturn.route.test.tsx`; this is only the wiring.
    const source = read(AVATAR_PAGE)
    expect(source).toContain('onOpenBooks={(fromMissionId, observedEpoch) => {')
    // The epoch observed at the tap is forwarded, not re-read here: re-reading
    // it would defeat the boundary it exists to guard.
    expect(source).toMatch(/beginLibraryReturnFlow\(\{[^}]*observedEpoch,/)
    // One call site for the Books destination, so there is no second place that
    // could navigate without the note or leave a note without navigating.
    expect(source.match(/STONEBRIDGE_BOOKS_PATH/g)).toHaveLength(2) // the import + the one call
    expect(source.match(/beginLibraryReturnFlow/g)).toHaveLength(2)
  })
})

describe('the canonical town route is the page the app really mounts', () => {
  /**
   * Read from the app's own table for the same reason the shelf is: "the nav
   * entry opens the village" is a claim about which component the app mounts for
   * `/stonebridge`, and a test that mounted its own route with a stub would pass
   * against a path the app does not have.
   */
  it('mounts StonebridgePage at the canonical path', () => {
    const route = findRoute(routes as readonly RouteNode[], STONEBRIDGE_TOWN_PATH)
    expect(route, `${STONEBRIDGE_TOWN_PATH} is not in the app's route table`).toBeDefined()
    const element = route?.element as { type?: unknown } | undefined
    expect(element?.type).toBe(StonebridgePage)
  })

  it('is not behind the parent-only guard — a kid reaching the village is the point', () => {
    const parentOnly = (routes as readonly RouteNode[])
      .flatMap((node) => node.children ?? [])
      .filter((node) => !node.path && node.children)
      .flatMap((node) => node.children ?? [])
      .map((node) => node.path)
    expect(parentOnly).not.toContain(STONEBRIDGE_TOWN_PATH)
  })

  it('leaves the legacy hub, its aliases and Today exactly where they were', () => {
    // The additive claim, asserted rather than remembered: the new page is a
    // second door. `/avatar` still mounts the real hub (armor, customizer,
    // ceremonies and its own village board), `/hero` and `/armor` still land
    // there, and Today is untouched.
    const hub = findRoute(routes as readonly RouteNode[], FORGE_HOST_PATH)
    expect((hub?.element as { type?: unknown } | undefined)?.type).toBe(MyAvatarPage)
    for (const alias of ['/hero', '/armor']) {
      const node = findRoute(routes as readonly RouteNode[], alias)
      expect(node, `${alias} is no longer routed`).toBeDefined()
      expect(
        (node?.element as { props?: { to?: string } } | undefined)?.props?.to,
        `${alias} no longer redirects to the hub`,
      ).toBe(FORGE_HOST_PATH)
    }
    const today = findRoute(routes as readonly RouteNode[], STONEBRIDGE_TODAY_PATH)
    expect((today?.element as { type?: unknown } | undefined)?.type).toBe(TodayPage)
  })

  it('and the page’s own doors are the paths it names', () => {
    // One definition for each destination the town page offers, so the page and
    // the route table cannot drift.
    const source = read('src/features/avatar/stonebridge/StonebridgePage.tsx')
    expect(source).toContain('navigate(STONEBRIDGE_BOOKS_PATH)')
    expect(source).toContain('navigate(STONEBRIDGE_TODAY_PATH)')
    expect(source).toContain('navigate(FORGE_HOST_PATH)')
    // And it never selects a child.
    expect(source).not.toMatch(/setActiveChild/)
  })

  /**
   * "One progress owner, one gallery, no 3D" — asked of what the module USES,
   * not of what it says.
   *
   * The first version of this block matched the raw file for
   * `StonebridgeMissionCard` and failed on the sentence in the page's own header
   * explaining that it deliberately does not render one — a guard that reads
   * prose reports a defect for an explanation, and the fix for that is never to
   * delete the explanation. So the oracle is the module's import list and its
   * rendered elements, taken from the source with comments removed: what a file
   * imports and what it puts on screen is what it does.
   *
   * The behavioural half is where it belongs — `stonebridgeTown.route.test.tsx`
   * renders the real page and asserts the card's own control (*🏰 Open
   * Stonebridge*) is nowhere on it.
   */
  describe('what the town page actually imports and renders', () => {
    const PAGE = 'src/features/avatar/stonebridge/StonebridgePage.tsx'

    /** Module specifiers this file imports from. */
    const imports = (code: string): string[] =>
      [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

    /** Component names this file renders as JSX. */
    const rendered = (code: string): string[] =>
      [...code.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1])

    it('does not import or render the mission card — one hook owner per journey', () => {
      const code = readCode(PAGE)
      // The page owns the read itself…
      expect(imports(code)).toContain('./useStonebridgeProgress')
      expect(code).toContain('useStonebridgeProgress(familyId, childId)')
      // …and the card, which would read it a second time, is neither imported
      // nor rendered.
      expect(imports(code).filter((s) => /StonebridgeMissionCard/.test(s))).toEqual([])
      expect(rendered(code)).not.toContain('StonebridgeMissionCard')
      // It renders the shared board directly instead.
      expect(rendered(code)).toContain('StonebridgeVillage')
    })

    it('does not import or render the hub’s 3D character or its gallery', () => {
      const code = readCode(PAGE)
      for (const forbidden of ['VoxelCharacter', 'AvatarCharacterDisplay', 'ArmorPieceGallery']) {
        expect(
          rendered(code),
          `the town page renders ${forbidden}`,
        ).not.toContain(forbidden)
        expect(
          imports(code).filter((s) => s.includes(forbidden)),
          `the town page imports ${forbidden}`,
        ).toEqual([])
      }
      expect(imports(code)).not.toContain('three')
      // The anchor id belongs to the hub's one gallery; the page points at the
      // hub's PATH and never at a copy of its anchor.
      expect(code).not.toContain('FORGE_GALLERY_ANCHOR_ID')
      // No invented armor route either.
      expect(code).not.toMatch(/['"]\/forge['"]/)
    })
  })
})

describe('the Books door is offered where the place means it', () => {
  it('on whichever location is being repaired now — unchanged', () => {
    for (const mission of STONEBRIDGE_MISSIONS) {
      expect(offersBooksDoor(mission.id, VillageLocationState.Active)).toBe(true)
    }
  })

  it('and on the repaired Library Hut, which IS the books place', () => {
    expect(offersBooksDoor(LIBRARY_MISSION_ID, VillageLocationState.Repaired)).toBe(true)
    // The id is the Bible's library location, not a name typed twice.
    expect(getMission(LIBRARY_MISSION_ID)?.locationName).toBe('The Library Hut')
  })

  it('on no other repaired location, and on nothing not started yet', () => {
    for (const mission of STONEBRIDGE_MISSIONS) {
      if (mission.id !== LIBRARY_MISSION_ID) {
        expect(offersBooksDoor(mission.id, VillageLocationState.Repaired)).toBe(false)
      }
      expect(offersBooksDoor(mission.id, VillageLocationState.Upcoming)).toBe(false)
    }
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
