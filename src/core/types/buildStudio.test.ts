import { describe, expect, it } from 'vitest'

import {
  buildStudioOptInDocId,
  buildStudioSourceDigest,
  buildStudioSourceKeys,
  buildStudioVersionDocId,
  parseBuildStudioSource,
  serializeBuildStudioSource,
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

describe('ids are derived, never invented twice', () => {
  it('builds a version id from child, project and version', () => {
    expect(buildStudioVersionDocId('c1', 'p1', 'v1')).toBe('c1__p1__v1')
  })

  it('builds the opt-in document id the settings convention uses', () => {
    expect(buildStudioOptInDocId('c1')).toBe('buildStudio_c1')
  })
})
