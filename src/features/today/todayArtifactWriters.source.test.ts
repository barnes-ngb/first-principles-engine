import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Every Today door that writes an artifact stamps the day (UX-436), and writes
 * its media to a field the type declares (UX-437).
 *
 * Both were found by Codex round 1 on the `FEAT-238` PR — the first directly,
 * the second as its consequence — and both are the same class: **a capture
 * surface on the day screen producing a record the app cannot fully read.**
 *
 *   • `TeachBackSection`, `WeekFocusCard`, `KidChapterPool` and
 *     `KidConundrumResponse` wrote an artifact with **no `dayLogId`**, so a
 *     teach-back note, a conundrum answer and a chapter recording — captured on
 *     Today, about today — could never reach *Today's evidence*, whose whole
 *     claim is that it holds everything the day produced.
 *   • `KidTeachBack` and `KidConundrumResponse` wrote the uploaded address to
 *     **`mediaUrl`**, singular: a field `Artifact` does not declare and no
 *     reader reads. The bytes reached Storage and the record kept no address,
 *     which is `artifact-media-missing` (`UX-387`).
 *
 * A source scan rather than a behavioural test **because the property is about
 * the SET**: a new door added to this directory tomorrow is the thing that must
 * not slip through, and no test of the existing ones can see it. The list is
 * derived from the directory, so the guard finds a new writer on its own.
 *
 * ── Per WRITE, not per file (Codex round 2, P2) ────────────────────────────
 *
 * The first cut asked `/dayLogId:/.test(wholeFile)`, which is a different and
 * much weaker question. `KidConundrumResponse.tsx` already holds **two**
 * `addDoc` calls, so deleting the stamp from either one left this test green —
 * and a second unstamped writer added to any file that already has a stamped
 * one would have sailed through too. That is the `[ledger-shape]` failure mode
 * the guard's own header cites, reproduced inside the guard: **a check that
 * passes on the case it was written for is worse than no check.** So each write
 * expression is extracted by brace balance and asked separately, and the
 * extractor is itself proved against the exact scenario the round described.
 */
const TODAY_DIR = join(import.meta.dirname)

/** A Firestore write into the artifacts collection, as this repo spells one. */
const ARTIFACT_ADD = /addDoc\(\s*artifactsCollection\(/g

/**
 * Comments stripped, so the scan reads CODE.
 *
 * Earned on this file's first run: the comment explaining why `mediaUrl` is the
 * wrong field contains the field's name, and a guard that fires on its own
 * explanation is a guard somebody deletes.
 */
export function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .join('\n')
}

/** One artifact write, and everything that decides what it sends. */
export interface ArtifactWrite {
  /**
   * The literal it sends, plus the declaration of anything it spreads in, or
   * `null` where the scan could not resolve one of them.
   */
  body: string | null
  /** The second argument as written — an object literal, or a variable name. */
  argument: string
}

/** Walk a balanced `{…}` or `(…)` from `open`, or `null` if it never closes. */
function balanced(code: string, open: number): string | null {
  const close = code[open] === '{' ? '}' : ')'
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === code[open]) depth += 1
    else if (code[i] === close) {
      depth -= 1
      if (depth === 0) return code.slice(open, i + 1)
    }
  }
  return null
}

/**
 * The text that DEFINES a local name: from its declaration keyword to the close
 * of the first `(` or `{` after it.
 *
 * `(` as well as `{` because this repo's builders are wrapped —
 * `const buildArtifactBase = useCallback((…) => ({ … }), [deps])` is the shape
 * `UnifiedCaptureCard` uses, and stopping at the first `{` would read only the
 * arrow's body opening rather than the whole definition.
 */
function declarationOf(code: string, name: string): string | null {
  const decl = new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).exec(code)
  if (!decl) return null
  for (let i = decl.index + decl[0].length; i < code.length; i += 1) {
    if (code[i] === '(' || code[i] === '{') return balanced(code, i)
    if (code[i] === ';' || code[i] === '\n') break
  }
  return null
}

/** The local names a write spreads in — `...base` and `...build(x)` alike. */
function spreadNames(body: string): string[] {
  return [...body.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
}

/**
 * Every `addDoc(artifactsCollection(…), …)` in a file, with everything that
 * decides what each one sends.
 *
 * Three shapes, and **all three must resolve**. The second and third were each
 * found by this scan's own runs, as false positives on files that DO stamp
 * their day — which is the useful direction for a guard to be wrong in, and the
 * reason each is handled rather than excused:
 *
 *   1. an **inline literal** — `addDoc(artifactsCollection(f), { … })`;
 *   2. a **named variable** — `const artifact: Omit<Artifact,'id'> = { … }`
 *      then `addDoc(…, artifact)`, which is `KidCaptureForm`'s shape; and
 *   3. a **spread builder** — `{ ...buildArtifactBase(title, type), … }`, which
 *      is `UnifiedCaptureCard`'s, where the day stamp lives in the builder.
 *
 * A write it cannot resolve comes back with `body: null` and **fails the test**
 * rather than being skipped. A guard that quietly ignores what it cannot parse
 * reports PASS while reading nothing, which is the `[ledger-shape]` lesson and
 * the reason this whole file exists.
 */
export function artifactWrites(source: string): ArtifactWrite[] {
  const code = withoutComments(source)
  const out: ArtifactWrite[] = []
  ARTIFACT_ADD.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ARTIFACT_ADD.exec(code)) !== null) {
    // Past `artifactsCollection(` to its own closing paren, then the comma.
    let i = match.index + match[0].length
    let depth = 1
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth += 1
      else if (code[i] === ')') depth -= 1
      i += 1
    }
    while (i < code.length && /[\s,]/.test(code[i])) i += 1

    let literal: string | null
    let argument: string
    if (code[i] === '{') {
      literal = balanced(code, i)
      argument = '{…}'
    } else {
      const name = /^[A-Za-z_$][\w$]*/.exec(code.slice(i))?.[0]
      argument = name ?? code.slice(i, i + 40)
      literal = name ? declarationOf(code, name) : null
    }

    if (literal === null) {
      out.push({ body: null, argument })
      continue
    }
    // Everything it spreads in counts as part of what it sends.
    const parts = [literal]
    let unresolved = false
    for (const name of spreadNames(literal)) {
      const source = declarationOf(code, name)
      if (source === null) unresolved = true
      else parts.push(source)
    }
    out.push({ body: unresolved ? null : parts.join('\n'), argument })
  }
  return out
}

/** Does this ONE write stamp the day it belongs to? */
export function stampsDayLogId(writeBody: string): boolean {
  return /\bdayLogId\s*:/.test(writeBody)
}

/** Does this source write the singular `mediaUrl` as a document field? */
export function writesSingularMediaUrl(source: string): boolean {
  const code = withoutComments(source)
    .split('\n')
    .filter((line) => !/^\s*(?:let|const|var)\s+mediaUrl\b/.test(line))
    .join('\n')
  return /\bmediaUrl\s*:/.test(code) || /\{\s*mediaUrl\s*\}/.test(code)
}

function todaySources(): { name: string; code: string }[] {
  return readdirSync(TODAY_DIR)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .map((name) => ({ name, code: readFileSync(join(TODAY_DIR, name), 'utf8') }))
}

const writes = todaySources().flatMap(({ name, code }) =>
  artifactWrites(code).map((write, i) => ({ name, index: i, ...write })),
)

describe('Today artifact writers (UX-436 / UX-437)', () => {
  it('finds the writes at all — a scan that reads nothing must fail, not pass', () => {
    // The `[ledger-shape]` lesson: a guard that passes on an empty input is
    // worse than no guard. Asserted as a floor rather than an exact count, so
    // adding a door does not break the guard that is meant to police it.
    expect(writes.length).toBeGreaterThanOrEqual(6)
  })

  it('RESOLVES every write it found — an unparsed one is a hole, not a pass', () => {
    for (const { name, index, argument, body } of writes) {
      expect(
        body,
        `${name} write #${index + 1} could not be resolved (argument: ${argument})`,
      ).not.toBeNull()
    }
  })

  it('sees BOTH writes in a file that has two — the round-2 defect', () => {
    // `KidConundrumResponse` writes an audio artifact and a drawing artifact.
    // A per-file check saw one boolean for the pair.
    const conundrum = writes.filter((w) => w.name === 'KidConundrumResponse.tsx')
    expect(conundrum.length).toBeGreaterThanOrEqual(2)
  })

  it('every INDIVIDUAL write stamps a dayLogId', () => {
    for (const { name, index, body } of writes) {
      expect(
        stampsDayLogId(body ?? ''),
        `${name} write #${index + 1} creates an artifact with no dayLogId`,
      ).toBe(true)
    }
  })

  it('none of them writes the singular `mediaUrl`, which no reader reads', () => {
    for (const { name, code } of todaySources()) {
      expect(
        writesSingularMediaUrl(code),
        `${name} writes \`mediaUrl\`, a field Artifact does not declare`,
      ).toBe(false)
    }
  })
})

describe('the guard can fail — proved, not assumed', () => {
  const TWO_WRITES = `
    await addDoc(artifactsCollection(familyId), {
      childId,
      dayLogId: todayKey(),
      tags: { domain: 'reading' },
    })
    await addDoc(artifactsCollection(familyId), {
      childId,
      title: 'Drawing',
      tags: { domain: 'conundrum' },
    })
  `

  it('extracts one body per write, braces balanced through nested objects', () => {
    const found = artifactWrites(TWO_WRITES)
    expect(found).toHaveLength(2)
    expect(found[0].body).toContain("domain: 'reading'")
    expect(found[1].body).toContain("title: 'Drawing'")
  })

  it('CATCHES the second write losing its stamp while the first keeps one', () => {
    // The exact scenario Codex round 2 described, and the exact thing the
    // per-file version could not see.
    expect(artifactWrites(TWO_WRITES).map((w) => stampsDayLogId(w.body ?? ''))).toEqual([
      true,
      false,
    ])
  })

  it('is not fooled by a spread or a ternary inside the write', () => {
    const found = artifactWrites(
      "addDoc(artifactsCollection(f), { childId, ...(u ? { uri: u } : {}), dayLogId: d })",
    )
    expect(found).toHaveLength(1)
    expect(stampsDayLogId(found[0].body ?? '')).toBe(true)
  })

  it('resolves a write whose argument is a NAMED variable — KidCaptureForm’s shape', () => {
    // This case is why the first cut of the per-write scan produced a false
    // positive on a file that does stamp its day.
    const found = artifactWrites(`
      const artifact: Omit<Artifact, 'id'> = {
        childId,
        dayLogId: today,
        tags: { domain: '' },
      }
      const docRef = await addDoc(artifactsCollection(familyId), artifact)
    `)
    expect(found).toHaveLength(1)
    expect(found[0].argument).toBe('artifact')
    expect(stampsDayLogId(found[0].body ?? '')).toBe(true)
  })

  it('reports a write it CANNOT resolve rather than passing it', () => {
    const found = artifactWrites('await addDoc(artifactsCollection(f), buildIt(x))')
    expect(found).toHaveLength(1)
    expect(found[0].body).toBeNull()
  })

  it('catches the singular media field, in both spellings', () => {
    expect(writesSingularMediaUrl('await addDoc(c, { mediaUrl: url })')).toBe(true)
    expect(writesSingularMediaUrl('await addDoc(c, { ...(u ? { mediaUrl } : {}) })')).toBe(true)
    expect(writesSingularMediaUrl('await updateDoc(r, { mediaUrl: url })')).toBe(true)
    expect(writesSingularMediaUrl('await addDoc(c, { mediaUrls: [url] })')).toBe(false)
  })

  it('does NOT fire on a local declaration or on a comment about the field', () => {
    expect(writesSingularMediaUrl('let mediaUrl: string | undefined')).toBe(false)
    expect(writesSingularMediaUrl('// this used to write mediaUrl: url, which is wrong')).toBe(
      false,
    )
    expect(writesSingularMediaUrl('/* mediaUrl: url */')).toBe(false)
  })
})

describe('the resolver handles this repo’s three write shapes', () => {
  it('follows a spread builder to where the stamp actually lives', () => {
    // `UnifiedCaptureCard`'s shape, and the scan's second false positive: the
    // literal carries no `dayLogId` because the builder it spreads does.
    const found = artifactWrites(`
      const buildArtifactBase = useCallback(
        (title: string, evidenceType: EvidenceType) => ({
          title,
          type: evidenceType,
          dayLogId: today,
        }),
        [today],
      )
      await addDoc(artifactsCollection(familyId), {
        ...buildArtifactBase(titleSeed, EvidenceType.Note),
        content: noteText,
      })
    `)
    expect(found).toHaveLength(1)
    expect(stampsDayLogId(found[0].body ?? '')).toBe(true)
  })

  it('still CATCHES a spread builder that forgets the stamp', () => {
    const found = artifactWrites(`
      const buildArtifactBase = useCallback((title: string) => ({ title }), [])
      await addDoc(artifactsCollection(familyId), {
        ...buildArtifactBase(titleSeed),
        content: noteText,
      })
    `)
    expect(found).toHaveLength(1)
    expect(found[0].body).not.toBeNull()
    expect(stampsDayLogId(found[0].body ?? '')).toBe(false)
  })

  it('reports a spread whose source is not in this file, rather than passing it', () => {
    const found = artifactWrites(
      'await addDoc(artifactsCollection(f), { ...importedBase, content })',
    )
    expect(found).toHaveLength(1)
    expect(found[0].body).toBeNull()
  })
})
