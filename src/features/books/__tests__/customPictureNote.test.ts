import { describe, expect, it, vi } from 'vitest'

import {
  CUSTOM_PICTURE_NOTE_CHIP_LABEL,
  CUSTOM_PICTURE_NOTE_CHIP_LABEL_SET,
  CUSTOM_PICTURE_NOTE_CLEAR_LABEL,
  CUSTOM_PICTURE_NOTE_HINT,
  CUSTOM_PICTURE_NOTE_MAX_LENGTH,
  CUSTOM_PICTURE_NOTE_ONE_OFF,
  CUSTOM_PICTURE_NOTE_PLACEHOLDER,
  CUSTOM_PICTURE_NOTE_PROMPT,
  customPictureNoteChipLabel,
  hasCustomPictureNote,
  normalizeCustomPictureNote,
} from '../customPictureNote'
import { resolveFancyEnhanceParams, FANCY_STYLE_OPTIONS } from '../drawingStickerStyles'
import { generateStickerVersion } from '../generateStickerVersion'
import {
  ImageRetryDoor,
  blockedTips,
  offersAlternatives,
  ImageGenerationFailure,
} from '../imageGenerationFailure'
import { drawnAsLine } from '../revisedPromptLine'
import { expectKidLine, expectKidWording } from '../../../test/kidReadability'
import { StickerCategory } from '../../../core/types/enums'
import type { Sticker } from '../../../core/types'

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'new-sticker' })),
}))
vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: () => ({}),
}))

/**
 * The FEAT-197 "+ My own look" note (UX-177).
 *
 * The finding it answers: the owner's two `space` stickers showed a look doing
 * exactly what its recipe says — replacing the girl's own material with nebula —
 * when what he wanted was to put her *in a space suit*. That is a different
 * axis, and no style in the picker can express it. So the note is a **subject**
 * instruction that rides alongside the picked look, never instead of it.
 */
describe('the shared normalize rule reaches the client unchanged', () => {
  it('is the same function both sides compile', () => {
    expect(normalizeCustomPictureNote('  put her  in a space suit. also a dog ')).toBe(
      'put her in a space suit',
    )
    expect(hasCustomPictureNote('   ')).toBe(false)
    expect(CUSTOM_PICTURE_NOTE_MAX_LENGTH).toBeGreaterThan(0)
  })
})

describe('the note rides alongside the look, never instead of it', () => {
  it('sends the picked look unchanged when a note is present', () => {
    for (const option of FANCY_STYLE_OPTIONS) {
      const bare = resolveFancyEnhanceParams(option.id)
      const noted = resolveFancyEnhanceParams(option.id, 'put her in a space suit')
      expect(noted.style).toBe(bare.style)
      expect(noted.theme).toBe(bare.theme)
      expect(noted.transparent).toBe(true)
      expect(noted.customNote).toBe('put her in a space suit')
    }
  })

  it('omits the key entirely when there is no note', () => {
    for (const raw of [undefined, '', '   ']) {
      const params = resolveFancyEnhanceParams('cartoon', raw)
      expect('customNote' in params).toBe(false)
      expect(params).toEqual(resolveFancyEnhanceParams('cartoon'))
    }
  })

  it('normalizes on the way out, so the request carries one bounded sentence', () => {
    const params = resolveFancyEnhanceParams('cartoon', '  give   him a cape. and a hat ')
    expect(params.customNote).toBe('give him a cape')
  })
})

describe('the version writer forwards the note and saves nothing of it', () => {
  const source: Sticker = {
    id: 'src',
    url: 'https://x.test/a.png',
    storagePath: 'families/f/stickers/a.png',
    label: 'Dragon',
    category: StickerCategory.Custom,
    childId: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    tags: ['object'],
    childProfile: 'both',
  }

  it('passes the note to enhanceSketch', async () => {
    const enhanceSketch = vi.fn(async () => ({ url: 'u', storagePath: 'p' }))
    await generateStickerVersion({
      familyId: 'f',
      source,
      styleId: 'space',
      customNote: 'put her in a space suit',
      sourceDrawingId: 'g1',
      label: 'Dragon',
      enhanceSketch,
    })
    expect(enhanceSketch).toHaveBeenCalledWith(
      expect.objectContaining({ customNote: 'put her in a space suit', theme: 'space' }),
    )
  })

  it('records the look on the saved version, never the note', async () => {
    const enhanceSketch = vi.fn(async () => ({ url: 'u', storagePath: 'p' }))
    const res = await generateStickerVersion({
      familyId: 'f',
      source,
      styleId: 'space',
      customNote: 'put her in a space suit',
      sourceDrawingId: 'g1',
      label: 'Dragon',
      enhanceSketch,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // One-off by design: no collection, no saved list, nothing on the sticker.
    expect(JSON.stringify(res.sticker)).not.toContain('space suit')
    expect(res.sticker.theme).toBe('space')
  })
})

describe('it composes with the retry card (FEAT-195)', () => {
  it('has a door of its own for a redraw that DOES carry words', () => {
    // `Redraw`'s promise — "no prompt field on this door, so neither tip may be
    // about wording" — has to keep holding for a note-less redraw.
    expect(blockedTips(ImageRetryDoor.Redraw, 'parent').join(' ')).not.toMatch(
      /instead of naming/i,
    )
    expect(blockedTips(ImageRetryDoor.RedrawNote, 'parent').join(' ')).toMatch(
      /instead of naming/i,
    )
  })

  it('offers rewordings only on a refusal, as everywhere else', () => {
    expect(offersAlternatives(ImageGenerationFailure.Blocked)).toBe(true)
    for (const kind of [
      ImageGenerationFailure.Busy,
      ImageGenerationFailure.NotConfigured,
      ImageGenerationFailure.NoImage,
      ImageGenerationFailure.Offline,
    ]) {
      expect(offersAlternatives(kind)).toBe(false)
    }
  })
})

describe('it says what was actually drawn (FEAT-195)', () => {
  it('shows the rewriter\'s version to a parent when the words changed', () => {
    expect(
      drawnAsLine('dress her as Elsa', 'dress her in a sparkling ice-blue gown', 'parent'),
    ).toBe('Drawn as: dress her in a sparkling ice-blue gown')
  })

  it('says nothing for a note used verbatim, or to a kid', () => {
    expect(drawnAsLine('give him a cape', undefined, 'parent')).toBeNull()
    expect(drawnAsLine('give him a cape', 'give him a cape', 'parent')).toBeNull()
    expect(drawnAsLine('dress her as Elsa', 'a silver gown', 'kid')).toBeNull()
  })
})

describe('the kid copy clears the readability bar', () => {
  it('holds every kid-facing string on the card', () => {
    expectKidWording(CUSTOM_PICTURE_NOTE_CHIP_LABEL, 'chip')
    expectKidWording(CUSTOM_PICTURE_NOTE_CHIP_LABEL_SET, 'chip (set)')
    expectKidWording(CUSTOM_PICTURE_NOTE_CLEAR_LABEL, 'clear')
    // A question and a placeholder are not sentences, so they take the wording
    // bar without the full stop.
    expectKidWording(CUSTOM_PICTURE_NOTE_PROMPT.kid, 'prompt')
    expectKidWording(CUSTOM_PICTURE_NOTE_PLACEHOLDER.kid, 'placeholder')
    expectKidLine(CUSTOM_PICTURE_NOTE_HINT.kid, 'hint')
    expectKidLine(CUSTOM_PICTURE_NOTE_ONE_OFF.kid, 'one-off')
  })

  it('holds the retry tips for the note door', () => {
    for (const tip of blockedTips(ImageRetryDoor.RedrawNote, 'kid')) {
      expectKidLine(tip, 'redraw-note tip')
    }
  })

  it('never says a kid line that promises a style change', () => {
    // The one thing this copy may not imply: it is not a look field.
    expect(CUSTOM_PICTURE_NOTE_HINT.kid).toMatch(/what is in the picture/i)
    expect(CUSTOM_PICTURE_NOTE_HINT.parent).toMatch(/still decides how it is drawn/i)
  })

  it('names the chip the same way whether or not a note is set', () => {
    expect(customPictureNoteChipLabel('')).toBe(CUSTOM_PICTURE_NOTE_CHIP_LABEL)
    expect(customPictureNoteChipLabel('give him a cape')).toBe(
      CUSTOM_PICTURE_NOTE_CHIP_LABEL_SET,
    )
    expect(CUSTOM_PICTURE_NOTE_CHIP_LABEL).toContain('My own look')
    expect(CUSTOM_PICTURE_NOTE_CHIP_LABEL_SET).toContain('My own look')
  })
})
