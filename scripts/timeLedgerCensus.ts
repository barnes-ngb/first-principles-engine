/**
 * Print the time-and-evidence ledger census's numbers — AUDIT-234.
 *
 * `CLAUDE.md`'s derived-numbers rule: every count a review document asserts
 * whose source of truth is in this repository must come from a committed test
 * or script that derives it, and the number written down must be the number the
 * script prints. This is that script. Run it and paste from it:
 *
 *     npm run census:time-ledger
 *
 * It shares ONE definition of the candidate heuristic, the file walk and the
 * census parser with the guard (`src/test/timeLedger.invariant.test.ts`), so the
 * figures in the document and the rule that keeps the document honest cannot
 * drift apart.
 *
 * The last two figures are the ones the audit exists for: how many date rules
 * the two projects hold for "which week am I looking at", and which readers of
 * the hours record go through the shared counting path
 * (`functions/src/shared/hoursContributions.ts`) rather than their own.
 */
import { loadCensus, loadSourceFiles } from '../src/test/timeLedgerSources'
import {
  censusProblems,
  deriveTimeLedgerSurfaces,
  parseCensusRows,
  stripComments,
  tallyCollections,
  tallyRoles,
} from '../src/test/timeLedgerSurfaces'

const files = loadSourceFiles()
const surfaces = deriveTimeLedgerSurfaces(files)
const rows = parseCensusRows(loadCensus())
const problems = censusProblems(surfaces, rows)

/** The week / year helpers a surface can resolve "which range" from. */
const DATE_RULES = [
  'getWeekRange',
  'getPlanningWeekRange',
  'lastCompletedSchoolWeekKey',
  'getSchoolYearRange',
  'weekRangeFromDateKey',
  'weekKeyFromDate',
  // The functions side's own two, which cannot import the app's.
  'lastWeekKey',
  'schoolYearStart',
  'getWeekMonday',
] as const

const dateRuleHits = new Map<string, number>()
for (const rule of DATE_RULES) dateRuleHits.set(rule, 0)
for (const file of files) {
  const code = stripComments(file.source)
  for (const rule of DATE_RULES) {
    const hits = code.match(new RegExp(`\\b${rule}\\s*\\(`, 'g'))?.length ?? 0
    if (hits > 0) dateRuleHits.set(rule, (dateRuleHits.get(rule) ?? 0) + hits)
  }
}

/** Files that fold minutes through the ONE shared counting path (ARCH-47). */
const SHARED_FOLD =
  /\b(collectHoursContributions|computeHoursSummary|computeMonthlyTrend|computeSubjectDistribution|computeMonthHours|summarizeHoursContributions|dayLogMinuteContributions)\s*\(/
const foldUsers = files
  .filter((f) => SHARED_FOLD.test(stripComments(f.source)))
  .map((f) => f.path)
  .filter((p) => !p.endsWith('records.logic.ts'))
  .filter((p) => !p.includes('shared/hoursContributions'))
  .filter((p) => !p.includes('tasks/monthlyHours'))

const roles = tallyRoles(surfaces)
const collections = tallyCollections(surfaces)

console.log(`source files scanned (non-test, src/ + functions/src/): ${files.length}`)
console.log(`surfaces naming a time or evidence collection: ${surfaces.length}`)
console.log('by role:', JSON.stringify(roles))
console.log('by collection:', JSON.stringify(collections))
console.log(`census rows: ${rows.length}`)
console.log(`census problems: ${problems.length}`)
for (const problem of problems) {
  console.log(`  ${problem.kind}: ${problem.path} — ${problem.detail}`)
}
console.log(
  `date-rule call sites (${DATE_RULES.length} distinct rules): ` +
    `${[...dateRuleHits.values()].reduce((a, b) => a + b, 0)}`,
)
for (const [rule, hits] of [...dateRuleHits].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(hits).padStart(3)}  ${rule}`)
}
console.log(`consumers of the shared counting path: ${foldUsers.length}`)
for (const path of foldUsers.sort()) console.log(`       ${path}`)
