import { describe, expect, it } from 'vitest'

/**
 * Lantern Cove's five challenges and their hours credit (FEAT-247, slice 4), at
 * the pure layer: the authored catalog and its project-scoped lookups, the proof
 * of a save, and the shared admission policy across BOTH games.
 */

import {
  buildStudioSourceDigest,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  utf8ByteLength,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'
import { SubjectBucket } from '../../core/types/enums'
import {
  BUILD_CHALLENGES,
  challengeById,
  challengeFor,
  challengesForProject,
  defaultChallengeFor,
  describeAttemptForParent,
  LANTERN_COVE_CHALLENGES,
  nextChallengeFor,
} from './buildStudioChallenges'
import {
  buildCreditJobFields,
  choosePredecessor,
  CREDIT_PROJECT_IDS,
  creditJobId,
  isCreditProject,
  parseCreditJob,
  proveBuildStudioCredit,
  type StoredVersionDoc,
} from './buildStudioCreditProof'
import {
  admitBuildStudioCredit,
  type BuildStudioCreditReceipt,
  type BuildStudioCreditSource,
} from './buildStudioHoursCredit'
import { BUILD_STUDIO_PROJECT_ID } from './buildStudioStarter'
import { LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles } from './lanternCoveStarter'

const CHILD = 'child-lincoln'
const COVE = LANTERN_COVE_PROJECT_ID
const APPLE = BUILD_STUDIO_PROJECT_ID
const T0 = Date.parse('2026-11-20T16:00:00.000Z')
const stamp = (ms: number) => ({ toMillis: () => ms })

describe('the five authored challenges', () => {
  it('have stable ids, initial revisions, the specified order and the specified subjects', () => {
    expect(LANTERN_COVE_CHALLENGES.map((c) => [c.id, c.order, c.revision, c.subjectBucket])).toEqual([
      ['move-your-starting-spot', 1, 1, SubjectBucket.PracticalArts],
      ['two-points-per-treasure', 2, 1, SubjectBucket.Math],
      ['raise-the-camp-flag-sooner', 3, 1, SubjectBucket.Math],
      ['move-a-treasure', 4, 1, SubjectBucket.Math],
      ['open-a-shortcut', 5, 1, SubjectBucket.PracticalArts],
    ])
  })

  it('offer the specified predictions', () => {
    const ids = (index: number) => LANTERN_COVE_CHALLENGES[index].prediction.options.map((o) => o.id)
    expect(ids(0)).toEqual(['left', 'right', 'same'])
    expect(ids(3)).toEqual(['fewer-steps', 'more-steps', 'same'])
    expect(ids(4)).toEqual(['through', 'around', 'unsure'])
    for (const challenge of LANTERN_COVE_CHALLENGES) {
      const options = challenge.prediction.options.map((o) => o.id)
      expect(options).toHaveLength(3)
      expect(new Set(options).size).toBe(3)
    }
  })

  it('hints locate a block or tool and ask a question — they never name a number to type', () => {
    for (const challenge of LANTERN_COVE_CHALLENGES) {
      expect(challenge.hint.endsWith('?')).toBe(true)
      expect(challenge.hint).not.toMatch(/\d/)
      expect(challenge.followUp.endsWith('?')).toBe(true)
    }
  })

  it('the shortcut puts map editing last, and challenges 2 and 3 say to start fresh', () => {
    expect(LANTERN_COVE_CHALLENGES[4].question).toMatch(/map editing last/i)
    expect(LANTERN_COVE_CHALLENGES[1].question).toMatch(/start fresh/i)
    expect(LANTERN_COVE_CHALLENGES[2].question).toMatch(/start fresh/i)
  })

  it('every lookup is scoped to its own project', () => {
    expect(challengesForProject(COVE)).toBe(LANTERN_COVE_CHALLENGES)
    expect(challengesForProject(APPLE)).toBe(BUILD_CHALLENGES)
    expect(challengesForProject('block-muncher')).toEqual([])
    expect(challengesForProject('__proto__')).toEqual([])
    expect(challengeFor(COVE, 'open-a-shortcut')?.goal).toBe('Open a shortcut.')
    expect(challengeFor(COVE, 'faster-hero')).toBeNull()
    expect(challengeFor(APPLE, 'open-a-shortcut')).toBeNull()
    expect(challengeById('open-a-shortcut')).toBeNull() // the one-argument form is Apple Dash's
    expect(challengeById('faster-hero')?.id).toBe('faster-hero')
    expect(defaultChallengeFor(COVE)?.id).toBe('move-your-starting-spot')
    expect(defaultChallengeFor('block-muncher')).toBeNull()
  })

  it('a swap walks the same project’s catalog and wraps', () => {
    expect(nextChallengeFor(COVE, 'move-your-starting-spot')?.id).toBe('two-points-per-treasure')
    expect(nextChallengeFor(COVE, 'open-a-shortcut')?.id).toBe('move-your-starting-spot')
    expect(nextChallengeFor(COVE, 'faster-hero')?.id).toBe('move-your-starting-spot') // unknown id: the start, never Apple Dash's
    expect(nextChallengeFor('block-muncher', 'x')).toBeNull()
  })
})

// ── Parent-facing description ───────────────────────────────────────────────

const attemptFor = (projectId: string, versionId: string, challengeId: string, optionId: string, over: object = {}) => ({
  childId: CHILD,
  projectId,
  versionId,
  attemptId: 'a-attempt1',
  challengeId,
  challengeRevision: 1,
  subjectBucket: challengeFor(projectId, challengeId)?.subjectBucket ?? SubjectBucket.Math,
  prediction: { optionId, at: '2026-11-20T15:50:00.000Z' },
  ...over,
})

describe('what a parent reads on a saved row', () => {
  const row = (projectId: string, challengeAttempt: unknown) => ({
    childId: CHILD,
    projectId,
    versionId: 'v-aaa111',
    challengeAttempt,
  })

  it('describes a Lantern Cove attempt in Lantern Cove’s words', () => {
    const described = describeAttemptForParent(row(COVE, attemptFor(COVE, 'v-aaa111', 'move-a-treasure', 'fewer-steps')))
    expect(described?.summary).toContain('Challenge: “Move a treasure.”')
    expect(described?.summary).toContain('Guess: Fewer steps.')
    expect(described?.followUp).toBe(LANTERN_COVE_CHALLENGES[3].followUp)
  })

  it('never borrows another game’s wording: a foreign id describes as nothing', () => {
    expect(describeAttemptForParent(row(COVE, attemptFor(COVE, 'v-aaa111', 'faster-hero', 'faster')))).toBeNull()
    expect(describeAttemptForParent(row(APPLE, attemptFor(APPLE, 'v-aaa111', 'open-a-shortcut', 'through')))).toBeNull()
  })

  it('an attempt scoped to a different project than its row is not described', () => {
    expect(describeAttemptForParent(row(APPLE, attemptFor(COVE, 'v-aaa111', 'move-a-treasure', 'same')))).toBeNull()
  })
})

// ── The proof of a save ─────────────────────────────────────────────────────

const APPLE_FILES: BuildStudioSourceFiles = {
  'pxt.json': JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] }),
  'main.ts': 'info.setLife(4)\nsprites.create(img``, SpriteKind.Player)\n',
  'main.blocks': '<xml><block type="pxt-on-start"><statement/></block></xml>',
}

const withoutKey = (files: BuildStudioSourceFiles, name: string): BuildStudioSourceFiles =>
  Object.fromEntries(Object.entries(files).filter(([key]) => key !== name))

function versionDoc(
  projectId: string,
  versionId: string,
  files: BuildStudioSourceFiles,
  opts: { acceptedMs?: number | null; attempt?: unknown } = {},
): StoredVersionDoc {
  const archive = serializeBuildStudioSource(files)
  const id = buildStudioVersionDocId(CHILD, projectId, versionId)
  const data: Record<string, unknown> = {
    id,
    childId: CHILD,
    projectId,
    versionId,
    label: 'x',
    createdAt: '2026-11-20T15:59:00.000Z',
    sourceArchive: archive,
    byteSize: utf8ByteLength(archive),
    fileCount: Object.keys(files).length,
    sourceDigest: buildStudioSourceDigest(archive),
  }
  if (opts.acceptedMs !== null) data.acceptedAt = stamp(opts.acceptedMs ?? T0)
  if (opts.attempt !== undefined) data.challengeAttempt = opts.attempt
  return { id, data }
}

const prove = (
  projectId: string,
  version: StoredVersionDoc,
  baseline: Parameters<typeof proveBuildStudioCredit>[0]['baseline'],
) =>
  proveBuildStudioCredit({
    childId: CHILD,
    projectId,
    versionId: version.data?.versionId as string,
    version,
    baseline,
  })

const cove = () => lanternCoveStarterFiles()
const movedHero = (): BuildStudioSourceFiles => ({
  ...cove(),
  'main.ts': cove()['main.ts'].replace('tiles.getTileLocation(1, 1)', 'tiles.getTileLocation(3, 2)'),
})
const withTile = (files: BuildStudioSourceFiles): BuildStudioSourceFiles => {
  const jres = JSON.parse(files['tilemap.g.jres'])
  const hex = atob(jres['Lantern Cove1'].data)
  jres['Lantern Cove1'].data = btoa(hex.slice(0, 10) + (hex[10] === '0' ? '1' : '0') + hex.slice(11))
  return { ...files, 'tilemap.g.jres': JSON.stringify(jres, null, 4) }
}
/** What a stock import → capture may do to an unchanged cove. */
const roundTripped = (files: BuildStudioSourceFiles): BuildStudioSourceFiles => ({
  ...files,
  'main.blocks': files['main.blocks'].replace(/ (x|y)="-?\d+"/g, '').replace(/></g, '>\n <'),
  'pxt.json': JSON.stringify({ ...JSON.parse(files['pxt.json']), description: 'rewritten', targetVersion: '9.9.9' }, null, 2),
})

describe('Lantern Cove challenge credit', () => {
  it.each(LANTERN_COVE_CHALLENGES.map((c) => [c.id, c] as const))(
    '%s: a prediction on the exact save credits the authored id, revision and subject',
    (_id, challenge) => {
      const v = versionDoc(COVE, 'v-aaa111', cove(), {
        attempt: attemptFor(COVE, 'v-aaa111', challenge.id, challenge.prediction.options[0].id),
      })
      expect(prove(COVE, v, null)).toMatchObject({
        ok: true,
        proof: {
          source: {
            kind: 'challenge',
            challengeId: challenge.id,
            challengeRevision: 1,
            subjectBucket: challenge.subjectBucket,
            projectId: COVE,
            versionId: 'v-aaa111',
          },
          workMs: T0,
        },
      })
    },
  )

  it('a prediction option the challenge does not offer, a wrong revision or a wrong subject is unverified', () => {
    const bad = [
      { prediction: { optionId: 'banana', at: '2026-11-20T15:50:00.000Z' } },
      { challengeRevision: 2 },
      { subjectBucket: SubjectBucket.Science },
    ]
    for (const over of bad) {
      const v = versionDoc(COVE, 'v-aaa111', cove(), {
        attempt: attemptFor(COVE, 'v-aaa111', 'move-your-starting-spot', 'left', over),
      })
      expect(prove(COVE, v, { kind: 'starter' })).toEqual({ ok: false, reason: 'challenge-unverified' })
    }
  })

  it('a challenge without a prediction is never laundered into free building', () => {
    const v = versionDoc(COVE, 'v-aaa111', movedHero(), {
      attempt: attemptFor(COVE, 'v-aaa111', 'move-your-starting-spot', 'left', { prediction: undefined }),
    })
    expect(prove(COVE, v, { kind: 'starter' })).toEqual({ ok: false, reason: 'challenge-unverified' })
  })
})

describe('a cross-game attempt earns nothing, in both directions', () => {
  it('a Lantern Cove save carrying an Apple Dash challenge earns neither challenge nor free-build credit', () => {
    const v = versionDoc(COVE, 'v-aaa111', movedHero(), {
      attempt: attemptFor(COVE, 'v-aaa111', 'faster-hero', 'faster', { subjectBucket: SubjectBucket.PracticalArts }),
    })
    // A changed save against the starter WOULD be free building; the claim blocks it.
    expect(prove(COVE, v, { kind: 'starter' })).toEqual({ ok: false, reason: 'challenge-unverified' })
  })

  it('an Apple Dash save carrying a Lantern Cove challenge earns neither', () => {
    const v = versionDoc(APPLE, 'v-aaa111', APPLE_FILES, {
      attempt: attemptFor(APPLE, 'v-aaa111', 'open-a-shortcut', 'through', { subjectBucket: SubjectBucket.PracticalArts }),
    })
    expect(prove(APPLE, v, { kind: 'starter' })).toEqual({ ok: false, reason: 'challenge-unverified' })
  })

  it('an attempt whose own project is the other game is malformed', () => {
    const v = versionDoc(COVE, 'v-aaa111', cove(), {
      attempt: attemptFor(APPLE, 'v-aaa111', 'faster-hero', 'faster'),
    })
    expect(prove(COVE, v, null)).toEqual({ ok: false, reason: 'malformed-attempt' })
  })
})

describe('Lantern Cove free building', () => {
  it('the first changed save is compared with Lantern Cove’s OWN starter', () => {
    const r = prove(COVE, versionDoc(COVE, 'v-aaa111', movedHero()), { kind: 'starter' })
    expect(r).toMatchObject({ ok: true, proof: { source: { kind: 'freeBuild', projectId: COVE }, predecessorDocId: null } })
  })

  it('opening and saving the starter unchanged earns nothing — raw or after a stock round trip', () => {
    expect(prove(COVE, versionDoc(COVE, 'v-aaa111', cove()), { kind: 'starter' })).toEqual({ ok: false, reason: 'unchanged' })
    const trip = roundTripped(cove())
    expect(trip['main.blocks']).not.toBe(cove()['main.blocks']) // control: it really was re-serialised
    expect(prove(COVE, versionDoc(COVE, 'v-aaa111', trip), { kind: 'starter' })).toEqual({ ok: false, reason: 'unchanged' })
  })

  it('a tile-only change IS work', () => {
    const tiled = withTile(cove())
    expect(tiled['tilemap.g.jres']).not.toBe(cove()['tilemap.g.jres'])
    expect(prove(COVE, versionDoc(COVE, 'v-aaa111', tiled), { kind: 'starter' })).toMatchObject({ ok: true })
  })

  it('later saves are compared with their own predecessor: unchanged earns nothing, a new change does', () => {
    const predecessor = versionDoc(COVE, 'v-aaa111', movedHero(), { acceptedMs: T0 - 600_000 })
    const baseline = { kind: 'version', doc: predecessor } as const
    const same = versionDoc(COVE, 'v-bbb222', roundTripped(movedHero()))
    expect(prove(COVE, same, baseline)).toEqual({ ok: false, reason: 'unchanged' })
    const next = versionDoc(COVE, 'v-ccc333', withTile(movedHero()))
    expect(prove(COVE, next, baseline)).toMatchObject({ ok: true, proof: { predecessorDocId: predecessor.id } })
  })

  it('a baseline from the other game is unreadable, never a comparison', () => {
    const appleBaseline = versionDoc(APPLE, 'v-aaa111', APPLE_FILES, { acceptedMs: T0 - 600_000 })
    expect(prove(COVE, versionDoc(COVE, 'v-bbb222', movedHero()), { kind: 'version', doc: appleBaseline })).toEqual({
      ok: false,
      reason: 'baseline-unreadable',
    })
  })

  it('a Lantern Cove save that lost its map is malformed, not credited', () => {
    const mapless = withoutKey(withoutKey(movedHero(), 'tilemap.g.jres'), 'tilemap.g.ts')
    expect(prove(COVE, versionDoc(COVE, 'v-aaa111', mapless), { kind: 'starter' })).toEqual({
      ok: false,
      reason: 'malformed-source',
    })
  })

  it('the predecessor is scoped to the game: an Apple Dash save in between is ignored', () => {
    const source = versionDoc(COVE, 'v-ccc333', movedHero(), { acceptedMs: T0 })
    const earlierCove = versionDoc(COVE, 'v-aaa111', cove(), { acceptedMs: T0 - 600_000 })
    const between = versionDoc(APPLE, 'v-bbb222', APPLE_FILES, { acceptedMs: T0 - 1000 })
    expect(choosePredecessor(source, CHILD, COVE, [earlierCove, between])).toEqual({ ok: true, docId: earlierCove.id })
    expect(choosePredecessor(source, CHILD, COVE, [between])).toEqual({ ok: true, docId: null })
  })
})

describe('which games can be credited', () => {
  it('exactly Apple Dash and Lantern Cove', () => {
    expect([...CREDIT_PROJECT_IDS]).toEqual([APPLE, COVE])
    expect(isCreditProject(COVE)).toBe(true)
    expect(isCreditProject(APPLE)).toBe(true)
    for (const other of ['block-muncher', '', 'constructor', undefined, null, 7]) {
      expect(isCreditProject(other)).toBe(false)
    }
  })

  it('a pending job is worked for either game and for nothing else', () => {
    for (const projectId of [APPLE, COVE]) {
      const id = creditJobId(CHILD, projectId, 'v-aaa111')
      expect(parseCreditJob(id, { ...buildCreditJobFields(CHILD, projectId, 'v-aaa111') })).toEqual({
        childId: CHILD,
        projectId,
        versionId: 'v-aaa111',
      })
    }
    const foreign = creditJobId(CHILD, 'block-muncher', 'v-aaa111')
    expect(parseCreditJob(foreign, buildCreditJobFields(CHILD, 'block-muncher', 'v-aaa111'))).toBeNull()
  })

  it('a proof for any other game is refused as bad scope', () => {
    const v = versionDoc('block-muncher', 'v-aaa111', APPLE_FILES)
    expect(prove('block-muncher', v, { kind: 'starter' })).toEqual({ ok: false, reason: 'bad-scope' })
  })
})

// ── The shared budget, across both games ────────────────────────────────────

const challengeSource = (projectId: string, challengeId: string, versionId: string): BuildStudioCreditSource => ({
  kind: 'challenge',
  challengeId,
  challengeRevision: 1,
  subjectBucket: SubjectBucket.Math,
  projectId,
  versionId,
})
const freeSource = (projectId: string, versionId: string): BuildStudioCreditSource => ({
  kind: 'freeBuild',
  projectId,
  versionId,
})
const receipt = (source: BuildStudioCreditSource, atMs: number, schoolDate = '2026-11-20'): BuildStudioCreditReceipt => ({
  familyId: 'fam-1',
  childId: CHILD,
  schoolDate,
  atMs,
  minutes: 15,
  source,
})
const candidate = (source: BuildStudioCreditSource, atMs: number) => ({
  familyId: 'fam-1',
  childId: CHILD,
  schoolDate: '2026-11-20',
  atMs,
  source,
})

describe('the shared daily budget and free-build cadence', () => {
  const min = 60_000

  it('free-build spacing holds across games, before and after', () => {
    const apple = receipt(freeSource(APPLE, 'v-apple1'), T0)
    expect(admitBuildStudioCredit(candidate(freeSource(COVE, 'v-cove1'), T0 + 10 * min), [apple])).toEqual({
      admitted: false,
      reason: 'free-build-too-soon',
    })
    expect(admitBuildStudioCredit(candidate(freeSource(COVE, 'v-cove1'), T0 - 10 * min), [apple])).toEqual({
      admitted: false,
      reason: 'free-build-too-soon',
    })
    expect(admitBuildStudioCredit(candidate(freeSource(COVE, 'v-cove1'), T0 + 15 * min), [apple])).toMatchObject({
      admitted: true,
      minutes: 15,
      subjectBucket: SubjectBucket.PracticalArts,
    })
  })

  it('the 240-minute cap is one budget for the two games together; no partial credit', () => {
    const challengeIds = [...BUILD_CHALLENGES.map((c) => c.id), ...LANTERN_COVE_CHALLENGES.map((c) => c.id)]
    // 15 units: 8 Apple Dash + 7 Lantern Cove-shaped sources = 225 minutes.
    const fifteen = Array.from({ length: 15 }, (_, i) =>
      receipt(challengeSource(i < 8 ? APPLE : COVE, challengeIds[i], `v-seed${i}`), T0 - (i + 1) * 20 * min),
    )
    expect(admitBuildStudioCredit(candidate(freeSource(COVE, 'v-cove1'), T0), fifteen)).toMatchObject({
      admitted: true,
      totalMinutesAfter: 240,
    })
    const sixteen = [...fifteen, receipt(challengeSource(COVE, challengeIds[16], 'v-seed15'), T0 - 400 * min)]
    expect(admitBuildStudioCredit(candidate(freeSource(COVE, 'v-cove1'), T0), sixteen)).toEqual({
      admitted: false,
      reason: 'over-daily-cap',
    })
  })

  it('one challenge counts once per day per game, and the same version id in the two games is two sources', () => {
    const first = receipt(challengeSource(COVE, 'move-a-treasure', 'v-cove1'), T0)
    expect(
      admitBuildStudioCredit(candidate(challengeSource(COVE, 'move-a-treasure', 'v-cove2'), T0 + 60 * min), [first]),
    ).toEqual({ admitted: false, reason: 'challenge-already-credited-today' })
    expect(
      admitBuildStudioCredit(candidate(challengeSource(COVE, 'open-a-shortcut', 'v-cove2'), T0 + 60 * min), [first]),
    ).toMatchObject({ admitted: true })
    // Same version id, other game: not a duplicate source.
    expect(
      admitBuildStudioCredit(candidate(freeSource(APPLE, 'v-cove1'), T0 + 60 * min), [first]),
    ).toMatchObject({ admitted: true })
  })

  it('a version cannot be credited through both challenge and free building', () => {
    const challenged = receipt(challengeSource(COVE, 'move-a-treasure', 'v-cove1'), T0)
    expect(admitBuildStudioCredit(candidate(freeSource(COVE, 'v-cove1'), T0 + 60 * min), [challenged])).toEqual({
      admitted: false,
      reason: 'duplicate-source',
    })
  })
})
