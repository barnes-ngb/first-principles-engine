import type { Sticker, StickerTag } from '../../core/types'

// ──────────────────────────────────────────────────────────────────
// Sticker label / edit planning (FEAT-160)
//
// One name per drawing. A drawing's versions (the cleaned original plus every
// AI-imagined themed version sharing a `sourceDrawingId`) all carry the same
// `label`, so renaming is a group operation — per-version names were considered
// and rejected by the owner. Both rename surfaces (the drawing card's pencil and
// the library's edit dialog) plan their writes here, so "what does a rename
// write" has exactly one definition.
//
// Two rails hold across both surfaces:
//   1. **Partial patches only.** Never a bare `setDoc` — editing a label must
//      not drop `sourceDrawingId` / `theme` / `isOriginal` or anything else.
//   2. **A no-op is not a write.** Saving a dialog nothing changed in, or
//      renaming to the string already stored, plans zero writes — so the UI has
//      nothing to claim it changed.
// ──────────────────────────────────────────────────────────────────

/** One planned Firestore write: a partial patch against a single sticker doc. */
export interface StickerWrite {
  id: string
  patch: Partial<Sticker>
}

export type StickerEditPlan =
  /** The typed label is empty once trimmed — nothing to save, say so. */
  | { kind: 'invalid'; reason: 'empty-label' }
  /** Nothing actually differs from what is stored. Close, write nothing. */
  | { kind: 'noop' }
  /** The patches to apply, and the label they settle on. */
  | { kind: 'write'; writes: StickerWrite[]; label: string }

/** The stored form of a typed label. */
export function normalizeStickerLabel(raw: string): string {
  return raw.trim()
}

/** Order-insensitive tag comparison — toggling a chip off and on is not a change. */
function sameTags(a: StickerTag[], b: StickerTag[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((t, i) => t === sortedB[i])
}

/**
 * Plan a group rename: give every version of one drawing the same new label.
 *
 * A version is written only if its own stored label differs from the target, so
 * renaming to the string already showing plans nothing (and a group whose
 * versions somehow drifted apart is pulled back together by one rename).
 * Versions with no id are skipped — there is nothing to address.
 */
export function planDrawingRename(
  rawNext: string,
  versions: Pick<Sticker, 'id' | 'label'>[],
): StickerEditPlan {
  const label = normalizeStickerLabel(rawNext)
  if (!label) return { kind: 'invalid', reason: 'empty-label' }
  const writes: StickerWrite[] = versions
    .filter((v) => !!v.id && v.label !== label)
    .map((v) => ({ id: v.id as string, patch: { label } }))
  return writes.length > 0 ? { kind: 'write', writes, label } : { kind: 'noop' }
}

export interface StickerEditInput {
  /** The sticker the edit dialog is open on. */
  target: Sticker
  nextLabel: string
  nextTags: StickerTag[]
  nextProfile: 'lincoln' | 'london' | 'both'
  /**
   * The loaded library. Used only to resolve the target's drawing-group
   * siblings, so a rename from the edit dialog stays a *group* rename rather
   * than quietly giving one version its own name.
   */
  library: Sticker[]
}

/**
 * Plan the library edit dialog's save: tags + "for" apply to the edited sticker
 * alone, while the label applies to its whole drawing group (or to just itself
 * when it is a standalone sticker).
 */
export function planStickerEdit(input: StickerEditInput): StickerEditPlan {
  const { target, nextLabel, nextTags, nextProfile, library } = input
  const label = normalizeStickerLabel(nextLabel)
  if (!label) return { kind: 'invalid', reason: 'empty-label' }
  if (!target.id) return { kind: 'noop' }

  // Group siblings, with the target guaranteed present even if the loaded
  // library is stale about it.
  const siblings = target.sourceDrawingId
    ? library.filter((s) => s.sourceDrawingId === target.sourceDrawingId)
    : []
  const members = siblings.some((s) => s.id === target.id) ? siblings : [target, ...siblings]

  const rename = planDrawingRename(label, members.length > 0 ? members : [target])
  const labelWrites = rename.kind === 'write' ? rename.writes : []

  const byId = new Map<string, StickerWrite>()
  for (const write of labelWrites) byId.set(write.id, { id: write.id, patch: { ...write.patch } })

  // Tags / profile are the edited sticker's own — never propagated to siblings.
  const targetPatch: Partial<Sticker> = {}
  if (!sameTags(target.tags ?? ['other'], nextTags)) targetPatch.tags = nextTags
  if ((target.childProfile ?? 'both') !== nextProfile) targetPatch.childProfile = nextProfile
  if (Object.keys(targetPatch).length > 0) {
    const existing = byId.get(target.id)
    byId.set(target.id, {
      id: target.id,
      patch: { ...(existing?.patch ?? {}), ...targetPatch },
    })
  }

  const writes = [...byId.values()]
  return writes.length > 0 ? { kind: 'write', writes, label } : { kind: 'noop' }
}
