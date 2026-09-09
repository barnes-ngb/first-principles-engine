/**
 * Setting a workbook's position BY HAND (UX-314).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Progress had exactly one way to say where a child had got to in a workbook:
 * photograph a page. `AddActivityDialog` offers "Current lesson (optional)" when
 * a row is CREATED, and the moment it is saved that field becomes unreachable —
 * the ⋮ menu offered Rename, Mark as complete, quick-log, Assign and Delete, and
 * nothing that could say "we're on lesson 14."
 *
 * That is fine right up until the scanner fails, which is the report this run
 * came from. With no by-hand route, a failing scan is not a degraded feature —
 * it is a wall, and the honest advice "try that page again" was the only advice
 * available. A records app needs the boring route to work when the clever one
 * does not.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A parent's typed position is AUTHORITATIVE, and may move a workbook BACKWARDS.
 * Scans are advance-only on purpose (`syncScanToConfig` writes a position only
 * when `lessonNumber > current`, so photographing an old page cannot rewind a
 * child's record). That rule protects against a stale photo; it must not also
 * stop a person correcting a number they can see is wrong. This is the
 * `evalModelSync` principle — source confidence gates a downgrade, and a human
 * looking at the book is the highest-confidence source there is.
 *
 * Pure: no React, no Firestore. It answers "is this a position, and what do we
 * say about it", nothing else.
 */

import type { ActivityConfig } from '../../core/types'

/** The most units any one program is allowed to claim. A guard against a typo
 *  (a slipped keypress turning 14 into 14000), not a real curriculum limit. */
export const MAX_POSITION = 9999

export type ParsedPosition =
  | { ok: true; position: number }
  | { ok: false; error: string }

/**
 * What the field is called, per row. A workbook counts lessons; a row with its
 * own `unitLabel` counts those. The label is the row's own word, never a guess.
 */
export function positionFieldLabel(config: Pick<ActivityConfig, 'unitLabel'>): string {
  const unit = config.unitLabel?.trim()
  if (!unit) return 'Current lesson'
  return `Current ${unit}`
}

/**
 * The line under the field. Names the total when the row knows one, so a parent
 * typing 61 into a 60-lesson book is told the bound before she is refused it.
 */
export function positionFieldHint(
  config: Pick<ActivityConfig, 'totalUnits' | 'unitLabel'>,
): string {
  const unit = config.unitLabel?.trim() || 'lesson'
  return config.totalUnits
    ? `This book has ${config.totalUnits} ${unit}s.`
    : 'The number you are on now.'
}

/**
 * Read a typed position.
 *
 * Deliberately strict about what a position IS (a whole number, at least 1) and
 * deliberately permissive about DIRECTION — see the module note. A blank field
 * is not an error to shout about, but it is not a write either.
 */
export function parsePositionInput(
  raw: string,
  config: Pick<ActivityConfig, 'totalUnits' | 'unitLabel'>,
): ParsedPosition {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Type the number you are on.' }
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'Use a whole number, like 14.' }
  }
  const position = Number(trimmed)
  if (position < 1) {
    return { ok: false, error: 'Use a whole number, like 14.' }
  }
  if (position > MAX_POSITION) {
    return { ok: false, error: `That looks too high — the most this can be is ${MAX_POSITION}.` }
  }
  const unit = config.unitLabel?.trim() || 'lesson'
  if (config.totalUnits && position > config.totalUnits) {
    return {
      ok: false,
      error: `This book has ${config.totalUnits} ${unit}s, so ${position} is past the end. Mark it complete instead, or raise the total when you add it.`,
    }
  }
  return { ok: true, position }
}

/**
 * The sentence confirming what was written. Names the move, because the whole
 * point of this door is that a parent is overriding what the app believed —
 * she should see both numbers.
 */
export function positionSavedNotice(
  config: Pick<ActivityConfig, 'name' | 'currentPosition' | 'unitLabel'>,
  position: number,
): string {
  const unit = config.unitLabel?.trim() || 'lesson'
  const from = config.currentPosition
  if (from == null || from === position) {
    return `${config.name} is at ${unit} ${position}.`
  }
  return `${config.name}: ${unit} ${from} → ${position}.`
}

/** What a parent reads when the write did not land. Says the row is UNCHANGED —
 *  the failure mode to avoid is her believing a correction was recorded. */
export function positionFailureNotice(config: Pick<ActivityConfig, 'name'>): string {
  return `Couldn't save that — ${config.name} is still where it was. Try again.`
}
