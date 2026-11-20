import { describe, expect, it } from 'vitest'

import {
  challengeAttemptKey,
  normalizeChallengeAttempt,
  type BuildStudioChallengeAttempt,
} from '../../core/types/buildStudio'
import {
  afterSaveLanded,
  canPredict,
  canReportOutcome,
  challengeResponseAtRisk,
  freezeAttempt,
  outcomeWaitingForSave,
  startAttempt,
  withOutcome,
  withPlayRequest,
  withPrediction,
} from './buildStudioChallengeAttempt'
import {
  BUILD_CHALLENGES,
  challengeById,
  DEFAULT_BUILD_CHALLENGE,
  describeAttemptForParent,
  nextChallenge,
} from './buildStudioChallenges'

const T1 = '2026-11-20T10:00:00.000Z'
const T2 = '2026-11-20T10:01:00.000Z'
const T3 = '2026-11-20T10:02:00.000Z'
const HERO = DEFAULT_BUILD_CHALLENGE
const SCOPE = { childId: 'c1', projectId: 'apple-dash-starter', versionId: 'v-one-1' }

describe('the authored catalog', () => {
  it('has twelve challenges in a fixed order with stable, unique ids', () => {
    expect(BUILD_CHALLENGES).toHaveLength(12)
    expect(BUILD_CHALLENGES.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(new Set(BUILD_CHALLENGES.map((c) => c.id)).size).toBe(12)
    for (const c of BUILD_CHALLENGES) {
      expect(c.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(c.id.length).toBeLessThanOrEqual(48)
      expect(Number.isInteger(c.revision) && c.revision >= 1).toBe(true)
    }
  })

  it('starts with "Make the hero faster."', () => {
    expect(DEFAULT_BUILD_CHALLENGE.id).toBe('faster-hero')
    expect(DEFAULT_BUILD_CHALLENGE.goal).toBe('Make the hero faster.')
    expect(BUILD_CHALLENGES[0]).toBe(DEFAULT_BUILD_CHALLENGE)
  })

  it('gives each one defensible subject, a location hint that is a question, and a prediction', () => {
    for (const c of BUILD_CHALLENGES) {
      expect(c.subject.trim()).not.toBe('')
      expect(c.hint.trim().endsWith('?')).toBe(true)
      expect(c.prediction.prompt.trim()).not.toBe('')
      const ids = c.prediction.options.map((o) => o.id)
      expect(ids.length).toBeGreaterThanOrEqual(2)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(c.followUp.trim()).not.toBe('')
    }
  })

  it('tags each challenge with the proposed canonical subject, in catalog order', () => {
    expect(BUILD_CHALLENGES.map((c) => c.subjectBucket)).toEqual([
      'PracticalArts', // faster-hero
      'Math', // one-more-heart
      'Math', // faster-falling-rock
      'Math', // ten-with-two-apples
      'Math', // fifty-points-in-a-round
      'Math', // fair-last-chance
      'SocialStudies', // round-for-brother
      'Science', // rocks-too-hard
      'Math', // rare-golden-apple
      'Math', // which-speed-worked-better
      'PracticalArts', // last-second-rescue
      'LanguageArts', // name-and-teach
    ])
  })

  it('does not gate the first three on a name', () => {
    for (const c of BUILD_CHALLENGES.slice(0, 3)) {
      const text = [c.goal, c.question, c.why, c.hint, c.prediction.prompt].join(' ')
      expect(text).not.toMatch(/brother|sister|Lincoln|London/i)
    }
  })

  it('swaps by id, wraps at the end, and an unknown id falls back to the default', () => {
    expect(nextChallenge('faster-hero').id).toBe('one-more-heart')
    expect(nextChallenge(BUILD_CHALLENGES[11].id).id).toBe('faster-hero')
    expect(nextChallenge('no-such-id').id).toBe(BUILD_CHALLENGES[0].id)
    expect(challengeById('no-such-id')).toBeNull()
  })
})

describe('one attempt: the guess comes before Play, and Play is not an observation', () => {
  it('allows a guess to change until the first Play request, then fixes it', () => {
    let s = startAttempt(HERO, 'a-attempt1')
    s = withPrediction(s, HERO, 'faster', T1)
    s = withPrediction(s, HERO, 'slower', T1)
    expect(s.prediction?.optionId).toBe('slower')
    s = withPlayRequest(s, T2)
    expect(canPredict(s)).toBe(false)
    expect(withPrediction(s, HERO, 'same', T3).prediction?.optionId).toBe('slower')
  })

  it('ignores an option the challenge does not offer, and a different challenge', () => {
    const s = startAttempt(HERO, 'a-attempt1')
    expect(withPrediction(s, HERO, 'not-an-option', T1).prediction).toBeNull()
    const other = challengeById('one-more-heart')!
    expect(withPrediction(s, other, 'one-more', T1).prediction).toBeNull()
  })

  it('keeps Play usable without a guess, but then asks no "did it match"', () => {
    const s = withPlayRequest(startAttempt(HERO, 'a-attempt1'), T1)
    expect(s.playRequest?.at).toBe(T1)
    expect(canReportOutcome(s)).toBe(false)
    expect(withOutcome(s, 'matched', T2).reportedOutcome).toBeNull()
  })

  it('records only the first Play request', () => {
    let s = withPlayRequest(startAttempt(HERO, 'a-attempt1'), T1)
    s = withPlayRequest(s, T3)
    expect(s.playRequest?.at).toBe(T1)
  })

  it('offers an outcome only after a guess AND a Play request', () => {
    let s = withPrediction(startAttempt(HERO, 'a-attempt1'), HERO, 'faster', T1)
    expect(canReportOutcome(s)).toBe(false)
    s = withPlayRequest(s, T2)
    expect(canReportOutcome(s)).toBe(true)
    s = withOutcome(s, 'different', T3)
    expect(s.reportedOutcome?.result).toBe('different')
  })

  it('freezes the guess so it cannot change after a Save took it', () => {
    let s = withPrediction(startAttempt(HERO, 'a-attempt1'), HERO, 'faster', T1)
    const { attempt, state } = freezeAttempt(s, SCOPE)
    expect(attempt?.prediction?.optionId).toBe('faster')
    s = state!
    expect(canPredict(s)).toBe(false)
    expect(withPrediction(s, HERO, 'slower', T2).prediction?.optionId).toBe('faster')
  })

  it('freezes nothing when nothing was recorded', () => {
    expect(freezeAttempt(startAttempt(HERO, 'a-attempt1'), SCOPE).attempt).toBeNull()
    expect(freezeAttempt(null, SCOPE).attempt).toBeNull()
  })

  it('scopes the frozen copy to the Save’s own child, project and version', () => {
    const s = withPlayRequest(withPrediction(startAttempt(HERO, 'a-attempt1'), HERO, 'same', T1), T2)
    const { attempt } = freezeAttempt(s, SCOPE)
    expect(attempt).toMatchObject({
      ...SCOPE,
      challengeId: 'faster-hero',
      challengeRevision: 1,
      subjectBucket: 'PracticalArts',
    })
    expect(normalizeChallengeAttempt(attempt)).toEqual(attempt)
  })
})

describe('a recorded response that no save holds is at risk', () => {
  const guessed = () => withPrediction(startAttempt(HERO, 'a-attempt1'), HERO, 'faster', T1)

  it('is not at risk when empty, absent or finished', () => {
    expect(challengeResponseAtRisk(null, undefined)).toBe(false)
    expect(challengeResponseAtRisk(startAttempt(HERO, 'a-attempt1'), undefined)).toBe(false)
    const played = withOutcome(withPlayRequest(guessed(), T2), 'matched', T3)
    const frozen = freezeAttempt(played, SCOPE)
    expect(challengeResponseAtRisk(afterSaveLanded(frozen.state, frozen.attempt!), undefined)).toBe(false)
  })

  it('is at risk for a guess or a Play tap before any save', () => {
    expect(challengeResponseAtRisk(guessed(), undefined)).toBe(true)
    expect(challengeResponseAtRisk(withPlayRequest(startAttempt(HERO, 'a-attempt1'), T2), undefined)).toBe(true)
  })

  it('is clean once a landed save acknowledged it, and at risk again for a newer outcome', () => {
    const played = withPlayRequest(guessed(), T2)
    const frozen = freezeAttempt(played, SCOPE)
    const landed = afterSaveLanded(frozen.state, frozen.attempt!)!
    expect(challengeResponseAtRisk(landed, undefined)).toBe(false)
    expect(challengeResponseAtRisk(withOutcome(landed, 'matched', T3), undefined)).toBe(true)
  })

  it('compares against the exact frozen payload of an unfinished save', () => {
    const played = withPlayRequest(guessed(), T2)
    const frozen = freezeAttempt(played, SCOPE)
    // The unfinished save holds exactly this response: that save is what is guarded.
    expect(challengeResponseAtRisk(frozen.state, frozen.attempt)).toBe(false)
    // A result reported after the freeze is not in the payload.
    const later = withOutcome(frozen.state!, 'different', T3)
    expect(challengeResponseAtRisk(later, frozen.attempt)).toBe(true)
    expect(frozen.attempt!.reportedOutcome).toBeUndefined()
  })
})

describe('an outcome given after a Save is never written back', () => {
  const played = () =>
    withPlayRequest(withPrediction(startAttempt(HERO, 'a-attempt1'), HERO, 'faster', T1), T2)

  it('waits for the NEXT explicit Save, which freezes it under its own version', () => {
    const first = freezeAttempt(played(), SCOPE)
    // The first Save landed with no outcome: the attempt stays open.
    let s = afterSaveLanded(first.state, first.attempt!)!
    expect(s.closed).toBe(false)
    s = withOutcome(s, 'matched', T3)
    expect(outcomeWaitingForSave(s)).toBe(true)
    // The prior frozen copy is untouched.
    expect(first.attempt!.reportedOutcome).toBeUndefined()
    const second = freezeAttempt(s, { ...SCOPE, versionId: 'v-two-2' })
    expect(second.attempt?.versionId).toBe('v-two-2')
    expect(second.attempt?.reportedOutcome?.result).toBe('matched')
    // Same attempt id on both, so they are recognisably one attempt.
    expect(second.attempt?.attemptId).toBe(first.attempt?.attemptId)
  })

  it('closes only when the landed Save recorded the outcome as it stands', () => {
    let s = withOutcome(played(), 'matched', T3)
    const frozen = freezeAttempt(s, SCOPE)
    // The child changed his answer while the write was out.
    s = withOutcome(frozen.state!, 'unsure', '2026-11-20T10:03:00.000Z')
    expect(afterSaveLanded(s, frozen.attempt!)!.closed).toBe(false)
    // Unchanged: the Save recorded it.
    expect(afterSaveLanded(frozen.state, frozen.attempt!)!.closed).toBe(true)
  })

  it('a landed Save of a different attempt closes nothing', () => {
    const s = withOutcome(played(), 'matched', T3)
    const other = { ...freezeAttempt(s, SCOPE).attempt!, attemptId: 'a-other-one' }
    expect(afterSaveLanded(s, other)!.closed).toBe(false)
  })

  it('a finished attempt carries nothing into later saves', () => {
    const s = withOutcome(played(), 'matched', T3)
    const frozen = freezeAttempt(s, SCOPE)
    const closed = afterSaveLanded(frozen.state, frozen.attempt!)!
    expect(freezeAttempt(closed, { ...SCOPE, versionId: 'v-later-3' }).attempt).toBeNull()
  })
})

describe('the stored record is validated strictly', () => {
  const good = (): BuildStudioChallengeAttempt => ({
    ...SCOPE,
    attemptId: 'a-attempt1',
    challengeId: 'faster-hero',
    challengeRevision: 1,
    subjectBucket: 'PracticalArts',
    prediction: { optionId: 'faster', at: T1 },
    playRequest: { at: T2 },
    reportedOutcome: { result: 'matched', at: T3 },
  })

  it('accepts only the five authored subjects, on read', () => {
    for (const ok of ['Math', 'Science', 'SocialStudies', 'LanguageArts', 'PracticalArts']) {
      expect(normalizeChallengeAttempt({ ...good(), subjectBucket: ok })).not.toBeNull()
    }
    for (const bad of ['Reading', 'Art', 'Other', 'math', '', 7, undefined]) {
      expect(normalizeChallengeAttempt({ ...good(), subjectBucket: bad })).toBeNull()
    }
  })

  it('accepts a complete record and a guess-only record', () => {
    expect(normalizeChallengeAttempt(good())).toEqual(good())
    const guessOnly = { ...good(), playRequest: undefined, reportedOutcome: undefined }
    delete (guessOnly as Partial<typeof guessOnly>).playRequest
    delete (guessOnly as Partial<typeof guessOnly>).reportedOutcome
    expect(normalizeChallengeAttempt(guessOnly)).not.toBeNull()
  })

  it('refuses unknown keys, bad ids and bad outcomes', () => {
    expect(normalizeChallengeAttempt({ ...good(), score: 10 })).toBeNull()
    expect(normalizeChallengeAttempt({ ...good(), childId: 'a/b' })).toBeNull()
    expect(normalizeChallengeAttempt({ ...good(), challengeId: 'Bad Id' })).toBeNull()
    expect(normalizeChallengeAttempt({ ...good(), challengeRevision: 0 })).toBeNull()
    expect(
      normalizeChallengeAttempt({ ...good(), reportedOutcome: { result: 'won', at: T3 } }),
    ).toBeNull()
    expect(normalizeChallengeAttempt({ ...good(), prediction: { optionId: 'x', at: T1, extra: 1 } })).toBeNull()
    expect(normalizeChallengeAttempt('nope')).toBeNull()
    expect(normalizeChallengeAttempt(null)).toBeNull()
  })

  it('refuses events out of order, and an outcome without a guess and a Play', () => {
    expect(
      normalizeChallengeAttempt({ ...good(), prediction: { optionId: 'faster', at: T3 } }),
    ).toBeNull()
    expect(
      normalizeChallengeAttempt({ ...good(), reportedOutcome: { result: 'matched', at: T1 } }),
    ).toBeNull()
    const noPlay = { ...good() }
    delete (noPlay as Partial<typeof noPlay>).playRequest
    expect(normalizeChallengeAttempt(noPlay)).toBeNull()
    const empty = {
      ...SCOPE,
      attemptId: 'a-attempt1',
      challengeId: 'faster-hero',
      challengeRevision: 1,
      subjectBucket: 'PracticalArts',
    }
    expect(normalizeChallengeAttempt(empty)).toBeNull()
  })

  it('gives the same attempt the same comparison key however its keys were ordered', () => {
    const reordered = JSON.parse(JSON.stringify(good(), ['reportedOutcome', 'result', 'at', 'playRequest', 'prediction', 'optionId', 'subjectBucket', 'challengeRevision', 'challengeId', 'attemptId', 'versionId', 'projectId', 'childId']))
    expect(challengeAttemptKey(reordered)).toBe(challengeAttemptKey(good()))
    expect(challengeAttemptKey(undefined)).toBe('')
    expect(challengeAttemptKey({ junk: true })).toBe('!invalid')
  })
})

describe('the parent’s line on an exact version row', () => {
  const row = (extra: Partial<Parameters<typeof describeAttemptForParent>[0]> = {}) => ({
    childId: SCOPE.childId,
    projectId: SCOPE.projectId,
    versionId: SCOPE.versionId,
    ...extra,
  })
  const attempt = (overrides: Record<string, unknown> = {}) => ({
    ...SCOPE,
    attemptId: 'a-attempt1',
    challengeId: 'faster-hero',
    challengeRevision: 1,
    subjectBucket: 'PracticalArts',
    prediction: { optionId: 'faster', at: T1 },
    playRequest: { at: T2 },
    reportedOutcome: { result: 'matched', at: T3 },
    ...overrides,
  })

  it('omits the line on older rows, even ones with the legacy goal id', () => {
    expect(describeAttemptForParent(row())).toBeNull()
    expect(describeAttemptForParent({ ...row(), goalId: 'one-more-life' } as never)).toBeNull()
  })

  it('states what was recorded — a guess, a Play press, what he said — and the follow-up', () => {
    const line = describeAttemptForParent(row({ challengeAttempt: attempt() }))!
    expect(line.summary).toContain('Make the hero faster.')
    expect(line.summary).toContain('Guess: Faster.')
    expect(line.summary).toContain('Pressed Play.')
    expect(line.summary).toContain('Said: Matched.')
    // A tap is not a claim about which source ran.
    expect(line.summary).not.toMatch(/this version (was|ran)|played this/i)
    expect(line.followUp).toBe(challengeById('faster-hero')!.followUp)
  })

  it('is honest about a Play-only and a guess-only record', () => {
    const playOnly = attempt({ prediction: undefined, reportedOutcome: undefined })
    delete (playOnly as Record<string, unknown>).prediction
    delete (playOnly as Record<string, unknown>).reportedOutcome
    expect(describeAttemptForParent(row({ challengeAttempt: playOnly }))!.summary).toContain('No guess.')
    const guessOnly = attempt()
    delete (guessOnly as Record<string, unknown>).playRequest
    delete (guessOnly as Record<string, unknown>).reportedOutcome
    expect(describeAttemptForParent(row({ challengeAttempt: guessOnly }))!.summary).toContain(
      'Had not pressed Play.',
    )
  })

  it('omits it when the record is not scoped to this exact row', () => {
    expect(describeAttemptForParent(row({ challengeAttempt: attempt({ versionId: 'v-other-9' }) }))).toBeNull()
    expect(describeAttemptForParent(row({ challengeAttempt: attempt({ childId: 'c2' }) }))).toBeNull()
    expect(describeAttemptForParent(row({ challengeAttempt: attempt({ projectId: 'other-proj' }) }))).toBeNull()
  })

  it('omits it for a malformed record or an unknown challenge, and skips the follow-up on another revision', () => {
    expect(describeAttemptForParent(row({ challengeAttempt: { junk: 1 } }))).toBeNull()
    expect(describeAttemptForParent(row({ challengeAttempt: attempt({ challengeId: 'gone-away' }) }))).toBeNull()
    const old = describeAttemptForParent(row({ challengeAttempt: attempt({ challengeRevision: 7 }) }))!
    expect(old.followUp).toBeNull()
    expect(old.summary).toContain('Made a guess.')
    // An earlier revision is not described in today's words for the task.
    expect(old.summary).toContain('earlier version of a challenge')
    expect(old.summary).not.toContain('Make the hero faster.')
    expect(old.summary).toContain('Pressed Play.')
  })
})
