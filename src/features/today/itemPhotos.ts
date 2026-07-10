import type { Artifact, ChecklistItem } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'

/** A single displayable photo for a checklist item: its URI + owning artifact id. */
export interface ItemPhoto {
  artifactId: string | undefined
  uri: string
}

/**
 * FEAT-62 polish: resolve the photo(s) the Today page can already *display* for a
 * checklist item — the same join the Artifacts section uses. That section renders
 * every photo artifact loaded for the day/child; an artifact belongs to an item
 * when its `tags.planItem` equals the item label (the title is derived from it).
 * We also honor the item's own `evidenceArtifactId` link. A photo the page can
 * show is a photo the backfill can analyze — no stricter. Multiple media URLs
 * (batch captures) and repeated captures under the same label are flattened and
 * de-duped by URI.
 */
export function resolveDisplayPhotos(
  item: ChecklistItem,
  artifacts: Artifact[],
): ItemPhoto[] {
  const out: ItemPhoto[] = []
  const seen = new Set<string>()
  const push = (a: Artifact) => {
    if (a.type !== EvidenceType.Photo) return
    const uris = a.mediaUrls && a.mediaUrls.length > 0 ? a.mediaUrls : a.uri ? [a.uri] : []
    for (const u of uris) {
      if (u && !seen.has(u)) {
        seen.add(u)
        out.push({ artifactId: a.id, uri: u })
      }
    }
  }
  // 1. The item's own linked evidence artifact (unless it points at a scan doc).
  if (item.evidenceArtifactId && item.evidenceCollection !== 'scans') {
    const linked = artifacts.find((a) => a.id === item.evidenceArtifactId)
    if (linked) push(linked)
  }
  // 2. Display parity: any photo artifact tagged to this plan item.
  for (const a of artifacts) {
    if (a.tags?.planItem === item.label) push(a)
  }
  return out
}
