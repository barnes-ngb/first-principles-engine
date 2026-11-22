import { describe, expect, it } from 'vitest'

import type { Sticker } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'
import type { EnhanceSketchResponse, ImageCallFailure } from '../../core/ai/useAI'
import {
  savedStickerEditSource,
  cloneSavedStickerEditSource,
  savedStickerEditSessionKey,
  savedStickerEditInstructionProblem,
  savedStickerEditRequest,
  usableSavedStickerEdit,
  checkSavedStickerSourceRow,
  editedStickerPayload,
  savedStickerEditFailureMessage,
  SAVED_STICKER_EDIT_MAX_LENGTH,
  SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
  SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG,
  SAVED_STICKER_EDIT_INSTRUCTION_HELP,
  SAVED_STICKER_EDIT_INELIGIBLE,
  SAVED_STICKER_EDIT_SOURCE_GONE,
  SAVED_STICKER_EDIT_SOURCE_CHANGED,
  SAVED_STICKER_EDIT_UNAVAILABLE,
  type SavedStickerEditSource,
} from './savedStickerEditSession'

// ── Helpers ──────────────────────────────────────────────────────────

function makeSticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 'stk-1',
    url: 'https://cdn.example.com/stk.png',
    storagePath: 'families/f1/stickers/stk.png',
    label: 'Wolf',
    category: StickerCategory.Custom,
    childId: 'child-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    theme: 'fantasy',
    tags: ['animal'],
    childProfile: 'lincoln',
    sourceDrawingId: 'dwg-1',
    ...overrides,
  }
}

function makeSource(overrides: Partial<SavedStickerEditSource> = {}): SavedStickerEditSource {
  return {
    id: 'stk-1',
    storagePath: 'families/f1/stickers/stk.png',
    url: 'https://cdn.example.com/stk.png',
    lookId: 'fantasy',
    label: 'Wolf',
    childId: 'child-1',
    childProfile: 'lincoln',
    tags: ['animal'],
    sourceDrawingId: 'dwg-1',
    ...overrides,
  }
}

// ── savedStickerEditSource ───────────────────────────────────────────

describe('savedStickerEditSource', () => {
  it('returns a snapshot for a valid styled sticker', () => {
    const sticker = makeSticker()
    const source = savedStickerEditSource(sticker)
    expect(source).not.toBeNull()
    expect(source!.id).toBe('stk-1')
    expect(source!.storagePath).toBe('families/f1/stickers/stk.png')
    expect(source!.url).toBe('https://cdn.example.com/stk.png')
    expect(source!.lookId).toBe('fantasy')
    expect(source!.label).toBe('Wolf')
    expect(source!.childId).toBe('child-1')
    expect(source!.childProfile).toBe('lincoln')
    expect(source!.sourceDrawingId).toBe('dwg-1')
    expect(source!.tags).toEqual(['animal'])
  })

  it('copies tags rather than referencing the original array', () => {
    const sticker = makeSticker({ tags: ['a', 'b'] })
    const source = savedStickerEditSource(sticker)
    expect(source!.tags).toEqual(['a', 'b'])
    expect(source!.tags).not.toBe(sticker.tags)
  })

  it('returns null for null/undefined sticker', () => {
    expect(savedStickerEditSource(null)).toBeNull()
    expect(savedStickerEditSource(undefined)).toBeNull()
  })

  it('returns null when id is missing', () => {
    expect(savedStickerEditSource(makeSticker({ id: undefined }))).toBeNull()
  })

  it('returns null when storagePath is missing', () => {
    expect(savedStickerEditSource(makeSticker({ storagePath: '' }))).toBeNull()
  })

  it('returns null when url is missing', () => {
    expect(savedStickerEditSource(makeSticker({ url: '' }))).toBeNull()
  })

  it('returns null for an original (cleaned drawing)', () => {
    expect(savedStickerEditSource(makeSticker({ isOriginal: true }))).toBeNull()
  })

  it('returns null when theme is missing', () => {
    expect(savedStickerEditSource(makeSticker({ theme: undefined }))).toBeNull()
  })

  it('returns null for an unrecognised look id', () => {
    expect(savedStickerEditSource(makeSticker({ theme: 'no-such-look' }))).toBeNull()
  })

  it('returns null for an inherited property name used as theme', () => {
    expect(savedStickerEditSource(makeSticker({ theme: 'constructor' }))).toBeNull()
    expect(savedStickerEditSource(makeSticker({ theme: 'toString' }))).toBeNull()
  })

  it('handles sticker with no optional fields', () => {
    const sticker = makeSticker({
      tags: undefined,
      childProfile: undefined,
      sourceDrawingId: undefined,
      childId: null,
    })
    const source = savedStickerEditSource(sticker)
    expect(source).not.toBeNull()
    expect(source!.tags).toBeUndefined()
    expect(source!.childProfile).toBeUndefined()
    expect(source!.sourceDrawingId).toBeUndefined()
    expect(source!.childId).toBeNull()
  })
})

// ── cloneSavedStickerEditSource ──────────────────────────────────────

describe('cloneSavedStickerEditSource', () => {
  it('produces an independent copy', () => {
    const original = makeSource()
    const clone = cloneSavedStickerEditSource(original)
    expect(clone).toEqual(original)
    expect(clone).not.toBe(original)
  })

  it('copies tags by value, not reference', () => {
    const original = makeSource({ tags: ['x', 'y'] })
    const clone = cloneSavedStickerEditSource(original)
    expect(clone.tags).toEqual(['x', 'y'])
    expect(clone.tags).not.toBe(original.tags)
  })

  it('handles undefined tags', () => {
    const original = makeSource({ tags: undefined })
    const clone = cloneSavedStickerEditSource(original)
    expect(clone.tags).toBeUndefined()
  })
})

// ── savedStickerEditSessionKey ───────────────────────────────────────

describe('savedStickerEditSessionKey', () => {
  it('produces a stable JSON tuple', () => {
    const source = makeSource()
    const key = savedStickerEditSessionKey('fam-1', source)
    const parsed = JSON.parse(key)
    expect(parsed).toEqual([
      'fam-1',
      'stk-1',
      'families/f1/stickers/stk.png',
      'https://cdn.example.com/stk.png',
      'fantasy',
      'Wolf',
      'child-1',
      'lincoln',
      ['animal'],
      'dwg-1',
    ])
  })

  it('normalises undefined to null in the tuple', () => {
    const source = makeSource({
      childId: undefined,
      childProfile: undefined,
      tags: undefined,
      sourceDrawingId: undefined,
    })
    const key = savedStickerEditSessionKey('fam-1', source)
    const parsed = JSON.parse(key)
    expect(parsed[6]).toBeNull()
    expect(parsed[7]).toBeNull()
    expect(parsed[8]).toBeNull()
    expect(parsed[9]).toBeNull()
  })

  it('differs when any source field changes', () => {
    const base = makeSource()
    const baseKey = savedStickerEditSessionKey('fam-1', base)

    const variants: Partial<SavedStickerEditSource>[] = [
      { id: 'stk-2' },
      { storagePath: 'other/path.png' },
      { url: 'https://other.com/stk.png' },
      { lookId: 'cartoon' },
      { label: 'Fox' },
      { childId: 'child-2' },
      { childProfile: 'london' },
      { tags: ['different'] },
      { sourceDrawingId: 'dwg-2' },
    ]

    for (const variant of variants) {
      const key = savedStickerEditSessionKey('fam-1', makeSource(variant))
      expect(key).not.toBe(baseKey)
    }
  })

  it('differs when familyId changes', () => {
    const source = makeSource()
    const k1 = savedStickerEditSessionKey('fam-1', source)
    const k2 = savedStickerEditSessionKey('fam-2', source)
    expect(k1).not.toBe(k2)
  })
})

// ── savedStickerEditInstructionProblem ────────────────────────────────

describe('savedStickerEditInstructionProblem', () => {
  it('returns null for a short valid instruction', () => {
    expect(savedStickerEditInstructionProblem('remove the hat')).toBeNull()
  })

  it('returns empty message for empty string', () => {
    expect(savedStickerEditInstructionProblem('')).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
    )
  })

  it('returns empty message for whitespace-only input', () => {
    expect(savedStickerEditInstructionProblem('   ')).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
    )
  })

  it('returns too-long message for overlength input', () => {
    const long = 'a'.repeat(SAVED_STICKER_EDIT_MAX_LENGTH + 10)
    expect(savedStickerEditInstructionProblem(long)).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG,
    )
  })

  it('returns help message for instruction that acceptEditInstruction rejects but is not too long or empty', () => {
    // Two sentences: normalizeCustomPictureNote keeps only the first, so
    // canonical ≠ normalized and acceptEditInstruction rejects it.
    const twoSentences = 'Remove the hat. Keep the dog'
    expect(savedStickerEditInstructionProblem(twoSentences)).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_HELP,
    )
  })

  it('allows instruction at exactly the max length', () => {
    const exact = 'x'.repeat(SAVED_STICKER_EDIT_MAX_LENGTH)
    expect(savedStickerEditInstructionProblem(exact)).toBeNull()
  })
})

// ── savedStickerEditRequest ──────────────────────────────────────────

describe('savedStickerEditRequest', () => {
  it('builds a request from valid input', () => {
    const source = makeSource()
    const req = savedStickerEditRequest({
      familyId: 'fam-1',
      source,
      instruction: 'remove the hat',
    })
    expect(req).not.toBeNull()
    expect(req!.familyId).toBe('fam-1')
    expect(req!.sketchStoragePath).toBe(source.storagePath)
    expect(req!.savedStickerEdit).toEqual({
      sourceStickerId: 'stk-1',
      sourceLookId: 'fantasy',
      instruction: 'remove the hat',
    })
  })

  it('canonicalises the instruction (trims trailing punctuation)', () => {
    const req = savedStickerEditRequest({
      familyId: 'fam-1',
      source: makeSource(),
      instruction: '  remove the hat!  ',
    })
    expect(req!.savedStickerEdit!.instruction).toBe('remove the hat')
  })

  it('returns null for empty instruction', () => {
    expect(
      savedStickerEditRequest({
        familyId: 'fam-1',
        source: makeSource(),
        instruction: '',
      }),
    ).toBeNull()
  })

  it('returns null for instruction that fails acceptance', () => {
    const twoSentences = 'Remove the hat. Keep the dog'
    expect(
      savedStickerEditRequest({
        familyId: 'fam-1',
        source: makeSource(),
        instruction: twoSentences,
      }),
    ).toBeNull()
  })

  it('does not carry legacy fields (style, theme, transparent, caption, customNote)', () => {
    const req = savedStickerEditRequest({
      familyId: 'fam-1',
      source: makeSource(),
      instruction: 'add a cape',
    })
    expect(req).not.toBeNull()
    expect(req!.style).toBeUndefined()
    expect(req!.theme).toBeUndefined()
    expect(req!.transparent).toBeUndefined()
    expect(req!.caption).toBeUndefined()
  })
})

// ── usableSavedStickerEdit ───────────────────────────────────────────

describe('usableSavedStickerEdit', () => {
  it('returns preview when both url and storagePath are present', () => {
    const result: EnhanceSketchResponse = {
      url: 'https://cdn.example.com/edited.png',
      storagePath: 'families/f1/stickers/edited.png',
    }
    const preview = usableSavedStickerEdit(result)
    expect(preview).toEqual({
      url: 'https://cdn.example.com/edited.png',
      storagePath: 'families/f1/stickers/edited.png',
    })
  })

  it('trims whitespace from url and storagePath', () => {
    const result: EnhanceSketchResponse = {
      url: '  https://cdn.example.com/edited.png  ',
      storagePath: '  families/f1/stickers/edited.png  ',
    }
    const preview = usableSavedStickerEdit(result)
    expect(preview!.url).toBe('https://cdn.example.com/edited.png')
    expect(preview!.storagePath).toBe('families/f1/stickers/edited.png')
  })

  it('returns null for null/undefined result', () => {
    expect(usableSavedStickerEdit(null)).toBeNull()
    expect(usableSavedStickerEdit(undefined)).toBeNull()
  })

  it('returns null when url is empty', () => {
    expect(usableSavedStickerEdit({ url: '', storagePath: 'path' })).toBeNull()
  })

  it('returns null when storagePath is empty', () => {
    expect(usableSavedStickerEdit({ url: 'https://x', storagePath: '' })).toBeNull()
  })

  it('returns null when url is whitespace-only', () => {
    expect(usableSavedStickerEdit({ url: '   ', storagePath: 'path' })).toBeNull()
  })

  it('returns null for a result with non-string url', () => {
    expect(usableSavedStickerEdit({ url: 123 as unknown as string, storagePath: 'path' })).toBeNull()
  })
})

// ── checkSavedStickerSourceRow ───────────────────────────────────────

describe('checkSavedStickerSourceRow', () => {
  const source = makeSource()

  function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      storagePath: source.storagePath,
      theme: source.lookId,
      label: source.label,
      childId: source.childId,
      childProfile: source.childProfile,
      sourceDrawingId: source.sourceDrawingId,
      ...overrides,
    }
  }

  it('returns ok for an unchanged row', () => {
    expect(checkSavedStickerSourceRow(makeRow(), source)).toEqual({ ok: true })
  })

  it('returns source-gone for null', () => {
    expect(checkSavedStickerSourceRow(null, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns source-gone for undefined', () => {
    expect(checkSavedStickerSourceRow(undefined, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns source-gone for a non-object', () => {
    expect(checkSavedStickerSourceRow('string', source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns source-gone for an array', () => {
    expect(checkSavedStickerSourceRow([], source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns ineligible when stored row became an original', () => {
    expect(checkSavedStickerSourceRow(makeRow({ isOriginal: true }), source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_INELIGIBLE,
    })
  })

  it('returns changed when storagePath differs', () => {
    expect(checkSavedStickerSourceRow(makeRow({ storagePath: 'other' }), source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns changed when theme differs', () => {
    expect(checkSavedStickerSourceRow(makeRow({ theme: 'cartoon' }), source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns changed when label differs', () => {
    expect(checkSavedStickerSourceRow(makeRow({ label: 'Fox' }), source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns changed when childId differs', () => {
    expect(checkSavedStickerSourceRow(makeRow({ childId: 'other' }), source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns changed when childProfile differs', () => {
    expect(
      checkSavedStickerSourceRow(makeRow({ childProfile: 'london' }), source),
    ).toEqual({ ok: false, message: SAVED_STICKER_EDIT_SOURCE_CHANGED })
  })

  it('returns changed when sourceDrawingId differs', () => {
    expect(
      checkSavedStickerSourceRow(makeRow({ sourceDrawingId: 'dwg-other' }), source),
    ).toEqual({ ok: false, message: SAVED_STICKER_EDIT_SOURCE_CHANGED })
  })

  it('treats null/undefined childId as equivalent', () => {
    const sourceNullChild = makeSource({ childId: undefined })
    const row = makeRow({ childId: null })
    expect(checkSavedStickerSourceRow(row, sourceNullChild)).toEqual({ ok: true })
  })

  it('treats missing childProfile as "both"', () => {
    const sourceNoProfile = makeSource({ childProfile: undefined })
    const row = makeRow({ childProfile: 'both' })
    expect(checkSavedStickerSourceRow(row, sourceNoProfile)).toEqual({ ok: true })
  })

  it('treats null/undefined sourceDrawingId as equivalent', () => {
    const sourceNoDwg = makeSource({ sourceDrawingId: undefined })
    const row = makeRow({ sourceDrawingId: null })
    expect(checkSavedStickerSourceRow(row, sourceNoDwg)).toEqual({ ok: true })
  })

  it('does not check tags — a tag edit elsewhere must not refuse an edit in flight', () => {
    const row = makeRow()
    // Tags differ but check should still pass
    ;(row as Record<string, unknown>).tags = ['completely', 'different']
    expect(checkSavedStickerSourceRow(row, source)).toEqual({ ok: true })
  })
})

// ── editedStickerPayload ─────────────────────────────────────────────

describe('editedStickerPayload', () => {
  it('builds a sticker record with the correct fields', () => {
    const source = makeSource()
    const result = { url: 'https://cdn.example.com/new.png', storagePath: 'path/new.png' }
    const payload = editedStickerPayload({
      source,
      result,
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    expect(payload.url).toBe(result.url)
    expect(payload.storagePath).toBe(result.storagePath)
    expect(payload.label).toBe(source.label)
    expect(payload.category).toBe(StickerCategory.Custom)
    expect(payload.childId).toBe(source.childId)
    expect(payload.createdAt).toBe('2026-10-01T12:00:00.000Z')
    expect(payload.theme).toBe(source.lookId)
    expect(payload.tags).toEqual(source.tags)
    expect(payload.childProfile).toBe(source.childProfile)
    expect(payload.sourceDrawingId).toBe(source.sourceDrawingId)
  })

  it('copies tags rather than referencing the source array', () => {
    const source = makeSource({ tags: ['a', 'b'] })
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({ source, result, createdAt: 'now' })
    expect(payload.tags).toEqual(['a', 'b'])
    expect(payload.tags).not.toBe(source.tags)
  })

  it('omits tags when source has none', () => {
    const source = makeSource({ tags: undefined })
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({ source, result, createdAt: 'now' })
    expect(payload).not.toHaveProperty('tags')
  })

  it('omits childProfile when source has none', () => {
    const source = makeSource({ childProfile: undefined })
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({ source, result, createdAt: 'now' })
    expect(payload).not.toHaveProperty('childProfile')
  })

  it('omits sourceDrawingId when source has none', () => {
    const source = makeSource({ sourceDrawingId: undefined })
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({ source, result, createdAt: 'now' })
    expect(payload).not.toHaveProperty('sourceDrawingId')
  })

  it('handles null childId', () => {
    const source = makeSource({ childId: null })
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({ source, result, createdAt: 'now' })
    expect(payload.childId).toBeNull()
  })

  it('does not carry isOriginal, prompt, or instruction', () => {
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({
      source: makeSource(),
      result,
      createdAt: 'now',
    })
    expect(payload).not.toHaveProperty('isOriginal')
    expect(payload).not.toHaveProperty('prompt')
    expect(payload).not.toHaveProperty('instruction')
  })

  it('does not include id — it is Omit<Sticker, "id">', () => {
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({
      source: makeSource(),
      result,
      createdAt: 'now',
    })
    expect(payload).not.toHaveProperty('id')
  })
})

// ── savedStickerEditFailureMessage ───────────────────────────────────

describe('savedStickerEditFailureMessage', () => {
  it('returns the server message when present', () => {
    const failure: ImageCallFailure = {
      message: 'Content policy violation',
    }
    expect(savedStickerEditFailureMessage(failure)).toBe('Content policy violation')
  })

  it('trims whitespace from server message', () => {
    const failure: ImageCallFailure = { message: '  Trimmed message  ' }
    expect(savedStickerEditFailureMessage(failure)).toBe('Trimmed message')
  })

  it('falls back to the generic unavailable message for null', () => {
    expect(savedStickerEditFailureMessage(null)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
  })

  it('falls back for undefined', () => {
    expect(savedStickerEditFailureMessage(undefined)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
  })

  it('falls back for empty message', () => {
    expect(savedStickerEditFailureMessage({ message: '' })).toBe(
      SAVED_STICKER_EDIT_UNAVAILABLE,
    )
  })

  it('falls back for whitespace-only message', () => {
    expect(savedStickerEditFailureMessage({ message: '   ' })).toBe(
      SAVED_STICKER_EDIT_UNAVAILABLE,
    )
  })

  it('falls back for non-string message', () => {
    expect(savedStickerEditFailureMessage({ message: 42 as unknown as string })).toBe(
      SAVED_STICKER_EDIT_UNAVAILABLE,
    )
  })

  it('falls back for failure with no message field', () => {
    expect(savedStickerEditFailureMessage({ code: 'some-code' })).toBe(
      SAVED_STICKER_EDIT_UNAVAILABLE,
    )
  })
})
