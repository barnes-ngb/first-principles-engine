import { describe, it, expect } from 'vitest'
import {
  parseLedgerIds,
  parseLedgerAnchors,
  parseIndexRows,
  collectBacktickTokens,
  deriveCollectionCount,
  parseGenSpans,
  rewriteGenSpans,
  parseAsConstEntries,
  extractRawFamilyRefs,
} from './check-docs-alignment.mjs'

describe('parseLedgerIds', () => {
  it('reads the ID column and ignores bold cross-references in the body', () => {
    const md = [
      '| ID | Band | Status | Title | Evidence |',
      '|---|---|---|---|---|',
      '| **DOC-07** | 1 | OPEN | fixes **DATA-15** and **FEAT-44** | x |',
      '| **DOC-08** | 1 | OPEN | new | y |',
    ].join('\n')
    const { rows, duplicates } = parseLedgerIds(md)
    expect(rows.map((r) => r.id)).toEqual(['DOC-07', 'DOC-08'])
    expect(duplicates).toEqual([])
  })

  it('flags a genuine duplicate ID (two rows own the same ID)', () => {
    const md = [
      '| **FEAT-44** | 4 | OPEN | multi-page scan | a |',
      '| **FEAT-45** | 2 | OPEN | other | b |',
      '| **FEAT-44** | 2 | OPEN | concept arcs | c |',
    ].join('\n')
    const { duplicates } = parseLedgerIds(md)
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].id).toBe('FEAT-44')
    expect(duplicates[0].lines).toEqual([1, 3])
  })

  it('reports a lane gap of 3 or more but not smaller gaps', () => {
    const md = [
      '| **DOC-1** | 1 | OPEN | a | . |',
      '| **DOC-2** | 1 | OPEN | b | . |',
      '| **DOC-6** | 1 | OPEN | c | . |', // 3,4,5 missing → gap ≥3
      '| **ARCH-1** | 1 | OPEN | d | . |',
      '| **ARCH-3** | 1 | OPEN | e | . |', // only 2 missing → no gap report
    ].join('\n')
    const { gaps } = parseLedgerIds(md)
    const doc = gaps.find((g) => g.lane === 'DOC')
    expect(doc.missing).toEqual([3, 4, 5])
    expect(gaps.find((g) => g.lane === 'ARCH')).toBeUndefined()
  })
})

describe('parseLedgerAnchors', () => {
  it('extracts anchors with and without bold, with line numbers', () => {
    const text = ['intro', 'Ledger anchor: FEAT-29', 'x', 'Ledger anchor: **FEAT-46**'].join('\n')
    const anchors = parseLedgerAnchors(text)
    expect(anchors).toEqual([
      { id: 'FEAT-29', line: 2 },
      { id: 'FEAT-46', line: 4 },
    ])
  })
})

describe('parseIndexRows', () => {
  const md = [
    '## Repo Docs (`/docs`)',
    '',
    '| Document | Status | Notes |',
    '|---|---|---|',
    '| `MASTER_OUTLINE.md` | **CURRENT** (v15) | note |',
    '| ~~`OLD.md`~~ | REMOVED | superseded |',
    '| `review/REVIEW_HOME_BASE.md` | **NEW** | note |',
    '| `review/prompts/` | **CURRENT** | dir |',
    '',
    '## Which Docs to Include',
    '| `SYSTEM_PROMPTS.md` | reason | (not validated — different table) |',
  ].join('\n')

  it('parses only the Repo Docs table, capturing path + status + dir flag', () => {
    const rows = parseIndexRows(md)
    expect(rows.map((r) => r.path)).toEqual([
      'MASTER_OUTLINE.md',
      'OLD.md',
      'review/REVIEW_HOME_BASE.md',
      'review/prompts/',
    ])
    expect(rows.find((r) => r.path === 'OLD.md').status).toBe('REMOVED')
    expect(rows.find((r) => r.path === 'review/prompts/').isDir).toBe(true)
  })
})

describe('collectBacktickTokens', () => {
  it('collects every backtick token', () => {
    const set = collectBacktickTokens('see `a.md` and `sub/b.md` here')
    expect(set.has('a.md')).toBe(true)
    expect(set.has('sub/b.md')).toBe(true)
  })
})

describe('deriveCollectionCount', () => {
  it('counts exported *Collection helpers, not converter type params', () => {
    const src = [
      "const fooConverter: FirestoreDataConverter<Foo> = {}",
      "export const fooCollection = (id: string): CollectionReference<Foo> =>",
      "  collection(db, `families/${id}/foo`) as CollectionReference<Foo>",
      "export const barCollection = (id: string) =>",
      "  collection(db, 'families', id, 'bar')",
      "export const bazDoc = (id: string): DocumentReference<Baz> => doc(db, 'baz')",
      "export const bazDocId = (a: string) => `${a}`",
    ].join('\n')
    expect(deriveCollectionCount(src)).toBe(2)
  })
})

describe('gen spans', () => {
  it('parses span values', () => {
    const t = 'defines <!-- gen:collection-count -->43<!-- /gen --> helpers'
    expect(parseGenSpans(t)).toEqual([{ value: 43, index: expect.any(Number) }])
  })

  it('rewrites span values to the derived count, preserving surrounding text', () => {
    const t = 'a <!-- gen:collection-count -->31<!-- /gen --> b <!-- gen:collection-count -->37<!-- /gen -->'
    expect(rewriteGenSpans(t, 43)).toBe(
      'a <!-- gen:collection-count -->43<!-- /gen --> b <!-- gen:collection-count -->43<!-- /gen -->',
    )
  })
})

describe('parseAsConstEntries', () => {
  it('parses key/value pairs and ignores comment lines', () => {
    const src = [
      "export const EvidenceKind = {",
      "  WorkingLevel: 'workingLevel',",
      "  // Slice 2a comment: attestation reserved",
      "  Attestation: 'attestation',",
      "} as const",
    ].join('\n')
    expect(parseAsConstEntries(src, 'EvidenceKind')).toEqual([
      { key: 'WorkingLevel', value: 'workingLevel' },
      { key: 'Attestation', value: 'attestation' },
    ])
  })
})

describe('extractRawFamilyRefs', () => {
  it('extracts the trailing collection segment from a raw family template ref', () => {
    const content = [
      'const a = collection(db, `families/${familyId}/xpLedger`)',
      'const b = collection(db, `families/${familyId}/children/${childId}/wordProgress`)',
      'const c = doc(db, `families/${familyId}/children/${childId}/wordProgress`, word)', // doc(), not collection()
    ].join('\n')
    const refs = extractRawFamilyRefs(content)
    expect(refs.map((r) => r.collection)).toEqual(['xpLedger', 'wordProgress'])
  })
})
