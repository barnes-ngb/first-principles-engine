import { describe, it, expect } from 'vitest'
import {
  parseLedgerIds,
  parseLedgerStatusCells,
  findOpenPrStatusRows,
  ledgerStatusIsHard,
  parseLedgerAnchors,
  parseIndexRows,
  collectBacktickTokens,
  deriveCollectionCount,
  parseGenSpans,
  rewriteGenSpans,
  parseAsConstEntries,
  extractRawFamilyRefs,
  analyzeRemoteResilience,
  analyzeImageDownscale,
  catchIsHandled,
  findSilentCatches,
  findUnroutedDayWrites,
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

describe('ledger-status invariant (a merged row cannot claim an open PR)', () => {
  const md = [
    '| ID | Band | Status | Title | Evidence |',
    '|---|---|---|---|---|',
    '| **FEAT-01** | 2 | **MERGED** (PR #1, merged 2026-08-01) | done | x |',
    '| **FEAT-02** | 2 | **BUILT (PR open) — do not merge** | still open | y |',
    // A correct status cell whose BODY narrates the phrase — must NOT match.
    '| **DOC-11** | 1 | **FIXED (2026-08-02 audit)** | swept stale "PR open" / "do not merge" cells; a video is `childId | \'both\'` | z |',
  ].join('\n')

  it('reads the status from cells[3] (ID | Band | Status | …), not the body', () => {
    const rows = parseLedgerStatusCells(md)
    expect(rows.map((r) => r.id)).toEqual(['FEAT-01', 'FEAT-02', 'DOC-11'])
    expect(rows[0].status).toBe('**MERGED** (PR #1, merged 2026-08-01)')
    expect(rows[1].line).toBe(4)
  })

  it('flags only the status cell that claims an open PR', () => {
    const hits = findOpenPrStatusRows(md)
    expect(hits.map((r) => r.id)).toEqual(['FEAT-02'])
  })

  it('does not fire on a row body quoting the phrase as prose', () => {
    expect(findOpenPrStatusRows(md).some((r) => r.id === 'DOC-11')).toBe(false)
  })

  it('matches "do not merge" even without the "PR open" wording', () => {
    const variant = [
      '| ID | Band | Status | Title | Evidence |',
      '|---|---|---|---|---|',
      '| **ARCH-99** | 1 | **DONE — do not merge** | v | w |',
    ].join('\n')
    expect(findOpenPrStatusRows(variant).map((r) => r.id)).toEqual(['ARCH-99'])
  })

  it('passes clean when every status cell has been flipped', () => {
    const clean = [
      '| ID | Band | Status | Title | Evidence |',
      '|---|---|---|---|---|',
      '| **FEAT-02** | 2 | **MERGED** (PR #2, merged 2026-08-11, commit `abc1234`) | t | e |',
    ].join('\n')
    expect(findOpenPrStatusRows(clean)).toEqual([])
  })

  // ── The 2026-08-22 widening (DOC-15) ──────────────────────────────────────
  // The house convention drifted to an "awaiting …" phrasing that says exactly
  // the same untrue thing on `main` as "PR open", in words the original two
  // patterns did not match. Three real rows (FEAT-152/153/154) carried it before
  // anyone noticed. Fixtures below are the verbatim ledger cells from that
  // episode, so a future "simplification" of the pattern list fails here.
  describe('"awaiting … review/merge" phrasings (added 2026-08-22)', () => {
    const shipped = (id, pr) =>
      `| **${id}** | 2 | **SHIPPED — PR #${pr}, 2026-08-17; awaiting human review + merge** (cell flipped on the final pre-merge commit per this run's prompt) | t | e |`
    const header = ['| ID | Band | Status | Title | Evidence |', '|---|---|---|---|---|']

    it('flags the real FEAT-152/153/154 wording that sailed past "PR open"/"do not merge"', () => {
      const md = [...header, shipped('FEAT-152', 1681), shipped('FEAT-153', 1684)].join('\n')
      expect(findOpenPrStatusRows(md).map((r) => r.id)).toEqual(['FEAT-152', 'FEAT-153'])
    })

    it('flags a bare "awaiting merge" and "awaiting review"', () => {
      const md = [
        ...header,
        '| **ARCH-98** | 1 | **DONE — awaiting merge** | t | e |',
        '| **ARCH-97** | 1 | **SHIPPED, awaiting review** | t | e |',
      ].join('\n')
      expect(findOpenPrStatusRows(md).map((r) => r.id)).toEqual(['ARCH-98', 'ARCH-97'])
    })

    // The load-bearing negative. FEAT-119's cell is an HONEST "awaiting": a
    // merged PR waiting on a human task. Requiring a following review/merge WORD
    // is what keeps it clean — and `\bmerge\b` does not match the "merged
    // 2026-07-25" that sits 29 characters later, so a cell stating the merge as
    // a fact never fires.
    it('does not fire on "AWAITING OWNER CURATION" on an already-merged row', () => {
      const md = [
        ...header,
        '| **FEAT-119** | 2 | **DRAFT LANDED — AWAITING OWNER CURATION** (PR #1622, merged 2026-07-25 — verified 2026-07-26) | t | e |',
      ].join('\n')
      expect(findOpenPrStatusRows(md)).toEqual([])
    })

    // Scope is unchanged by the widening: status cell only, never row bodies.
    it('still ignores the phrase in a row BODY, as the original patterns do', () => {
      const md = [
        ...header,
        '| **DOC-15** | 1 | **MERGED** (PR #3, merged 2026-08-22) | swept cells reading "awaiting human review + merge" | e |',
      ].join('\n')
      expect(findOpenPrStatusRows(md)).toEqual([])
    })
  })

  // The branch split is the load-bearing part: HARD on main, SOFT on PR runs.
  it('is HARD only against main, SOFT on PR runs and unforced local runs', () => {
    expect(ledgerStatusIsHard({ GITHUB_REF_NAME: 'main' })).toBe(true)
    expect(ledgerStatusIsHard({ DOCS_CHECK_BRANCH: 'main' })).toBe(true)
    // pull_request runs report `<pr-number>/merge`, never `main`.
    expect(ledgerStatusIsHard({ GITHUB_REF_NAME: '1661/merge' })).toBe(false)
    expect(ledgerStatusIsHard({ GITHUB_REF_NAME: 'claude/some-branch' })).toBe(false)
    expect(ledgerStatusIsHard({})).toBe(false)
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

// ── Resilience invariants (DOC-09) ──────────────────────────────────────────

describe('analyzeRemoteResilience', () => {
  it('flags a raw httpsCallable but not a bare import', () => {
    const importOnly = "import { getFunctions, httpsCallable } from 'firebase/functions'"
    expect(analyzeRemoteResilience(importOnly).hasRemoteCall).toBe(false)
    const callSite = "const fn = httpsCallable<Req, Res>(functions, 'chat')"
    expect(analyzeRemoteResilience(callSite).hasRemoteCall).toBe(true)
  })

  it('recognizes each timeout signal: option, withTimeout wrapper, AbortController', () => {
    expect(analyzeRemoteResilience('httpsCallable(fns, "x", { timeout: 120_000 })').hasTimeout).toBe(true)
    expect(analyzeRemoteResilience('httpsCallable(fns, "x"); await withTimeout(work, 5000)').hasTimeout).toBe(true)
    expect(analyzeRemoteResilience('const c = new AbortController()').hasTimeout).toBe(true)
    expect(analyzeRemoteResilience('httpsCallable(fns, "x")').hasTimeout).toBe(false)
  })

  it('detects a finally block', () => {
    expect(analyzeRemoteResilience('try { a() } finally { setLoading(false) }').hasFinally).toBe(true)
    expect(analyzeRemoteResilience('try { a() } catch (e) {}').hasFinally).toBe(false)
  })
})

describe('analyzeImageDownscale', () => {
  it('detects an image file-input only when both type=file and an image accept are present', () => {
    const imageInput = '<input type="file" accept="image/*" onChange={h} />'
    expect(analyzeImageDownscale(imageInput).hasImageInput).toBe(true)
    const audioInput = '<input type="file" accept="audio/*" />'
    expect(analyzeImageDownscale(audioInput).hasImageInput).toBe(false)
    const noInput = 'const accept = "image/png"'
    expect(analyzeImageDownscale(noInput).hasImageInput).toBe(false)
  })

  it('recognizes the downscale/compress family', () => {
    expect(analyzeImageDownscale('await downscaleImage(file)').hasDownscale).toBe(true)
    expect(analyzeImageDownscale('await compressPhotoToDataUrl(file)').hasDownscale).toBe(true)
    expect(analyzeImageDownscale('await compressIfNeeded(file, 2e6)').hasDownscale).toBe(true)
    expect(analyzeImageDownscale('await uploadBytes(ref, file)').hasDownscale).toBe(false)
  })
})

describe('catchIsHandled / findSilentCatches', () => {
  it('classifies a catch as handled when it rethrows, sets error state, or logs at warn+', () => {
    expect(catchIsHandled(' throw err ')).toBe(true)
    expect(catchIsHandled(' setError(new Error(msg)) ')).toBe(true)
    expect(catchIsHandled(' setUploadError("nope") ')).toBe(true)
    expect(catchIsHandled(' console.error(err) ')).toBe(true)
    expect(catchIsHandled(' console.warn(err) ')).toBe(true)
    expect(catchIsHandled(' /* ignore */ return null ')).toBe(false)
    expect(catchIsHandled(' console.log(err) ')).toBe(false) // log() is not warn+
  })

  it('finds only the swallowed catch, with a line number, and brace-matches nested blocks', () => {
    const content = [
      'async function a() {', // 1
      '  try { await x() } catch (e) {', // 2  ← silent
      '    if (retry) { queue() }', // 3  (nested braces)
      '    return null', // 4
      '  }', // 5
      '}', // 6
      'async function b() {', // 7
      '  try { await y() } catch (e) {', // 8  ← handled
      '    setError(e)', // 9
      '  }', // 10
      '}', // 11
    ].join('\n')
    const silent = findSilentCatches(content)
    expect(silent).toHaveLength(1)
    expect(silent[0].line).toBe(2)
  })
})

describe('findUnroutedDayWrites (day-write routing invariant, FEAT-114)', () => {
  it('flags a raw setDoc on a daysCollection ref (inline)', () => {
    const content = [
      "const ref = doc(daysCollection(familyId), dayLogDocId(today, childId))",
      "await setDoc(doc(daysCollection(familyId), id), payload)",
    ].join('\n')
    const hits = findUnroutedDayWrites(content)
    expect(hits.map((h) => h.verb)).toContain('setDoc')
  })

  it('flags a raw updateDoc via a same-file day-ref variable', () => {
    const content = [
      "const dayLogRef = doc(daysCollection(familyId), docId)",
      "const snap = await getDoc(dayLogRef)",
      "await updateDoc(dayLogRef, { checklist })",
    ].join('\n')
    const hits = findUnroutedDayWrites(content)
    expect(hits).toHaveLength(1)
    expect(hits[0].verb).toBe('updateDoc')
    expect(hits[0].line).toBe(3)
  })

  it('flags a raw deleteDoc on a raw families/…/days path', () => {
    const content =
      'await deleteDoc(doc(db, `families/${familyId}/days`, id))'
    const hits = findUnroutedDayWrites(content)
    expect(hits.map((h) => h.verb)).toEqual(['deleteDoc'])
  })

  it('does NOT flag a read (getDoc) of a day ref', () => {
    const content = [
      "const dayLogRef = doc(daysCollection(familyId), docId)",
      "const snap = await getDoc(dayLogRef)",
    ].join('\n')
    expect(findUnroutedDayWrites(content)).toEqual([])
  })

  it('does NOT flag a routed call through the guarded writers', () => {
    const content = [
      "const dayLogRef = doc(daysCollection(familyId), docId)",
      "await setDayLogGuarded(dayLogRef, payload, 'apply-plan')",
      "await updateDayLogGuarded(dayLogRef, { checklist }, 'redo-plan')",
      "await deleteDayLogGuarded(doc(daysCollection(familyId), id), 'sweep')",
    ].join('\n')
    expect(findUnroutedDayWrites(content)).toEqual([])
  })

  it('does NOT flag writes to other collections', () => {
    const content = [
      "await setDoc(doc(hoursCollection(familyId), id), entry)",
      "await deleteDoc(doc(weeksCollection(familyId), weekId))",
    ].join('\n')
    expect(findUnroutedDayWrites(content)).toEqual([])
  })
})
