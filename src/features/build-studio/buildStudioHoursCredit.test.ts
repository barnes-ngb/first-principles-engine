import { describe, expect, it } from 'vitest'

import { SubjectBucket } from '../../core/types/enums'
import {
  admitBuildStudioCredit,
  BUILD_STUDIO_DAILY_CREDIT_CAP_MINUTES,
  creditForSource,
} from './buildStudioHoursCredit'
import type {
  BuildStudioCreditCandidate,
  BuildStudioCreditReceipt,
  BuildStudioCreditSource,
} from './buildStudioHoursCredit'

// Synthetic fixtures only.
const FAMILY = 'family-test'
const CHILD = 'child-a'
const DAY1 = '2030-03-04'
const DAY2 = '2030-03-05'
const MIN = 60_000
const T0 = Date.UTC(2030, 2, 4, 15, 0, 0)

const challenge = (over: Partial<Extract<BuildStudioCreditSource, { kind: 'challenge' }>> = {}): BuildStudioCreditSource => ({
  kind: 'challenge',
  challengeId: 'bridge-span',
  challengeRevision: 1,
  subjectBucket: SubjectBucket.Math,
  projectId: 'project-1',
  versionId: 'version-1',
  ...over,
})
const free = (projectId = 'project-1', versionId = 'version-f1'): BuildStudioCreditSource => ({
  kind: 'freeBuild',
  projectId,
  versionId,
})
const idea = (requestId = 'request-1'): BuildStudioCreditSource => ({ kind: 'blockMuncherIdea', requestId })
const verdict = (requestId = 'request-1', playedBuildId = 'build-1'): BuildStudioCreditSource => ({
  kind: 'blockMuncherVerdict',
  requestId,
  playedBuildId,
})

const candidate = (
  source: BuildStudioCreditSource,
  over: Partial<BuildStudioCreditCandidate> = {},
): BuildStudioCreditCandidate => ({
  familyId: FAMILY,
  childId: CHILD,
  schoolDate: DAY1,
  atMs: T0,
  source,
  ...over,
})
const receipt = (
  source: BuildStudioCreditSource,
  over: Partial<BuildStudioCreditReceipt> = {},
): BuildStudioCreditReceipt => ({
  familyId: FAMILY,
  childId: CHILD,
  schoolDate: DAY1,
  atMs: T0 - 600 * MIN,
  minutes: creditForSource(source).minutes,
  source,
  ...over,
})
/**
 * Real committed receipts totalling exactly `total` minutes (a multiple of 5), each a fixed
 * unit with its own distinct intent: 15-minute challenges in separate projects, then a
 * 10-minute verdict and/or a 5-minute idea for the remainder.
 */
const fill = (total: number, over: Partial<BuildStudioCreditReceipt> = {}): BuildStudioCreditReceipt[] => {
  const out: BuildStudioCreditReceipt[] = []
  let left = total
  for (let i = 0; left >= 15; i++, left -= 15) {
    out.push(receipt(challenge({ projectId: `fill-project-${i}`, versionId: `fill-version-${i}` }), over))
  }
  if (left >= 10) {
    out.push(receipt(verdict('fill-request', 'fill-build'), over))
    left -= 10
  }
  if (left >= 5) {
    out.push(receipt(idea('fill-idea'), over))
    left -= 5
  }
  return out
}

const rejected = (c: BuildStudioCreditCandidate, r: BuildStudioCreditReceipt[]) => {
  const d = admitBuildStudioCredit(c, r)
  return d.admitted ? 'admitted' : d.reason
}

describe('fixed credit table', () => {
  it('credits a challenge 15 minutes under its authored subject', () => {
    for (const subjectBucket of [SubjectBucket.Science, SubjectBucket.SocialStudies, SubjectBucket.Math]) {
      expect(admitBuildStudioCredit(candidate(challenge({ subjectBucket })), [])).toEqual({
        admitted: true,
        minutes: 15,
        subjectBucket,
        totalMinutesAfter: 15,
      })
    }
  })

  it('credits a changed free-building save 15 minutes of Practical Arts', () => {
    expect(admitBuildStudioCredit(candidate(free()), [])).toMatchObject({
      admitted: true,
      minutes: 15,
      subjectBucket: SubjectBucket.PracticalArts,
    })
  })

  it('credits a Block Muncher idea 5 minutes of Language Arts', () => {
    expect(admitBuildStudioCredit(candidate(idea()), [])).toMatchObject({
      admitted: true,
      minutes: 5,
      subjectBucket: SubjectBucket.LanguageArts,
    })
  })

  it('credits a Block Muncher verdict 10 minutes of Practical Arts', () => {
    expect(admitBuildStudioCredit(candidate(verdict()), [])).toMatchObject({
      admitted: true,
      minutes: 10,
      subjectBucket: SubjectBucket.PracticalArts,
    })
  })

  it('reports the running total including prior receipts for the date', () => {
    const d = admitBuildStudioCredit(candidate(verdict()), [receipt(idea())])
    expect(d).toMatchObject({ admitted: true, totalMinutesAfter: 15 })
  })
})

describe('exact-source retries', () => {
  it('rejects a repeated challenge version, even on another date', () => {
    const prior = receipt(challenge())
    expect(rejected(candidate(challenge()), [prior])).toBe('duplicate-source')
    expect(rejected(candidate(challenge(), { schoolDate: DAY2 }), [prior])).toBe('duplicate-source')
  })

  it('rejects a repeated free-building version, even on another date', () => {
    const prior = receipt(free())
    expect(rejected(candidate(free(), { schoolDate: DAY2 }), [prior])).toBe('duplicate-source')
  })

  it('rejects a repeated idea and a repeated verdict, but treats request and verdict as separate', () => {
    expect(rejected(candidate(idea()), [receipt(idea())])).toBe('duplicate-source')
    expect(rejected(candidate(verdict()), [receipt(verdict())])).toBe('duplicate-source')
    expect(rejected(candidate(verdict()), [receipt(idea())])).toBe('admitted')
    expect(rejected(candidate(idea()), [receipt(verdict())])).toBe('admitted')
  })

  it('treats a different played build or request as a different verdict', () => {
    expect(rejected(candidate(verdict('request-1', 'build-2')), [receipt(verdict())])).toBe('admitted')
    expect(rejected(candidate(verdict('request-2', 'build-1')), [receipt(verdict())])).toBe('admitted')
  })

  it('checks the exact source before the cap', () => {
    expect(rejected(candidate(idea()), [receipt(idea()), ...fill(235)])).toBe('duplicate-source')
  })

  it('lets one saved version enter through only one of challenge and free building', () => {
    const asChallenge = receipt(challenge({ projectId: 'p', versionId: 'v' }))
    const asFree = receipt(free('p', 'v'))
    expect(rejected(candidate(free('p', 'v')), [asChallenge])).toBe('duplicate-source')
    expect(rejected(candidate(challenge({ projectId: 'p', versionId: 'v' })), [asFree])).toBe('duplicate-source')
  })

  it('does not confuse the same version id in a different project', () => {
    expect(rejected(candidate(free('p2', 'v')), [receipt(challenge({ projectId: 'p', versionId: 'v' }))])).toBe(
      'admitted',
    )
  })

  it('ignores receipts from another child or family', () => {
    expect(rejected(candidate(idea()), [receipt(idea(), { childId: 'child-b' })])).toBe('admitted')
    expect(rejected(candidate(idea()), [receipt(idea(), { familyId: 'family-other' })])).toBe('admitted')
    expect(rejected(candidate(idea()), fill(240, { childId: 'child-b' }))).toBe('admitted')
  })
})

describe('one challenge per project and challenge ID per day', () => {
  it('rejects a second version of the same challenge on the same date', () => {
    const prior = receipt(challenge({ versionId: 'version-1' }))
    expect(rejected(candidate(challenge({ versionId: 'version-2' })), [prior])).toBe(
      'challenge-already-credited-today',
    )
  })

  it('is independent of the challenge revision', () => {
    const prior = receipt(challenge({ challengeRevision: 1 }))
    expect(rejected(candidate(challenge({ challengeRevision: 2, versionId: 'version-2' })), [prior])).toBe(
      'challenge-already-credited-today',
    )
  })

  it('allows the same challenge on the next date with a new version', () => {
    const prior = receipt(challenge())
    expect(rejected(candidate(challenge({ versionId: 'version-2' }), { schoolDate: DAY2 }), [prior])).toBe(
      'admitted',
    )
  })

  it('allows a different challenge, or the same challenge in a different project, on the same date', () => {
    const prior = receipt(challenge())
    expect(rejected(candidate(challenge({ challengeId: 'other-one', versionId: 'version-2' })), [prior])).toBe(
      'admitted',
    )
    expect(rejected(candidate(challenge({ projectId: 'project-2', versionId: 'version-2' })), [prior])).toBe(
      'admitted',
    )
  })
})

describe('daily budget', () => {
  const units = [
    { name: 'challenge', source: challenge(), minutes: 15 },
    { name: 'free build', source: free('project-9', 'version-9'), minutes: 15 },
    { name: 'idea', source: idea('request-9'), minutes: 5 },
    { name: 'verdict', source: verdict('request-9', 'build-9'), minutes: 10 },
  ]

  it('sanity: the helper makes real fixed-unit receipts totalling the request', () => {
    expect(BUILD_STUDIO_DAILY_CREDIT_CAP_MINUTES).toBe(240)
    for (const total of [225, 230, 235, 240]) {
      const receipts = fill(total)
      expect(receipts.reduce((s, r) => s + r.minutes, 0)).toBe(total)
      expect(new Set(receipts.map((r) => JSON.stringify(r.source))).size).toBe(receipts.length)
    }
  })

  for (const u of units) {
    describe(u.name, () => {
      const c = () => candidate(u.source)

      it('is admitted when it lands on exactly 240', () => {
        expect(admitBuildStudioCredit(c(), fill(240 - u.minutes))).toMatchObject({
          admitted: true,
          minutes: u.minutes,
          totalMinutesAfter: 240,
        })
      })

      it('is rejected whole when it goes one whole unit over', () => {
        expect(rejected(c(), fill(240))).toBe('over-daily-cap')
        expect(rejected(c(), fill(240 - u.minutes + 5))).toBe('over-daily-cap')
      })

      it('gets a fresh budget on a later day', () => {
        expect(rejected(candidate(u.source, { schoolDate: DAY2 }), fill(240))).toBe('admitted')
      })

      it('is not counted against another child or room', () => {
        expect(rejected(c(), fill(240, { childId: 'child-b' }))).toBe('admitted')
        expect(rejected(c(), fill(240, { familyId: 'family-other' }))).toBe('admitted')
      })
    })
  }

  it('counts receipts of every kind toward the date', () => {
    const prior = [receipt(challenge()), receipt(free('p', 'v')), ...fill(210)]
    expect(rejected(candidate(idea()), prior)).toBe('over-daily-cap')
  })
})

describe('corrupt receipts', () => {
  const bad = (minutes: number, over: Partial<BuildStudioCreditReceipt> = {}) =>
    receipt(idea('corrupt'), { minutes, ...over })
  const malformed = [-15, -1, 0, 2.5, 0.1, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]

  it('rejects a malformed same-day amount for every credit type', () => {
    for (const minutes of malformed) {
      for (const source of [challenge(), free(), idea('request-9'), verdict('request-9', 'build-9')]) {
        expect(rejected(candidate(source), [bad(minutes)])).toBe('invalid-receipt')
      }
    }
  })

  it('does not let a negative amount reserve negative capacity past the cap', () => {
    expect(rejected(candidate(idea('request-9')), [...fill(240), bad(-100)])).toBe('invalid-receipt')
    expect(rejected(candidate(idea('request-9')), [bad(-100), ...fill(240)])).toBe('invalid-receipt')
  })

  it('ignores a malformed amount on an unrelated day for the minute total', () => {
    for (const minutes of malformed) {
      expect(rejected(candidate(idea('request-9')), [bad(minutes, { schoolDate: DAY2 })])).toBe('admitted')
    }
  })

  it('ignores a malformed receipt of another child or family', () => {
    expect(rejected(candidate(idea('request-9')), [bad(-5, { childId: 'child-b' })])).toBe('admitted')
    expect(rejected(candidate(idea('request-9')), [bad(-5, { familyId: 'family-other' })])).toBe('admitted')
  })

  it('still applies an unrelated-day receipt to exact-source duplicates', () => {
    expect(rejected(candidate(idea('corrupt')), [bad(-5, { schoolDate: DAY2 })])).toBe('duplicate-source')
  })

  it('still applies an unrelated-day free-building receipt to cadence', () => {
    const near = receipt(free('project-1', 'near'), { schoolDate: DAY2, atMs: T0 + 5 * MIN, minutes: Number.NaN })
    expect(rejected(candidate(free('project-1', 'new')), [near])).toBe('free-build-too-soon')
  })

  it('keeps normal receipts and dedup intact alongside', () => {
    expect(rejected(candidate(idea()), [receipt(verdict())])).toBe('admitted')
    expect(rejected(candidate(idea()), [receipt(idea())])).toBe('duplicate-source')
  })
})

describe('candidate instant', () => {
  it('is validated for every credit type', () => {
    for (const atMs of [Number.NaN, Infinity, -Infinity]) {
      for (const source of [challenge(), free(), idea(), verdict()]) {
        expect(rejected(candidate(source, { atMs }), [])).toBe('invalid-instant')
      }
    }
  })
})

describe('free-building spacing', () => {
  const freeAt = (offsetMin: number, over: Partial<BuildStudioCreditReceipt> = {}) =>
    receipt(free('project-1', `version-at-${offsetMin}`), { atMs: T0 + offsetMin * MIN, ...over })
  const next = (over: Partial<BuildStudioCreditCandidate> = {}) => candidate(free('project-1', 'version-new'), over)

  it('allows exactly 15 minutes and rejects anything shorter', () => {
    expect(rejected(next(), [freeAt(-15)])).toBe('admitted')
    expect(rejected(next(), [freeAt(-14.99)])).toBe('free-build-too-soon')
    expect(rejected(next(), [freeAt(-1)])).toBe('free-build-too-soon')
    expect(rejected(next(), [freeAt(0)])).toBe('free-build-too-soon')
  })

  it('applies to a neighbour after the candidate as well as before it', () => {
    expect(rejected(next(), [freeAt(14)])).toBe('free-build-too-soon')
    expect(rejected(next(), [freeAt(15)])).toBe('admitted')
  })

  it('is independent of receipt order, using both neighbours', () => {
    const before = freeAt(-20)
    const after = freeAt(10)
    expect(rejected(next(), [before, after])).toBe('free-build-too-soon')
    expect(rejected(next(), [after, before])).toBe('free-build-too-soon')
    expect(rejected(next(), [freeAt(-20), freeAt(20)])).toBe('admitted')
    expect(rejected(next(), [freeAt(20), freeAt(-20)])).toBe('admitted')
  })

  it('holds across midnight, whichever school date each receipt carries', () => {
    const lateNight = Date.UTC(2030, 2, 4, 23, 55, 0)
    const justAfter = Date.UTC(2030, 2, 5, 0, 5, 0)
    const prior = receipt(free('project-1', 'late'), { atMs: lateNight, schoolDate: DAY1 })
    expect(rejected(next({ atMs: justAfter, schoolDate: DAY2 }), [prior])).toBe('free-build-too-soon')
    expect(rejected(next({ atMs: lateNight + 15 * MIN, schoolDate: DAY2 }), [prior])).toBe('admitted')
    const early = receipt(free('project-1', 'early'), { atMs: justAfter, schoolDate: DAY2 })
    expect(rejected(next({ atMs: lateNight, schoolDate: DAY1 }), [early])).toBe('free-build-too-soon')
  })

  it('does not space free building against other kinds or other children', () => {
    expect(rejected(next(), [receipt(challenge(), { atMs: T0 }), receipt(idea(), { atMs: T0 })])).toBe('admitted')
    expect(rejected(next(), [freeAt(0, { childId: 'child-b' })])).toBe('admitted')
  })

  it('rejects an invalid instant instead of skipping the interval', () => {
    for (const atMs of [Number.NaN, Infinity, -Infinity]) {
      expect(rejected(next({ atMs }), [])).toBe('invalid-instant')
    }
    expect(rejected(next(), [freeAt(-60, { atMs: Number.NaN })])).toBe('invalid-instant')
  })

  it('ignores a non-finite instant on a non-free-building neighbour', () => {
    expect(rejected(next(), [receipt(idea(), { atMs: Number.NaN })])).toBe('admitted')
  })
})
