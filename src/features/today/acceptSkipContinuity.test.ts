import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { writeChecklistRow, skipRowWriteNotice } from './dayChecklistRowWrite'
import { checklistItemKey } from './dayWriteGuard'
import { dayLogDocId } from './daylog.model'
import { resolvePreCompletionScanIndex } from './preCompletionScanIdentity'
import type { DayLog, ChecklistItem } from '../../core/types'
import { SkipReason } from '../../core/types/enums'
import { collectHoursContributions } from '../../../functions/src/shared/hoursContributions'

// Execute the actual Today handler, not a second implementation of it. Mock
// external I/O while retaining the real row writer and transaction guard.
const source = readFileSync(join(process.cwd(), 'src/features/today/TodayPage.tsx'), 'utf8')
const ast = ts.createSourceFile('TodayPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handlerSource = ''
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleAcceptSkip'
    && node.initializer && ts.isCallExpression(node.initializer)) {
    handlerSource = node.initializer.arguments[0].getText(ast)
  }
  ts.forEachChild(node, visit)
}
visit(ast)
if (!handlerSource) throw new Error('Actual handleAcceptSkip callback not found')
const compiled = ts.transpileModule(`const handler = ${handlerSource}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

type Ref = { key: string; firestore: object }
const store = new Map<string, DayLog>()
const writes: { key: string; payload: Record<string, unknown> }[] = []
let contend: (() => void) | null = null
let rejectWrite = false
let attempts = 0
vi.mock('firebase/firestore', () => ({
  doc: (collection: string, id: string): Ref => ({ key: `${collection}/${id}`, firestore: {} }),
  runTransaction: async (_db: unknown, body: (tx: unknown) => Promise<unknown>) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      attempts++
      let readAt: DayLog | undefined
      try {
        return await body({
          get: async (ref: Ref) => {
            readAt = store.get(ref.key)
            const change = contend
            contend = null
            change?.()
            return { exists: () => !!readAt, data: () => readAt }
          },
          update: (ref: Ref, payload: Record<string, unknown>) => {
            if (rejectWrite) throw new Error('rejected')
            if (store.get(ref.key) !== readAt) throw new Error('retry')
            writes.push({ key: ref.key, payload })
            store.set(ref.key, { ...readAt, ...payload } as DayLog)
          },
        })
      } catch (err) {
        if ((err as Error).message !== 'retry') throw err
      }
    }
    throw new Error('retries exhausted')
  },
  getDoc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: (family: string) => `families/${family}/days`,
}))

const FAMILY = 'synthetic-family'
const CHILD = 'synthetic-child'
const DATE = '2026-09-15'
const key = (family = FAMILY, child = CHILD, day = DATE) => `families/${family}/days/${dayLogDocId(day, child)}`
const row = (id: string, over: Partial<ChecklistItem> = {}) => ({ id, label: id, completed: false, subjectBucket: 'Math', plannedMinutes: 15, ...over }) as ChecklistItem
const startDay = (): DayLog => ({
  childId: CHILD, date: DATE,
  checklist: [row('scan-row'), row('writing')],
  blocks: [{ id: 'writing', type: 'core', title: 'writing', subjectBucket: 'Math', plannedMinutes: 15 }],
  xpTotal: 0, retro: 'original',
}) as unknown as DayLog
const newerDay = (): DayLog => ({
  ...startDay(),
  checklist: [row('scan-row', { engagement: 'engaged' }), row('writing', { completed: true })],
  blocks: [{ ...startDay().blocks[0], actualMinutes: 15 }],
  xpTotal: 10, retro: 'newer observation',
}) as DayLog
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
function setup(dayLog = startDay(), index = 0) {
  const sync = deferred()
  const override = deferred()
  const syncEntered = deferred()
  const overrideEntered = deferred()
  const notices: { text: string; severity: string }[] = []
  const syncScanToConfig = vi.fn(async () => { syncEntered.resolve(); await sync.promise })
  const updateDoc = vi.fn(async () => { overrideEntered.resolve(); await override.promise })
  const bindings = {
    familyId: FAMILY, selectedChildId: CHILD, today: DATE, dayLog,
    scanItemIndex: index,
    preCompletionTarget: { familyId: FAMILY, childId: CHILD, dateKey: DATE, itemId: dayLog.checklist?.[index]?.id ?? '', scanId: 'synthetic-scan' },
    resolvePreCompletionScanIndex,
    scanResult: { id: 'synthetic-scan', results: { pageType: 'worksheet', curriculumDetected: { name: 'Synthetic Workbook', lessonNumber: 4 } } },
    SkipReason, checklistItemKey, writeChecklistRow, skipRowWriteNotice,
    syncScanToConfig, updateDoc,
    doc: (collection: string, id: string) => `${collection}/${id}`,
    scansCollection: (family: string) => `families/${family}/scans`,
    setSnackMessage: (notice: { text: string; severity: string }) => notices.push(notice),
    // Used only by the actual old handler in the independent reversion control.
    persistDayLogImmediate: (day: DayLog) => store.set(key(), day),
  }
  const makeHandler = (values: typeof bindings) => new Function(...Object.keys(values), `${compiled}; return handler`)(...Object.values(values)) as () => Promise<boolean>
  return { handler: makeHandler(bindings), bindings, makeHandler, sync, override, syncEntered, overrideEntered, notices, syncScanToConfig, updateDoc }
}

beforeEach(() => {
  store.clear(); writes.length = 0; contend = null; rejectWrite = false; attempts = 0
  store.set(key(), startDay())
})

describe('Accept skip preserves daily activity continuity', () => {
  it.each(['sync', 'override'] as const)('keeps newer saved work across the %s await, with unchanged hours contributions', async (boundary) => {
    const h = setup()
    const pending = h.handler()
    await h.syncEntered.promise
    if (boundary === 'override') { h.sync.resolve(); await h.overrideEntered.promise }
    const live = newerDay()
    store.set(key(), live)
    const before = collectHoursContributions([live], [], [], CHILD)
    expect(before.length).toBeGreaterThan(0)
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(true)
    const saved = store.get(key())!
    expect(saved.checklist![1]).toBe(live.checklist![1])
    expect(saved.checklist![0]).toEqual({ ...live.checklist![0], skipped: true, skipReason: SkipReason.AiRecommended })
    expect(saved.blocks).toBe(live.blocks)
    expect(saved.xpTotal).toBe(10)
    expect(saved).toMatchObject({ retro: 'newer observation' })
    expect(collectHoursContributions([saved], [], [], CHILD)).toEqual(before)
    expect(Object.keys(writes[0].payload).sort()).toEqual(['checklist', 'updatedAt'])
    expect(h.syncScanToConfig).toHaveBeenCalledWith(CHILD, expect.objectContaining({ curriculumDetected: { name: 'Synthetic Workbook', lessonNumber: 5 } }))
  })

  it('retries a concurrent edit and finds the original row after reordering', async () => {
    const h = setup()
    const pending = h.handler()
    await h.syncEntered.promise
    const live = newerDay()
    contend = () => store.set(key(), { ...live, checklist: [row('new-row'), live.checklist![1], { ...live.checklist![0], completed: true }] })
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(true)
    expect(attempts).toBe(2)
    expect(store.get(key())!.checklist!.map((item) => [item.id, !!item.skipped, item.completed])).toEqual([
      ['new-row', false, false], ['writing', false, true], ['scan-row', true, true],
    ])
    expect(store.get(key())!.blocks).toBe(live.blocks)
  })

  it.each([false, true])('refuses duplicate origin rows before either side effect (other completion=%s)', async (completed) => {
    const scanned = row('same workbook')
    const twin = { ...scanned, completed }
    const day = { ...startDay(), checklist: [twin, scanned] }
    store.set(key(), day)
    const h = setup(day, 1)
    expect(await h.handler()).toBe(false)
    // If the scanned twin disappears later, the remaining row must not become
    // a newly unique target for an operation that started ambiguously.
    store.set(key(), { ...day, checklist: [twin] })
    expect(h.syncScanToConfig).not.toHaveBeenCalled()
    expect(h.updateDoc).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(h.notices.at(-1)!.text).toContain('no longer linked to one row')
  })

  it.each(['sync', 'override'] as const)('refuses an equal-state duplicate inserted/reordered during the %s await', async (boundary) => {
    const scanned = row('same workbook')
    const day = { ...startDay(), checklist: [scanned, row('writing')] }
    store.set(key(), day)
    const h = setup(day)
    const pending = h.handler()
    await h.syncEntered.promise
    if (boundary === 'override') { h.sync.resolve(); await h.overrideEntered.promise }
    const latest = { ...newerDay(), checklist: [{ ...scanned, engagement: 'okay' as const }, scanned, row('writing', { completed: true })] }
    store.set(key(), latest)
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(false)
    expect(store.get(key())).toBe(latest)
    expect(writes).toHaveLength(0)
    expect(h.notices.at(-1)!.text).toContain('More than one row')
    expect(h.notices.at(-1)!.text).toContain('may already have advanced')
  })

  it('re-checks uniqueness when a duplicate appears during a transaction retry', async () => {
    const h = setup()
    const pending = h.handler()
    await h.syncEntered.promise
    const latest = { ...newerDay(), checklist: [row('scan-row'), row('scan-row'), row('writing', { completed: true })] }
    contend = () => store.set(key(), latest)
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(false)
    expect(attempts).toBe(2)
    expect(store.get(key())).toBe(latest)
    expect(writes).toHaveLength(0)
    expect(h.notices.at(-1)!.text).toContain('More than one row')
  })

  it('refuses a legacy row before identity preparation and before either side effect', async () => {
    const scanned = row('unique workbook', { id: undefined })
    const day = { ...startDay(), checklist: [scanned, row('writing')] }
    store.set(key(), day)
    const h = setup(day)
    expect(await h.handler()).toBe(false)
    expect(h.syncScanToConfig).not.toHaveBeenCalled()
    expect(h.updateDoc).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })

  it.each(['sync', 'override', 'retry'] as const)('never skips a fresh same-name replacement at %s', async (boundary) => {
    const h = setup()
    const pending = h.handler()
    await h.syncEntered.promise
    if (boundary === 'override') { h.sync.resolve(); await h.overrideEntered.promise }
    const replacement = { ...newerDay(), checklist: [{ ...startDay().checklist![0], id: 'fresh-planner-id' }, row('writing', { completed: true })] }
    if (boundary === 'retry') contend = () => store.set(key(), replacement)
    else store.set(key(), replacement)
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(false)
    expect(store.get(key())).toBe(replacement)
    expect(writes).toHaveLength(0)
  })

  it.each(['familyId', 'childId', 'dateKey', 'scanId', 'itemId'] as const)('refuses a mismatched bound %s before side effects', async (field) => {
    const h = setup()
    const handler = h.makeHandler({ ...h.bindings, preCompletionTarget: { ...h.bindings.preCompletionTarget, [field]: 'other' } })
    expect(await handler()).toBe(false)
    expect(h.syncScanToConfig).not.toHaveBeenCalled()
    expect(h.updateDoc).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })

  it.each(['sync', 'override'] as const)('keeps the original family, child and day after navigation at %s', async (boundary) => {
    const h = setup()
    const pending = h.handler()
    await h.syncEntered.promise
    if (boundary === 'override') { h.sync.resolve(); await h.overrideEntered.promise }
    const other = { ...newerDay(), childId: 'another-child', date: '2026-09-16' }
    const otherKey = key('another-family', 'another-child', '2026-09-16')
    store.set(otherKey, other)
    // A new render creates a new callback; the in-flight one keeps its origin.
    h.makeHandler({ ...h.bindings, familyId: 'another-family', selectedChildId: 'another-child', today: '2026-09-16', dayLog: other })
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(true)
    expect(writes.map((write) => write.key)).toEqual([key()])
    expect(store.get(otherKey)).toBe(other)
    expect(h.updateDoc).toHaveBeenCalledWith(`families/${FAMILY}/scans/synthetic-scan`, expect.any(Object))
  })

  it.each(['day-gone', 'row-gone', 'failed'] as const)('reports %s without resurrecting work or announcing acceptance', async (mode) => {
    const h = setup()
    const pending = h.handler()
    await h.syncEntered.promise
    if (mode === 'day-gone') store.delete(key())
    if (mode === 'row-gone') store.set(key(), { ...newerDay(), checklist: [row('other')] })
    if (mode === 'failed') rejectWrite = true
    const before = store.get(key())
    h.sync.resolve(); h.override.resolve()
    expect(await pending).toBe(false)
    expect(store.get(key())).toBe(before)
    expect(h.notices.at(-1)).toMatchObject({ severity: 'warning' })
    expect(h.notices.at(-1)!.text).toContain('may already have advanced')
    expect(h.notices.some((notice) => notice.severity === 'success' || notice.text.includes('Photo saved'))).toBe(false)
    expect(h.updateDoc).toHaveBeenCalledOnce()
  })

  it('refuses an absent starting row before changing curriculum', async () => {
    const h = setup(startDay(), 99)
    expect(await h.handler()).toBe(false)
    expect(h.syncScanToConfig).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })

  it.each(['sync', 'override'] as const)('a rejected %s step does not write the day or claim acceptance', async (boundary) => {
    const h = setup()
    if (boundary === 'sync') h.syncScanToConfig.mockRejectedValueOnce(new Error('sync failed'))
    else h.updateDoc.mockRejectedValueOnce(new Error('override failed'))
    h.sync.resolve(); h.override.resolve()
    expect(await h.handler()).toBe(false)
    expect(writes).toHaveLength(0)
    expect(h.notices.at(-1)).toMatchObject({ severity: 'error' })
    expect(h.notices.at(-1)!.text).toContain('may already have advanced')
  })
})
