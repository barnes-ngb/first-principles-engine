/**
 * FEAT-141: the one-line content note that rides along with a captured image.
 *
 * Owner direction (Nathan, 2026-08-13): *"We need to analyze every image and
 * keep that description"* — short, not cumbersome, and reusing analysis that
 * already happens rather than paying for a second look at the same photo.
 *
 * Two producers, one shape:
 *  - **Scans** derive their note DETERMINISTICALLY from the analysis already
 *    stored on the scan (`results`). No AI call, no new round-trip — the fields
 *    are already there, this just reads them in a fixed order.
 *  - **Artifacts** take the note the capture-time classification pass emits
 *    (`results.contentNote`, added to the existing `scan` prompt — same call),
 *    falling back to the deterministic derivation when the model omitted it.
 *
 * Rails this module holds:
 *  - **Length is capped at write** (`CONTENT_NOTE_MAX_LENGTH`), never at read.
 *    A note is metadata on a photo, not a paragraph.
 *  - **Absent stays absent.** Every function returns `undefined` rather than an
 *    empty string or a guess, so a capture that learned nothing writes no field
 *    (Firestore rejects `undefined`, so callers spread conditionally).
 *  - **Parent-side only.** The note feeds curation, portfolio and compliance.
 *    Nothing here is rendered to a child.
 */

import type { ScanResult } from '../types/planning'
import { isCertificateScan } from '../types/planning'

/** Hard ceiling on a stored content note. Short by design — it is a label, not prose. */
export const CONTENT_NOTE_MAX_LENGTH = 140

/**
 * What the app already knows about a capture at the moment it happens. Passed
 * into the classification pass so the note is grounded in the day's context
 * (which checklist item, which subject) instead of guessed from pixels alone.
 * The child is already in the scan prompt via the childProfile slice.
 */
export interface CaptureContext {
  /** Checklist item label the photo was captured against. */
  itemLabel?: string
  /** Subject bucket of that item. */
  subjectBucket?: string
}

/**
 * Normalize a candidate note: collapse whitespace, trim, enforce the cap.
 * Returns `undefined` for anything that isn't a usable string, so callers can
 * spread the field conditionally.
 */
export function clampContentNote(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed) return undefined
  if (collapsed.length <= CONTENT_NOTE_MAX_LENGTH) return collapsed
  // Cut at the last word boundary that leaves room for the ellipsis.
  const head = collapsed.slice(0, CONTENT_NOTE_MAX_LENGTH - 1)
  const lastSpace = head.lastIndexOf(' ')
  const body = lastSpace > CONTENT_NOTE_MAX_LENGTH / 2 ? head.slice(0, lastSpace) : head
  return `${body.trimEnd()}…`
}

/** `Lesson 47` / `p.73` / `` — whichever the scan actually identified. */
function positionLabel(lessonNumber?: number | null, pageNumber?: number | null): string {
  if (typeof lessonNumber === 'number' && Number.isFinite(lessonNumber)) {
    return `Lesson ${lessonNumber}`
  }
  if (typeof pageNumber === 'number' && Number.isFinite(pageNumber)) {
    return `p.${pageNumber}`
  }
  return ''
}

function joinNote(head: string, tail: string): string | undefined {
  const h = head.trim()
  const t = tail.trim()
  if (h && t) return clampContentNote(`${h} — ${t}`)
  return clampContentNote(h || t)
}

/**
 * Derive a note from a scan's own stored analysis. Deterministic and free —
 * every field read here was already written by the scan pipeline.
 *
 * Worksheet shape: `"<curriculum> <Lesson N|p.N> — <topic>"`, e.g.
 * `"GATB Math 3 p.73 — elapsed time + multiplication facts"`. Falls back to the
 * subject when no curriculum was identified, and to the targeted skills when
 * the model gave no `specificTopic`. Certificate shape: `"<curriculum> <level>
 * — <milestone>"`.
 */
export function deriveScanContentNote(results: ScanResult | null | undefined): string | undefined {
  if (!results) return undefined

  if (isCertificateScan(results)) {
    const head = [results.curriculumName, results.level].filter(Boolean).join(' ')
    return joinNote(head, results.milestone ?? '')
  }

  const detected = results.curriculumDetected
  const head = [
    detected?.name || detected?.levelDesignation || results.subject || '',
    positionLabel(detected?.lessonNumber, detected?.pageNumber),
  ]
    .filter(Boolean)
    .join(' ')

  const skills = (results.skillsTargeted ?? [])
    .map((s) => s?.skill)
    .filter((s): s is string => !!s && !!s.trim())
    .slice(0, 2)
    .join(' + ')
  const tail = results.specificTopic?.trim() || skills

  return joinNote(head, tail)
}

/**
 * The note to stamp on an ARTIFACT captured through the classification pass.
 *
 * Prefers the one-liner the pass itself emitted (it saw the photo and the
 * capture context, so it can describe a Lego build or a science setup that the
 * workbook-shaped fields can't), and falls back to the deterministic derivation
 * when the model omitted it. Returns `undefined` when neither produced anything
 * — a capture never invents a description of an image nobody read.
 */
export function pickArtifactContentNote(results: ScanResult | null | undefined): string | undefined {
  if (!results) return undefined
  const emitted = clampContentNote((results as { contentNote?: unknown }).contentNote)
  return emitted ?? deriveScanContentNote(results)
}
