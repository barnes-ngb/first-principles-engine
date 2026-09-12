/**
 * Every place time or evidence is written, and every place it is read — the
 * pure rule behind AUDIT-234's census.
 *
 * `docs/review/TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md` is the registry this
 * module derives and the guard
 * (`src/test/timeLedger.invariant.test.ts`) keeps honest. Both it and
 * `npm run census:time-ledger` read THIS file, so the document's numbers and
 * the rule that stops the document going stale cannot drift apart — the
 * `childSwitchSurfaces.ts` construction, for its reason.
 *
 * ── What counts as a surface ────────────────────────────────────────────────
 *
 * The four collections a day's time and evidence live in:
 *
 *   • `hours`            — an entry with minutes (a timer, a capture, a quick-add)
 *   • `hoursAdjustments` — a correction or a credit, positive or negative
 *   • `days`             — the day log: blocks with actuals, checklist items
 *   • `artifacts`        — the evidence, which carries no minutes of its own
 *
 * A file is a **candidate** when it names one of them, either through the app's
 * collection helpers (`hoursCollection(`, …) or through a raw Firestore path on
 * the functions side. `core/firebase/firestore.ts` — where the four helpers are
 * defined — is not one: it builds the references and touches no document, and a
 * registry row for it would say nothing a reader needs.
 *
 * ── What the heuristic cannot see, and why that is stated not hidden ────────
 *
 * Classification is per FILE and by regex, so a file that both reads and writes
 * is `BOTH` and a file that writes one collection and reads another is not
 * distinguished. That is deliberate and matches `todaySurfaceCensus.ts`'s
 * accounting: read/write intent per call site is not derivable by a scan, so the
 * registry's own columns say which door does what, per file, by hand. What the
 * derivation guarantees is COMPLETENESS — that no file touching the time record
 * is absent from the document — which is the property a census is for and the
 * one that is expensive to check by reading.
 *
 * Pure: no I/O. The file walk lives in `timeLedgerSources.ts`.
 */

export interface SourceFile {
  path: string
  source: string
}

/** The four collections a day's time and evidence live in. */
export const TIME_COLLECTIONS = [
  'hours',
  'hoursAdjustments',
  'days',
  'artifacts',
] as const
export type TimeCollection = (typeof TIME_COLLECTIONS)[number]

/** What a file does with the collections it names. */
export const Role = {
  /** Writes at least one of them (and may read too). */
  Write: 'WRITE',
  /** Reads at least one of them, and writes none. */
  Read: 'READ',
  /** Both, which a file-level scan cannot split further. */
  Both: 'BOTH',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export interface TimeLedgerSurface {
  path: string
  /** The collections this file names, in `TIME_COLLECTIONS` order. */
  collections: TimeCollection[]
  role: Role
}

/** Comments stripped, so prose about a collection is never counted as a use. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Does this code name this collection?
 *
 * Two spellings, because the two projects reach Firestore differently: the app
 * goes through the typed helpers in `core/firebase/firestore.ts`
 * (`hoursCollection(familyId)`), and the Cloud Functions build raw paths
 * (`db.collection("families/${familyId}/hours")`, `.collection("days")`).
 *
 * `days` is matched on the whole segment so `dailyPlans` and `dayLogId` do not
 * count, and the helper form is anchored on the exact helper name so
 * `hoursAdjustmentsCollection` is never read as `hoursCollection`.
 */
export function namesCollection(code: string, collection: TimeCollection): boolean {
  const helper = new RegExp(`\\b${collection}Collection\\s*\\(`)
  if (helper.test(code)) return true
  // Raw path: a `collection(...)` call whose quoted argument is either exactly
  // the collection name (`.collection("days")`) or a path whose LAST segment is
  // (`collection(\`families/${familyId}/hours\`)`). The back-reference keeps the
  // two quotes the same, and requiring either the opening quote or a `/` before
  // the name is what stops `holidays` reading as `days`.
  const raw = new RegExp(
    `collection\\(\\s*(["'\`])(?:[^"'\`]*/)?${collection}\\1`,
  )
  return raw.test(code)
}

/**
 * The write verbs, INCLUDING this repo's own guarded day writers.
 *
 * `setDayLogGuarded` / `deleteDayLogGuarded` are load-bearing here: every write
 * to `days` routes through `today/dayWriteGuard.ts` (enforced by
 * `docs:check`'s own `[day-write-routing]` rule), so a file that calls one of
 * them and never names `setDoc` is a day-log WRITER — `watch/writeWatchItemToDay.ts`
 * being the clearest case, a file whose entire job is the write. Reading the raw
 * verbs alone would have classified four of this repo's day writers as readers.
 */
const WRITE_VERBS =
  /\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|setDayLogGuarded|deleteDayLogGuarded)\s*\(|\.\s*(set|update|add|delete)\s*\(/
const READ_VERBS = /\b(getDocs|getDoc|onSnapshot)\s*\(|\.\s*get\s*\(\s*\)/

/** Which role this file plays, from the verbs it uses. */
export function deriveRole(code: string): Role {
  const writes = WRITE_VERBS.test(code)
  const reads = READ_VERBS.test(code)
  // A candidate names a collection, so it does SOMETHING with it; with neither
  // verb visible the honest fallback is the one that claims least.
  if (writes && reads) return Role.Both
  if (writes) return Role.Write
  return Role.Read
}

/**
 * Every file that names one of the four collections, with what it does to them.
 *
 * Sorted by path, so the registry's order is data rather than the order somebody
 * happened to add rows in.
 */
export function deriveTimeLedgerSurfaces(files: readonly SourceFile[]): TimeLedgerSurface[] {
  const out: TimeLedgerSurface[] = []
  for (const file of files) {
    const code = stripComments(file.source)
    const collections = TIME_COLLECTIONS.filter((c) => namesCollection(code, c))
    if (collections.length === 0) continue
    out.push({ path: file.path, collections: [...collections], role: deriveRole(code) })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

// ── The registry, as the document stores it ─────────────────────────────────

export interface CensusRow {
  path: string
  /** The `Collections` cell, already split and trimmed. */
  collections: string[]
  role: string
  /** Which fold or date rule this file goes through — hand-written. */
  fold: string
  /** What this door or reader is — hand-written. */
  note: string
}

/** The heading the registry table sits under. */
export const REGISTRY_HEADING = '## 5. The registry'

const ROW = /^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/

/**
 * Parse the registry out of the census markdown.
 *
 * Deliberately strict about shape: a row that does not match is not silently
 * skipped as "prose", it simply is not a row, and the guard's completeness check
 * then reports the file it was supposed to cover as unclassified. A table that
 * parses to NOTHING is the `[ledger-shape]` lesson — a guard passing on
 * malformed input is worse than no guard — and is checked separately.
 */
export function parseCensusRows(markdown: string): CensusRow[] {
  const start = markdown.indexOf(REGISTRY_HEADING)
  const body = start === -1 ? markdown : markdown.slice(start)
  const rows: CensusRow[] = []
  for (const line of body.split('\n')) {
    const match = ROW.exec(line.trim())
    if (!match) continue
    const [, path, collections, role, fold, note] = match
    rows.push({
      path: path.trim(),
      collections: collections
        .split('·')
        .map((c) => c.replace(/`/g, '').trim())
        .filter(Boolean),
      role: role.trim(),
      fold: fold.trim(),
      note: note.trim(),
    })
  }
  return rows
}

export interface CensusProblem {
  kind:
    | 'unclassified'
    | 'not-a-candidate'
    | 'duplicate'
    | 'blank-cell'
    | 'wrong-collections'
    | 'wrong-role'
  path: string
  detail: string
}

/**
 * Everything wrong with the registry, as a list — empty means it is honest.
 *
 * Six failures, and each of them has cost somebody a review round somewhere in
 * this repo: a surface with no row, a row for a file that is not one (so a
 * deleted or renamed file leaves a stale claim), two rows for one file, a blank
 * cell (an unexplained row is the one that comes back as a P1), and either
 * derived column disagreeing with the live source.
 */
export function censusProblems(
  surfaces: readonly TimeLedgerSurface[],
  rows: readonly CensusRow[],
): CensusProblem[] {
  const problems: CensusProblem[] = []
  const byPath = new Map<string, TimeLedgerSurface>(surfaces.map((s) => [s.path, s]))
  const seen = new Set<string>()

  for (const row of rows) {
    if (seen.has(row.path)) {
      problems.push({ kind: 'duplicate', path: row.path, detail: 'listed more than once' })
      continue
    }
    seen.add(row.path)

    const surface = byPath.get(row.path)
    if (!surface) {
      problems.push({
        kind: 'not-a-candidate',
        path: row.path,
        detail: 'no such file names a time collection — renamed, deleted, or never one',
      })
      continue
    }
    if (!row.fold || !row.note || !row.role || row.collections.length === 0) {
      problems.push({ kind: 'blank-cell', path: row.path, detail: 'every cell must be filled' })
    }
    const expected = surface.collections.join(' · ')
    if (row.collections.join(' · ') !== expected) {
      problems.push({
        kind: 'wrong-collections',
        path: row.path,
        detail: `row says "${row.collections.join(' · ')}", source says "${expected}"`,
      })
    }
    if (row.role !== surface.role) {
      problems.push({
        kind: 'wrong-role',
        path: row.path,
        detail: `row says "${row.role}", source says "${surface.role}"`,
      })
    }
  }

  for (const surface of surfaces) {
    if (seen.has(surface.path)) continue
    problems.push({
      kind: 'unclassified',
      path: surface.path,
      detail: `names ${surface.collections.join(' · ')} and has no row`,
    })
  }

  return problems
}

/** How many files play each role — the census's headline split. */
export function tallyRoles(surfaces: readonly TimeLedgerSurface[]): Record<string, number> {
  const out: Record<string, number> = { WRITE: 0, READ: 0, BOTH: 0 }
  for (const surface of surfaces) out[surface.role] += 1
  return out
}

/** How many files name each collection. */
export function tallyCollections(
  surfaces: readonly TimeLedgerSurface[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const collection of TIME_COLLECTIONS) out[collection] = 0
  for (const surface of surfaces) {
    for (const collection of surface.collections) out[collection] += 1
  }
  return out
}
