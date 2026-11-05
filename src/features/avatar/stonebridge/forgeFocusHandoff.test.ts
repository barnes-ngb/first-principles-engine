import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import {
  FORGE_HOST_PATH,
  clearForgeFocusRequest,
  consumeForgeFocus,
  requestForgeFocus,
} from './forgeFocusHandoff'
import {
  FORGE_GALLERY_ANCHOR_ID,
  focusForgeGallery,
} from './stonebridgeDestinations'
import {
  getLibraryIdentityEpoch,
  observeLibraryReturnIdentity,
} from './libraryReturnFlow'

/**
 * The town page's armor door, as a rule rather than as a screen.
 *
 * What makes it safe is invisible in a screenshot: that the request belongs to
 * one child, that it dies with an identity movement, that it is spent on the
 * first ask, and that the thing it finally does is the SAME scroll-and-focus the
 * Hero Hub's own Forge visit does — a scroll with no focus being the defect
 * `FIX-267` exists for.
 *
 * The journey over a real router is in `stonebridgeTown.route.test.tsx`; the
 * hub's half of the hand-off is wiring in `MyAvatarPage`, read here as source for
 * the reason the rest of that page's facts are: a 1,900-line host with Three.js
 * behind it would make this a suite about mocking.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const AVATAR_PAGE = 'src/features/avatar/MyAvatarPage.tsx'

const FAM = 'fam-1'
const LINCOLN = 'lincoln'
const LONDON = 'london'

/** Request against the epoch the module has actually observed. */
function request(scope: { familyId?: string; childId?: string } = {}) {
  return requestForgeFocus({
    familyId: FAM,
    childId: LINCOLN,
    ...scope,
    epoch: getLibraryIdentityEpoch(),
  })
}

beforeEach(() => {
  setActiveChildIdShared(LINCOLN)
  // A settled identity, so the movements below are movements.
  observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
  clearForgeFocusRequest()
})

afterEach(() => {
  clearForgeFocusRequest()
})

describe('the armor door has one destination, and it is a real one', () => {
  it('is the hub, which is where the gallery actually is', () => {
    expect(FORGE_HOST_PATH).toBe('/avatar')
    // Not an invented route, and not a hash.
    expect(FORGE_HOST_PATH).not.toContain('forge')
    expect(FORGE_HOST_PATH).not.toContain('#')
  })

  it('the hub consumes the request and performs the existing jump', () => {
    const source = read(AVATAR_PAGE)
    expect(source).toContain('consumeForgeFocus({ familyId, childId })')
    // The SAME helper the in-page Forge visit uses — one definition of the
    // reduced-motion scroll and the focus, not a second one for arrivals.
    expect(source).toContain('focusForgeGallery()')
    // And it waits for the anchor to exist rather than for a timer: a jump into
    // a page that has not rendered is the no-op this guards against.
    expect(source).toContain('document.getElementById(FORGE_GALLERY_ANCHOR_ID)')
    // Still exactly one gallery and one anchor on the hub.
    expect(source.match(/<ArmorPieceGallery/g)).toHaveLength(1)
    expect(source.match(/id=\{FORGE_GALLERY_ANCHOR_ID\}/g)).toHaveLength(1)
    // And no child is selected on arrival.
    expect(source).not.toMatch(/setActiveChild/)
  })
})

describe('whose request it is', () => {
  it('is served for the child it was made for', () => {
    expect(request()).toBe(true)
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(true)
  })

  it('is never served for the brother', () => {
    request()
    expect(consumeForgeFocus({ familyId: FAM, childId: LONDON })).toBe(false)
  })

  it('or for another family holding the same child id', () => {
    request()
    expect(consumeForgeFocus({ familyId: 'fam-2', childId: LINCOLN })).toBe(false)
  })

  it('and is refused outright for an unsettled scope, either side', () => {
    expect(request({ childId: '' })).toBe(false)
    expect(request({ familyId: '' })).toBe(false)
    request()
    expect(consumeForgeFocus({ familyId: FAM, childId: '' })).toBe(false)
  })

  it('is spent on the first ask, whatever the answer', () => {
    request()
    expect(consumeForgeFocus({ familyId: FAM, childId: LONDON })).toBe(false)
    // Refused and GONE: it cannot sit there waiting for the right page to
    // arrive and scroll it later.
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(false)
  })

  it('and a served one is not served twice', () => {
    request()
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(true)
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(false)
  })

  it('with nothing in hand, nothing is served', () => {
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(false)
  })
})

describe('an identity movement between the tap and the arrival', () => {
  it('refuses a request made before a child switch', () => {
    request()
    setActiveChildIdShared(LONDON)
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(false)
  })

  it('and one made before a same-tick A → B → A, with the id restored', () => {
    // The scope string comes back to Lincoln, so comparing ids would accept it.
    request()
    setActiveChildIdShared(LONDON)
    setActiveChildIdShared(LINCOLN)
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(false)
  })

  it('and one made before a logout, even with the same account back', () => {
    request()
    observeLibraryReturnIdentity('')
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(false)
  })

  it('but a request made AFTER the movement is a perfectly good one', () => {
    // The positive control: what expires is the request, not the door.
    request()
    setActiveChildIdShared(LONDON)
    setActiveChildIdShared(LINCOLN)
    clearForgeFocusRequest()
    request()
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(true)
  })
})

describe('what the hub does once it has accepted one', () => {
  it('scrolls to the real anchor and leaves the keyboard ON it', () => {
    const gallery = document.createElement('div')
    gallery.id = FORGE_GALLERY_ANCHOR_ID
    gallery.tabIndex = -1
    document.body.appendChild(gallery)
    try {
      request()
      expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(true)
      expect(focusForgeGallery(document, window)).toBe(true)
      // A hash scroll alone would leave the focus where it was.
      expect(document.activeElement).toBe(gallery)
      expect(gallery.isConnected).toBe(true)
      expect(gallery.closest('[aria-hidden="true"]')).toBeNull()
    } finally {
      gallery.remove()
    }
  })

  it('and reports honestly when the page has no gallery to move to', () => {
    // A parent profile, or a section error boundary standing in for it: the
    // request is spent and the jump says it moved nothing, rather than a no-op
    // reported as success.
    expect(document.getElementById(FORGE_GALLERY_ANCHOR_ID)).toBeNull()
    request()
    expect(consumeForgeFocus({ familyId: FAM, childId: LINCOLN })).toBe(true)
    expect(focusForgeGallery(document, window)).toBe(false)
  })
})
