import { describe, expect, it } from 'vitest'

import type { Sticker } from '../../core/types'
import { ARCADE_ART_SIZES, ArcadeArtFailure } from './arcadeArt'
import {
  arcadeArtFailureMessage,
  arcadeArtFileName,
  arcadeArtLoadFailureMessage,
  arcadeArtSessionKey,
  arcadeArtSource,
  ArcadeArtLoadFailure,
  ARCADE_ART_DOOR_LABEL,
  ARCADE_ART_INSTRUCTIONS,
  ARCADE_ART_INTRO,
  ARCADE_ART_PALETTE_NOTE,
  arcadeArtDownloadNote,
  type ArcadeArtSource,
} from './arcadeArtSession'
import { savedStickerEditSource } from './savedStickerEditSession'

/** A themed version in a known look. */
const version: Sticker = {
  id: 'v-comic',
  url: 'https://example.test/comic.png',
  storagePath: 'families/f1/stickers/comic.png',
  label: 'Wolf',
  category: 'custom',
  theme: 'comic',
  sourceDrawingId: 'g1',
  createdAt: '2026-10-01',
}

/** The group's cleaned original — the child's own drawing, in no AI look. */
const original: Sticker = {
  ...version,
  id: 'orig',
  url: 'https://example.test/orig.png',
  storagePath: 'families/f1/stickers/orig.png',
  theme: undefined,
  isOriginal: true,
}

/** A standalone legacy sticker with no look and no group. */
const legacy: Sticker = {
  id: 'legacy',
  url: 'https://example.test/legacy.png',
  storagePath: 'families/f1/stickers/legacy.png',
  label: 'Dino bones!',
  category: 'custom',
  createdAt: '2026-05-01',
}

const source = (sticker: Sticker): ArcadeArtSource => {
  const result = arcadeArtSource(sticker)
  if (!result) throw new Error('expected an eligible source')
  return result
}

describe('which pictures this door opens on', () => {
  it('opens on a themed version', () => {
    expect(arcadeArtSource(version)).toEqual({
      id: 'v-comic',
      url: version.url,
      storagePath: version.storagePath,
      label: 'Wolf',
    })
  })

  /**
   * The one rule that must NOT be inherited from the saved-version editor.
   *
   * `savedStickerEditSource` refuses the group original and refuses a picture
   * with no known look, because its job is to redraw a look that already exists
   * in the pixels. Converting pixels to game art has no such premise, and a
   * child's own cleaned drawing is exactly the picture they want as a sprite —
   * so both are asserted here IN CONTRAST, not merely allowed.
   */
  it('opens on the group ORIGINAL, which the saved-version editor refuses', () => {
    expect(savedStickerEditSource(original)).toBeNull()
    expect(arcadeArtSource(original)?.id).toBe('orig')
  })

  it('opens on a look-less legacy sticker, which the saved-version editor refuses', () => {
    expect(savedStickerEditSource(legacy)).toBeNull()
    expect(arcadeArtSource(legacy)?.id).toBe('legacy')
  })

  it('refuses a row with nothing to read', () => {
    expect(arcadeArtSource(null)).toBeNull()
    expect(arcadeArtSource(undefined)).toBeNull()
    expect(arcadeArtSource({ ...version, id: undefined })).toBeNull()
    expect(arcadeArtSource({ ...version, url: '  ' })).toBeNull()
    expect(arcadeArtSource({ ...version, storagePath: '' })).toBeNull()
  })

  it('carries an empty label rather than inventing one', () => {
    expect(arcadeArtSource({ ...version, label: '' })?.label).toBe('')
  })
})

describe('the session identity', () => {
  const base = { contextKey: 'f1|parents|child-1', familyId: 'f1', nonce: 0 }

  it('is stable for the same picture, context and opening', () => {
    expect(arcadeArtSessionKey({ ...base, source: source(version) })).toBe(
      arcadeArtSessionKey({ ...base, source: source(version) }),
    )
  })

  it('changes when the actor context changes', () => {
    expect(
      arcadeArtSessionKey({ ...base, contextKey: 'f1|lincoln|child-2', source: source(version) }),
    ).not.toBe(arcadeArtSessionKey({ ...base, source: source(version) }))
  })

  it('changes when the family changes', () => {
    expect(
      arcadeArtSessionKey({ ...base, familyId: 'f2', source: source(version) }),
    ).not.toBe(arcadeArtSessionKey({ ...base, source: source(version) }))
  })

  it('changes when the SAME id is pointed at different bytes', () => {
    // The case a document id alone cannot see: the row kept its id and the
    // picture behind it is a different picture.
    const movedUrl = source({ ...version, url: 'https://example.test/other.png' })
    const movedPath = source({ ...version, storagePath: 'families/f1/stickers/other.png' })
    const key = arcadeArtSessionKey({ ...base, source: source(version) })
    expect(arcadeArtSessionKey({ ...base, source: movedUrl })).not.toBe(key)
    expect(arcadeArtSessionKey({ ...base, source: movedPath })).not.toBe(key)
  })

  it('changes on a close-and-reopen of the identical picture', () => {
    // Without this, React reuses the body and the second opening inherits the
    // first one's grid, error and "Copied" receipt.
    expect(arcadeArtSessionKey({ ...base, nonce: 1, source: source(version) })).not.toBe(
      arcadeArtSessionKey({ ...base, nonce: 0, source: source(version) }),
    )
  })

  it('does NOT change when only the label changes', () => {
    // A rename moves no pixel, and throwing away a converted grid over it would
    // be a loss with nothing behind it.
    expect(
      arcadeArtSessionKey({ ...base, source: source({ ...version, label: 'Fox' }) }),
    ).toBe(arcadeArtSessionKey({ ...base, source: source(version) }))
  })

  it('cannot be collided by a value containing the separator', () => {
    expect(
      arcadeArtSessionKey({ ...base, contextKey: 'f1', source: source({ ...version, id: '"|parents|child-1"' }) }),
    ).not.toBe(
      arcadeArtSessionKey({ ...base, contextKey: 'f1|parents|child-1', source: source(version) }),
    )
  })
})

describe('what a person is told when it fails', () => {
  it('has a sentence for every conversion refusal, at both sizes', () => {
    for (const size of ARCADE_ART_SIZES) {
      for (const reason of Object.values(ArcadeArtFailure)) {
        const message = arcadeArtFailureMessage(reason, size)
        expect(message.length, `${reason} @ ${size}`).toBeGreaterThan(20)
        expect(message.trim().endsWith('.'), `${reason} @ ${size}`).toBe(true)
      }
    }
  })

  it('has a sentence for every load failure except the cancelled one', () => {
    for (const reason of Object.values(ArcadeArtLoadFailure)) {
      const message = arcadeArtLoadFailureMessage(reason)
      if (reason === ArcadeArtLoadFailure.Cancelled) {
        // A cancelled load is a session that is gone: it reports nothing.
        expect(message).toBe('')
        continue
      }
      expect(message.length, reason).toBeGreaterThan(20)
      expect(message.trim().endsWith('.'), reason).toBe(true)
    }
  })

  /**
   * The rail the whole loader exists for: `imageDataUri.fetchAsDataUri` logs the
   * storage path and a URL prefix, and nothing this feature shows may do the
   * same. A failure sentence is the one place an address could leak into view.
   */
  it('names no URL, no storage path and no bucket in any message', () => {
    // Explicit arrows, not bare references: `map` passes the INDEX as the
    // second argument, which `arcadeArtFailureMessage` reads as the size.
    const everything = [
      ...ARCADE_ART_SIZES.flatMap((size) =>
        Object.values(ArcadeArtFailure).map((r) => arcadeArtFailureMessage(r, size)),
      ),
      ...Object.values(ArcadeArtLoadFailure).map((r) => arcadeArtLoadFailureMessage(r)),
      ARCADE_ART_INTRO,
      ARCADE_ART_PALETTE_NOTE,
      ...ARCADE_ART_INSTRUCTIONS,
    ].join('\n')
    expect(everything).not.toMatch(/https?:\/\/(?!arcade\.makecode\.com)/)
    expect(everything).not.toMatch(/families\//)
    expect(everything).not.toMatch(/firebasestorage|googleapis|appspot/)
  })

  it('says the empty result is about the picture, and what to try instead', () => {
    // The one refusal that is about the art rather than the machinery, so it is
    // the one that owes a next step.
    expect(arcadeArtFailureMessage(ArcadeArtFailure.EmptyResult, 16)).toMatch(/32 × 32/)
  })

  it('does NOT tell somebody at 32 to try 32', () => {
    // Advice that cannot work: there is no bigger size, so the honest next step
    // is about the picture rather than about the grid.
    const at32 = arcadeArtFailureMessage(ArcadeArtFailure.EmptyResult, 32)
    expect(at32).not.toMatch(/Try 32/)
    expect(at32).toMatch(/thicker lines|stronger colours/)
  })

  it('still answers a whole sentence when no size is given', () => {
    const bare = arcadeArtFailureMessage(ArcadeArtFailure.EmptyResult)
    expect(bare.trim().endsWith('.')).toBe(true)
    expect(bare.length).toBeGreaterThan(20)
  })
})

describe('the instructions', () => {
  it('tell a person to REPLACE a literal, in the JavaScript view', () => {
    const steps = ARCADE_ART_INSTRUCTIONS.join(' ')
    // An image literal is an expression: on its own at the top level it is
    // valid JavaScript that nothing uses, so it compiles and draws no sprite —
    // which is why "replace" has to be the verb rather than "paste".
    expect(steps).toMatch(/JavaScript/)
    expect(steps).toMatch(/replace/i)
    expect(steps).toMatch(/paste this over it/i)
    expect(steps).toMatch(/img/)
  })

  it('say the colours are the DEFAULT palette, and what a custom one does', () => {
    // Fifteen a cell can be drawn in, plus the see-through index — counting
    // transparent as a sixteenth colour would be one more than exist.
    expect(ARCADE_ART_PALETTE_NOTE).toMatch(/15 colours/)
    expect(ARCADE_ART_PALETTE_NOTE).toMatch(/see-through/)
    expect(ARCADE_ART_PALETTE_NOTE).toMatch(/default palette/)
    expect(ARCADE_ART_PALETTE_NOTE).toMatch(/own palette/)
  })

  it('name the door the same way the title does', () => {
    expect(ARCADE_ART_DOOR_LABEL).toBe('Make game art')
  })

  it('say the saved picture is not changed', () => {
    expect(ARCADE_ART_INTRO).toMatch(/not changed/)
  })

  it('say the PNG is the sprite size, not the zoomed size', () => {
    for (const size of ARCADE_ART_SIZES) {
      expect(arcadeArtDownloadNote(size)).toContain(`${size} × ${size} pixels`)
    }
    expect(arcadeArtDownloadNote(16)).not.toContain('32')
  })
})

describe('the file name', () => {
  it('carries the size, so a 16 and a 32 are two files', () => {
    expect(arcadeArtFileName('Wolf', 16, 'png')).toBe('wolf-arcade-16x16.png')
    expect(arcadeArtFileName('Wolf', 32, 'png')).toBe('wolf-arcade-32x32.png')
  })

  it('reduces a typed label to plain characters', () => {
    expect(arcadeArtFileName('Dino bones!', 16, 'txt')).toBe('dino-bones-arcade-16x16.txt')
    expect(arcadeArtFileName('  Rex / Max  ', 16, 'png')).toBe('rex-max-arcade-16x16.png')
  })

  it('falls back rather than producing a nameless file', () => {
    expect(arcadeArtFileName('', 16, 'png')).toBe('sticker-arcade-16x16.png')
    expect(arcadeArtFileName('!!!', 16, 'png')).toBe('sticker-arcade-16x16.png')
  })

  it('bounds a very long label', () => {
    const name = arcadeArtFileName('a'.repeat(500), 32, 'png')
    expect(name).toBe(`${'a'.repeat(48)}-arcade-32x32.png`)
  })
})
