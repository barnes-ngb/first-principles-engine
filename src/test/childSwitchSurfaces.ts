/**
 * The child-switch surface registry — UX-329.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `UX-324` made the active child changeable from the app shell. Five review
 * rounds on PR #1817 then found, one round at a time, that a mounted surface
 * holding child-scoped state in local React state and writing it with the LIVE
 * `activeChildId` silently re-targets on a switch: a generated story re-filed
 * under the newly-selected child, a Workshop wizard following the switch, a
 * dirty goal stack saved onto another child's record, a creative timer
 * crediting its minutes to whoever was active when it stopped. Six were fixed
 * one per round. Round 5 named three more and said the honest thing: the
 * per-surface answers are each different, and bounding this needs a rule at the
 * shell rather than another patch.
 *
 * The reason it was found one round at a time is that **nothing in the repo
 * knew the list existed**. This module is that list, derived from the source
 * rather than typed out, so a surface cannot join the class unnoticed. The
 * census (`docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md`) is the
 * registry; `childSwitchSurfaces.invariant.test.ts` is the enforcement.
 *
 * ── The five verdicts ──────────────────────────────────────────────────────
 *
 * Every candidate declares one. They are the vocabulary the six PR #1817 fixes
 * turned out to need; see {@link ChildSwitchVerdict}.
 *
 * ── Fail closed ────────────────────────────────────────────────────────────
 *
 * `[ledger-shape]` (PR #1814) exists because a guard that passes on malformed
 * input is worse than no guard: it reports PASS while reading nothing. So every
 * parse failure here is an error, not an empty result — a census that does not
 * parse, a row with the wrong number of cells, a blank cell, an unrecognised
 * verdict and a row naming a file that no longer exists are all reported, and a
 * census whose table yields zero rows is reported rather than trivially
 * satisfying "every candidate is classified".
 *
 * Pure: no `node:fs`, no React. The caller supplies the file list.
 */

/** What a mounted editor does when the scoped identity under it changes. */
export const ChildSwitchVerdict = {
  /**
   * The work is unsaved and expensive to recreate, so the WRITE is bound to the
   * identity the work was created under. `CreateSightWordBook` (a generated
   * story cost a paid call); `useCreativeTimer`'s `ownerChildId`.
   */
  Bind: 'BIND',
  /**
   * The work is already persisted under its own child, so the surface stops
   * rendering for the new child and is restored on switching back. Nothing is
   * written, so switching back is lossless. `WorkshopPage`.
   */
  Hide: 'HIDE',
  /**
   * The work is cheap to retype, so it is re-seeded from the new child, `dirty`
   * cleared, and THE LOSS MADE VISIBLE. `GoalBuilder`; `QuickAddHours`.
   */
  Reset: 'RESET',
  /**
   * The read has not settled or has FAILED, so the surface is not editable at
   * all. A failed read is not an affirmative empty result — the house rule, and
   * the exact defect Codex round 5 caught in `useBusinessGoal`.
   */
  Gate: 'GATE',
  /**
   * It genuinely carries its own id, or holds nothing across a switch. The
   * census row must SAY WHY, with the line that makes it true; an unexplained
   * SAFE is the row that comes back as a P1.
   */
  Safe: 'SAFE',
} as const
export type ChildSwitchVerdict =
  (typeof ChildSwitchVerdict)[keyof typeof ChildSwitchVerdict]

export const CHILD_SWITCH_VERDICTS: readonly ChildSwitchVerdict[] =
  Object.values(ChildSwitchVerdict)

/** How the surface comes by the child identity it writes with. */
export const CandidateArm = {
  /** Reads `useActiveChild` itself — the shell switch reaches it directly. */
  Hook: 'hook',
  /** Is handed a `childId` by its caller — reached THROUGH a parent. */
  Prop: 'prop',
} as const
export type CandidateArm = (typeof CandidateArm)[keyof typeof CandidateArm]

export interface SourceFile {
  /** Repo-relative, forward slashes (`src/features/...`). */
  path: string
  source: string
}

export interface Candidate {
  path: string
  arm: CandidateArm
}

// ── The heuristic ───────────────────────────────────────────────────────────
//
// It OVER-MATCHES on purpose. A surface it catches that turns out to be fine
// costs one SAFE row with a reason; a surface it cannot see is a hole, and a
// hole in this particular list is how three P1s went unnoticed for five rounds.
// The shapes it still misses are named in the census's own "What the heuristic
// cannot see" section and were checked by hand.

/** A Firestore write, as this repo spells one. */
const FIRESTORE_WRITE =
  /\b(?:setDoc|addDoc|updateDoc|deleteDoc|runTransaction|writeBatch)\s*\(/

/**
 * A child id handed to a call in argument position — the shape that catches a
 * component which submits through a callback prop rather than writing directly.
 * `SaleEntryForm` is exactly that (`onLogSale({ childId, ... })`) and is one of
 * the three P1s, so a write-only predicate would have missed it.
 */
const SUBMITS_CHILD = /^\s*(?:childId|activeChildId|ownerChildId)\s*[,:]/m

/**
 * A child id handed to a call in POSITIONAL argument position —
 * `applyUpdate(familyId, activeChildId, pendingResult)`.
 *
 * Added by Codex round 1 on PR #1820, which found the first version of this
 * heuristic silent on `CertificateScanSection`: it holds a scanned certificate
 * awaiting Confirm, reads `useActiveChild`, and delegates the write through a
 * positional argument — so it matched neither the Firestore-write predicate nor
 * the object-shorthand one, and the census reported green over a live P1 on the
 * `activityConfigs` / `skillSnapshots` rail. **A guard that passes on the case
 * it was written for is worse than no guard**, which is the whole `[ledger-shape]`
 * lesson this module is built on, so the fix is to widen the heuristic rather
 * than to add that one file to the census by hand.
 *
 * Bounded to a single call's parentheses (`[^()]*`) so it cannot match across
 * an unrelated expression, and it costs 14 more rows — all SAFE or already
 * answered. That is the trade this arm exists to make: over-matching costs a
 * row with a reason, under-matching costs a P1 nobody sees.
 */
const SUBMITS_CHILD_POSITIONALLY =
  /[A-Za-z_$][\w$]*\s*\([^()]*\b(?:childId|activeChildId|ownerChildId)\b\s*[,)]/

/** Holds React state that can outlive a child change. */
const HOLDS_STATE = /\buseState\s*[<(]/

/** Declares a `childId` prop or parameter. */
const TAKES_CHILD_PROP = /\bchildId\s*\??\s*:\s*string/

/** Reads the shell's single source of truth for the active child. */
const READS_ACTIVE_CHILD = /useActiveChild/

/**
 * Is this file a candidate, and by which arm?
 *
 * The prop arm requires an actual Firestore write for a `.ts` file and accepts
 * the submits-a-child shape for a `.tsx` one. The asymmetry is deliberate and
 * narrow: a `.ts` hook that merely names `childId` in a returned object or a
 * query is a subscription, not an editor, and admitting all of those would bury
 * the registry in rows that say "reads only" — while a `.tsx` file that names a
 * child id in argument position is a form handing a draft to its parent, which
 * is the case that must not be missed.
 */
export function classifyCandidate(file: SourceFile): Candidate | null {
  const { path, source } = file
  if (!HOLDS_STATE.test(source)) return null
  const writes = FIRESTORE_WRITE.test(source)
  const submits =
    SUBMITS_CHILD.test(source) || SUBMITS_CHILD_POSITIONALLY.test(source)
  if (READS_ACTIVE_CHILD.test(source)) {
    if (writes || submits) {
      return { path, arm: CandidateArm.Hook }
    }
    return null
  }
  if (!TAKES_CHILD_PROP.test(source)) return null
  if (writes || (path.endsWith('.tsx') && submits)) {
    return { path, arm: CandidateArm.Prop }
  }
  return null
}

/** Every candidate in the given files, sorted by path for a stable census. */
export function deriveChildSwitchCandidates(files: readonly SourceFile[]): Candidate[] {
  const out: Candidate[] = []
  for (const f of files) {
    const c = classifyCandidate(f)
    if (c) out.push(c)
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

// ── The census, as data ─────────────────────────────────────────────────────

export interface CensusRow {
  path: string
  verdict: string
  severity: string
  /** 1-indexed line in the census file, for an error a person can act on. */
  line: number
  /** Every cell between the outer pipes, trimmed. */
  cells: string[]
}

/** The column count the census table is written with. */
export const CENSUS_COLUMNS = 6
/** 1-indexed: Surface · State · Writes · Reachable · **Verdict** · Severity. */
const VERDICT_COLUMN = 5
const SEVERITY_COLUMN = 6

/**
 * Split a markdown table row on its UNESCAPED pipes.
 *
 * A row body legitimately contains `childId \| 'both'` — the escape markdown
 * needs for a literal pipe inside a cell. A naive `split('|')` counts that as a
 * column boundary, which is precisely the class `[ledger-shape]` was written
 * for: the row renders correctly and the guard reads it wrong.
 */
function splitRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      current += '\\|'
      i += 1
      continue
    }
    if (ch === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

/**
 * Rows of the census's surface table: any table row whose first cell is a code
 * span naming a path under `src/`. Header, separator and prose rows are not
 * rows; a row that looks like one and is malformed IS returned, so the caller
 * can report it rather than silently reading past it.
 */
export function parseCensusRows(markdown: string): CensusRow[] {
  const out: CensusRow[] = []
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (!line.trimStart().startsWith('|')) return
    // Deliberately not anchored to a closing `|`: a first cell decorated with
    // anything after the path must still PARSE, so that a row which looks like
    // a registry row is checked rather than silently skipped. A skipped row is
    // the `[ledger-shape]` failure — the guard reports PASS on what it did not
    // read.
    const m = line.match(/^\s*\|\s*`(src\/[^`]+)`/)
    if (!m) return
    const cells = splitRow(line)
    // cells[0] is '' from the leading pipe; the trailing pipe adds a final ''.
    const body = cells.slice(1, cells.length - 1)
    out.push({
      path: m[1],
      verdict: body[VERDICT_COLUMN - 1] ?? '',
      severity: body[SEVERITY_COLUMN - 1] ?? '',
      line: i + 1,
      cells: body,
    })
  })
  return out
}

export interface CensusProblem {
  kind:
    | 'unclassified'
    | 'stale-row'
    | 'duplicate-row'
    | 'bad-verdict'
    | 'blank-cell'
    | 'bad-shape'
    | 'empty-census'
  message: string
}

/** The bare verdict token inside a cell like `**BIND**` or `BIND — because…`. */
function verdictToken(cell: string): string {
  const m = cell.match(/\b(BIND|HIDE|RESET|GATE|SAFE)\b/)
  return m ? m[1] : ''
}

/**
 * Everything wrong with the census, relative to the source it describes.
 *
 * Returns problems rather than throwing so the caller can report all of them at
 * once — one red run that names five new surfaces beats five red runs.
 */
export function censusProblems(
  candidates: readonly Candidate[],
  rows: readonly CensusRow[],
  existingPaths: ReadonlySet<string>,
): CensusProblem[] {
  const problems: CensusProblem[] = []

  if (rows.length === 0) {
    problems.push({
      kind: 'empty-census',
      message:
        'the census surface table produced no rows — a guard that reads nothing reports PASS on everything',
    })
    return problems
  }

  const seen = new Set<string>()
  for (const row of rows) {
    if (row.cells.length !== CENSUS_COLUMNS) {
      problems.push({
        kind: 'bad-shape',
        message: `line ${row.line}: ${row.cells.length} cells, expected ${CENSUS_COLUMNS} (escape any literal \`|\` as \\|) — \`${row.path}\``,
      })
      continue
    }
    if (row.cells.some((c) => c === '')) {
      problems.push({
        kind: 'blank-cell',
        message: `line ${row.line}: a blank cell — every column must be answered — \`${row.path}\``,
      })
    }
    if (!CHILD_SWITCH_VERDICTS.includes(verdictToken(row.verdict) as ChildSwitchVerdict)) {
      problems.push({
        kind: 'bad-verdict',
        message: `line ${row.line}: verdict "${row.verdict}" is not one of ${CHILD_SWITCH_VERDICTS.join(' / ')} — \`${row.path}\``,
      })
    }
    if (seen.has(row.path)) {
      problems.push({
        kind: 'duplicate-row',
        message: `line ${row.line}: \`${row.path}\` is listed twice`,
      })
    }
    seen.add(row.path)
    if (!existingPaths.has(row.path)) {
      problems.push({
        kind: 'stale-row',
        message: `line ${row.line}: \`${row.path}\` no longer exists — delete the row or fix the path`,
      })
    }
  }

  for (const c of candidates) {
    if (!seen.has(c.path)) {
      problems.push({
        kind: 'unclassified',
        message: `\`${c.path}\` (${c.arm} arm) reads a child identity, holds editable state and writes, but has no census row — give it a verdict (${CHILD_SWITCH_VERDICTS.join(' / ')})`,
      })
    }
  }

  return problems
}

/** Verdict tallies, for the census's own derived numbers. */
export function tallyVerdicts(rows: readonly CensusRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of CHILD_SWITCH_VERDICTS) out[v] = 0
  for (const row of rows) {
    const token = verdictToken(row.verdict)
    if (token) out[token] = (out[token] ?? 0) + 1
  }
  return out
}

/** Severity tallies (`P1` / `P2` / `P3` / anything else as `—`). */
export function tallySeverities(rows: readonly CensusRow[]): Record<string, number> {
  const out: Record<string, number> = { P1: 0, P2: 0, P3: 0, '—': 0 }
  for (const row of rows) {
    const m = row.severity.match(/\bP[123]\b/)
    out[m ? m[0] : '—'] += 1
  }
  return out
}
