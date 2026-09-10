/**
 * Print the child-switch surface census's numbers — UX-329.
 *
 * `CLAUDE.md`'s derived-numbers rule: every count a review document asserts
 * whose source of truth is in this repository must come from a committed test
 * or script that derives it, and the number written down must be the number the
 * script prints. This is that script. Run it and paste from it:
 *
 *     npm run census:child-switch
 *
 * It shares ONE definition of the candidate heuristic, the file walk and the
 * census parser with the guard (`src/test/childSwitchSurfaces.invariant.test.ts`),
 * so the figures in the document and the rule that keeps the document honest
 * cannot drift apart.
 */
import {
  censusProblems,
  deriveChildSwitchCandidates,
  parseCensusRows,
  tallySeverities,
  tallyVerdicts,
} from '../src/test/childSwitchSurfaces'
import { loadCensus, loadSourceFiles } from '../src/test/childSwitchSources'

const files = loadSourceFiles()
const candidates = deriveChildSwitchCandidates(files)
const rows = parseCensusRows(loadCensus())
const problems = censusProblems(candidates, rows, new Set(files.map((f) => f.path)))

const readsActiveChild = files.filter((f) => /useActiveChild/.test(f.source)).length
/** Surfaces that can change the active child WITHOUT the shell switcher. */
const rendersSelector = files.filter(
  (f) => /<ChildSelector\b/.test(f.source) && !f.path.endsWith('components/ChildSelector.tsx'),
).length
const callsSetActiveChild = files.filter(
  (f) => f.path.startsWith('src/features/') && /\bsetActiveChildId\b/.test(f.source),
).length
const byArm = { hook: 0, prop: 0 }
for (const c of candidates) byArm[c.arm] += 1

console.log(`source files scanned (non-test, under src/, excluding src/test/): ${files.length}`)
console.log(`files reading useActiveChild: ${readsActiveChild}`)
console.log(`candidates: ${candidates.length} (hook arm ${byArm.hook}, prop arm ${byArm.prop})`)
console.log(`files rendering an in-page <ChildSelector>: ${rendersSelector}`)
console.log(
  `feature files referencing setActiveChildId (any in-page child control): ${callsSetActiveChild}`,
)
console.log(`census rows: ${rows.length}`)
console.log('by verdict:', JSON.stringify(tallyVerdicts(rows)))
console.log('by severity:', JSON.stringify(tallySeverities(rows)))
console.log(`census problems: ${problems.length}`)
for (const p of problems) console.log(`  [${p.kind}] ${p.message}`)
