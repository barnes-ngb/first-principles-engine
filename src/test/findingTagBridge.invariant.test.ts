import { describe, expect, it } from 'vitest'

import { loadChatPromptSource, loadTagCensus, TAG_CENSUS_PATH } from './findingTagSources'
import {
  classifyTag,
  declaredDomainOf,
  deriveTagRows,
  derivedCells,
  MIN_VERDICT_RATIONALE,
  parseTagCensusRows,
  promptSkillTagBlocks,
  TAG_VERDICTS,
  tagCensusProblems,
  TagSource,
  verdictRationale,
  type TagRow,
} from './findingTagBridge'

/**
 * AUDIT-226 — a skill tag cannot join the finding-tag bridge unclassified.
 *
 * `mapFindingToNode`'s keyword fallback was an ordered chain of `includes` tests
 * over a separator-stripped tag. That technique produced `UX-347`
 * (`writing.paragraph` → `math.data.graphs`, because "para-graph" contains
 * "graph"), `UX-346` (`math.number-sense` → nothing at all) and `UX-348`
 * (`math.wordProblems` → the band-5 concept while the curated table says the
 * band-1-2 one) — and **two of the three were found by accident** by a run doing
 * something else. Enumerating and repairing three entries would have left the
 * fourth undiscovered.
 *
 * So this is the list, derived from the four sources that emit tags, and
 * `docs/review/FINDING_TAG_BRIDGE_CENSUS_2026-09.md` is the registry.
 *
 * It **fails closed**, per PR #1814's `[ledger-shape]` lesson that a guard which
 * passes on malformed input is worse than no guard: a census that does not
 * parse, a stale derived cell, a blank cell, an unexplained verdict, a verdict
 * that contradicts the source and a table yielding zero rows are all failures.
 * The last block PROVES it fails, by feeding it an unclassified tag and a
 * deliberately cross-domain resolution rather than asserting that it would.
 */

const chat = loadChatPromptSource()
const rows = deriveTagRows(chat)
const census = loadTagCensus()
const censusRows = parseTagCensusRows(census)

describe('the tag universe is derived, not copied', () => {
  it('finds all three SKILL TAGS blocks in the prompt source', () => {
    // If a prompt edit renamed the heading, the universe would silently shrink
    // and every remaining check would pass over nothing — the [ledger-shape]
    // failure in a different costume.
    expect(promptSkillTagBlocks(chat)).toHaveLength(3)
    for (const block of promptSkillTagBlocks(chat)) {
      expect(block.length, 'a SKILL TAGS heading with no bullets under it').toBeGreaterThan(0)
    }
  })

  it('gathers tags from all four sources', () => {
    for (const source of Object.values(TagSource)) {
      const found = rows.filter((r) => r.sources.includes(source))
      expect(found.length, `no tags from ${source}`).toBeGreaterThan(0)
    }
  })

  it('reads a census that actually parsed', () => {
    expect(censusRows.length, `${TAG_CENSUS_PATH} produced no tag rows`).toBeGreaterThan(0)
  })
})

describe('the finding-tag census is complete and current', () => {
  it('classifies every tag every source emits', () => {
    const problems = tagCensusProblems(rows, censusRows).filter((p) => p.kind === 'unclassified')
    expect(problems.map((p) => p.message)).toEqual([])
  })

  it('carries no stale row and no stale derived cell', () => {
    const problems = tagCensusProblems(rows, censusRows).filter(
      (p) => p.kind === 'stale-row' || p.kind === 'stale-cell',
    )
    expect(problems.map((p) => p.message)).toEqual([])
  })

  it('is well formed — no duplicate, blank, mis-shaped or unexplained row', () => {
    const problems = tagCensusProblems(rows, censusRows).filter((p) =>
      ['duplicate-row', 'blank-cell', 'bad-shape', 'bad-verdict', 'unexplained-verdict'].includes(
        p.kind,
      ),
    )
    expect(problems.map((p) => p.message)).toEqual([])
  })

  it('reports nothing at all against the committed census', () => {
    expect(tagCensusProblems(rows, censusRows).map((p) => p.message)).toEqual([])
  })
})

describe('UX-347 — no tag resolves into a domain it does not name', () => {
  // The cheap check that would have caught UX-347 on its own, and it is NOT
  // gated on the census: a cross-domain resolution fails however it is
  // classified. `writing.paragraph` is not emitted by any source in the
  // universe, which is exactly why the rule has to be about the shape of an
  // answer rather than about a list of known tags.
  it('holds for every tag in the universe', () => {
    const crossed = rows.filter((r) => r.crossDomain)
    expect(
      crossed.map((r) => `${r.tag} (${r.declaredDomain}) → ${r.node} (${r.nodeDomain})`),
    ).toEqual([])
  })

  it('holds for the tag the defect was reported on, which no source emits', () => {
    expect(rows.some((r) => r.tag === 'writing.paragraph')).toBe(false)
    const row = classifyTag('writing.paragraph', [TagSource.PromptExample])
    expect(row.crossDomain).toBe(false)
    expect(row.node).toBe('writing.composition.paragraph')
  })

  it('opens the one cross-domain lane for the TAG, not for its whole domain', () => {
    // Codex round 1 on PR #1827, P1: the anchor's first version allowed the
    // pairing at the domain level, so a writing tag naming no spelling reached a
    // real foundations reading concept. The registry classifies by the app's own
    // rule rather than a copy of it, which is why this belongs here too.
    expect(classifyTag('writing.fluency', [TagSource.PromptExample]).node).toBeNull()
    const spelling = classifyTag('writing.spelling.sightWord', [TagSource.Catalog])
    expect(spelling.node).toBe('reading.phonics.sightWords')
    expect(spelling.crossDomain).toBe(false)
  })

  it('reads the declared domain off the leading segment only', () => {
    expect(declaredDomainOf('phonics.cvc.short-o')).toBe('reading')
    expect(declaredDomainOf('writing.paragraph')).toBe('writing')
    // A working-level key declares nothing — which is the hole `UX-350`'s
    // `multiplication.fluency` row sits in, and the row says so.
    expect(declaredDomainOf('multiplication.fluency')).toBeNull()
    expect(declaredDomainOf('counting')).toBeNull()
  })
})

describe('the guard fails closed — proved, not asserted', () => {
  /** A row for a tag with no census entry. */
  const unclassified: TagRow = classifyTag('math.brand-new-thing', [TagSource.PromptList])

  it('fails on a tag with no census row', () => {
    const problems = tagCensusProblems([...rows, unclassified], censusRows)
    expect(problems.some((p) => p.kind === 'unclassified')).toBe(true)
  })

  it('fails on a cross-domain resolution', () => {
    const crossed: TagRow = {
      ...unclassified,
      tag: 'writing.some-chart-thing',
      node: 'math.data.graphs',
      nodeDomain: 'math',
      declaredDomain: 'writing',
      conceptIds: ['math.data.graphs'],
      outcome: 'direct',
      crossDomain: true,
    }
    const problems = tagCensusProblems([...rows, crossed], censusRows)
    expect(problems.some((p) => p.kind === 'cross-domain')).toBe(true)
  })

  it('fails on a census that parses to nothing', () => {
    const problems = tagCensusProblems(rows, [])
    expect(problems.map((p) => p.kind)).toEqual(['empty-census'])
  })

  it('fails on a stale derived cell', () => {
    const first = censusRows[0]
    const broken = [{ ...first, cells: [...first.cells] }, ...censusRows.slice(1)]
    broken[0].cells[2] = '`math.utterly.wrong`'
    expect(tagCensusProblems(rows, broken).some((p) => p.kind === 'stale-cell')).toBe(true)
  })

  it('fails on a row naming a tag no source emits any more', () => {
    const first = censusRows[0]
    const stale = [{ ...first, tag: 'tag.that.no.longer.exists' }, ...censusRows]
    expect(tagCensusProblems(rows, stale).some((p) => p.kind === 'stale-row')).toBe(true)
  })

  it('fails on a verdict with no rationale, and on one that is not a verdict', () => {
    const first = censusRows[0]
    const bare = [{ ...first, cells: [...first.cells] }, ...censusRows.slice(1)]
    bare[0].cells[5] = '**CORRECT**'
    expect(tagCensusProblems(rows, bare).some((p) => p.kind === 'unexplained-verdict')).toBe(true)

    const none = [{ ...first, cells: [...first.cells] }, ...censusRows.slice(1)]
    none[0].cells[5] = 'looks fine to me, honestly, nothing to see here'
    expect(tagCensusProblems(rows, none).some((p) => p.kind === 'bad-verdict')).toBe(true)
  })

  it('fails on a verdict that contradicts what the source does', () => {
    // A row cannot claim CORRECT about a tag that resolves to nothing…
    const dropped = rows.find((r) => r.node === null)
    expect(dropped, 'the universe should contain at least one unmapped tag').toBeDefined()
    const lying = censusRows
      .filter((r) => r.tag === dropped!.tag)
      .map((r) => ({ ...r, cells: [...r.cells] }))
    expect(lying.length, `no census row for ${dropped!.tag}`).toBe(1)
    lying[0].cells[5] = '**CORRECT** — it lands exactly where it should, honestly'
    expect(
      tagCensusProblems([dropped!], lying).some((p) => p.kind === 'bad-verdict'),
    ).toBe(true)

    // …nor CURATED about a tag the curated table has no answer for.
    const uncurated = rows.find((r) => !r.curated && r.node !== null)!
    const claimed = censusRows
      .filter((r) => r.tag === uncurated.tag)
      .map((r) => ({ ...r, cells: [...r.cells] }))
    claimed[0].cells[5] = '**CURATED** — the owner picked this one deliberately'
    expect(
      tagCensusProblems([uncurated], claimed).some((p) => p.kind === 'bad-verdict'),
    ).toBe(true)
  })

  it('fails on a blank cell and on a mis-shaped row', () => {
    const first = censusRows[0]
    const blank = [{ ...first, cells: [...first.cells] }, ...censusRows.slice(1)]
    blank[0].cells[6] = ''
    expect(tagCensusProblems(rows, blank).some((p) => p.kind === 'blank-cell')).toBe(true)

    const short = [{ ...first, cells: first.cells.slice(0, 6) }, ...censusRows.slice(1)]
    expect(tagCensusProblems(rows, short).some((p) => p.kind === 'bad-shape')).toBe(true)
  })
})

describe('the verdict vocabulary and the rationale floor', () => {
  it('every census verdict is one of the five', () => {
    for (const row of censusRows) {
      const cell = row.cells[5] ?? ''
      expect(
        TAG_VERDICTS.some((v) => cell.includes(v)),
        `line ${row.line}: ${row.tag}`,
      ).toBe(true)
    }
  })

  it('strips the token and the bold markers before measuring the reason', () => {
    expect(verdictRationale('**CORRECT** — because of the thing')).toBe('because of the thing')
    expect(verdictRationale('**CORRECT**')).toBe('')
    expect(MIN_VERDICT_RATIONALE).toBeGreaterThan(0)
  })

  it('renders the derived cells exactly as the census writes them', () => {
    // The format is shared between the guard and `npm run census:finding-tags`,
    // so a row pasted from the script always matches what the guard expects.
    const row = rows.find((r) => r.tag === 'math.wordProblems')!
    expect(derivedCells(row)).toEqual({
      sources: 'catalog',
      node: '`math.problemSolving`',
      concept: '`math.problemSolving.oneStep` (curated)',
      evalRead: 'kept',
    })
  })
})
