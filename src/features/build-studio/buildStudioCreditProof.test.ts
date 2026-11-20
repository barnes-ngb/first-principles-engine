import { describe, expect, it } from 'vitest'

import {
  buildStudioSourceDigest,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  utf8ByteLength,
  type BuildStudioChallengeAttempt,
} from '../../core/types/buildStudio'
import {
  buildCreditProposal,
  choosePredecessor,
  creditDayId,
  creditHoursId,
  creditReceiptId,
  decideAdmission,
  isSchoolDate,
  parseCreditDay,
  proposalKey,
  proveBuildStudioCredit,
  schoolDateInZone,
  shiftSchoolDate,
  type StoredVersionDoc,
} from './buildStudioCreditProof'
import { starterSourceFiles } from './buildStudioStarter'

// Synthetic fixtures only.
const CHILD = 'child-lincoln'
const PROJECT = 'apple-dash-starter'
const T0 = Date.parse('2026-11-20T16:00:00.000Z')

const stamp = (ms: number) => ({ toMillis: () => ms })

const PXT = JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] })
const FILES = {
  'pxt.json': PXT,
  'main.ts': 'info.setLife(4)\nsprites.create(img``, SpriteKind.Player)\n',
  'main.blocks': '<xml><block type="pxt-on-start"><statement/></block></xml>',
}

function versionDoc(
  versionId: string,
  opts: {
    files?: Record<string, string>
    acceptedMs?: number | null
    createdAt?: string
    attempt?: unknown
    child?: string
    mutate?: (d: Record<string, unknown>) => void
  } = {},
): StoredVersionDoc {
  const child = opts.child ?? CHILD
  const files = opts.files ?? FILES
  const archive = serializeBuildStudioSource(files)
  const data: Record<string, unknown> = {
    id: buildStudioVersionDocId(child, PROJECT, versionId),
    childId: child,
    projectId: PROJECT,
    versionId,
    label: 'x',
    createdAt: opts.createdAt ?? '2026-11-20T15:59:00.000Z',
    sourceArchive: archive,
    byteSize: utf8ByteLength(archive),
    fileCount: Object.keys(files).length,
    sourceDigest: buildStudioSourceDigest(archive),
  }
  if (opts.acceptedMs !== null) data.acceptedAt = stamp(opts.acceptedMs ?? T0)
  if (opts.attempt !== undefined) data.challengeAttempt = opts.attempt
  opts.mutate?.(data)
  return { id: buildStudioVersionDocId(child, PROJECT, versionId), data }
}

const attempt = (versionId: string, over: Partial<BuildStudioChallengeAttempt> = {}) => ({
  childId: CHILD,
  projectId: PROJECT,
  versionId,
  attemptId: 'a-attempt1',
  challengeId: 'one-more-heart',
  challengeRevision: 1,
  subjectBucket: 'Math',
  prediction: { optionId: 'one-more', at: '2026-11-20T15:50:00.000Z' },
  ...over,
})

const prove = (version: StoredVersionDoc, baseline: Parameters<typeof proveBuildStudioCredit>[0]['baseline']) =>
  proveBuildStudioCredit({
    childId: CHILD,
    projectId: PROJECT,
    versionId: version.data?.versionId as string,
    version,
    baseline,
  })

describe('challenge proof', () => {
  it('a prediction on the exact saved version earns the AUTHORED subject; Play is optional', () => {
    const v = versionDoc('v-aaa111', { attempt: attempt('v-aaa111') })
    const r = prove(v, null)
    expect(r).toMatchObject({
      ok: true,
      proof: {
        source: {
          kind: 'challenge',
          challengeId: 'one-more-heart',
          challengeRevision: 1,
          subjectBucket: 'Math',
          projectId: PROJECT,
          versionId: 'v-aaa111',
        },
        workMs: T0,
      },
    })
  })

  it('a challenge without a verified prediction is never laundered into free building', () => {
    const playOnly = versionDoc('v-aaa111', {
      attempt: attempt('v-aaa111', { prediction: undefined, playRequest: { at: '2026-11-20T15:51:00.000Z' } }),
    })
    // Even with a baseline that WOULD make it a changed free build.
    expect(prove(playOnly, { kind: 'starter' })).toEqual({ ok: false, reason: 'challenge-unverified' })
  })

  it.each([
    ['unknown challenge', { challengeId: 'no-such-challenge' }],
    ['a revision that is not the authored one', { challengeRevision: 2 }],
    ['a subject that is not the authored one', { subjectBucket: 'Science' as const }],
    ['a prediction option the challenge does not offer', { prediction: { optionId: 'banana', at: '2026-11-20T15:50:00.000Z' } }],
  ])('%s is unverified', (_name, over) => {
    const v = versionDoc('v-aaa111', { attempt: attempt('v-aaa111', over as never) })
    expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'challenge-unverified' })
  })

  it.each([
    ['another child', { childId: 'child-other' }],
    ['another project', { projectId: 'some-other-project' }],
    ['another version', { versionId: 'v-zzz999' }],
  ])('an attempt scoped to %s is malformed', (_name, over) => {
    const v = versionDoc('v-aaa111', { attempt: attempt('v-aaa111', over as never) })
    expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'malformed-attempt' })
  })

  it('a null or junk challengeAttempt field is malformed, not "no challenge"', () => {
    for (const junk of [null, 'x', 7, {}]) {
      const v = versionDoc('v-aaa111', { attempt: junk })
      expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'malformed-attempt' })
    }
  })
})

describe('free-build proof', () => {
  it('a changed save against the prepared starter is credited as free building', () => {
    const r = prove(versionDoc('v-aaa111'), null as never)
    // No baseline supplied for a free build fails closed…
    expect(r).toEqual({ ok: false, reason: 'baseline-unreadable' })
    // …and the starter baseline proves it.
    expect(prove(versionDoc('v-aaa111'), { kind: 'starter' })).toMatchObject({
      ok: true,
      proof: { source: { kind: 'freeBuild', projectId: PROJECT, versionId: 'v-aaa111' }, predecessorDocId: null },
    })
  })

  it('the unchanged starter is not credit', () => {
    const v = versionDoc('v-aaa111', { files: { ...starterSourceFiles() } })
    expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'unchanged' })
  })

  it('editor scratch (.simstate.json) alone is not a change', () => {
    const v = versionDoc('v-aaa111', {
      files: { ...starterSourceFiles(), '.simstate.json': '{"S/#run":"1"}' },
    })
    expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'unchanged' })
  })

  it('compares with the exact predecessor, and records its identity', () => {
    const prev = versionDoc('v-bbb222', { acceptedMs: T0 - 600_000 })
    const same = versionDoc('v-aaa111')
    expect(prove(same, { kind: 'version', doc: prev })).toEqual({ ok: false, reason: 'unchanged' })

    const changed = versionDoc('v-aaa111', { files: { ...FILES, 'main.ts': FILES['main.ts'] + '// edit\n' } })
    expect(prove(changed, { kind: 'version', doc: prev })).toMatchObject({
      ok: true,
      proof: { predecessorDocId: prev.id },
    })
  })

  it('a malformed or foreign baseline cannot produce credit', () => {
    const bad = versionDoc('v-bbb222', { mutate: (d) => (d.sourceDigest = 'nope') })
    expect(prove(versionDoc('v-aaa111'), { kind: 'version', doc: bad })).toEqual({
      ok: false,
      reason: 'baseline-unreadable',
    })
    const other = versionDoc('v-bbb222', { child: 'child-other' })
    expect(prove(versionDoc('v-aaa111'), { kind: 'version', doc: other })).toEqual({
      ok: false,
      reason: 'baseline-unreadable',
    })
  })
})

describe('eligibility and integrity', () => {
  it('a version without a server acceptedAt is reference only', () => {
    const legacy = versionDoc('v-aaa111', { acceptedMs: null })
    expect(prove(legacy, { kind: 'starter' })).toEqual({ ok: false, reason: 'not-eligible' })
  })

  it('a pending server-timestamp sentinel is not a time', () => {
    const v = versionDoc('v-aaa111', { mutate: (d) => (d.acceptedAt = { sentinel: 'serverTimestamp' }) })
    expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'not-eligible' })
  })

  it('the document must be the exact deterministic one for this child', () => {
    const v = versionDoc('v-aaa111', { child: 'child-other' })
    expect(prove(v, { kind: 'starter' })).toEqual({ ok: false, reason: 'bad-scope' })
    const wrongField = versionDoc('v-aaa111', { mutate: (d) => (d.childId = 'child-other') })
    expect(prove(wrongField, { kind: 'starter' })).toEqual({ ok: false, reason: 'bad-scope' })
  })

  it('only the Apple Dash project is creditable', () => {
    const r = proveBuildStudioCredit({
      childId: CHILD,
      projectId: 'other-project',
      versionId: 'v-aaa111',
      version: versionDoc('v-aaa111'),
      baseline: { kind: 'starter' },
    })
    expect(r).toEqual({ ok: false, reason: 'bad-scope' })
  })

  it.each([
    ['a digest that does not match', (d: Record<string, unknown>) => (d.sourceDigest = 'x')],
    ['a wrong byte size', (d: Record<string, unknown>) => (d.byteSize = 1)],
    ['a wrong file count', (d: Record<string, unknown>) => (d.fileCount = 99)],
    ['an archive that is not JSON', (d: Record<string, unknown>) => (d.sourceArchive = 'nope')],
    [
      'a non-canonical archive',
      (d: Record<string, unknown>) => {
        const compact = JSON.stringify(JSON.parse(d.sourceArchive as string))
        d.sourceArchive = compact
        d.byteSize = utf8ByteLength(compact)
        d.sourceDigest = buildStudioSourceDigest(compact)
      },
    ],
    ['a missing archive', (d: Record<string, unknown>) => delete d.sourceArchive],
  ])('%s is a malformed source', (_name, mutate) => {
    expect(prove(versionDoc('v-aaa111', { mutate }), { kind: 'starter' })).toEqual({
      ok: false,
      reason: 'malformed-source',
    })
  })
})

describe('choosing the predecessor', () => {
  const src = versionDoc('v-aaa111', { acceptedMs: T0 })
  const at = (id: string, ms: number) => versionDoc(id, { acceptedMs: ms })

  it('is the immediately preceding durable version, never a later one', () => {
    const r = choosePredecessor(src, CHILD, PROJECT, [
      at('v-old111', T0 - 3_000_000),
      at('v-mid222', T0 - 1_000),
      at('v-new333', T0 + 5_000),
    ])
    expect(r).toEqual({ ok: true, docId: buildStudioVersionDocId(CHILD, PROJECT, 'v-mid222') })
  })

  it('is none (the starter) when nothing precedes', () => {
    expect(choosePredecessor(src, CHILD, PROJECT, [at('v-new333', T0 + 1)])).toEqual({ ok: true, docId: null })
  })

  it('orders a legacy row by its own createdAt, and a legacy row never needs acceptedAt', () => {
    const legacy = versionDoc('v-leg444', { acceptedMs: null, createdAt: '2026-11-20T15:00:00.000Z' })
    expect(choosePredecessor(src, CHILD, PROJECT, [legacy])).toEqual({ ok: true, docId: legacy.id })
  })

  it('breaks a tie by stable identity', () => {
    const a = at('v-tie111', T0)
    const b = at('v-tie222', T0)
    const s = at('v-tie333', T0)
    // Doc ids sort v-tie111 < v-tie222 < v-tie333, so the source follows both; b is nearest.
    expect(choosePredecessor(s, CHILD, PROJECT, [a, b])).toEqual({ ok: true, docId: b.id })
    expect(choosePredecessor(a, CHILD, PROJECT, [b, s])).toEqual({ ok: true, docId: null })
  })

  it("never reads another child's or project's row", () => {
    const foreign = versionDoc('v-for555', { acceptedMs: T0 - 10, child: 'child-other' })
    const otherProject = versionDoc('v-oth666', { acceptedMs: T0 - 10, mutate: (d) => (d.projectId = 'zzz-project') })
    expect(choosePredecessor(src, CHILD, PROJECT, [foreign, otherProject])).toEqual({ ok: true, docId: null })
  })

  it('fails closed on a sibling it cannot order', () => {
    const pending = versionDoc('v-pen777', { mutate: (d) => (d.acceptedAt = { sentinel: true }) })
    expect(choosePredecessor(src, CHILD, PROJECT, [pending])).toEqual({ ok: false, reason: 'unordered' })
    const noTime = versionDoc('v-not888', { acceptedMs: null, mutate: (d) => delete d.createdAt })
    expect(choosePredecessor(src, CHILD, PROJECT, [noTime])).toEqual({ ok: false, reason: 'unordered' })
  })
})

describe('school dates', () => {
  it('reads the instant in the NAMED zone, never the runtime locale', () => {
    const justBeforeMidnightCentral = Date.parse('2026-11-21T05:30:00.000Z') // 23:30 CST
    expect(schoolDateInZone(justBeforeMidnightCentral, 'America/Chicago')).toBe('2026-11-20')
    expect(schoolDateInZone(justBeforeMidnightCentral + 3_600_000, 'America/Chicago')).toBe('2026-11-21')
    expect(schoolDateInZone(justBeforeMidnightCentral, 'Asia/Tokyo')).toBe('2026-11-21')
  })

  it('is null for an unreadable zone or instant', () => {
    expect(schoolDateInZone(T0, 'Not/AZone')).toBeNull()
    expect(schoolDateInZone(Number.NaN, 'America/Chicago')).toBeNull()
  })

  it('validates real dates and shifts across month and year ends', () => {
    expect(isSchoolDate('2026-02-31')).toBe(false)
    expect(isSchoolDate('2026-2-1')).toBe(false)
    expect(shiftSchoolDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftSchoolDate('2026-03-01', -2)).toBe('2026-02-27')
  })

  it('builds unambiguous ids', () => {
    expect(creditReceiptId('a', 'b', 'c')).toBe('a.b.c')
    expect(creditDayId('a', '2026-11-20')).toBe('a.2026-11-20')
    expect(creditHoursId('a', 'b', 'c')).toBe('bsc.a.b.c')
  })
})

describe('the proposal key', () => {
  const proof = (prove(versionDoc('v-aaa111'), { kind: 'starter' }) as { ok: true; proof: never }).proof
  const make = (timeZone: string) =>
    buildCreditProposal({ familyId: 'fam-1', childId: CHILD, timeZone, versionDocId: 'x', proof })!

  it('changes with the zone, so a zone change forces a new preview', () => {
    expect(proposalKey(make('America/Chicago'))).toBe(proposalKey(make('America/Chicago')))
    expect(proposalKey(make('America/Chicago'))).not.toBe(proposalKey(make('Pacific/Auckland')))
  })
})

describe('day buckets fail closed', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    receiptId: 'r',
    atMs: T0,
    minutes: 15,
    source: { kind: 'freeBuild', projectId: PROJECT, versionId: 'v-x1234' },
    ...over,
  })
  const day = (entries: unknown[], over: Record<string, unknown> = {}) => ({
    childId: CHILD,
    schoolDate: '2026-11-20',
    entries,
    ...over,
  })

  it('a missing bucket is empty', () => {
    expect(parseCreditDay(false, undefined, CHILD, '2026-11-20')).toEqual({ entries: [] })
  })

  it.each([
    ['another child', day([], { childId: 'child-other' })],
    ['another date', day([], { schoolDate: '2026-11-21' })],
    ['entries that are not an array', day([], { entries: 'x' })],
    ['a negative amount', day([entry({ minutes: -15 })])],
    ['a zero amount', day([entry({ minutes: 0 })])],
    ['a fractional amount', day([entry({ minutes: 7.5 })])],
    ['an unknown source', day([entry({ source: { kind: 'mystery' } })])],
    ['a non-finite instant', day([entry({ atMs: Number.NaN })])],
    ['too many entries', day(Array.from({ length: 49 }, () => entry()))],
  ])('%s is malformed', (_name, data) => {
    expect(parseCreditDay(true, data, CHILD, '2026-11-20')).toBeNull()
  })

  it('a malformed NEIGHBOUR bucket fails the whole decision (its instants feed spacing)', () => {
    const proposal = buildCreditProposal({
      familyId: 'fam-1',
      childId: CHILD,
      timeZone: 'America/Chicago',
      versionDocId: 'x',
      proof: (prove(versionDoc('v-aaa111'), { kind: 'starter' }) as { ok: true; proof: never }).proof,
    })!
    const buckets = new Map<string, { exists: boolean; data: unknown }>()
    for (let i = -2; i <= 2; i += 1) buckets.set(shiftSchoolDate(proposal.schoolDate, i), { exists: false, data: undefined })
    expect(decideAdmission(proposal, buckets)).toMatchObject({ ok: true, decision: { admitted: true } })

    const prev = shiftSchoolDate(proposal.schoolDate, -1)
    buckets.set(prev, { exists: true, data: { childId: CHILD, schoolDate: prev, entries: [entry({ minutes: -1 })] } })
    expect(decideAdmission(proposal, buckets)).toEqual({ ok: false, reason: 'malformed-budget' })

    buckets.delete(prev) // an unread bucket is also not trusted
    expect(decideAdmission(proposal, buckets)).toEqual({ ok: false, reason: 'malformed-budget' })
  })
})
