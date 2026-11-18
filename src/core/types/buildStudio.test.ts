import { describe, expect, it } from 'vitest'

import {
  BUILD_STUDIO_MAX_ARCHIVE_BYTES,
  BUILD_STUDIO_MAX_FILE_BYTES,
  buildStudioOptInDocId,
  buildStudioSourceDigest,
  buildStudioSourceKeys,
  buildStudioVersionDocId,
  parseBuildStudioSource,
  serializeBuildStudioSource,
  utf8ByteLength,
} from './buildStudio'

/**
 * The serialization contract (LOCAL-BUILD-001).
 *
 * This is load-bearing in a way a serializer usually is not: the version
 * writer's "is this the same payload?" check is an EXACT STRING comparison
 * against the stored archive, so the same files must always produce the same
 * characters. If they did not, a retry would look like a conflicting second
 * save and the child would be told his work clashed with itself.
 */

const PXT = JSON.stringify({
  name: 'Apple Dash starter',
  files: ['main.blocks', 'main.ts'],
  preferredEditor: 'blocksprj',
})

describe('the archive is deterministic', () => {
  it('produces identical characters for the same files in a different order', () => {
    const a = serializeBuildStudioSource({
      'pxt.json': PXT,
      'main.ts': 'info.setLife(3)',
      'main.blocks': '<xml/>',
    })
    const b = serializeBuildStudioSource({
      'main.blocks': '<xml/>',
      'pxt.json': PXT,
      'main.ts': 'info.setLife(3)',
    })
    expect(a).toBe(b)
    expect(buildStudioSourceDigest(a)).toBe(buildStudioSourceDigest(b))
  })

  it('round-trips the exact bytes of every file', () => {
    const files = {
      'pxt.json': PXT,
      'main.ts': 'info.setLife(3)\n// a comment with a } brace and a "quote"\n',
      'main.blocks': '<xml xmlns="x"><block type="pxt-on-start"/></xml>',
      'assets.jres': '{"image":"data"}',
    }
    const restored = parseBuildStudioSource(serializeBuildStudioSource(files))
    expect(restored).toEqual(files)
  })

  it('changes the digest when one character changes', () => {
    const one = serializeBuildStudioSource({ 'pxt.json': PXT, 'main.ts': 'info.setLife(3)' })
    const two = serializeBuildStudioSource({ 'pxt.json': PXT, 'main.ts': 'info.setLife(4)' })
    expect(one).not.toBe(two)
    expect(buildStudioSourceDigest(one)).not.toBe(buildStudioSourceDigest(two))
  })
})

describe("the editor's private journal is left out, and said so", () => {
  it('drops `_history` but keeps everything declared', () => {
    const keys = buildStudioSourceKeys({
      'pxt.json': PXT,
      'main.ts': 'x',
      'main.blocks': '<xml/>',
      _history: '{"entries":[]}',
    })
    expect(keys).toEqual(['main.blocks', 'main.ts', 'pxt.json'])
  })

  it('keeps a file the manifest forgot to list', () => {
    // An asset the editor sent but `pxt.json` does not name is still part of
    // the program; dropping it would store an incomplete game.
    const keys = buildStudioSourceKeys({
      'pxt.json': PXT,
      'main.ts': 'x',
      'main.blocks': '<xml/>',
      'assets.jres': '{}',
    })
    expect(keys).toContain('assets.jres')
  })

  it('keeps every non-private file when the manifest will not parse', () => {
    // Fail OPEN on the file list, closed on everything else: a manifest we
    // could not read is not a reason to silently store fewer files.
    const keys = buildStudioSourceKeys({
      'pxt.json': 'not json at all',
      'main.ts': 'x',
      'weird.ts': 'y',
      _history: 'z',
    })
    expect(keys).toEqual(['main.ts', 'pxt.json', 'weird.ts'])
  })
})

describe('a bad archive is refused, not guessed at', () => {
  it.each([
    ['not json', 'nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['an empty object', '{}'],
  ])('refuses %s', (_label, archive) => {
    expect(() => parseBuildStudioSource(archive)).toThrow()
  })

  it('refuses a file whose value is not text, naming it', () => {
    expect(() => parseBuildStudioSource('{"main.ts": 7}')).toThrow(/main\.ts/)
  })
})

describe('size is measured in UTF-8 bytes', () => {
  it('agrees with TextEncoder on ASCII, accents, CJK and emoji', () => {
    for (const sample of ['', 'abc', 'café', '界', '界界界', '🎮', 'a界🎮z']) {
      expect(utf8ByteLength(sample), sample).toBe(new TextEncoder().encode(sample).length)
    }
  })

  it('is NOT the character count for anything outside ASCII', () => {
    // The whole defect in one assertion: the old gate used the left number.
    expect('界'.repeat(185_000).length).toBe(185_000)
    expect(utf8ByteLength('界'.repeat(185_000))).toBe(555_000)
  })

  it('counts a surrogate pair as one four-byte character', () => {
    expect('🎮'.length).toBe(2)
    expect(utf8ByteLength('🎮')).toBe(4)
  })

  it('produces a number for a lone surrogate rather than throwing', () => {
    expect(utf8ByteLength('\uD800')).toBeGreaterThan(0)
  })

  it('leaves a byte cap below Firestore’s 1 MiB with real margin', () => {
    const FIRESTORE_MAX = 1_048_576
    expect(BUILD_STUDIO_MAX_ARCHIVE_BYTES).toBeLessThan(FIRESTORE_MAX)
    // At least a quarter of the budget left for the rest of the document.
    expect(FIRESTORE_MAX - BUILD_STUDIO_MAX_ARCHIVE_BYTES).toBeGreaterThan(
      FIRESTORE_MAX / 4,
    )
  })

  it('keeps the per-file cap no larger than the whole archive cap', () => {
    expect(BUILD_STUDIO_MAX_FILE_BYTES).toBeLessThanOrEqual(BUILD_STUDIO_MAX_ARCHIVE_BYTES)
  })
})

describe('ids are derived, never invented twice', () => {
  it('builds a version id from child, project and version', () => {
    expect(buildStudioVersionDocId('c1', 'p1', 'v1')).toBe('c1__p1__v1')
  })

  it('builds the opt-in document id the settings convention uses', () => {
    expect(buildStudioOptInDocId('c1')).toBe('buildStudio_c1')
  })
})
