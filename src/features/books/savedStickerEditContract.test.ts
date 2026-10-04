import { describe, expect, it, vi } from 'vitest'

import { FANCY_STYLE_OPTIONS, resolveFancyEnhanceParams } from './drawingStickerStyles'
import { generateStickerVersion } from './generateStickerVersion'
import {
  SAVED_STICKER_LOOKS,
  savedStickerLook,
} from '../../../functions/src/shared/savedStickerEdit'
import type { Sticker } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'

/**
 * The server's look table, pinned against the picker that actually saved them
 * (SAVED-STICKER-EDIT-CONTRACT-002).
 *
 * Editing a saved picture has to redraw it in the look it is already in, and the
 * look a saved version carries is a **picker id** — `Sticker.theme` holds
 * `cartoon` / `fantasy` / `minecraft`, not the `style`/`theme` pair the Cloud
 * Function speaks. `functions/` cannot import the picker (the dependency arrow
 * runs app → functions), so the server keeps its own table and this test is what
 * stops the two drifting: it compiles both sides and fails if the picker gains,
 * loses or re-points a look.
 *
 * The picker itself is untouched by this work — including its fallback, which is
 * right for someone tapping a button and wrong for a redraw of a picture that
 * already exists.
 */

const addDocMock = vi.hoisted(() => vi.fn(async () => ({ id: 'new-id' })))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  stickerLibraryCollection: (familyId: string) => ({ familyId }),
}))

describe('the server look table matches the picker', () => {
  it('names exactly the looks the picker can save', () => {
    expect(Object.keys(SAVED_STICKER_LOOKS).sort()).toEqual(
      FANCY_STYLE_OPTIONS.map((o) => o.id).sort(),
    )
  })

  it.each(FANCY_STYLE_OPTIONS.map((o) => o.id))(
    'resolves %s to the same style/theme the request was made with',
    (id) => {
      const params = resolveFancyEnhanceParams(id)
      const look = savedStickerLook(id)
      expect(look).not.toBeNull()
      expect(look?.style).toBe(params.style)
      expect(look?.theme).toBe(params.theme)
      // Every saved version is a cutout, which is why the edit mode derives
      // `transparent` rather than accepting it.
      expect(params.transparent).toBe(true)
    },
  )

  it('keeps the picker fallback and refuses it on the server', () => {
    // The picker defaults an unknown id to the watercolor look, which is fine for
    // a fresh drawing. On a saved picture it would silently replace the look the
    // picture is in, so the server has no fallback at all.
    expect(resolveFancyEnhanceParams('no-such-look')).toEqual(
      resolveFancyEnhanceParams(FANCY_STYLE_OPTIONS[0].id),
    )
    expect(savedStickerLook('no-such-look')).toBeNull()
    // And the server speaks picker ids, not its own style names.
    expect(savedStickerLook('storybook')).toBeNull()
  })
})

describe('what a saved version records as its look', () => {
  it('is the picker id the server compares against', async () => {
    // The field the server reads is written here, by the flow that makes a
    // version — so `sourceLookId` and the stored `theme` are the same vocabulary.
    const source: Sticker = {
      id: 'src',
      url: 'https://example.com/src.png',
      storagePath: 'families/f/stickers/src.png',
      label: 'Wolf',
      category: StickerCategory.Custom,
      childId: null,
      createdAt: '2026-06-20T00:00:00.000Z',
    }
    const res = await generateStickerVersion({
      familyId: 'f',
      source,
      styleId: 'fantasy',
      sourceDrawingId: 'group-1',
      label: 'Wolf',
      enhanceSketch: vi.fn(async () => ({
        url: 'https://example.com/fancy.png',
        storagePath: 'families/f/sketches/fancy.png',
      })),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.sticker.theme).toBe('fantasy')
    expect(savedStickerLook(res.sticker.theme)).toEqual({ theme: 'fantasy' })
    // And the saved image's own path is what an edit request has to send as its
    // source, which is the other half of what the server checks.
    expect(res.sticker.storagePath).toBe('families/f/sketches/fancy.png')
  })
})
