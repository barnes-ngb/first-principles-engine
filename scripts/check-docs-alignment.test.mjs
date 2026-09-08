import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  parseLedgerIds,
  parseLedgerStatusCells,
  findOpenPrStatusRows,
  findContradictoryStatusRows,
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

describe('findContradictoryStatusRows', () => {
  // The episode: PR #1785's final pre-merge commit flipped UX-218 to FIXED and
  // recorded the run's own "CODEX ROUND: open — do not merge yet" line in the
  // SAME cell. Both halves were true about the run; as a status cell the pair
  // is nonsense, and because [ledger-status] is SOFT off `main` it passed four
  // pre-merge runs and then turned the push to `main` red.
  const realCell =
    '| **UX-218** | 2 | **FIXED** (PR #1785, 2026-09-06) — cell flipped on the ' +
    'final pre-merge commit, so the run summary reads `CODEX ROUND: open — do ' +
    'not merge yet` and the merge decision is the owner\'s | title | ev |'

  it('catches the cell that actually broke main', () => {
    expect(findContradictoryStatusRows(realCell).map((r) => r.id)).toEqual(['UX-218'])
  })

  it('leaves an honest in-flight row alone — that is check 11 s job, and it is SOFT off main', () => {
    const md = '| **ARCH-99** | 2 | BUILT (PR open) — do not merge | title | ev |'
    expect(findContradictoryStatusRows(md)).toEqual([])
    // …and the existing rule still sees it, so nothing was widened.
    expect(findOpenPrStatusRows(md).map((r) => r.id)).toEqual(['ARCH-99'])
  })

  it('leaves a plainly landed row alone', () => {
    const md = [
      '| **FEAT-10** | 2 | **FIXED** (PR #1785, merged 2026-09-06) | title | ev |',
      '| **FEAT-11** | 3 | **RESOLVED** 2026-08-01 | title | ev |',
      '| **FEAT-12** | 3 | OPEN | title | ev |',
    ].join('\n')
    expect(findContradictoryStatusRows(md)).toEqual([])
  })

  it('reads the status cell only, so a body narrating the drift never fires', () => {
    const md =
      '| **DOC-11** | 3 | **FIXED** (PR #1657, merged) | sweep | rows reading ' +
      '"PR open" / "do not merge" long after the PR merged |'
    expect(findContradictoryStatusRows(md)).toEqual([])
  })

  it('fires on the "awaiting review/merge" wording too, not just "do not merge"', () => {
    const md =
      '| **FEAT-99** | 2 | **FIXED** (PR #1681, merged) — awaiting human review + merge | t | e |'
    expect(findContradictoryStatusRows(md).map((r) => r.id)).toEqual(['FEAT-99'])
  })

  // ── The two false positives that shaped LANDED_STATUS_PATTERNS ────────────
  // Both are REAL historical cells, not invented ones. Codex found the first
  // (PR #1787, P1); the 134-revision sweep below found the second.

  it('leaves ARCH-42 alone — "FIXED" describes the work, not the landing', () => {
    // Commit bfb8991, legitimately in flight at the time. The first draft of
    // this check matched on `FIXED` and would have reddened a correct PR.
    const md =
      '| **ARCH-42** | 2 | **FIXED** (FEAT-183, PR open, branch ' +
      '`claude/london-run-a-capability-gates-skzsxc`) — the branch keys on ' +
      '`resolveChildAgeGroup` | t | e |'
    expect(findContradictoryStatusRows(md)).toEqual([])
    expect(findOpenPrStatusRows(md).map((r) => r.id)).toEqual(['ARCH-42'])
  })

  it('leaves FEAT-177 alone — prose ABOUT the merged wording is not a merge claim', () => {
    // Commit 1a6b1d80. A bare /\bmerged\b/ pattern fired on this and was
    // dropped: the cell says it has NOT merged, while naming the wording it
    // will use when it does.
    const md =
      '| **FEAT-177** | 2 | **BUILT (PR open, 2026-09-03) — do not merge; cell ' +
      'flips to the house `**MERGED** (PR #NNNN, …)` wording on the final ' +
      'commit** | t | e |'
    expect(findContradictoryStatusRows(md)).toEqual([])
  })

  // ── The history sweep is a PROBE, not a test (UX-272) ─────────────────────
  //
  // It used to be an unconditional `it()` asserting that exactly one historical
  // revision hit the guard. That assertion was wrong twice over, and it turned
  // every push to `deploy` red.
  //
  //  1. It self-skipped on a shallow clone and its comment named "CI" as the
  //     justification. True of `ci.yml` (three checkouts, no `fetch-depth`) —
  //     and FALSE of `.github/workflows/deploy.yml:25`, which sets
  //     `fetch-depth: 0` so the "functions changed" diff is reliable. The one
  //     workflow the skip was never measured against is the one that hands the
  //     sweep full history, so it ran there and failed there. Name the
  //     workflow, not the concept: this repo has two that run the suite.
  //
  //  2. Its expected list depended on how deep the clone happened to be. Its
  //     docstring recorded a sweep of "134 historical revisions"; a full clone
  //     at that same commit had 578, and EVERY offender below sits at position
  //     198+ in the newest-first revision list. The verification saw a shorter,
  //     cleaner history than the assertion would later meet.
  //
  // The deeper reason it is gone: history is immutable. A row that read
  // ambiguously in July cannot be fixed now, so the assertion could only ever
  // grow exceptions, and every exception makes the guard mean less. The check
  // with teeth is `holds on the live ledger`, below — and it passes.
  //
  // WHAT A FULL-HISTORY SWEEP FINDS TODAY (measured 2026-09-08, 591 ledger
  // revisions, 67 hits across 5 rows). Recognise these before diagnosing them:
  //
  //  · FEAT-112 — 57 hits, ONE cell text seen once per revision it survived in:
  //      "**MERGED (PR #1607, 2026-07-20). AMENDMENT PR open — do not merge**"
  //    A self-consistent narrative: the original work merged, and a *later*
  //    amendment PR was separately open. It matches a LANDED pattern and an
  //    OPEN-PR pattern because both halves are true of different things. This
  //    is the docstring's own named failure mode — "a false positive on a row
  //    that was correct at the time" — landing on the guard that named it.
  //
  //  · FEAT-152 / FEAT-153 / FEAT-154 — 9 hits, the house-rule shape:
  //      "**SHIPPED — PR #NNNN, <date>; awaiting human review + merge**"
  //    A run flipping its own cell on the final pre-merge commit. The guard
  //    fires on this BY DESIGN (see the FEAT-99 fixture above), so these are
  //    true positives against an immutable record — which is precisely why the
  //    house rule is not what changes here.
  //
  //  · UX-218 — 1 hit, `1a7c56858f`: the cell that actually turned `main` red.
  //
  // Kept as an opt-in probe because it still earns its keep for one person: the
  // one editing LANDED_STATUS_PATTERNS / OPEN_PR_STATUS_PATTERNS, who wants to
  // see what a new regex sweeps up. It lives here rather than in a standalone
  // script so it sits beside the fixtures and the function it probes — a second
  // file would be a second copy of the traversal to keep in step.
  //
  //   npm run docs:ledger-sweep     (sets LEDGER_HISTORY_SWEEP; needs full history)
  //
  // It REPORTS and asserts nothing about the historical set. Freezing that set
  // is the bug this replaced.
  it.skipIf(!process.env.LEDGER_HISTORY_SWEEP)(
    'PROBE (opt-in): reports every historical revision the guard fires on',
    () => {
      const repo = join(import.meta.dirname, '..')
      const run = (args) =>
        execFileSync('git', args, { cwd: repo, maxBuffer: 1 << 28 }).toString()

      // Opting in and silently measuring nothing is the one outcome worth
      // failing on: a shallow or partial clone reads as a clean sweep. "Not
      // shallow" is not proof the objects are readable, so the traversal is
      // capability-checked rather than assumed.
      expect(
        run(['rev-parse', '--is-shallow-repository']).trim(),
        'LEDGER_HISTORY_SWEEP needs full history — run `git fetch --unshallow` first',
      ).toBe('false')

      const revs = run(['log', '--format=%H', '--', 'docs/review/REVIEW_HOME_BASE.md'])
        .trim()
        .split('\n')
        .filter(Boolean)

      const byId = new Map()
      let unreadable = 0
      for (const rev of revs) {
        let md
        try {
          md = run(['show', `${rev}:docs/review/REVIEW_HOME_BASE.md`])
        } catch {
          unreadable += 1
          continue
        }
        for (const row of findContradictoryStatusRows(md)) {
          if (!byId.has(row.id)) byId.set(row.id, [])
          byId.get(row.id).push({ rev: rev.slice(0, 10), status: row.status })
        }
      }

      const report = [
        `swept ${revs.length} ledger revision(s)` +
          (unreadable ? ` (${unreadable} unreadable tree(s) skipped)` : ''),
      ]
      for (const [id, hits] of byId) {
        report.push(`\n${id} — ${hits.length} hit(s), newest ${hits[0].rev}`)
        for (const status of new Set(hits.map((h) => h.status))) {
          report.push(`  ${status}`)
        }
      }
      console.log(report.join('\n')) // the probe's entire product is this report

      // A sweep that read one revision measured nothing.
      expect(revs.length).toBeGreaterThan(1)
    },
    // One `git show` per ledger revision — ~10s at 591 revisions and growing
    // with the ledger, so the default 5s would fail on the traversal's own
    // length rather than on anything it found.
    120_000,
  )

  it('holds on the live ledger', () => {
    const md = readFileSync(
      join(import.meta.dirname, '..', 'docs', 'review', 'REVIEW_HOME_BASE.md'),
      'utf8',
    )
    // Unlike check 11, this one is safe to assert against the live document on
    // any branch: a contradiction is never the correct in-flight wording.
    expect(findContradictoryStatusRows(md)).toEqual([])
  })
})
