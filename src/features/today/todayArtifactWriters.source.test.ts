import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
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
 *     which is `artifact-media-missing` (`UX-387`) — and `UX-432` is what made
 *     it visible, since the evidence list would otherwise have said *(no file)*
 *     over audio that exists.
 *
 * A source scan rather than a behavioural test **because the property is about
 * the SET**: a new door added to this directory tomorrow is the thing that must
 * not slip through, and no test of the six existing ones can see it. The
 * derived list is every non-test file under `src/features/today/` that calls
 * `addDoc(artifactsCollection(...))`, so the guard finds a seventh on its own.
 */
const TODAY_DIR = join(import.meta.dirname)

const WRITES_ARTIFACT = /addDoc\(\s*artifactsCollection\(/

/**
 * Comments and local declarations stripped, so the scan reads CODE.
 *
 * Both exclusions were earned on this file's first run: `let mediaUrl: string`
 * is a local variable, not a field, and the comment explaining why the field is
 * wrong contains the field's name. A guard that fires on its own explanation is
 * a guard somebody deletes.
 */
export function writableCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .filter((line) => !/^\s*(?:let|const|var)\s+mediaUrl\b/.test(line))
    .join('\n')
}

/** Is the singular `mediaUrl` written as a DOCUMENT FIELD anywhere here? */
export function writesSingularMediaUrl(source: string): boolean {
  const code = writableCode(source)
  return /\bmediaUrl\s*:/.test(code) || /\{\s*mediaUrl\s*\}/.test(code)
}

/** Does this source stamp a `dayLogId` on what it writes? */
export function stampsDayLogId(source: string): boolean {
  return /dayLogId\s*:/.test(writableCode(source))
}

function todaySources(): { name: string; code: string }[] {
  return readdirSync(TODAY_DIR)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .map((name) => ({ name, code: readFileSync(join(TODAY_DIR, name), 'utf8') }))
}

const writers = todaySources().filter((f) => WRITES_ARTIFACT.test(f.code))

describe('Today artifact writers (UX-436 / UX-437)', () => {
  it('finds the writers at all — a scan that reads nothing must fail, not pass', () => {
    // The `[ledger-shape]` lesson: a guard that passes on an empty input is
    // worse than no guard. Six today; the assertion is that there are some.
    expect(writers.length).toBeGreaterThanOrEqual(5)
  })

  it('every one of them stamps a dayLogId', () => {
    for (const { name, code } of writers) {
      expect(stampsDayLogId(code), `${name} writes an artifact with no dayLogId`).toBe(true)
    }
  })

  it('none of them writes the singular `mediaUrl`, which no reader reads', () => {
    for (const { name, code } of writers) {
      expect(
        writesSingularMediaUrl(code),
        `${name} writes \`mediaUrl\`, a field Artifact does not declare`,
      ).toBe(false)
    }
  })
})

describe('the guard can fail — proved, not assumed', () => {
  it('catches a writer that forgets the day stamp', () => {
    expect(stampsDayLogId('addDoc(artifactsCollection(f), { childId, title })')).toBe(false)
    expect(stampsDayLogId('addDoc(artifactsCollection(f), { childId, dayLogId: today })')).toBe(
      true,
    )
  })

  it('catches the singular field, in both the explicit and shorthand spellings', () => {
    expect(writesSingularMediaUrl('await addDoc(c, { mediaUrl: url })')).toBe(true)
    expect(writesSingularMediaUrl('await addDoc(c, { ...(u ? { mediaUrl } : {}) })')).toBe(true)
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
