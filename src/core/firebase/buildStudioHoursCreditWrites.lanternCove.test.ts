import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lantern Cove through the REAL credit writer (FEAT-247, slice 4), over an
 * in-memory Firestore. Synthetic data only.
 *
 * The harness is the one `buildStudioHoursCreditWrites.test.ts` uses, trimmed to
 * what these tests need: the `./firestore` mock exports exactly the helpers the
 * writer may reach, reads are server-only, and the transaction stand-in refuses a
 * read after a write and applies its buffered writes only on a successful commit
 * (`lostResponse` applies them and then throws, the lost-ACK case).
 */

type Row = Record<string, unknown>
const store = new Map<string, Row>()
let commitMode: 'ok' | 'lostResponse' = 'ok'
let queue: Promise<unknown> = Promise.resolve()
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
  buildStudioCreditJobsCollection: (f: string) => colRef(`families/${f}/buildStudioCreditJobs`),
  hoursCollection: (f: string) => colRef(`families/${f}/hours`),
}))

const snapOf = (ref: Ref) => {
  const data = store.get(ref.__path)
  return {
    id: ref.id,
    exists: () => data !== undefined,
    data: () => (data ? { ...data } : undefined),
    metadata: { hasPendingWrites: false, fromCache: false },
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (col: { __path: string }, id: string) => ({ __path: `${col.__path}/${id}`, id }),
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  documentId: () => '__name__',
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ orderBy: field }),
  startAfter: (v: string | { id: string }) => ({ after: typeof v === 'string' ? v : v.id }),
  limit: (n: number) => ({ limit: n }),
  query: (col: { __path: string }, ...constraints: unknown[]) => ({ col, constraints }),
  getDocFromServer: async (ref: Ref) => snapOf(ref),
  getDocsFromServer: async (q: {
    col: { __path: string }
    constraints: Array<{ field?: string; op?: string; value?: unknown; limit?: number; after?: string }>
  }) => {
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
      metadata: { hasPendingWrites: false, fromCache: false },
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
  type BuildStudioSourceFiles,
} from '../types/buildStudio'
import { SubjectBucket } from '../types/enums'
import { LANTERN_COVE_CHALLENGES } from '../../features/build-studio/buildStudioChallenges'
import { buildCreditJobFields } from '../../features/build-studio/buildStudioCreditProof'
import { BUILD_STUDIO_PROJECT_ID } from '../../features/build-studio/buildStudioStarter'
import { LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles } from '../../features/build-studio/lanternCoveStarter'
import {
  correctBuildStudioCreditHours,
  listPendingBuildStudioCreditJobs,
  previewBuildStudioCredit,
  readBuildStudioCreditedVersion,
  reconcileBuildStudioCreditJob,
  reconcileBuildStudioCreditJobsForChild,
  type CreditScope,
} from './buildStudioHoursCreditWrites'

const FAMILY = 'fam-1'
const CHILD = 'child-lincoln'
const COVE = LANTERN_COVE_PROJECT_ID
const APPLE = BUILD_STUDIO_PROJECT_ID
const T0 = Date.parse('2026-11-20T16:00:00.000Z') // 10:00 CST, 2026-11-20
const MIN = 60_000
const stamp = (ms: number) => ({ toMillis: () => ms })

const APPLE_FILES: BuildStudioSourceFiles = {
  'pxt.json': JSON.stringify({ name: 'Apple Dash starter', files: ['main.blocks', 'main.ts'] }),
  'main.ts': 'info.setLife(4)\nsprites.create(img``, SpriteKind.Player)\n',
  'main.blocks': '<xml><block type="pxt-on-start"><statement/></block></xml>',
}
const movedHero = (): BuildStudioSourceFiles => {
  const files = lanternCoveStarterFiles()
  return { ...files, 'main.ts': files['main.ts'].replace('tiles.getTileLocation(1, 1)', 'tiles.getTileLocation(3, 2)') }
}
const tileOnly = (): BuildStudioSourceFiles => {
  const files = lanternCoveStarterFiles()
  const jres = JSON.parse(files['tilemap.g.jres'])
  const hex = atob(jres['Lantern Cove1'].data)
  jres['Lantern Cove1'].data = btoa(hex.slice(0, 10) + (hex[10] === '0' ? '1' : '0') + hex.slice(11))
  return { ...files, 'tilemap.g.jres': JSON.stringify(jres, null, 4) }
}
const roundTripped = (): BuildStudioSourceFiles => {
  const files = lanternCoveStarterFiles()
  return {
    ...files,
    'main.blocks': files['main.blocks'].replace(/ (x|y)="-?\d+"/g, '').replace(/></g, '>\n <'),
    'pxt.json': JSON.stringify({ ...JSON.parse(files['pxt.json']), description: 'rewritten' }, null, 2),
  }
}

const vPath = (projectId: string, versionId: string, child = CHILD) =>
  `families/${FAMILY}/buildStudioVersions/${buildStudioVersionDocId(child, projectId, versionId)}`
const jobPath = (projectId: string, versionId: string) =>
  `families/${FAMILY}/buildStudioCreditJobs/${CHILD}.${projectId}.${versionId}`
const receiptPath = (projectId: string, versionId: string) =>
  `families/${FAMILY}/buildStudioCreditReceipts/${CHILD}.${projectId}.${versionId}`
const hoursPath = (projectId: string, versionId: string) =>
  `families/${FAMILY}/hours/bsc.${CHILD}.${projectId}.${versionId}`
const dayPath = (date: string) => `families/${FAMILY}/buildStudioCreditDays/${CHILD}.${date}`
const hoursRows = () => [...store.keys()].filter((k) => k.startsWith(`families/${FAMILY}/hours/`))

function putVersion(
  projectId: string,
  versionId: string,
  files: BuildStudioSourceFiles,
  opts: { acceptedMs?: number; attempt?: unknown; child?: string } = {},
) {
  const child = opts.child ?? CHILD
  const archive = serializeBuildStudioSource(files)
  const row: Row = {
    childId: child,
    projectId,
    versionId,
    label: 'x',
    createdAt: '2026-11-20T15:59:00.000Z',
    sourceArchive: archive,
    byteSize: utf8ByteLength(archive),
    fileCount: Object.keys(files).length,
    sourceDigest: buildStudioSourceDigest(archive),
    acceptedAt: stamp(opts.acceptedMs ?? T0),
  }
  if (opts.attempt !== undefined) row.challengeAttempt = opts.attempt
  store.set(vPath(projectId, versionId, child), row)
}

const putJob = (projectId: string, versionId: string) =>
  store.set(jobPath(projectId, versionId), {
    ...buildCreditJobFields(CHILD, projectId, versionId),
    createdAt: stamp(T0),
  })

const attemptFor = (projectId: string, versionId: string, challengeId: string, optionId: string, subjectBucket: string) => ({
  childId: CHILD,
  projectId,
  versionId,
  attemptId: 'a-attempt1',
  challengeId,
  challengeRevision: 1,
  subjectBucket,
  prediction: { optionId, at: '2026-11-20T15:50:00.000Z' },
})

const scope = (projectId: string, versionId: string): CreditScope => ({
  familyId: FAMILY,
  childId: CHILD,
  projectId,
  versionId,
})

function putDay(date: string, entries: Array<{ minutes: number; atMs: number; source: Row }>) {
  store.set(dayPath(date), {
    schema: 1,
    childId: CHILD,
    schoolDate: date,
    entries: entries.map((e) => ({
      receiptId: `${CHILD}.${e.source.projectId}.${e.source.versionId}`,
      ...e,
    })),
  })
}

beforeEach(() => {
  store.clear()
  writtenPaths.length = 0
  commitMode = 'ok'
  queue = Promise.resolve()
})

describe('preview', () => {
  it('proposes a changed first save against Lantern Cove’s own starter', async () => {
    putVersion(COVE, 'v-aaa111', movedHero())
    expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toMatchObject({
      status: 'ready',
      proposal: {
        projectId: COVE,
        minutes: 15,
        subjectBucket: SubjectBucket.PracticalArts,
        source: { kind: 'freeBuild', projectId: COVE, versionId: 'v-aaa111' },
        predecessorDocId: null,
        schoolDate: '2026-11-20',
      },
    })
    expect(writtenPaths).toEqual([]) // a preview writes nothing
  })

  it('open-and-save of unchanged work earns nothing — raw, or after a stock round trip', async () => {
    putVersion(COVE, 'v-aaa111', lanternCoveStarterFiles())
    expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toEqual({ status: 'unproven', reason: 'unchanged' })
    putVersion(COVE, 'v-bbb222', roundTripped())
    expect(await previewBuildStudioCredit(scope(COVE, 'v-bbb222'))).toEqual({ status: 'unproven', reason: 'unchanged' })
  })

  it('a tile-only change earns', async () => {
    putVersion(COVE, 'v-aaa111', tileOnly())
    expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toMatchObject({ status: 'ready' })
  })

  it('compares with the immediately preceding Lantern Cove save, never an Apple Dash one', async () => {
    putVersion(COVE, 'v-aaa111', movedHero(), { acceptedMs: T0 - 120 * MIN })
    putVersion(APPLE, 'v-zzz999', APPLE_FILES, { acceptedMs: T0 - 5 * MIN }) // closer in time, other game
    putVersion(COVE, 'v-bbb222', roundTripped(), { acceptedMs: T0 }) // the starter re-saved: differs from the predecessor
    const p = await previewBuildStudioCredit(scope(COVE, 'v-bbb222'))
    expect(p).toMatchObject({ status: 'ready', proposal: { predecessorDocId: buildStudioVersionDocId(CHILD, COVE, 'v-aaa111') } })
    putVersion(COVE, 'v-ccc333', movedHero(), { acceptedMs: T0 + MIN })
    expect(await previewBuildStudioCredit(scope(COVE, 'v-ccc333'))).toMatchObject({ status: 'ready' })
  })

  it.each(LANTERN_COVE_CHALLENGES.map((c) => [c.id, c] as const))(
    'challenge %s persists its authored subject',
    async (_id, challenge) => {
      putVersion(COVE, 'v-aaa111', lanternCoveStarterFiles(), {
        attempt: attemptFor(COVE, 'v-aaa111', challenge.id, challenge.prediction.options[0].id, challenge.subjectBucket),
      })
      expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toMatchObject({
        status: 'ready',
        proposal: { minutes: 15, subjectBucket: challenge.subjectBucket, source: { kind: 'challenge', challengeId: challenge.id } },
      })
    },
  )

  it('a wrong-project attempt earns nothing, in both directions', async () => {
    putVersion(COVE, 'v-aaa111', movedHero(), {
      attempt: attemptFor(COVE, 'v-aaa111', 'faster-hero', 'faster', SubjectBucket.PracticalArts),
    })
    expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toEqual({ status: 'unproven', reason: 'challenge-unverified' })
    putVersion(APPLE, 'v-bbb222', APPLE_FILES, {
      attempt: attemptFor(APPLE, 'v-bbb222', 'open-a-shortcut', 'through', SubjectBucket.PracticalArts),
    })
    expect(await previewBuildStudioCredit(scope(APPLE, 'v-bbb222'))).toEqual({ status: 'unproven', reason: 'challenge-unverified' })
  })

  it('declines a Lantern Cove build inside 15 minutes of an Apple Dash build (shared cadence)', async () => {
    putDay('2026-11-20', [
      { minutes: 15, atMs: T0 - 10 * MIN, source: { kind: 'freeBuild', projectId: APPLE, versionId: 'v-seedf1' } },
    ])
    putVersion(COVE, 'v-aaa111', movedHero())
    expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toMatchObject({
      status: 'declined',
      reason: 'free-build-too-soon',
    })
  })

  it('declines past the 240-minute budget the two games share, with no partial credit', async () => {
    const entries = Array.from({ length: 16 }, (_, i) => ({
      minutes: 15,
      atMs: T0 - (i + 1) * 20 * MIN,
      source: {
        kind: 'challenge',
        challengeId: `seeded-${i}`,
        challengeRevision: 1,
        subjectBucket: SubjectBucket.Math,
        projectId: i % 2 === 0 ? APPLE : COVE,
        versionId: `v-seed${i}`,
      } as Row,
    }))
    putDay('2026-11-20', entries)
    putVersion(COVE, 'v-aaa111', movedHero())
    expect(await previewBuildStudioCredit(scope(COVE, 'v-aaa111'))).toMatchObject({
      status: 'declined',
      reason: 'over-daily-cap',
    })
    expect(hoursRows()).toHaveLength(0)
  })
})

describe('the pending job', () => {
  it('credits a new Lantern Cove save automatically: receipt, hours row, budget unit, and the job is gone', async () => {
    putVersion(COVE, 'v-aaa111', movedHero())
    putJob(COVE, 'v-aaa111')
    const result = await reconcileBuildStudioCreditJob(scope(COVE, 'v-aaa111'))
    expect(result).toMatchObject({ status: 'settled', outcome: 'credited', jobRemoved: true })

    expect(store.get(receiptPath(COVE, 'v-aaa111'))).toMatchObject({ childId: CHILD, projectId: COVE, minutes: 15 })
    expect(store.get(hoursPath(COVE, 'v-aaa111'))).toMatchObject({
      childId: CHILD,
      minutes: 15,
      date: '2026-11-20',
      subjectBucket: SubjectBucket.PracticalArts,
      source: 'build-studio-credit',
    })
    expect(JSON.stringify(store.get(hoursPath(COVE, 'v-aaa111')))).toContain('Lantern Cove')
    expect((store.get(dayPath('2026-11-20')) as { entries: unknown[] }).entries).toHaveLength(1)
    expect(store.has(jobPath(COVE, 'v-aaa111'))).toBe(false)
  })

  it('the worker queue is the child’s: one pass settles an Apple Dash job and a Lantern Cove job', async () => {
    putVersion(APPLE, 'v-apple1', APPLE_FILES, { acceptedMs: T0 - 60 * MIN })
    putJob(APPLE, 'v-apple1')
    putVersion(COVE, 'v-cove01', movedHero(), { acceptedMs: T0 })
    putJob(COVE, 'v-cove01')
    expect(await listPendingBuildStudioCreditJobs({ familyId: FAMILY, childId: CHILD })).toMatchObject({
      status: 'ok',
      jobs: [scope(APPLE, 'v-apple1'), scope(COVE, 'v-cove01')],
    })
    const pass = await reconcileBuildStudioCreditJobsForChild({ familyId: FAMILY, childId: CHILD, isCurrent: () => true })
    expect(pass.settled).toBe(2)
    expect(hoursRows().sort()).toEqual([hoursPath(APPLE, 'v-apple1'), hoursPath(COVE, 'v-cove01')].sort())
  })

  it('another child’s Lantern Cove job is never worked by this child’s pass', async () => {
    store.set(`families/${FAMILY}/buildStudioCreditJobs/child-other.${COVE}.v-aaa111`, {
      ...buildCreditJobFields('child-other', COVE, 'v-aaa111'),
      createdAt: stamp(T0),
    })
    const listed = await listPendingBuildStudioCreditJobs({ familyId: FAMILY, childId: CHILD })
    expect(listed).toMatchObject({ status: 'ok', jobs: [] })
  })

  it('a lost acknowledgement settles from the permanent receipt and never credits twice', async () => {
    putVersion(COVE, 'v-aaa111', movedHero())
    putJob(COVE, 'v-aaa111')
    commitMode = 'lostResponse'
    const first = await reconcileBuildStudioCreditJob(scope(COVE, 'v-aaa111'))
    expect(first).toMatchObject({ status: 'settled', outcome: 'alreadySettled' })
    expect(hoursRows()).toEqual([hoursPath(COVE, 'v-aaa111')])

    commitMode = 'ok'
    putJob(COVE, 'v-aaa111') // a job left behind by a failed removal
    const again = await reconcileBuildStudioCreditJob(scope(COVE, 'v-aaa111'))
    expect(again).toMatchObject({ status: 'settled', outcome: 'alreadySettled' })
    expect(hoursRows()).toEqual([hoursPath(COVE, 'v-aaa111')])
    expect(writtenPaths.filter((p) => p === hoursPath(COVE, 'v-aaa111'))).toHaveLength(1)
    expect((store.get(dayPath('2026-11-20')) as { entries: unknown[] }).entries).toHaveLength(1)
  })

  it('a job for a save made before this existed has no job and is never previewed (no backfill)', async () => {
    putVersion(COVE, 'v-old001', movedHero())
    expect(await reconcileBuildStudioCreditJob(scope(COVE, 'v-old001'))).toEqual({ status: 'closed', reason: 'no-job' })
    expect(hoursRows()).toHaveLength(0)
  })

  it('an unrecognised game’s job is invalid and writes nothing', async () => {
    expect(await reconcileBuildStudioCreditJob(scope('block-muncher', 'v-aaa111'))).toEqual({ status: 'invalid' })
    expect(writtenPaths).toEqual([])
  })
})

describe('corrections keep the receipt', () => {
  const credit = async () => {
    putVersion(COVE, 'v-aaa111', movedHero())
    putJob(COVE, 'v-aaa111')
    await reconcileBuildStudioCreditJob(scope(COVE, 'v-aaa111'))
    writtenPaths.length = 0
  }

  it('lowering the visible row leaves the receipt and the budget unit alone', async () => {
    await credit()
    const before = JSON.stringify([store.get(receiptPath(COVE, 'v-aaa111')), store.get(dayPath('2026-11-20'))])
    expect(
      await correctBuildStudioCreditHours({ ...scope(COVE, 'v-aaa111'), expectedMinutes: 15, minutes: 10 }),
    ).toEqual({ status: 'corrected', minutes: 10 })
    expect(writtenPaths).toEqual([hoursPath(COVE, 'v-aaa111')])
    expect(JSON.stringify([store.get(receiptPath(COVE, 'v-aaa111')), store.get(dayPath('2026-11-20'))])).toBe(before)
  })

  it('a removed row is never re-credited, even if the job comes back', async () => {
    await credit()
    expect(
      await correctBuildStudioCreditHours({ ...scope(COVE, 'v-aaa111'), expectedMinutes: 15, minutes: 'delete' }),
    ).toEqual({ status: 'deleted' })
    putJob(COVE, 'v-aaa111')
    expect(await reconcileBuildStudioCreditJob(scope(COVE, 'v-aaa111'))).toMatchObject({
      status: 'settled',
      outcome: 'alreadySettled',
    })
    expect(hoursRows()).toHaveLength(0)
    expect(store.has(receiptPath(COVE, 'v-aaa111'))).toBe(true)
  })
})

describe('the exact saved version, for the parent', () => {
  type Prov = Parameters<typeof readBuildStudioCreditedVersion>[0]['provenance']
  const fullProv = (projectId: string, versionId: string, extra: Partial<Prov> = {}, child = CHILD): Prov => ({
    schema: 1,
    receiptId: `${child}.${projectId}.${versionId}`,
    kind: 'freeBuild',
    projectId,
    versionId,
    versionDocId: buildStudioVersionDocId(child, projectId, versionId),
    admittedMinutes: 15,
    workAtMs: T0,
    timeZone: 'America/Chicago',
    ...extra,
  })
  const read = (provenance: Prov, childId = CHILD) =>
    readBuildStudioCreditedVersion({ familyId: FAMILY, childId, provenance })

  it('opens the exact Lantern Cove version the credit names — not a newer one', async () => {
    putVersion(COVE, 'v-aaa111', movedHero())
    putVersion(COVE, 'v-bbb222', tileOnly(), { acceptedMs: T0 + MIN })
    expect(await read(fullProv(COVE, 'v-aaa111'))).toMatchObject({
      status: 'ok',
      version: { versionId: 'v-aaa111', projectId: COVE, childId: CHILD },
    })
  })

  it('opens a Lantern Cove challenge credit against its recorded challenge, and refuses a mismatch', async () => {
    const c = LANTERN_COVE_CHALLENGES[4]
    putVersion(COVE, 'v-aaa111', lanternCoveStarterFiles(), {
      attempt: attemptFor(COVE, 'v-aaa111', c.id, 'through', c.subjectBucket),
    })
    const prov = fullProv(COVE, 'v-aaa111', { kind: 'challenge', challengeId: c.id, challengeRevision: 1 })
    expect(await read(prov)).toMatchObject({ status: 'ok' })
    expect(await read({ ...prov, challengeId: 'move-a-treasure' })).toEqual({ status: 'malformed', reason: 'bad-challenge' })
  })

  it('a game that is not an editable credit game has no saved version to open', async () => {
    putVersion(COVE, 'v-aaa111', movedHero())
    expect(await read(fullProv('block-muncher', 'v-aaa111'))).toEqual({ status: 'malformed', reason: 'bad-provenance' })
  })

  it('never opens a Lantern Cove save that lost part of itself, or a sibling’s', async () => {
    const mapless = Object.fromEntries(Object.entries(movedHero()).filter(([k]) => !k.startsWith('tilemap')))
    putVersion(COVE, 'v-aaa111', mapless)
    expect(await read(fullProv(COVE, 'v-aaa111'))).toEqual({ status: 'malformed', reason: 'bad-archive' })

    putVersion(COVE, 'v-bbb222', movedHero())
    expect(await read(fullProv(COVE, 'v-bbb222'), 'child-other')).toEqual({ status: 'malformed', reason: 'bad-provenance' })
  })

  it('does not open an Apple Dash row through a Lantern Cove provenance, or the reverse', async () => {
    putVersion(APPLE, 'v-aaa111', APPLE_FILES)
    expect(await read(fullProv(COVE, 'v-aaa111'))).toEqual({ status: 'unavailable' })
    putVersion(COVE, 'v-bbb222', movedHero())
    expect(await read(fullProv(APPLE, 'v-bbb222'))).toEqual({ status: 'unavailable' })
  })
})
