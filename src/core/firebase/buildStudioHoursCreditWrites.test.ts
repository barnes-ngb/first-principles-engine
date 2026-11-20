import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Build Studio hours-credit writer (LOCAL-VISION-007 slice 3, stage 1), over
 * an in-memory Firestore. Synthetic data only.
 *
 * The `./firestore` mock exports EXACTLY the helpers this writer may use, so a
 * write to any other collection (xp, mastery, days, …) fails at that line.
 * The transaction stand-in runs transactions one at a time (what Firestore's
 * retry converges to), refuses a `get` after a write, and applies the buffered
 * writes only on a successful commit.
 */

type Row = Record<string, unknown>
const store = new Map<string, Row>()
let commitMode: 'ok' | 'lostResponse' | 'fail' = 'ok'
let failReadsFor: string | null = null
let pendingWriteIds = new Set<string>()
let queue: Promise<unknown> = Promise.resolve()
let historyPages = 0
const writtenPaths: string[] = []

interface Ref {
  __path: string
  id: string
}
const colRef = (path: string) => ({ __path: path })

vi.mock('./firestore', () => ({
  db: { __db: true },
  familyRootDoc: (familyId: string) => ({ __path: `families/${familyId}`, id: familyId }),
  buildStudioVersionsCollection: (f: string) => colRef(`families/${f}/buildStudioVersions`),
  buildStudioCreditReceiptsCollection: (f: string) => colRef(`families/${f}/buildStudioCreditReceipts`),
  buildStudioCreditDaysCollection: (f: string) => colRef(`families/${f}/buildStudioCreditDays`),
  hoursCollection: (f: string) => colRef(`families/${f}/hours`),
}))

const snapOf = (ref: Ref) => {
  const data = store.get(ref.__path)
  return {
    id: ref.id,
    exists: () => data !== undefined,
    data: () => (data ? { ...data } : undefined),
    metadata: { hasPendingWrites: pendingWriteIds.has(ref.__path), fromCache: false },
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (col: { __path: string }, id: string) => ({ __path: `${col.__path}/${id}`, id }),
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  documentId: () => '__name__',
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ orderBy: field }),
  startAfter: (snap: { id: string }) => ({ after: snap.id }),
  limit: (n: number) => ({ limit: n }),
  query: (col: { __path: string }, ...constraints: unknown[]) => ({ col, constraints }),
  // `getDoc` is deliberately NOT mocked: every read here must be server-only.
  getDocFromServer: async (ref: Ref) => {
    if (failReadsFor && ref.__path.includes(failReadsFor)) throw new Error('offline')
    return snapOf(ref)
  },
  getDocsFromServer: async (q: {
    col: { __path: string }
    constraints: Array<{ field?: string; op?: string; value?: unknown; limit?: number; after?: string }>
  }) => {
    if (failReadsFor && q.col.__path.includes(failReadsFor)) throw new Error('offline')
    historyPages += 1
    const base = `${q.col.__path}/`
    let docs = [...store.entries()]
      .filter(([path]) => path.startsWith(base))
      .map(([path, row]) => ({ path, id: path.slice(base.length), row }))
    for (const c of q.constraints) {
      if (c.field === '__name__') {
        docs = docs.filter((d) => (c.op === '>=' ? d.id >= (c.value as string) : d.id < (c.value as string)))
      } else if (c.field) {
        docs = docs.filter((d) => d.row[c.field as string] === c.value)
      }
    }
    docs.sort((a, b) => (a.id < b.id ? -1 : 1))
    const after = q.constraints.find((c) => c.after !== undefined)?.after
    if (after !== undefined) docs = docs.filter((d) => d.id > after)
    const cap = q.constraints.find((c) => c.limit !== undefined)?.limit ?? Infinity
    const out = docs.slice(0, cap).map((d) => ({
      id: d.id,
      data: () => ({ ...d.row }),
      metadata: { hasPendingWrites: pendingWriteIds.has(d.path), fromCache: false },
    }))
    return { docs: out, size: out.length }
  },
  runTransaction: (
    _db: unknown,
    body: (tx: {
      get: (ref: Ref) => Promise<ReturnType<typeof snapOf>>
      set: (ref: Ref, data: Row) => void
      update: (ref: Ref, data: Row) => void
      delete: (ref: Ref) => void
    }) => Promise<unknown>,
  ) => {
    const run = async () => {
      const writes: Array<() => void> = []
      let wrote = false
      const result = await body({
        get: async (ref) => {
          if (wrote) throw new Error('Firestore transactions require all reads before writes')
          return snapOf(ref)
        },
        set: (ref, data) => {
          wrote = true
          writes.push(() => {
            store.set(ref.__path, { ...data })
            writtenPaths.push(ref.__path)
          })
        },
        update: (ref, data) => {
          wrote = true
          writes.push(() => {
            store.set(ref.__path, { ...(store.get(ref.__path) ?? {}), ...data })
            writtenPaths.push(ref.__path)
          })
        },
        delete: (ref) => {
          wrote = true
          writes.push(() => {
            store.delete(ref.__path)
            writtenPaths.push(ref.__path)
          })
        },
      })
      if (commitMode === 'fail') throw new Error('commit rejected')
      for (const w of writes) w()
      if (commitMode === 'lostResponse' && writes.length > 0) throw new Error('response lost')
      return result
    }
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  },
}))

import {
  buildStudioSourceDigest,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  utf8ByteLength,
} from '../types/buildStudio'
import { starterSourceFiles } from '../../features/build-studio/buildStudioStarter'
import {
  confirmBuildStudioCredit,
  correctBuildStudioCreditHours,
  previewBuildStudioCredit,
  readBuildStudioCreditedVersion,
  type CreditScope,
} from './buildStudioHoursCreditWrites'

const FAMILY = 'fam-1'
const CHILD = 'child-lincoln'
const PROJECT = 'apple-dash-starter'
const T0 = Date.parse('2026-11-20T16:00:00.000Z') // 10:00 CST, 2026-11-20
const stamp = (ms: number) => ({ toMillis: () => ms })

const PXT = JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] })
const filesWith = (n: number) => ({
  'pxt.json': PXT,
  'main.ts': `info.setLife(${n})\nsprites.create(img\`\`, SpriteKind.Player)\n`,
  'main.blocks': '<xml><block type="pxt-on-start"><statement/></block></xml>',
})

const vPath = (versionId: string, child = CHILD) =>
  `families/${FAMILY}/buildStudioVersions/${buildStudioVersionDocId(child, PROJECT, versionId)}`

function putVersion(
  versionId: string,
  opts: {
    files?: Record<string, string>
    acceptedMs?: number | null
    attempt?: unknown
    child?: string
    createdAt?: string
  } = {},
) {
  const child = opts.child ?? CHILD
  const files = opts.files ?? filesWith(4)
  const archive = serializeBuildStudioSource(files)
  const row: Row = {
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
  if (opts.acceptedMs !== null) row.acceptedAt = stamp(opts.acceptedMs ?? T0)
  if (opts.attempt !== undefined) row.challengeAttempt = opts.attempt
  store.set(vPath(versionId, child), row)
}

const attempt = (versionId: string, challengeId = 'one-more-heart', optionId = 'one-more') => ({
  childId: CHILD,
  projectId: PROJECT,
  versionId,
  attemptId: 'a-attempt1',
  challengeId,
  challengeRevision: 1,
  subjectBucket: challengeId === 'one-more-heart' ? 'Math' : 'PracticalArts',
  prediction: { optionId, at: '2026-11-20T15:50:00.000Z' },
})

const scope = (versionId: string): CreditScope => ({
  familyId: FAMILY,
  childId: CHILD,
  projectId: PROJECT,
  versionId,
})

async function ready(versionId: string) {
  const preview = await previewBuildStudioCredit(scope(versionId))
  if (preview.status !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(preview)}`)
  return preview.proposal
}

const hoursRows = () => [...store.keys()].filter((k) => k.startsWith(`families/${FAMILY}/hours/`))
const hoursPath = (versionId: string) => `families/${FAMILY}/hours/bsc.${CHILD}.${PROJECT}.${versionId}`
const dayPath = (date: string) => `families/${FAMILY}/buildStudioCreditDays/${CHILD}.${date}`

function putDay(date: string, entries: Array<{ minutes: number; atMs: number; source: Row }>) {
  store.set(dayPath(date), {
    schema: 1,
    childId: CHILD,
    schoolDate: date,
    // A challenge / free-build entry's receipt id is the DETERMINISTIC id of its
    // source (the writer's parser rejects any other); other sources are free-form.
    entries: entries.map((e, i) => ({
      receiptId:
        e.source.kind === 'freeBuild' || e.source.kind === 'challenge'
          ? `${CHILD}.${e.source.projectId}.${e.source.versionId}`
          : `seed-${i}`,
      ...e,
    })),
  })
}

beforeEach(() => {
  store.clear()
  writtenPaths.length = 0
  commitMode = 'ok'
  failReadsFor = null
  pendingWriteIds = new Set()
  queue = Promise.resolve()
  historyPages = 0
})

describe('preview', () => {
  it('proposes a changed free build against the prepared starter, in the family zone', async () => {
    putVersion('v-aaa111')
    const p = await ready('v-aaa111')
    expect(p).toMatchObject({
      childId: CHILD,
      schoolDate: '2026-11-20',
      timeZone: 'America/Chicago',
      minutes: 15,
      subjectBucket: 'PracticalArts',
      source: { kind: 'freeBuild', versionId: 'v-aaa111' },
      predecessorDocId: null,
      workMs: T0,
    })
    expect(writtenPaths).toEqual([]) // read-only
  })

  it('proposes a challenge credit under its authored subject', async () => {
    putVersion('v-aaa111', { attempt: attempt('v-aaa111') })
    const p = await ready('v-aaa111')
    expect(p).toMatchObject({ minutes: 15, subjectBucket: 'Math', source: { kind: 'challenge', challengeId: 'one-more-heart' } })
  })

  it("uses the family root's timeZone, and falls back to Central for one it cannot read", async () => {
    putVersion('v-aaa111')
    store.set(`families/${FAMILY}`, { timeZone: 'Pacific/Auckland' })
    expect(await ready('v-aaa111')).toMatchObject({ timeZone: 'Pacific/Auckland', schoolDate: '2026-11-21' })
    store.set(`families/${FAMILY}`, { timeZone: 'Not/AZone' })
    expect(await ready('v-aaa111')).toMatchObject({ timeZone: 'America/Chicago', schoolDate: '2026-11-20' })
  })

  it('refuses a version with no server acceptance time, or with a pending local write', async () => {
    putVersion('v-aaa111', { acceptedMs: null })
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toEqual({ status: 'unproven', reason: 'not-eligible' })
    putVersion('v-bbb222')
    pendingWriteIds.add(vPath('v-bbb222'))
    expect(await previewBuildStudioCredit(scope('v-bbb222'))).toEqual({ status: 'unproven', reason: 'pending-write' })
  })

  it('reports unavailable, invalid and failed reads distinctly', async () => {
    expect(await previewBuildStudioCredit(scope('v-nope111'))).toEqual({ status: 'unavailable' })
    expect(await previewBuildStudioCredit({ ...scope('v-aaa111'), childId: 'a/b' })).toEqual({ status: 'invalid' })
    putVersion('v-aaa111')
    failReadsFor = 'buildStudioVersions'
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toEqual({ status: 'failed', reason: 'read-failed' })
  })

  it('compares with the immediately PRECEDING version; later versions and other children are irrelevant', async () => {
    putVersion('v-aaa111', { acceptedMs: T0 - 600_000, files: filesWith(4) })
    putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(5) }) // the source
    putVersion('v-ccc333', { acceptedMs: T0 + 600_000, files: filesWith(6) }) // later
    // Another child's row, just before, byte-identical to the source: must never be a baseline.
    putVersion('v-ddd444', { acceptedMs: T0 - 1, files: filesWith(5), child: 'child-other' })
    const p = await ready('v-bbb222')
    expect(p.predecessorDocId).toBe(buildStudioVersionDocId(CHILD, PROJECT, 'v-aaa111'))
  })

  it('an unchanged save is not credit, even when a later version differs', async () => {
    putVersion('v-aaa111', { acceptedMs: T0 - 600_000, files: filesWith(4) })
    putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(4) })
    putVersion('v-ccc333', { acceptedMs: T0 + 600_000, files: filesWith(9) })
    expect(await previewBuildStudioCredit(scope('v-bbb222'))).toEqual({ status: 'unproven', reason: 'unchanged' })
  })

  it('the unchanged starter is not credit', async () => {
    putVersion('v-aaa111', { files: { ...starterSourceFiles() } })
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toEqual({ status: 'unproven', reason: 'unchanged' })
  })

  it('a challenge attempt without a prediction is not credited as free building', async () => {
    putVersion('v-aaa111', {
      attempt: { ...attempt('v-aaa111'), prediction: undefined, playRequest: { at: '2026-11-20T15:51:00.000Z' } },
    })
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toEqual({ status: 'unproven', reason: 'challenge-unverified' })
  })
})

describe('confirm', () => {
  it('writes exactly one receipt, one day bucket and one attributed hours row', async () => {
    putVersion('v-aaa111', { attempt: attempt('v-aaa111') })
    const result = await confirmBuildStudioCredit(await ready('v-aaa111'))
    expect(result.status).toBe('credited')

    expect([...writtenPaths].sort()).toEqual(
      [
        `families/${FAMILY}/buildStudioCreditReceipts/${CHILD}.${PROJECT}.v-aaa111`,
        dayPath('2026-11-20'),
        hoursPath('v-aaa111'),
      ].sort(),
    )
    expect(store.get(hoursPath('v-aaa111'))).toEqual({
      childId: CHILD,
      date: '2026-11-20',
      minutes: 15,
      blockType: 'Project',
      subjectBucket: 'Math',
      source: 'build-studio-credit',
      notes: expect.stringContaining('Build Studio challenge'),
      buildStudioCredit: {
        schema: 1,
        receiptId: `${CHILD}.${PROJECT}.v-aaa111`,
        kind: 'challenge',
        projectId: PROJECT,
        versionId: 'v-aaa111',
        versionDocId: buildStudioVersionDocId(CHILD, PROJECT, 'v-aaa111'),
        challengeId: 'one-more-heart',
        challengeRevision: 1,
        admittedMinutes: 15,
        workAtMs: T0,
        timeZone: 'America/Chicago',
      },
    })
    // The child's version document is never touched by a credit.
    expect(writtenPaths.some((p) => p.includes('buildStudioVersions'))).toBe(false)
  })

  it('a free-build row carries no challenge fields', async () => {
    putVersion('v-aaa111')
    await confirmBuildStudioCredit(await ready('v-aaa111'))
    const prov = store.get(hoursPath('v-aaa111'))?.buildStudioCredit as Row
    expect(prov.kind).toBe('freeBuild')
    expect('challengeId' in prov).toBe(false)
  })

  it('a retry, and a concurrent confirm, return the first receipt with no duplicate', async () => {
    putVersion('v-aaa111')
    const proposal = await ready('v-aaa111')
    const [a, b] = await Promise.all([confirmBuildStudioCredit(proposal), confirmBuildStudioCredit(proposal)])
    expect([a.status, b.status].sort()).toEqual(['alreadySettled', 'credited'])
    expect(hoursRows()).toHaveLength(1)
    const again = await confirmBuildStudioCredit(proposal)
    expect(again.status).toBe('alreadySettled')
    expect(hoursRows()).toHaveLength(1)
    expect((store.get(dayPath('2026-11-20'))?.entries as unknown[]).length).toBe(1)
  })

  it('a response lost after a committed write is safe to confirm again', async () => {
    putVersion('v-aaa111')
    const proposal = await ready('v-aaa111')
    commitMode = 'lostResponse'
    expect(await confirmBuildStudioCredit(proposal)).toEqual({ status: 'failed', retryable: true, reason: 'write-failed' })
    commitMode = 'ok'
    const retry = await confirmBuildStudioCredit(proposal)
    expect(retry.status).toBe('alreadySettled')
    expect(hoursRows()).toHaveLength(1)
  })

  it('a rejected commit leaves nothing behind', async () => {
    putVersion('v-aaa111')
    const proposal = await ready('v-aaa111')
    commitMode = 'fail'
    expect((await confirmBuildStudioCredit(proposal)).status).toBe('failed')
    expect(hoursRows()).toHaveLength(0)
    expect([...store.keys()].some((k) => k.includes('Receipts') || k.includes('CreditDays'))).toBe(false)
  })

  it('a zone change between preview and confirm needs a new preview and writes nothing', async () => {
    putVersion('v-aaa111')
    const proposal = await ready('v-aaa111')
    store.set(`families/${FAMILY}`, { timeZone: 'Pacific/Auckland' })
    expect(await confirmBuildStudioCredit(proposal)).toEqual({ status: 'stale', reason: 'timezone-changed' })
    expect(writtenPaths).toEqual([])
    // A fresh preview resolves the new date.
    expect(await ready('v-aaa111')).toMatchObject({ timeZone: 'Pacific/Auckland', schoolDate: '2026-11-21' })
  })

  it('a committed retry returns the ORIGINAL receipt even after the zone changed', async () => {
    putVersion('v-aaa111')
    const proposal = await ready('v-aaa111')
    const first = await confirmBuildStudioCredit(proposal)
    store.set(`families/${FAMILY}`, { timeZone: 'Pacific/Auckland' })
    const retry = await confirmBuildStudioCredit(proposal)
    expect(retry).toEqual({ status: 'alreadySettled', receipt: (first as { receipt: unknown }).receipt })
    expect((retry as { receipt: { timeZone: string; schoolDate: string } }).receipt).toMatchObject({
      timeZone: 'America/Chicago',
      schoolDate: '2026-11-20',
    })
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toMatchObject({ status: 'alreadySettled' })
    expect(hoursRows()).toHaveLength(1)
  })

  it('a doctored proposal never writes: minutes, subject, date or predecessor that disagree are stale', async () => {
    putVersion('v-aaa111')
    const p = await ready('v-aaa111')
    for (const doctored of [
      { ...p, minutes: 240 },
      { ...p, schoolDate: '2026-11-19' },
      { ...p, subjectBucket: 'Math' as const },
      { ...p, workMs: p.workMs + 1 },
      { ...p, sourceDigest: 'x' },
    ]) {
      expect(await confirmBuildStudioCredit(doctored as never)).toEqual({ status: 'stale', reason: 'source-changed' })
    }
    expect(await confirmBuildStudioCredit({ ...p, predecessorDocId: 'child-lincoln__apple-dash-starter__v-zzz999' })).toEqual({
      status: 'stale',
      reason: 'source-changed',
    })
    expect(await confirmBuildStudioCredit({ ...p, childId: 'a/b' })).toEqual({ status: 'invalid' })
    expect(await confirmBuildStudioCredit({ ...p, predecessorDocId: 'other-child__x__y' })).toEqual({ status: 'invalid' })
    expect(writtenPaths).toEqual([])
  })

  describe('fresh predecessor before confirmation', () => {
    const idOf = (v: string) => buildStudioVersionDocId(CHILD, PROJECT, v)

    it('a legacy predecessor materialising after the preview makes the proposal stale, writing nothing', async () => {
      putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(5) })
      const proposal = await ready('v-bbb222')
      expect(proposal.predecessorDocId).toBeNull()
      // A legacy row (no acceptedAt, client createdAt before the source) syncs late.
      putVersion('v-late111', { acceptedMs: null, createdAt: '2026-11-20T15:30:00.000Z', files: filesWith(5) })
      expect(await confirmBuildStudioCredit(proposal)).toEqual({ status: 'stale', reason: 'source-changed' })
      expect(writtenPaths).toEqual([])
      // A fresh preview now compares against the legacy row (identical source → unchanged).
      expect(await previewBuildStudioCredit(scope('v-bbb222'))).toEqual({ status: 'unproven', reason: 'unchanged' })
    })

    it('a caller passing an earlier predecessor than the immediate one is stale', async () => {
      putVersion('v-aaa111', { acceptedMs: T0 - 1_200_000, files: filesWith(3) })
      putVersion('v-mid2222', { acceptedMs: T0 - 600_000, files: filesWith(4) })
      putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(5) })
      const proposal = await ready('v-bbb222')
      expect(proposal.predecessorDocId).toBe(idOf('v-mid2222'))
      const earlier = { ...proposal, predecessorDocId: idOf('v-aaa111') }
      expect(await confirmBuildStudioCredit(earlier)).toEqual({ status: 'stale', reason: 'source-changed' })
      expect(writtenPaths).toEqual([])
      expect((await confirmBuildStudioCredit(proposal)).status).toBe('credited')
    })

    it('a version saved after the source never becomes its predecessor', async () => {
      putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(5) })
      const proposal = await ready('v-bbb222')
      putVersion('v-new3333', { acceptedMs: T0 + 600_000, files: filesWith(5) })
      expect((await confirmBuildStudioCredit(proposal)).status).toBe('credited')
    })

    it('a committed receipt wins over changed history, even after the visible row was removed', async () => {
      putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(5) })
      const proposal = await ready('v-bbb222')
      const first = await confirmBuildStudioCredit(proposal)
      store.delete(hoursPath('v-bbb222'))
      putVersion('v-late111', { acceptedMs: null, createdAt: '2026-11-20T15:30:00.000Z', files: filesWith(5) })
      store.set(`families/${FAMILY}`, { timeZone: 'Pacific/Auckland' })
      expect(await confirmBuildStudioCredit(proposal)).toEqual({
        status: 'alreadySettled',
        receipt: (first as { receipt: unknown }).receipt,
      })
      expect(hoursRows()).toHaveLength(0)
    })

    it('refuses a pending-write source or history row, and a failed history read does not write', async () => {
      putVersion('v-aaa111', { acceptedMs: T0 - 600_000, files: filesWith(4) })
      putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(5) })
      const proposal = await ready('v-bbb222')
      pendingWriteIds.add(vPath('v-aaa111'))
      expect(await confirmBuildStudioCredit(proposal)).toEqual({ status: 'unproven', reason: 'pending-write' })
      expect(await previewBuildStudioCredit(scope('v-bbb222'))).toEqual({ status: 'unproven', reason: 'pending-write' })
      pendingWriteIds.clear()
      failReadsFor = 'buildStudioVersions'
      expect(await confirmBuildStudioCredit(proposal)).toMatchObject({ status: 'failed', retryable: true })
      expect(writtenPaths).toEqual([])
    })

    it('has no lifetime cap: an established family with hundreds of saves still proves', async () => {
      for (let i = 0; i < 520; i += 1) {
        putVersion(`v-h${String(i).padStart(4, '0')}`, { acceptedMs: T0 - (600 - i) * 60_000, files: filesWith(i % 7) })
      }
      putVersion('v-bbb222', { acceptedMs: T0, files: filesWith(9) })
      const proposal = await ready('v-bbb222')
      expect(proposal.predecessorDocId).toBe(idOf('v-h0519'))
      expect(historyPages).toBeGreaterThan(10) // paged, not capped
      expect((await confirmBuildStudioCredit(proposal)).status).toBe('credited')
    })
  })

  it("never credits another child's version", async () => {
    putVersion('v-aaa111', { child: 'child-other' })
    const r = await confirmBuildStudioCredit({
      ...(await (async () => {
        putVersion('v-bbb222')
        return ready('v-bbb222')
      })()),
      versionId: 'v-aaa111',
      versionDocId: buildStudioVersionDocId(CHILD, PROJECT, 'v-aaa111'),
    })
    expect(r.status).toBe('unavailable')
    expect(writtenPaths).toEqual([])
  })
})

describe('the daily cap and spacing', () => {
  const idea = (n: number) => ({ kind: 'blockMuncherIdea', requestId: `req-${n}` })
  // The fixed credit for a verdict is 10 minutes (an idea is 5): a bucket entry's
  // minutes must equal its source's fixed value, so a 10-minute entry is a verdict.
  const verdict = (n: number) => ({ kind: 'blockMuncherVerdict', requestId: `req-${n}`, playedBuildId: `play-${n}` })

  it('the four-hour cap holds when two devices race for the last unit', async () => {
    // 225 committed minutes (45 × 5): exactly one 15-minute unit left.
    putDay('2026-11-20', Array.from({ length: 45 }, (_, i) => ({ minutes: 5, atMs: T0 - 86_400_000 * 0 - (i + 1) * 3_600_000, source: idea(i) })))
    putVersion('v-aaa111', { attempt: attempt('v-aaa111', 'one-more-heart') })
    putVersion('v-bbb222', { attempt: { ...attempt('v-bbb222', 'faster-hero', 'faster'), versionId: 'v-bbb222' }, acceptedMs: T0 + 60_000 })
    const [pa, pb] = [await ready('v-aaa111'), await ready('v-bbb222')]
    const results = await Promise.all([confirmBuildStudioCredit(pa), confirmBuildStudioCredit(pb)])
    expect(results.map((r) => r.status).sort()).toEqual(['credited', 'declined'])
    expect(results.find((r) => r.status === 'declined')).toEqual({ status: 'declined', reason: 'over-daily-cap' })
    expect(hoursRows()).toHaveLength(1)
    const entries = store.get(dayPath('2026-11-20'))?.entries as Array<{ minutes: number }>
    expect(entries.reduce((s, e) => s + e.minutes, 0)).toBe(240)
  })

  it('a unit that does not fully fit is declined, with nothing written', async () => {
    // 24 × 10 = the full 240; a further 15-minute unit cannot fit.
    putDay('2026-11-20', Array.from({ length: 24 }, (_, i) => ({ minutes: 10, atMs: T0 - (i + 1) * 3_600_000, source: verdict(i) })))
    putVersion('v-aaa111')
    const preview = await previewBuildStudioCredit(scope('v-aaa111'))
    expect(preview).toMatchObject({ status: 'declined', reason: 'over-daily-cap' })
    const proposal = (preview as { proposal: Parameters<typeof confirmBuildStudioCredit>[0] }).proposal
    expect(await confirmBuildStudioCredit(proposal)).toEqual({ status: 'declined', reason: 'over-daily-cap' })
    expect(hoursRows()).toHaveLength(0)
  })

  it('free builds must be 15 elapsed minutes apart across midnight, whichever bucket holds the neighbour', async () => {
    // 23:55 CST on the 20th = 05:55Z on the 21st. The new save is 00:05 CST on the 21st.
    const newMs = Date.parse('2026-11-21T06:05:00.000Z')
    putVersion('v-aaa111', { acceptedMs: newMs })
    putDay('2026-11-20', [
      { minutes: 15, atMs: Date.parse('2026-11-21T05:55:00.000Z'), source: { kind: 'freeBuild', projectId: PROJECT, versionId: 'v-old1234' } },
    ])
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toMatchObject({ status: 'declined', reason: 'free-build-too-soon' })

    // The same neighbour filed under a DIFFERENT date label (another zone's date) still counts.
    store.delete(dayPath('2026-11-20'))
    putDay('2026-11-22', [
      { minutes: 15, atMs: Date.parse('2026-11-21T05:55:00.000Z'), source: { kind: 'freeBuild', projectId: PROJECT, versionId: 'v-old1234' } },
    ])
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toMatchObject({ status: 'declined', reason: 'free-build-too-soon' })

    // 20 minutes apart is fine.
    store.delete(dayPath('2026-11-22'))
    putDay('2026-11-20', [
      { minutes: 15, atMs: Date.parse('2026-11-21T05:45:00.000Z'), source: { kind: 'freeBuild', projectId: PROJECT, versionId: 'v-old1234' } },
    ])
    expect((await previewBuildStudioCredit(scope('v-aaa111'))).status).toBe('ready')
  })

  it("only THIS date's bucket counts toward this date's total", async () => {
    // The 19th is FULL (24 × 10); that must not touch the 20th's own room.
    putDay('2026-11-19', Array.from({ length: 24 }, (_, i) => ({ minutes: 10, atMs: T0 - 86_400_000 - i * 3_600_000, source: verdict(i) })))
    putVersion('v-aaa111')
    expect((await previewBuildStudioCredit(scope('v-aaa111'))).status).toBe('ready')
  })

  it('one credit per challenge per day, across different saved versions', async () => {
    putVersion('v-aaa111', { attempt: attempt('v-aaa111') })
    putVersion('v-bbb222', { attempt: attempt('v-bbb222'), acceptedMs: T0 + 3_600_000 })
    expect((await confirmBuildStudioCredit(await ready('v-aaa111'))).status).toBe('credited')
    expect(await previewBuildStudioCredit(scope('v-bbb222'))).toMatchObject({
      status: 'declined',
      reason: 'challenge-already-credited-today',
    })
  })

  it('malformed budget state fails closed and writes nothing', async () => {
    putVersion('v-aaa111')
    putDay('2026-11-20', [{ minutes: -15, atMs: T0 - 3_600_000, source: idea(1) }])
    expect(await previewBuildStudioCredit(scope('v-aaa111'))).toEqual({ status: 'failed', reason: 'malformed-budget' })
    const r = await confirmBuildStudioCredit({
      ...(await (async () => {
        store.delete(dayPath('2026-11-20'))
        return ready('v-aaa111')
      })()),
    })
    expect(r.status).toBe('credited')

    // A malformed NEIGHBOUR bucket (its instants feed spacing) also blocks.
    putVersion('v-bbb222', { files: filesWith(7), acceptedMs: T0 + 3_600_000 })
    const proposal = await ready('v-bbb222').catch(() => null)
    expect(proposal).not.toBeNull()
    store.set(dayPath('2026-11-19'), { childId: CHILD, schoolDate: '2026-11-19', entries: 'broken' })
    expect(await confirmBuildStudioCredit(proposal as never)).toEqual({
      status: 'failed',
      retryable: false,
      reason: 'malformed-budget',
    })
  })
})

describe('corrections', () => {
  async function credited() {
    putVersion('v-aaa111')
    const proposal = await ready('v-aaa111')
    await confirmBuildStudioCredit(proposal)
    writtenPaths.length = 0
    return proposal
  }
  const correct = (over: Partial<Parameters<typeof correctBuildStudioCreditHours>[0]>) =>
    correctBuildStudioCreditHours({ ...scope('v-aaa111'), expectedMinutes: 15, minutes: 10, ...over })

  it('lowers only the minutes of the visible row, leaving receipt and bucket intact', async () => {
    await credited()
    const before = JSON.stringify([store.get(dayPath('2026-11-20')), store.get(`families/${FAMILY}/buildStudioCreditReceipts/${CHILD}.${PROJECT}.v-aaa111`)])
    expect(await correct({})).toEqual({ status: 'corrected', minutes: 10 })
    expect(writtenPaths).toEqual([hoursPath('v-aaa111')])
    expect(store.get(hoursPath('v-aaa111'))).toMatchObject({ minutes: 10, childId: CHILD, date: '2026-11-20', subjectBucket: 'PracticalArts', source: 'build-studio-credit' })
    expect(JSON.stringify([store.get(dayPath('2026-11-20')), store.get(`families/${FAMILY}/buildStudioCreditReceipts/${CHILD}.${PROJECT}.v-aaa111`)])).toBe(before)
  })

  it('never raises, never zero, never fractional', async () => {
    await credited()
    expect(await correct({ minutes: 15 })).toEqual({ status: 'invalid', reason: 'not-lower' })
    expect(await correct({ minutes: 60 })).toEqual({ status: 'invalid', reason: 'not-lower' })
    expect(await correct({ minutes: 0 })).toEqual({ status: 'invalid', reason: 'not-a-positive-whole-number' })
    expect(await correct({ minutes: 7.5 })).toEqual({ status: 'invalid', reason: 'not-a-positive-whole-number' })
    expect(writtenPaths).toEqual([])
  })

  it('rejects a stale expectation and reloads (changed, deleted or not this credit)', async () => {
    await credited()
    expect(await correct({ expectedMinutes: 12 })).toEqual({ status: 'stale', reason: 'row-changed' })
    store.set(hoursPath('v-aaa111'), { ...store.get(hoursPath('v-aaa111')), childId: 'child-other' })
    expect(await correct({})).toEqual({ status: 'stale', reason: 'row-mismatch' })
    store.delete(hoursPath('v-aaa111'))
    expect(await correct({})).toEqual({ status: 'stale', reason: 'row-missing' })
    expect(await correctBuildStudioCreditHours({ ...scope('v-nope111'), expectedMinutes: 15, minutes: 5 })).toEqual({ status: 'noReceipt' })
  })

  it('a deleted row is never re-created, never re-earned, and keeps the cap unit', async () => {
    const proposal = await credited()
    expect(await correct({ minutes: 'delete' })).toEqual({ status: 'deleted' })
    expect(hoursRows()).toHaveLength(0)

    expect((await previewBuildStudioCredit(scope('v-aaa111'))).status).toBe('alreadySettled')
    // A retry holding the original proposal settles to the original receipt too.
    const retry = await confirmBuildStudioCredit(proposal)
    expect(retry.status).toBe('alreadySettled')
    expect(hoursRows()).toHaveLength(0)
    expect((store.get(dayPath('2026-11-20'))?.entries as Array<{ minutes: number }>)[0].minutes).toBe(15)
  })

  it('a correction does not free the 15-minute free-build spacing either', async () => {
    await credited()
    await correct({ minutes: 'delete' })
    putVersion('v-bbb222', { files: filesWith(8), acceptedMs: T0 + 5 * 60_000 })
    expect(await previewBuildStudioCredit(scope('v-bbb222'))).toMatchObject({ status: 'declined', reason: 'free-build-too-soon' })
  })
})

describe('the exact saved version, for the parent', () => {
  type Prov = Parameters<typeof readBuildStudioCreditedVersion>[0]['provenance']
  /** Full provenance, as a credit's hours row records it. */
  const fullProv = (versionId: string, extra: Partial<Prov> = {}, child = CHILD): Prov => ({
    schema: 1,
    receiptId: `${child}.${PROJECT}.${versionId}`,
    kind: 'freeBuild',
    projectId: PROJECT,
    versionId,
    versionDocId: buildStudioVersionDocId(child, PROJECT, versionId),
    admittedMinutes: 15,
    workAtMs: T0,
    timeZone: 'America/Chicago',
    ...extra,
  })
  const free = fullProv('v-aaa111')
  const read = (provenance: Prov, childId = CHILD) =>
    readBuildStudioCreditedVersion({ familyId: FAMILY, childId, provenance })

  it('returns the exact version, not a newer one', async () => {
    putVersion('v-aaa111', { files: filesWith(4) })
    putVersion('v-bbb222', { files: filesWith(9), acceptedMs: T0 + 1000 })
    const r = await read(free)
    expect(r).toMatchObject({ status: 'ok', version: { versionId: 'v-aaa111', childId: CHILD } })
  })

  it('unavailable, malformed and failed are different answers', async () => {
    expect(await read(free)).toEqual({ status: 'unavailable' })

    putVersion('v-aaa111')
    store.set(vPath('v-aaa111'), { ...store.get(vPath('v-aaa111')), childId: 'child-other' })
    expect(await read(free)).toEqual({ status: 'malformed', reason: 'bad-identity' })

    putVersion('v-aaa111')
    store.set(vPath('v-aaa111'), { ...store.get(vPath('v-aaa111')), sourceDigest: 'x' })
    expect(await read(free)).toEqual({ status: 'malformed', reason: 'bad-archive' })

    putVersion('v-aaa111')
    failReadsFor = 'buildStudioVersions'
    expect(await read(free)).toEqual({ status: 'failed' })
    failReadsFor = null
    expect(await read({ ...free, projectId: 'a/b' })).toEqual({ status: 'malformed', reason: 'bad-scope' })
  })

  it("does not read another child's row for the selected child", async () => {
    putVersion('v-aaa111', { child: 'child-other' })
    expect(await read(free)).toEqual({ status: 'unavailable' })
  })

  it('verifies the expected challenge provenance', async () => {
    putVersion('v-aaa111', { attempt: attempt('v-aaa111') })
    const prov = fullProv('v-aaa111', { kind: 'challenge', challengeId: 'one-more-heart', challengeRevision: 1 })
    expect((await read(prov)).status).toBe('ok')
    expect(await read({ ...prov, challengeId: 'faster-hero' })).toEqual({ status: 'malformed', reason: 'bad-challenge' })
    expect(await read({ ...prov, challengeRevision: 2 })).toEqual({ status: 'malformed', reason: 'bad-challenge' })
    // A free-build claim over a challenge version is also a mismatch.
    expect(await read(fullProv('v-aaa111'))).toEqual({ status: 'malformed', reason: 'bad-challenge' })
  })

  it("matches the recorded challenge revision, not the authored catalogue's current one", async () => {
    // Stored revision differs from today's (1): the archived source still opens by its own metadata.
    putVersion('v-aaa111', { attempt: { ...attempt('v-aaa111'), challengeRevision: 2 } })
    const prov = fullProv('v-aaa111', { kind: 'challenge', challengeId: 'one-more-heart', challengeRevision: 2 })
    expect((await read(prov)).status).toBe('ok')
  })

  it('rejects provenance that is not this scope, schema or project, or is incoherent for its kind', async () => {
    putVersion('v-aaa111')
    putVersion('v-aaa111', { child: 'child-sibling' })
    const bad = { status: 'malformed', reason: 'bad-provenance' }
    // The sibling's link, used with this child, even though this child has the same version id.
    expect(await read(fullProv('v-aaa111', {}, 'child-sibling'))).toEqual(bad)
    expect(await read(fullProv('v-aaa111', { receiptId: `child-sibling.${PROJECT}.v-aaa111` }))).toEqual(bad)
    expect(await read({ ...free, schema: 2 as never })).toEqual(bad)
    expect(await read({ ...free, versionDocId: buildStudioVersionDocId(CHILD, PROJECT, 'v-bbb222') })).toEqual(bad)
    expect(await read({ ...free, projectId: 'other-project', versionDocId: buildStudioVersionDocId(CHILD, 'other-project', 'v-aaa111'), receiptId: `${CHILD}.other-project.v-aaa111` })).toEqual(bad)
    expect(await read({ ...free, challengeId: 'one-more-heart' })).toEqual(bad)
    expect(await read(fullProv('v-aaa111', { kind: 'challenge' }))).toEqual(bad)
    // The matching link for the sibling opens the sibling's own row.
    expect((await read(fullProv('v-aaa111', {}, 'child-sibling'), 'child-sibling')).status).toBe('ok')
  })
})
