/**
 * Today's evidence — the ONE answer to *what did this child leave behind
 * today, when, and against which row* (UX-431).
 *
 * ── Why it exists ──────────────────────────────────────────────────────────
 *
 * Owner, 2026-09-13: *"We should include any artifacts, not just the pictures,
 * but the time that they were added, details. This way any notes or just a line
 * entry on an activity is also included at the bottom of a day."*
 *
 * The day already had a full record of itself and the page did not show it.
 * Two lists existed and both were pictures-only in effect:
 *
 *   • the parent's `Artifacts` section (in `UnifiedCaptureCard`) drew a title, a
 *     type chip, and media for `Photo` and `Audio` — so a `Note`, a captured
 *     `Video` link and a `Worksheet` each rendered as a bare title, and nothing
 *     anywhere said WHEN or WHICH ROW; and
 *   • Kid Today's `My Stuff` drew a thumbnail for a `Photo`, an icon for a
 *     `Note`, a title and a time — and nothing at all for the other three.
 *
 * So this is **not a third list**. It is the one shape both of those render
 * now, which is the same discipline `FEAT-237` applied to the child pickers one
 * run earlier: the answer to "there are several of these" is one of them, not
 * another one.
 *
 * ── What it is not ─────────────────────────────────────────────────────────
 *
 * **It computes no minutes.** Hours live in the shared fold and on the Review;
 * a second place that adds up a day is how two numbers start disagreeing
 * (`UX-206`'s tautology, `UX-410`'s three prompt readers). The owner's sentence
 * asks for *what was captured*, and that is all this answers. An artifact's
 * `hours` row cannot honestly be named beside it either, because **there is no
 * join key between them** — the Capture card writes an `hours` document with no
 * artifact id — and matching on the notes string would attribute minutes by
 * guess. Filed as `UX-434`.
 *
 * **It writes nothing**, reads nothing, and is pure.
 *
 * ── Ordering ───────────────────────────────────────────────────────────────
 *
 * Oldest first — the order the day happened in. Both callers hold their list in
 * whatever order their own query returned (`TodayPage` sorts newest-first for
 * the checklist's photo join), so the order is decided here rather than at two
 * call sites that could disagree. A stamp that cannot be read sorts last: it
 * makes no claim about when, so it may not displace one that does.
 */
import type { Artifact, ChecklistItem } from '../../core/types'
import { EvidenceType } from '../../core/types/enums'
import { FILE_MISSING_LABEL, artifactMediaMissing } from '../../core/utils/artifactMedia'
import { formatClockTime, resolveFamilyTimeZone } from '../../core/utils/clockTime'

/** Who is reading. Capability, never a name. */
export const EvidenceAudience = {
  Parent: 'parent',
  Kid: 'kid',
} as const
export type EvidenceAudience =
  (typeof EvidenceAudience)[keyof typeof EvidenceAudience]

/**
 * The word a PARENT reads for each evidence type.
 *
 * A `Record<EvidenceType, string>`, so a sixth member of the enum fails to
 * compile until somebody decides what a person calls it — the same rail
 * `SECTION_FOR_TYPE` and `ACTIVITY_TYPE_WORDS` put on `ActivityType`.
 * `Worksheet` reads *Page* because that is what it is: a photographed page of a
 * book, and nobody in this family says "worksheet".
 */
export const EVIDENCE_WORD: Record<EvidenceType, string> = {
  [EvidenceType.Photo]: 'Photo',
  [EvidenceType.Note]: 'Note',
  [EvidenceType.Audio]: 'Audio',
  [EvidenceType.Video]: 'Video',
  [EvidenceType.Worksheet]: 'Page',
}

/**
 * The word a KID reads. Held to the shared readability bar
 * (`src/test/kidReadability.ts`), which is why two of them differ: *Audio* is
 * three syllables and *Video* is three, so a six-year-old gets **Sound** and
 * **Link** — and *Link* is the honest word anyway, a `Video` artifact being an
 * external address rather than a file (`UX-285`).
 */
export const KID_EVIDENCE_WORD: Record<EvidenceType, string> = {
  [EvidenceType.Photo]: 'Photo',
  [EvidenceType.Note]: 'Note',
  [EvidenceType.Audio]: 'Sound',
  [EvidenceType.Video]: 'Link',
  [EvidenceType.Worksheet]: 'Page',
}

/**
 * A stored `type` this app does not recognise. It has happened before —
 * lowercase `'photo'` / `'audio'` / `'video'` are live in this family's records
 * — so an unknown one is named as unknown rather than dropped from the day.
 */
export const UNKNOWN_EVIDENCE_WORD = 'Entry'
export const KID_UNKNOWN_EVIDENCE_WORD = 'Thing'

/** Said where a piece of evidence belongs to the day but to no row on it. */
export const UNATTACHED_ROW_LABEL = '(not attached to a row)'

/**
 * Said where a media-typed artifact never got its file (`UX-432` / `UX-387`).
 * Declared beside the rule that produces it (`core/utils/artifactMedia.ts`) and
 * re-exported here so this module stays the one place a surface reads its copy.
 */
export { FILE_MISSING_LABEL } from '../../core/utils/artifactMedia'
/** The same fact, for a kid. Two words, one syllable each. */
export const KID_FILE_MISSING_LABEL = '(no file)'

/** The heading over the section. */
export const EVIDENCE_SECTION_TITLE = 'Today’s evidence'
export const KID_EVIDENCE_SECTION_TITLE = 'What you did today'

/** One line, never an empty card. */
export const EVIDENCE_EMPTY_LINE = 'Nothing captured yet today.'
export const KID_EVIDENCE_EMPTY_LINE = 'Nothing saved yet today.'

/**
 * A failed read is never rendered as a result — the house rule, stated in four
 * places on the weekly review alone. An empty day and a day whose read dropped
 * are different facts and this surface says which.
 */
export const EVIDENCE_FAILED_LINE =
  'Couldn’t load today’s evidence. It’s still saved — try again.'
export const KID_EVIDENCE_FAILED_LINE = 'Could not load your stuff.'

/**
 * The trailing `(20m)` a planner label carries.
 *
 * TEN sites in `src/features/today/` strip it with their own inline copy of the
 * regex — six of them WITHOUT the `$` anchor, so they do not all agree about a
 * label carrying minutes anywhere but the end. This is the eleventh occurrence
 * and the first NAMED one; the consolidation is filed as `UX-435` rather than
 * done here, because rewiring ten live label paths (two of which feed a `days`
 * write's stored `label`) is a wider change than this read-only section earns,
 * and because the anchorless copies mean it has to decide which behaviour is
 * right rather than just move code. The count is derived, not read off:
 * `grep -rn 'replace(/\s\*\\(\\d+m\\)' src/features/today/ | grep -v '\.test\.'`.
 */
const LABEL_MINUTES = /\s*\(\d+m\)\s*$/

/** A row label as a person reads it. */
export function evidenceRowLabel(label: string): string {
  return label.replace(LABEL_MINUTES, '').trim()
}

/** One line of the day's record. */
export interface TodayEvidenceEntry {
  /** The artifact's document id, or a stable fallback when it has none. */
  key: string
  /** `"9:05 AM"` in the family's zone, or `null` for an unreadable stamp. */
  time: string | null
  /** *Photo · Note · Audio · Video · Page* — the audience's word. */
  typeWord: string
  /** The checklist row this belongs to, or `null` when it belongs to none. */
  rowLabel: string | null
  /** The artifact's own title. */
  title: string
  /**
   * The detail lines, in the order a person wants them: the parent's `notes`
   * verbatim, then the artifact's own text (`content`), then the strand topic.
   * De-duped against each other and against the title, because several writers
   * copy the same string into two fields (`UX-285`: a video's address lands in
   * both `uri` and `content`).
   */
  details: string[]
  /** True where a media-typed artifact never got its file. */
  fileMissing: boolean
  /** The artifact itself, for the shared media renderer. */
  artifact: Artifact
}

function wordFor(type: EvidenceType, audience: EvidenceAudience): string {
  const table = audience === EvidenceAudience.Kid ? KID_EVIDENCE_WORD : EVIDENCE_WORD
  return (
    table[type] ??
    (audience === EvidenceAudience.Kid
      ? KID_UNKNOWN_EVIDENCE_WORD
      : UNKNOWN_EVIDENCE_WORD)
  )
}

/**
 * Which checklist row does this artifact belong to?
 *
 * Three routes, strongest first, and **the two weak ones refuse an ambiguous
 * answer** — the `todayRowKind` rule (a single distinct answer or none),
 * because naming the wrong row is worse than naming none:
 *
 *  1. **The row claims it.** `evidenceArtifactId` is written by the capture that
 *     linked them, so it is the row's own word and is taken even when two rows
 *     carry it — `UX-404`'s duplicate-row case, where both rows really are the
 *     same work.
 *  2. **`tags.planItem`** — the capture stamps the row's label on the artifact.
 *     This is the join `resolveDisplayPhotos` already uses for the *Captured*
 *     chip, so the chip and this list can never disagree about a photo.
 *  3. **`activityConfigId`** — written by strand capture (`UX-282`) and matched
 *     against the row's own `activityConfigId` / `workbookConfigId` /
 *     `strandConfigId` stamps.
 *
 * A row an artifact is matched to by 2 or 3 is an inference; a `null` here is
 * read as *(not attached to a row)*, which is a true statement about what this
 * page can tell, never a claim that the work belonged to nothing.
 */
export function resolveEvidenceRow(
  artifact: Artifact,
  checklist: readonly ChecklistItem[],
): ChecklistItem | null {
  if (artifact.id) {
    const claimed = checklist.find(
      (i) => i.evidenceCollection !== 'scans' && i.evidenceArtifactId === artifact.id,
    )
    if (claimed) return claimed
  }
  const planItem = artifact.tags?.planItem
  if (planItem) {
    const byLabel = checklist.filter((i) => i.label === planItem)
    if (byLabel.length === 1) return byLabel[0]
  }
  const configId = artifact.activityConfigId
  if (configId) {
    const byConfig = checklist.filter(
      (i) =>
        i.activityConfigId === configId ||
        i.workbookConfigId === configId ||
        i.strandConfigId === configId,
    )
    if (byConfig.length === 1) return byConfig[0]
  }
  return null
}

/**
 * The detail lines for one artifact, de-duped and trimmed.
 *
 * **`contentNote` is parent-only, and that is the field's own contract**
 * (Codex round 1, P2). FEAT-141 writes it as a short plain-language description
 * of what a captured image shows, produced by the classification pass that
 * already runs on that path — *"parent-side metadata for curation / portfolio /
 * compliance — **never rendered to a child**"*. For a photo or a scanned page
 * captured through `useUnifiedCapture` it is the **only** descriptive detail
 * the record carries, the title being a generic row label, so dropping it left
 * the parent's list with nothing to say about exactly the captures the owner's
 * sentence was about. The audience gate is therefore load-bearing rather than
 * cosmetic, and is asserted in both directions.
 */
export function evidenceDetails(
  artifact: Artifact,
  audience: EvidenceAudience = EvidenceAudience.Parent,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (value: string | undefined) => {
    const text = value?.trim()
    if (!text) return
    // A video stores its address in both `uri` and `content` (UX-285), and
    // several writers seed the title from the note's own first line — showing
    // either twice is noise, not a second fact.
    if (text === artifact.uri) return
    if (text === artifact.title?.trim()) return
    if (seen.has(text)) return
    seen.add(text)
    out.push(text)
  }
  push(artifact.notes)
  push(artifact.content)
  if (audience === EvidenceAudience.Parent) push(artifact.contentNote)
  push(artifact.topic)
  return out
}

export interface BuildTodayEvidenceArgs {
  artifacts: readonly Artifact[]
  checklist?: readonly ChecklistItem[]
  audience: EvidenceAudience
  /**
   * The family's own `FamilySettings.timeZone`, where they have set one. Passed
   * through `resolveFamilyTimeZone`, so an unset or unparseable value reads as
   * the app's default rather than taking the whole time column away.
   */
  timeZone?: string
}

/** The day's record, oldest first. Pure; writes nothing, reads nothing. */
export function buildTodayEvidence({
  artifacts,
  checklist = [],
  audience,
  timeZone,
}: BuildTodayEvidenceArgs): TodayEvidenceEntry[] {
  const rows = artifacts.map((artifact, index) => {
    const row = resolveEvidenceRow(artifact, checklist)
    const entry: TodayEvidenceEntry = {
      key: artifact.id ?? `${artifact.createdAt ?? 'unstamped'}-${index}`,
      time: formatClockTime(artifact.createdAt, resolveFamilyTimeZone(timeZone)),
      typeWord: wordFor(artifact.type, audience),
      rowLabel: row ? evidenceRowLabel(row.label) : null,
      title: artifact.title?.trim() ?? '',
      details: evidenceDetails(artifact, audience),
      fileMissing: artifactMediaMissing(artifact),
      artifact,
    }
    return { entry, index, stamp: artifact.createdAt ?? '' }
  })
  return rows
    .sort((a, b) => {
      const aOk = a.entry.time !== null
      const bOk = b.entry.time !== null
      // A stamp nobody can read makes no claim about when, so it may not
      // displace one that does: unreadable stamps go last, in input order.
      if (aOk !== bOk) return aOk ? -1 : 1
      const byStamp = a.stamp.localeCompare(b.stamp)
      return byStamp !== 0 ? byStamp : a.index - b.index
    })
    .map((r) => r.entry)
}

/** The audience's copy, in one place so a surface cannot mix the two. */
export interface EvidenceCopy {
  title: string
  emptyLine: string
  failedLine: string
  fileMissingLabel: string
  /** Absent for a kid: *(not attached to a row)* is a filing word, not his. */
  unattachedLabel: string | null
}

export function evidenceCopy(audience: EvidenceAudience): EvidenceCopy {
  if (audience === EvidenceAudience.Kid) {
    return {
      title: KID_EVIDENCE_SECTION_TITLE,
      emptyLine: KID_EVIDENCE_EMPTY_LINE,
      failedLine: KID_EVIDENCE_FAILED_LINE,
      fileMissingLabel: KID_FILE_MISSING_LABEL,
      unattachedLabel: null,
    }
  }
  return {
    title: EVIDENCE_SECTION_TITLE,
    emptyLine: EVIDENCE_EMPTY_LINE,
    failedLine: EVIDENCE_FAILED_LINE,
    fileMissingLabel: FILE_MISSING_LABEL,
    unattachedLabel: UNATTACHED_ROW_LABEL,
  }
}
