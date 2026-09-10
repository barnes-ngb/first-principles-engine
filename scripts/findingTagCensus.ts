/**
 * Print the finding-tag bridge census's numbers — AUDIT-226.
 *
 * `CLAUDE.md`'s derived-numbers rule: every count a review document asserts
 * whose source of truth is in this repository must come from a committed test or
 * script that derives it, and the number written down must be the number the
 * script prints. This is that script. Run it and paste from it:
 *
 *     npm run census:finding-tags
 *
 * It shares ONE definition of the tag universe, the classification and the
 * census parser with the guard (`src/test/findingTagBridge.invariant.test.ts`),
 * so the figures in the document and the rule that keeps the document honest
 * cannot drift apart.
 *
 * Pass `--rows` to print the registry table itself, ready to paste into §5 of
 * the census — the derived columns only, since the verdict is a judgement.
 */
import {
  conceptReach,
  deriveTagRows,
  derivedCells,
  levelMapTags,
  parseTagCensusRows,
  promptExampleTags,
  promptListTags,
  promptSkillTagBlocks,
  tagCensusProblems,
  tallyOutcomes,
  tallyTagVerdicts,
  TagSource,
} from '../src/test/findingTagBridge'
import { loadChatPromptSource, loadTagCensus } from '../src/test/findingTagSources'

const chat = loadChatPromptSource()
const rows = deriveTagRows(chat)
const censusRows = parseTagCensusRows(loadTagCensus())
const problems = tagCensusProblems(rows, censusRows)

if (process.argv.includes('--rows')) {
  for (const row of rows) {
    const d = derivedCells(row)
    console.log(`| \`${row.tag}\` | ${d.sources} | ${d.node} | ${d.concept} | ${d.evalRead} |`)
  }
  process.exit(0)
}

const bySource = Object.fromEntries(
  Object.values(TagSource).map((source) => [
    source,
    rows.filter((r) => r.sources.includes(source)).length,
  ]),
)

console.log(`SKILL TAGS blocks found in the prompt source: ${promptSkillTagBlocks(chat).length}`)
console.log(`prompt-list tags: ${promptListTags(chat).length}`)
console.log(`prompt-example tags: ${promptExampleTags(chat).length}`)
console.log(`level-map keys: ${levelMapTags().length}`)
console.log(`distinct tags in the universe: ${rows.length}`)
console.log('by source:', JSON.stringify(bySource))

const reaching = rows.filter((r) => r.reachesFoundations)
const kept = reaching.filter((r) => r.conceptIds.length > 0)
console.log(`tags that can reach a foundations concept: ${reaching.length}`)
console.log(`  kept by computeEvalRead: ${kept.length}`)
console.log(`  dropped by computeEvalRead: ${reaching.length - kept.length}`)
console.log(`tags resolving to no curriculum node at all: ${rows.filter((r) => !r.node).length}`)
console.log(`tags resolving outside the domain they declare: ${rows.filter((r) => r.crossDomain).length}`)

const reach = conceptReach(rows)
console.log(`foundations concepts the whole universe can reach: ${reach.reached} of ${reach.total}`)
console.log('by bridge outcome:', JSON.stringify(tallyOutcomes(rows)))
console.log(`census rows: ${censusRows.length}`)
console.log('by verdict:', JSON.stringify(tallyTagVerdicts(censusRows)))
console.log(`census problems: ${problems.length}`)
for (const problem of problems) console.log(`  [${problem.kind}] ${problem.message}`)
