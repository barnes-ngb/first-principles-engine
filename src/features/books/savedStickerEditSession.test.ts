import { describe, it, expect } from 'vitest'

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
  SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
  SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG,
  SAVED_STICKER_EDIT_INSTRUCTION_HELP,
  SAVED_STICKER_EDIT_SOURCE_GONE,
  SAVED_STICKER_EDIT_SOURCE_CHANGED,
  SAVED_STICKER_EDIT_INELIGIBLE,
  SAVED_STICKER_EDIT_UNAVAILABLE,
  SAVED_STICKER_EDIT_MAX_LENGTH,
  type SavedStickerEditSource,
} from './savedStickerEditSession'
import { StickerCategory } from '../../core/types/enums'
import type { Sticker } from '../../core/types'

// ── helpers ──────────────────────────────────────────────────────

function makeSticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 'stk-1',
    storagePath: 'families/fam/stickers/stk-1.png',
    url: 'https://storage.test/stk-1.png',
    label: 'Robot',
    category: StickerCategory.Custom,
    childId: 'lincoln',
    createdAt: '2026-09-01T10:00:00Z',
    theme: 'cartoon',
    ...overrides,
  }
}

function makeSource(overrides: Partial<SavedStickerEditSource> = {}): SavedStickerEditSource {
  return {
    id: 'stk-1',
    storagePath: 'families/fam/stickers/stk-1.png',
    url: 'https://storage.test/stk-1.png',
    lookId: 'cartoon',
    label: 'Robot',
    childId: 'lincoln',
    childProfile: undefined,
    tags: ['robot', 'sci-fi'],
    sourceDrawingId: undefined,
    ...overrides,
  }
}

// ── savedStickerEditSource ───────────────────────────────────────

describe('savedStickerEditSource', () => {
  it('snapshots a valid sticker', () => {
    const sticker = makeSticker({ tags: ['robot'] })
    const source = savedStickerEditSource(sticker)
    expect(source).not.toBeNull()
    expect(source!.id).toBe('stk-1')
    expect(source!.storagePath).toBe(sticker.storagePath)
    expect(source!.url).toBe(sticker.url)
    expect(source!.lookId).toBe('cartoon')
    expect(source!.label).toBe('Robot')
    expect(source!.childId).toBe('lincoln')
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

  it('returns null for an original (cleaned drawing)', () => {
    expect(savedStickerEditSource(makeSticker({ isOriginal: true }))).toBeNull()
  })

  it('returns null when theme is empty', () => {
    expect(savedStickerEditSource(makeSticker({ theme: '' }))).toBeNull()
  })

  it('returns null for an unrecognized look id', () => {
    expect(savedStickerEditSource(makeSticker({ theme: 'not-a-real-look' }))).toBeNull()
  })

  it('copies tags by value, not reference', () => {
    const sticker = makeSticker({ tags: ['a', 'b'] })
    const source = savedStickerEditSource(sticker)!
    expect(source.tags).toEqual(['a', 'b'])
    expect(source.tags).not.toBe(sticker.tags)
  })

  it('leaves tags undefined when sticker has no tags', () => {
    const sticker = makeSticker({ tags: undefined })
    const source = savedStickerEditSource(sticker)!
    expect(source.tags).toBeUndefined()
  })
})

// ── cloneSavedStickerEditSource ──────────────────────────────────

describe('cloneSavedStickerEditSource', () => {
  it('produces an independent copy', () => {
    const source = makeSource({ tags: ['x'] })
    const clone = cloneSavedStickerEditSource(source)
    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone.tags).not.toBe(source.tags)
  })

  it('handles undefined tags', () => {
    const source = makeSource({ tags: undefined })
    const clone = cloneSavedStickerEditSource(source)
    expect(clone.tags).toBeUndefined()
  })
})

// ── savedStickerEditSessionKey ───────────────────────────────────

describe('savedStickerEditSessionKey', () => {
  it('encodes all identity fields as a JSON tuple', () => {
    const key = savedStickerEditSessionKey('fam-1', makeSource())
    const parsed = JSON.parse(key)
    expect(parsed[0]).toBe('fam-1')
    expect(parsed[1]).toBe('stk-1')
    expect(parsed[2]).toBe('families/fam/stickers/stk-1.png')
  })

  it('changes when any identity field changes', () => {
    const source = makeSource()
    const base = savedStickerEditSessionKey('fam-1', source)
    expect(savedStickerEditSessionKey('fam-2', source)).not.toBe(base)
    expect(savedStickerEditSessionKey('fam-1', makeSource({ id: 'stk-2' }))).not.toBe(base)
    expect(savedStickerEditSessionKey('fam-1', makeSource({ lookId: 'fantasy' }))).not.toBe(base)
    expect(savedStickerEditSessionKey('fam-1', makeSource({ label: 'Cat' }))).not.toBe(base)
  })
})

// ── savedStickerEditInstructionProblem ────────────────────────────

describe('savedStickerEditInstructionProblem', () => {
  it('returns null for a valid short instruction', () => {
    expect(savedStickerEditInstructionProblem('remove the hat')).toBeNull()
  })

  it('returns EMPTY for whitespace-only input', () => {
    expect(savedStickerEditInstructionProblem('   ')).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
    )
  })

  it('returns EMPTY for empty string', () => {
    expect(savedStickerEditInstructionProblem('')).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_EMPTY,
    )
  })

  it('returns TOO_LONG for an instruction over the max', () => {
    const long = 'a'.repeat(SAVED_STICKER_EDIT_MAX_LENGTH + 10)
    expect(savedStickerEditInstructionProblem(long)).toBe(
      SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG,
    )
  })
})

// ── savedStickerEditRequest ──────────────────────────────────────

describe('savedStickerEditRequest', () => {
  it('builds a request for a valid instruction', () => {
    const req = savedStickerEditRequest({
      familyId: 'fam-1',
      source: makeSource(),
      instruction: 'remove the hat',
    })
    expect(req).not.toBeNull()
    expect(req!.familyId).toBe('fam-1')
    expect(req!.sketchStoragePath).toBe('families/fam/stickers/stk-1.png')
    expect(req!.savedStickerEdit).toEqual({
      sourceStickerId: 'stk-1',
      sourceLookId: 'cartoon',
      instruction: 'remove the hat',
    })
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

  it('returns null for an unacceptable instruction', () => {
    const long = 'a'.repeat(SAVED_STICKER_EDIT_MAX_LENGTH + 10)
    expect(
      savedStickerEditRequest({
        familyId: 'fam-1',
        source: makeSource(),
        instruction: long,
      }),
    ).toBeNull()
  })
})

// ── usableSavedStickerEdit ───────────────────────────────────────

describe('usableSavedStickerEdit', () => {
  it('returns a preview when both url and storagePath are present', () => {
    const result = usableSavedStickerEdit({
      url: 'https://storage.test/result.png',
      storagePath: 'families/fam/stickers/result.png',
    } as any)
    expect(result).toEqual({
      url: 'https://storage.test/result.png',
      storagePath: 'families/fam/stickers/result.png',
    })
  })

  it('returns null when url is empty', () => {
    expect(
      usableSavedStickerEdit({
        url: '',
        storagePath: 'some/path',
      } as any),
    ).toBeNull()
  })

  it('returns null when storagePath is empty', () => {
    expect(
      usableSavedStickerEdit({
        url: 'https://storage.test/x.png',
        storagePath: '',
      } as any),
    ).toBeNull()
  })

  it('returns null for null/undefined result', () => {
    expect(usableSavedStickerEdit(null)).toBeNull()
    expect(usableSavedStickerEdit(undefined)).toBeNull()
  })

  it('trims whitespace from url and storagePath', () => {
    const result = usableSavedStickerEdit({
      url: '  https://storage.test/x.png  ',
      storagePath: '  path/x.png  ',
    } as any)
    expect(result!.url).toBe('https://storage.test/x.png')
    expect(result!.storagePath).toBe('path/x.png')
  })
})

// ── checkSavedStickerSourceRow ───────────────────────────────────

describe('checkSavedStickerSourceRow', () => {
  const source = makeSource()

  it('returns ok when the row matches the snapshot', () => {
    const row = {
      storagePath: source.storagePath,
      theme: source.lookId,
      label: source.label,
      childId: source.childId,
      childProfile: source.childProfile,
      sourceDrawingId: source.sourceDrawingId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({ ok: true })
  })

  it('returns SOURCE_GONE for null row', () => {
    expect(checkSavedStickerSourceRow(null, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns SOURCE_GONE for non-object row', () => {
    expect(checkSavedStickerSourceRow('not-an-object', source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns SOURCE_GONE for array row', () => {
    expect(checkSavedStickerSourceRow([], source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_GONE,
    })
  })

  it('returns INELIGIBLE when stored row is an original', () => {
    expect(checkSavedStickerSourceRow({ isOriginal: true }, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_INELIGIBLE,
    })
  })

  it('returns SOURCE_CHANGED when storagePath changed', () => {
    const row = {
      storagePath: 'different/path.png',
      theme: source.lookId,
      label: source.label,
      childId: source.childId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns SOURCE_CHANGED when label changed', () => {
    const row = {
      storagePath: source.storagePath,
      theme: source.lookId,
      label: 'Renamed Robot',
      childId: source.childId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })

  it('returns SOURCE_CHANGED when theme/look changed', () => {
    const row = {
      storagePath: source.storagePath,
      theme: 'fantasy',
      label: source.label,
      childId: source.childId,
    }
    expect(checkSavedStickerSourceRow(row, source)).toEqual({
      ok: false,
      message: SAVED_STICKER_EDIT_SOURCE_CHANGED,
    })
  })
})

// ── editedStickerPayload ─────────────────────────────────────────

describe('editedStickerPayload', () => {
  it('builds a new sticker row from the source and result', () => {
    const payload = editedStickerPayload({
      source: makeSource({ tags: ['robot'] }),
      result: {
        url: 'https://storage.test/new.png',
        storagePath: 'families/fam/stickers/new.png',
      },
      createdAt: '2026-09-15T10:00:00Z',
    })
    expect(payload.url).toBe('https://storage.test/new.png')
    expect(payload.storagePath).toBe('families/fam/stickers/new.png')
    expect(payload.label).toBe('Robot')
    expect(payload.category).toBe(StickerCategory.Custom)
    expect(payload.childId).toBe('lincoln')
    expect(payload.theme).toBe('cartoon')
    expect(payload.createdAt).toBe('2026-09-15T10:00:00Z')
    expect(payload.tags).toEqual(['robot'])
  })

  it('copies tags by value', () => {
    const tags = ['a', 'b']
    const source = makeSource({ tags })
    const payload = editedStickerPayload({
      source,
      result: { url: 'u', storagePath: 'p' },
      createdAt: '2026-09-15T10:00:00Z',
    })
    expect(payload.tags).toEqual(['a', 'b'])
    expect(payload.tags).not.toBe(tags)
  })

  it('omits tags when source has none', () => {
    const payload = editedStickerPayload({
      source: makeSource({ tags: undefined }),
      result: { url: 'u', storagePath: 'p' },
      createdAt: '2026-09-15T10:00:00Z',
    })
    expect(payload).not.toHaveProperty('tags')
  })

  it('omits childProfile when source has none', () => {
    const payload = editedStickerPayload({
      source: makeSource({ childProfile: undefined }),
      result: { url: 'u', storagePath: 'p' },
      createdAt: '2026-09-15T10:00:00Z',
    })
    expect(payload).not.toHaveProperty('childProfile')
  })

  it('omits sourceDrawingId when source has none', () => {
    const payload = editedStickerPayload({
      source: makeSource({ sourceDrawingId: undefined }),
      result: { url: 'u', storagePath: 'p' },
      createdAt: '2026-09-15T10:00:00Z',
    })
    expect(payload).not.toHaveProperty('sourceDrawingId')
  })
})

// ── savedStickerEditFailureMessage ───────────────────────────────

describe('savedStickerEditFailureMessage', () => {
  it('returns the server message when present', () => {
    expect(
      savedStickerEditFailureMessage({ message: 'Not allowed', code: 'blocked' } as any),
    ).toBe('Not allowed')
  })

  it('returns fallback for null/undefined failure', () => {
    expect(savedStickerEditFailureMessage(null)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
    expect(savedStickerEditFailureMessage(undefined)).toBe(SAVED_STICKER_EDIT_UNAVAILABLE)
  })

  it('returns fallback for empty message', () => {
    expect(savedStickerEditFailureMessage({ message: '  ' } as any)).toBe(
      SAVED_STICKER_EDIT_UNAVAILABLE,
    )
  })

  it('trims the message', () => {
    expect(
      savedStickerEditFailureMessage({ message: '  Some error  ' } as any),
    ).toBe('Some error')
  })
})
