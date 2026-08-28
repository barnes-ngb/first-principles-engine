import { describe, expect, it } from 'vitest'

import type { Sticker } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'
import {
  normalizeStickerLabel,
  planDrawingRename,
  planStickerEdit,
} from './stickerLabelEdit'

function sticker(over: Partial<Sticker> & { id: string }): Sticker {
  return {
    url: 'https://example.test/s.png',
    storagePath: 'families/f1/stickers/s.png',
    label: 'My drawing',
    category: StickerCategory.Custom,
    createdAt: '2026-08-01T00:00:00.000Z',
    tags: ['object'],
    childProfile: 'both',
    ...over,
  }
}

describe('normalizeStickerLabel', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeStickerLabel('  Dragon  ')).toBe('Dragon')
  })
})

describe('planDrawingRename (FEAT-160)', () => {
  const versions = [
    sticker({ id: 'a', label: 'My drawing', isOriginal: true, sourceDrawingId: 'd1' }),
    sticker({ id: 'b', label: 'My drawing', theme: 'fantasy', sourceDrawingId: 'd1' }),
    sticker({ id: 'c', label: 'My drawing', theme: 'cartoon', sourceDrawingId: 'd1' }),
  ]

  it('renames every version of the drawing together — one name per drawing', () => {
    const plan = planDrawingRename("Lincoln's dragon", versions)
    expect(plan.kind).toBe('write')
    if (plan.kind !== 'write') return
    expect(plan.writes.map((w) => w.id).sort()).toEqual(['a', 'b', 'c'])
    for (const w of plan.writes) expect(w.patch).toEqual({ label: "Lincoln's dragon" })
  })

  it('patches only the label — never a whole-doc replacement', () => {
    const plan = planDrawingRename('Dragon', versions)
    if (plan.kind !== 'write') throw new Error('expected a write')
    // The link fields that make a group a group must survive a rename.
    for (const w of plan.writes) expect(Object.keys(w.patch)).toEqual(['label'])
  })

  it('trims before deciding and before writing', () => {
    const plan = planDrawingRename('   Dragon   ', versions)
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.label).toBe('Dragon')
  })

  it('a no-op is not a write: renaming to the name already stored plans nothing', () => {
    expect(planDrawingRename('My drawing', versions).kind).toBe('noop')
    expect(planDrawingRename('  My drawing  ', versions).kind).toBe('noop')
  })

  it('writes only the versions that actually differ', () => {
    const drifted = [versions[0], sticker({ ...versions[1], id: 'b', label: 'Old name' })]
    const plan = planDrawingRename('My drawing', drifted)
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.writes.map((w) => w.id)).toEqual(['b'])
  })

  it('rejects an empty name rather than storing a blank one', () => {
    expect(planDrawingRename('   ', versions)).toEqual({ kind: 'invalid', reason: 'empty-label' })
  })

  it('skips versions with no id — there is nothing to address', () => {
    const plan = planDrawingRename('Dragon', [
      { id: undefined, label: 'My drawing' },
      { id: 'b', label: 'My drawing' },
    ])
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.writes.map((w) => w.id)).toEqual(['b'])
  })
})

describe('planStickerEdit (FEAT-160)', () => {
  const target = sticker({ id: 'a', label: 'My drawing', tags: ['animal'], childProfile: 'both' })

  it('saving an unchanged dialog writes nothing', () => {
    const plan = planStickerEdit({
      target,
      nextLabel: 'My drawing',
      nextTags: ['animal'],
      nextProfile: 'both',
      library: [target],
    })
    expect(plan.kind).toBe('noop')
  })

  it('toggling a tag off and back on is not a change', () => {
    const two = sticker({ id: 'a', tags: ['animal', 'fantasy'] })
    const plan = planStickerEdit({
      target: two,
      nextLabel: two.label,
      nextTags: ['fantasy', 'animal'],
      nextProfile: 'both',
      library: [two],
    })
    expect(plan.kind).toBe('noop')
  })

  it('patches only the fields that moved', () => {
    const plan = planStickerEdit({
      target,
      nextLabel: 'My drawing',
      nextTags: ['animal', 'fantasy'],
      nextProfile: 'both',
      library: [target],
    })
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.writes).toEqual([{ id: 'a', patch: { tags: ['animal', 'fantasy'] } }])
  })

  it('a rename here is still a group rename — every version follows', () => {
    const original = sticker({ id: 'a', label: 'My drawing', sourceDrawingId: 'd1', isOriginal: true })
    const fancy = sticker({ id: 'b', label: 'My drawing', sourceDrawingId: 'd1', theme: 'fantasy' })
    const other = sticker({ id: 'z', label: 'Something else', sourceDrawingId: 'd2' })
    const plan = planStickerEdit({
      target: original,
      nextLabel: 'Dragon',
      nextTags: original.tags ?? [],
      nextProfile: 'both',
      library: [original, fancy, other],
    })
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.writes.map((w) => w.id).sort()).toEqual(['a', 'b'])
    // The unrelated drawing is untouched.
    expect(plan.writes.some((w) => w.id === 'z')).toBe(false)
  })

  it('tags and "for" stay on the edited sticker — they never fan out to siblings', () => {
    const original = sticker({ id: 'a', label: 'My drawing', sourceDrawingId: 'd1', tags: ['animal'] })
    const fancy = sticker({ id: 'b', label: 'My drawing', sourceDrawingId: 'd1', tags: ['animal'] })
    const plan = planStickerEdit({
      target: original,
      nextLabel: 'Dragon',
      nextTags: ['fantasy'],
      nextProfile: 'lincoln',
      library: [original, fancy],
    })
    if (plan.kind !== 'write') throw new Error('expected a write')
    const byId = Object.fromEntries(plan.writes.map((w) => [w.id, w.patch]))
    expect(byId.a).toEqual({ label: 'Dragon', tags: ['fantasy'], childProfile: 'lincoln' })
    expect(byId.b).toEqual({ label: 'Dragon' })
  })

  it('a standalone sticker renames alone', () => {
    const standalone = sticker({ id: 'a', label: 'Star' })
    const unrelated = sticker({ id: 'b', label: 'Star' })
    const plan = planStickerEdit({
      target: standalone,
      nextLabel: 'Big star',
      nextTags: standalone.tags ?? [],
      nextProfile: 'both',
      library: [standalone, unrelated],
    })
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.writes.map((w) => w.id)).toEqual(['a'])
  })

  it('rejects an empty name', () => {
    const plan = planStickerEdit({
      target,
      nextLabel: '  ',
      nextTags: ['animal'],
      nextProfile: 'both',
      library: [target],
    })
    expect(plan).toEqual({ kind: 'invalid', reason: 'empty-label' })
  })

  it('still writes the target when the loaded library is stale about it', () => {
    const grouped = sticker({ id: 'a', label: 'My drawing', sourceDrawingId: 'd1' })
    const plan = planStickerEdit({
      target: grouped,
      nextLabel: 'Dragon',
      nextTags: grouped.tags ?? [],
      nextProfile: 'both',
      library: [],
    })
    if (plan.kind !== 'write') throw new Error('expected a write')
    expect(plan.writes.map((w) => w.id)).toEqual(['a'])
  })
})
