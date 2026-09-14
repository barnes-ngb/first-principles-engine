/**
 * The ONE answer to *does this artifact need a file, and did it get one*
 * (UX-432).
 *
 * The rule already existed — `dataReviewExport.logic.ts`'s integrity check #9,
 * `artifact-media-missing`, which reported **16 rows on Lincoln alone** in the
 * 2026-09-11 export (`UX-387`). What did not exist was any way for a SCREEN to
 * ask the same question, so a media-typed artifact with no file rendered as an
 * empty card: a row with a title and nothing under it, indistinguishable from a
 * row whose picture was still loading.
 *
 * Extracted here so the export's flag and the screen's sentence cannot disagree
 * about which rows they are talking about. `dataReviewExport.logic.ts` now reads
 * this; its behaviour is byte-identical and asserted so.
 *
 * ── The rule, and the two things it deliberately is not ────────────────────
 *
 * A `Note` carries its text in `content` and needs no file, so it is never
 * missing one — a note is **first-class evidence, not a degraded photo**.
 * A `Worksheet` is excluded for the same reason the export excludes it: the
 * type is written by scan paths that keep their record on the `scans` document,
 * and flagging them would report a defect that is not one.
 *
 * The legacy lowercase spellings (`'photo'`, `'audio'`, `'video'`) are carried
 * over verbatim from the export. They exist in stored data; dropping them here
 * would silently narrow a check that has been running against live records.
 */
import type { Artifact } from '../types'

/**
 * Said where a media-typed artifact never got its file.
 *
 * It lives beside the rule rather than beside either renderer, so the sentence
 * and the predicate that produces it cannot drift, and so a `components/` file
 * never has to reach up into `features/` for it.
 */
export const FILE_MISSING_LABEL = '(file missing)'

/** The types that are expected to carry a file or an address. */
export const MEDIA_BEARING_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'Photo',
  'photo',
  'Audio',
  'audio',
  'Video',
  'video',
])

/** Does this artifact's type expect media at all? */
export function artifactExpectsMedia(artifact: Pick<Artifact, 'type'>): boolean {
  return MEDIA_BEARING_ARTIFACT_TYPES.has(artifact.type as string)
}

/** Every address this artifact carries, `mediaUrls` first, de-duped. */
export function artifactMediaUrls(
  artifact: Pick<Artifact, 'uri' | 'mediaUrls'>,
): string[] {
  const urls = artifact.mediaUrls?.length
    ? artifact.mediaUrls
    : artifact.uri
      ? [artifact.uri]
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (u && !seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

/**
 * A media-typed artifact that carries neither `uri` nor a `mediaUrls` entry.
 *
 * `false` for a `Note` and for any other type that owes no file — the question
 * is "did the file that was promised arrive", not "is there a file".
 */
export function artifactMediaMissing(
  artifact: Pick<Artifact, 'type' | 'uri' | 'mediaUrls'>,
): boolean {
  return artifactExpectsMedia(artifact) && artifactMediaUrls(artifact).length === 0
}
