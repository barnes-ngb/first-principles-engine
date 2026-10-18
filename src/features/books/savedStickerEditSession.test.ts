import { describe, it, expect } from 'vitest'

import {
  SAVED_STICKER_EDIT_MAX_LENGTH,
  SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
  SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG,
  SAVED_STICKER_EDIT_INSTRUCTION_HELP,
  SAVED_STICKER_EDIT_INELIGIBLE,
  SAVED_STICKER_EDIT_SOURCE_GONE,
  SAVED_STICKER_EDIT_SOURCE_CHANGED,
  SAVED_STICKER_EDIT_UNAVAILABLE,
  savedStickerEditSource,
  cloneSavedStickerEditSource,
  savedStickerEditSessionKey,
  savedStickerEditInstructionProblem,
  savedStickerEditRequest,
  usableSavedStickerEdit,
  checkSavedStickerSourceRow,
  editedStickerPayload,
  savedStickerEditFailureMessage,
  type SavedStickerEditSource,
} from './savedStickerEditSession'

import { StickerCategory } from '../../core/types/enums'
import type { Sticker } from '../../core/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 'sticker-1',
    storagePath: 'families/fam-1/stickers/s1.png',
    url: 'https://storage.example.com/s1.png',
    label: 'Robot',
    category: StickerCategory.Custom,
    childId: 'child-1',
    createdAt: '2026-10-01T12:00:00Z',
    theme: 'fantasy',
    ...overrides,
  } as Sticker
}

function makeSource(overrides: Partial<SavedStickerEditSource> = {}): SavedStickerEditSource {
  return {
    id: 'sticker-1',
    storagePath: 'families/fam-1/stickers/s1.png',
    url: 'https://storage.example.com/s1.png',
    lookId: 'fantasy',
    label: 'Robot',
    childId: 'child-1',
    childProfile: undefined,
    tags: ['robot', 'sci-fi'],
    sourceDrawingId: 'drawing-1',
    ...overrides,
  }
}

// ── savedStickerEditSource ──────────────────────────────────────────────────

describe('savedStickerEditSource', () => {
  it('returns a snapshot for a valid sticker with a known look', () => {
    const sticker = makeSticker()
    const source = savedStickerEditSource(sticker)
    expect(source).not.toBeNull()
    expect(source!.id).toBe('sticker-1')
    expect(source!.lookId).toBe('fantasy')
    expect(source!.label).toBe('Robot')
  })

  it('returns null for null/undefined sticker', () => {
    expect(savedStickerEditSource(null)).toBeNull()
    expect(savedStickerEditSource(undefined)).toBeNull()
  })

  it('returns null when sticker has no id', () => {
    expect(savedStickerEditSource(makeSticker({ id: '' }))).toBeNull()
  })

  it('returns null when sticker has no storagePath', () => {
    expect(savedStickerEditSource(makeSticker({ storagePath: '' }))).toBeNull()
  })

  it('returns null when sticker has no url', () => {
    expect(savedStickerEditSource(makeSticker({ url: '' }))).toBeNull()
  })

  it('returns null when sticker is an original', () => {
    expect(savedStickerEditSource(makeSticker({ isOriginal: true }))).toBeNull()
  })

  it('returns null when sticker has no theme', () => {
    expect(savedStickerEditSource(makeSticker({ theme: undefined }))).toBeNull()
  })

  it('returns null when theme is an unknown look', () => {
    expect(savedStickerEditSource(makeSticker({ theme: 'nonexistent-look-xyz' }))).toBeNull()
  })

  it('copies tags rather than referencing them', () => {
    const sticker = makeSticker({ tags: ['a', 'b'] })
    const source = savedStickerEditSource(sticker)
    expect(source!.tags).toEqual(['a', 'b'])
    ;(sticker as any).tags.push('c')
    expect(source!.tags).toEqual(['a', 'b'])
  })
})

// ── cloneSavedStickerEditSource ─────────────────────────────────────────────

describe('cloneSavedStickerEditSource', () => {
  it('produces an independent copy', () => {
    const source = makeSource({ tags: ['x', 'y'] })
    const clone = cloneSavedStickerEditSource(source)
    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    clone.label = 'Changed'
    expect(source.label).toBe('Robot')
  })

  it('deep-copies tags', () => {
    const source = makeSource({ tags: ['a'] })
    const clone = cloneSavedStickerEditSource(source)
    clone.tags!.push('b')
    expect(source.tags).toEqual(['a'])
  })

  it('handles undefined tags', () => {
    const source = makeSource({ tags: undefined })
    const clone = cloneSavedStickerEditSource(source)
    expect(clone.tags).toBeUndefined()
  })
})

// ── savedStickerEditSessionKey ──────────────────────────────────────────────

describe('savedStickerEditSessionKey', () => {
  it('produces a stable key for the same inputs', () => {
    const source = makeSource()
    const key1 = savedStickerEditSessionKey('fam-1', source)
    const key2 = savedStickerEditSessionKey('fam-1', source)
    expect(key1).toBe(key2)
  })

  it('produces different keys for different families', () => {
    const source = makeSource()
    expect(savedStickerEditSessionKey('fam-1', source))
      .not.toBe(savedStickerEditSessionKey('fam-2', source))
  })

  it('produces different keys when the source changes', () => {
    const source1 = makeSource({ label: 'Robot' })
    const source2 = makeSource({ label: 'Dinosaur' })
    expect(savedStickerEditSessionKey('fam-1', source1))
      .not.toBe(savedStickerEditSessionKey('fam-1', source2))
  })
})

// ── savedStickerEditInstructionProblem ───────────────────────────────────────

describe('savedStickerEditInstructionProblem', () => {
  it('returns null for a valid short instruction', () => {
    expect(savedStickerEditInstructionProblem('take the hat off')).toBeNull()
  })

  it('returns the empty message for an empty string', () => {
    expect(savedStickerEditInstructionProblem('')).toBe(SAVED_STICKER_EDIT_INSTRUCTION_EMPTY)
  })

  it('returns the empty message for whitespace-only', () => {
    expect(savedStickerEditInstructionProblem('   ')).toBe(SAVED_STICKER_EDIT_INSTRUCTION_EMPTY)
  })

  it('returns the too-long message for overlength instructions', () => {
    const long = 'x'.repeat(SAVED_STICKER_EDIT_MAX_LENGTH + 1)
    expect(savedStickerEditInstructionProblem(long)).toBe(SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG)
  })
})

// ── savedStickerEditRequest ─────────────────────────────────────────────────

describe('savedStickerEditRequest', () => {
  it('returns a request for a valid instruction', () => {
    const source = makeSource()
    const req = savedStickerEditRequest({
      familyId: 'fam-1',
      source,
      instruction: 'remove the hat',
    })
    expect(req).not.toBeNull()
    expect(req!.familyId).toBe('fam-1')
    expect(req!.sketchStoragePath).toBe(source.storagePath)
    expect(req!.savedStickerEdit!.sourceStickerId).toBe(source.id)
    expect(req!.savedStickerEdit!.sourceLookId).toBe(source.lookId)
  })

  it('returns null for an empty instruction', () => {
    const source = makeSource()
    expect(savedStickerEditRequest({
      familyId: 'fam-1',
      source,
      instruction: '',
    })).toBeNull()
  })
})

// ── usableSavedStickerEdit ──────────────────────────────────────────────────

describe('usableSavedStickerEdit', () => {
  it('returns a preview when both url and storagePath are present', () => {
    const result = usableSavedStickerEdit({
      url: 'https://example.com/result.png',
      storagePath: 'families/fam-1/stickers/r1.png',
    } as any)
    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://example.com/result.png')
    expect(result!.storagePath).toBe('families/fam-1/stickers/r1.png')
  })

  it('returns null when url is missing', () => {
    expect(usableSavedStickerEdit({ storagePath: 'a' } as any)).toBeNull()
  })

  it('returns null when storagePath is missing', () => {
    expect(usableSavedStickerEdit({ url: 'a' } as any)).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(usableSavedStickerEdit(null)).toBeNull()
    expect(usableSavedStickerEdit(undefined)).toBeNull()
  })

  it('trims whitespace-only values to empty and returns null', () => {
    expect(usableSavedStickerEdit({ url: '  ', storagePath: 'a' } as any)).toBeNull()
  })
})

// ── checkSavedStickerSourceRow ──────────────────────────────────────────────

describe('checkSavedStickerSourceRow', () => {
  const source = makeSource()

  it('returns ok when the row matches the source', () => {
    const row = {
      storagePath: source.storagePath,
      theme: source.lookId,
      label: source.label,
      childId: source.childId,
      childProfile: source.childProfile ?? 'both',
      sourceDrawingId: source.sourceDrawingId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({ ok: true })
  })

  it('returns SOURCE_GONE for null/undefined row', () => {
    expect(checkSavedStickerSourceRow(null, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
    expect(checkSavedStickerSourceRow(undefined, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns SOURCE_GONE for an array', () => {
    expect(checkSavedStickerSourceRow([], source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns INELIGIBLE for an original', () => {
    expect(checkSavedStickerSourceRow({ isOriginal: true }, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_INELIGIBLE,
    })
  })

  it('returns SOURCE_CHANGED when storagePath differs', () => {
    const row = {
      storagePath: 'different/path.png',
      theme: source.lookId,
      label: source.label,
      childId: source.childId,
      childProfile: source.childProfile ?? 'both',
      sourceDrawingId: source.sourceDrawingId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns SOURCE_CHANGED when label differs', () => {
    const row = {
      storagePath: source.storagePath,
      theme: source.lookId,
      label: 'Dinosaur',
      childId: source.childId,
      childProfile: source.childProfile ?? 'both',
      sourceDrawingId: source.sourceDrawingId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })
})

// ── editedStickerPayload ────────────────────────────────────────────────────

describe('editedStickerPayload', () => {
  it('produces a new sticker payload from source and result', () => {
    const source = makeSource({ tags: ['a'], childProfile: 'lincoln' as any })
    const result = { url: 'https://new.png', storagePath: 'new/path.png' }
    const payload = editedStickerPayload({
      source,
      result,
      createdAt: '2026-10-15T12:00:00Z',
    })

    expect(payload.url).toBe('https://new.png')
    expect(payload.storagePath).toBe('new/path.png')
    expect(payload.label).toBe('Robot')
    expect(payload.category).toBe(StickerCategory.Custom)
    expect(payload.childId).toBe('child-1')
    expect(payload.createdAt).toBe('2026-10-15T12:00:00Z')
    expect(payload.theme).toBe('fantasy')
    expect(payload.tags).toEqual(['a'])
    expect(payload.childProfile).toBe('lincoln')
    expect(payload.sourceDrawingId).toBe('drawing-1')
  })

  it('omits optional fields when source does not have them', () => {
    const source = makeSource({
      tags: undefined,
      childProfile: undefined,
      sourceDrawingId: undefined,
    })
    const result = { url: 'https://new.png', storagePath: 'new/path.png' }
    const payload = editedStickerPayload({ source, result, createdAt: '2026-10-15T12:00:00Z' })

    expect(payload).not.toHaveProperty('tags')
    expect(payload).not.toHaveProperty('childProfile')
    expect(payload).not.toHaveProperty('sourceDrawingId')
  })

  it('deep-copies tags', () => {
    const source = makeSource({ tags: ['a', 'b'] })
    const result = { url: 'u', storagePath: 'p' }
    const payload = editedStickerPayload({ source, result, createdAt: 'x' })
    payload.tags!.push('c')
    expect(source.tags).toEqual(['a', 'b'])
  })
})

// ── savedStickerEditFailureMessage ──────────────────────────────────────────

describe('savedStickerEditFailureMessage', () => {
  it('returns the server message when present', () => {
    expect(savedStickerEditFailureMessage({ message: 'safety block' } as any)).toBe('safety block')
  })

  it('returns the generic message for null/undefined failure', () => {
    expect(savedStickerEditFailureMessage(null)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
    expect(savedStickerEditFailureMessage(undefined)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
  })

  it('returns the generic message for empty string', () => {
    expect(savedStickerEditFailureMessage({ message: '  ' } as any)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
  })
})
