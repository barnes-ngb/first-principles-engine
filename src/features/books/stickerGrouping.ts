import type { Sticker } from '../../core/types'

/**
 * A source-drawing group (FEAT-33 slice 3): the cleaned original plus every
 * AI-imagined themed version that shares its `sourceDrawingId`.
 */
export interface DrawingGroup {
  sourceDrawingId: string
  /** Card representative — the original if it still exists, else the earliest version. */
  representative: Sticker
  /** All versions in the group: original first, then themed versions oldest→newest. */
  versions: Sticker[]
}

export interface GroupedStickers {
  /** Stickers that share a source drawing, collapsed into labeled cards. */
  drawings: DrawingGroup[]
  /** Stickers with no `sourceDrawingId` (text→sticker, legacy) — render as-is. */
  standalone: Sticker[]
}

function byCreatedAtAsc(a: Sticker, b: Sticker): number {
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}

/**
 * Split a flat sticker list into source-drawing groups + standalone stickers.
 *
 * Backward-compatible: any sticker without `sourceDrawingId` is standalone and
 * untouched. Within a group, the original (`isOriginal`) sorts first and is the
 * card representative; if the original was deleted, the earliest remaining
 * version represents the card so the group still holds together by id. Group
 * display order follows first appearance in the input (callers pass newest-first,
 * so a freshly-touched drawing naturally surfaces).
 */
export function groupStickers(stickers: Sticker[]): GroupedStickers {
  const standalone: Sticker[] = []
  const groups = new Map<string, Sticker[]>()
  // Insertion order of group keys = first time we see a member.
  const order: string[] = []

  for (const sticker of stickers) {
    const key = sticker.sourceDrawingId
    if (!key) {
      standalone.push(sticker)
      continue
    }
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(sticker)
  }

  const drawings: DrawingGroup[] = order.map((key) => {
    const members = groups.get(key)!
    const versions = [...members].sort((a, b) => {
      // Original anchors the strip; the rest run oldest→newest.
      if (a.isOriginal && !b.isOriginal) return -1
      if (!a.isOriginal && b.isOriginal) return 1
      return byCreatedAtAsc(a, b)
    })
    const representative = versions.find((s) => s.isOriginal) ?? versions[0]
    return { sourceDrawingId: key, representative, versions }
  })

  return { drawings, standalone }
}
