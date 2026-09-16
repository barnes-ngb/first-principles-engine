import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import type { ChecklistItem, DayLog } from '../../core/types'
import { hasPersistentChecklistId, resolvePreCompletionScanIndex, type PreCompletionScanTarget } from './preCompletionScanIdentity'

const source = readFileSync(join(process.cwd(), 'src/features/today/TodayPage.tsx'), 'utf8')
const ast = ts.createSourceFile('TodayPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function callback(name: string) {
  let code = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      code = node.initializer.arguments[0].getText(ast)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!code) throw new Error(`Actual ${name} not found`)
  return code
}
function bind<T>(code: string, values: Record<string, unknown>): T {
  const js = ts.transpileModule(`const handler = ${code}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(values), `${js}; return handler`)(...Object.values(values)) as T
}
const scope = { familyId: 'family', childId: 'child', dateKey: '2026-09-15' }
const row = (id?: string): ChecklistItem => ({ ...(id !== undefined ? { id } : {}), label: 'Workbook', completed: false })
const day = (rows: ChecklistItem[]): DayLog => ({ childId: scope.childId, date: scope.dateKey, checklist: rows, blocks: [] })
const target: PreCompletionScanTarget = { ...scope, itemId: 'original', scanId: 'scan-A' }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function preScan(dayLog: DayLog, shared = { current: null as object | null }) {
  const result = deferred<{ id: string; results: { pageType: string } } | null>()
  const runScan = vi.fn(() => result.promise)
  const writeChecklistRow = vi.fn().mockResolvedValue({ status: 'done' })
  const setPreCompletionTarget = vi.fn()
  const setSnackMessage = vi.fn()
  const handler = bind<(file: File, index: number) => Promise<void>>(callback('handlePreCompletionScan'), {
    dayLog, familyId: scope.familyId, selectedChildId: scope.childId, today: scope.dateKey,
    hasPersistentChecklistId, preCompletionRequestRef: shared, setPreCompletionTarget,
    setScanItemIndex: vi.fn(), setSnackMessage, captureMayRouteToCurriculum: () => false,
    resolveTodayRow: () => ({ kind: 'workbook' }), activityConfigs: [], activityConfigsState: 'ready',
    runScan, writeChecklistRow, captureRowWriteNotice: () => null,
  })
  return { handler, runScan, writeChecklistRow, setPreCompletionTarget, setSnackMessage, result }
}

// Execute the actual file-input onClick, including the immutable callback that
// survives the camera being open. No second implementation of the UI gate.
const checklistSource = readFileSync(join(process.cwd(), 'src/features/today/TodayChecklist.tsx'), 'utf8')
const checklistAst = ts.createSourceFile('TodayChecklist.tsx', checklistSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let cameraCode = ''
function findCamera(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(checklistAst) === 'Button'
    && node.children.some((child) => ts.isJsxText(child) && child.text.includes('Scan lesson to check'))) {
    const attribute = node.openingElement.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(checklistAst) === 'onClick')
    if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) cameraCode = attribute.initializer.expression!.getText(checklistAst)
  }
  ts.forEachChild(node, findCamera)
}
findCamera(checklistAst)
if (!cameraCode) throw new Error('Actual scan camera caller not found')

describe('persistent pre-completion scan identity', () => {
  it('resolves only the original ID after reorder, never a same-name replacement', () => {
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row('other'), row('original')]))).toBe(1)
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row('replacement')]))).toBeNull()
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row('original'), row('original')]))).toBeNull()
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', day([row()]))).toBeNull()
  })

  it.each(['familyId', 'childId', 'dateKey', 'scanId', 'itemId'] as const)('rejects a mismatched %s binding', (field) => {
    expect(resolvePreCompletionScanIndex({ ...target, [field]: 'wrong' }, scope, 'scan-A', day([row('original')]))).toBeNull()
  })

  it.each([undefined, '', ' ', 7])('never starts a scan from an unprepared/invalid captured ID %s', async (id) => {
    const captured = day([row(id as string | undefined)])
    const h = preScan(captured)
    // A later identified snapshot does not alter the camera callback's origin.
    day([row('newly-prepared')])
    await h.handler(new File(['x'], 'scan.jpg'), 0)
    expect(h.runScan).not.toHaveBeenCalled()
    expect(h.writeChecklistRow).not.toHaveBeenCalled()
  })

  it('legacy camera tap prepares without opening a camera, then requires a fresh identified tap', async () => {
    const input = { click: vi.fn(), onchange: null as unknown }
    const createElement = vi.fn(() => input)
    const prepareWrite = vi.fn().mockResolvedValue('ready')
    const notice = vi.fn()
    const prepare = bind<() => Promise<void>>(callback('handlePreparePreCompletionScan'), {
      familyId: scope.familyId, selectedChildId: scope.childId, today: scope.dateKey, preparingScanRows: false, canEditLiveDay: true,
      setPreparingScanRows: vi.fn(), prepareDayChecklistIdentitiesGuarded: prepareWrite,
      doc: (collection: string, id: string) => `${collection}/${id}`, daysCollection: () => 'days',
      dayLogDocId: () => 'selected-day', setSnackMessage: notice,
    })
    let preparing: Promise<void> | undefined
    const common = { hasPersistentChecklistId, index: 0, document: { createElement }, onPreCompletionScan: vi.fn(), onPreparePreCompletionScan: () => { preparing = prepare() } }
    bind<() => void>(cameraCode, { ...common, item: row() })()
    await preparing
    expect(prepareWrite).toHaveBeenCalledOnce()
    expect(createElement).not.toHaveBeenCalled()
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Tap Scan lesson again') }))
    bind<() => void>(cameraCode, { ...common, item: row('prepared') })()
    expect(input.click).toHaveBeenCalledOnce()
  })

  it('the preparation write entrypoint refuses a profile without parent edit capability', async () => {
    const prepareDayChecklistIdentitiesGuarded = vi.fn()
    const handler = bind<() => Promise<void>>(callback('handlePreparePreCompletionScan'), {
      canEditLiveDay: false, familyId: scope.familyId, selectedChildId: scope.childId, preparingScanRows: false,
      prepareDayChecklistIdentitiesGuarded, setPreparingScanRows: vi.fn(),
    })
    await handler()
    expect(prepareDayChecklistIdentitiesGuarded).not.toHaveBeenCalled()
  })

  it('camera closure captures the identified row before a replacement render', async () => {
    const original = day([row('original')])
    const h = preScan(original)
    let pending: Promise<void> | undefined
    const input = { click: vi.fn(), onchange: null as unknown }
    bind<() => void>(cameraCode, {
      item: original.checklist![0], index: 0, hasPersistentChecklistId,
      document: { createElement: () => input },
      onPreCompletionScan: (file: File, index: number) => { pending = h.handler(file, index) },
    })()
    const replacement = day([row('fresh-plan-id')])
    ;(input.onchange as (event: unknown) => void)({ target: { files: [new File(['x'], 'scan.jpg')] } })
    h.result.resolve({ id: 'scan-A', results: { pageType: 'worksheet' } })
    await pending
    expect(h.writeChecklistRow).toHaveBeenCalledWith(expect.objectContaining({ itemKey: 'original', requireUniqueIdentity: true, familyId: scope.familyId, childId: scope.childId, dateKey: scope.dateKey }))
    expect(h.setPreCompletionTarget).toHaveBeenLastCalledWith(target)
    expect(resolvePreCompletionScanIndex(target, scope, 'scan-A', replacement)).toBeNull()
  })

  it('out-of-order scan returns cannot bind an older result to a newer target', async () => {
    const shared = { current: null as object | null }
    const first = preScan(day([row('first')]), shared)
    const second = preScan(day([row('second')]), shared)
    const a = first.handler(new File(['a'], 'a.jpg'), 0)
    const b = second.handler(new File(['b'], 'b.jpg'), 0)
    second.result.resolve({ id: 'scan-B', results: { pageType: 'worksheet' } })
    await b
    first.result.resolve({ id: 'scan-A', results: { pageType: 'worksheet' } })
    await a
    expect(first.setPreCompletionTarget).toHaveBeenCalledTimes(1)
    expect(first.setPreCompletionTarget).toHaveBeenCalledWith(null)
    const bound = second.setPreCompletionTarget.mock.calls.at(-1)![0] as PreCompletionScanTarget
    expect(resolvePreCompletionScanIndex(bound, scope, 'scan-A', day([row('second')]))).toBeNull()
    expect(resolvePreCompletionScanIndex(bound, scope, 'scan-B', day([row('second')]))).toBe(0)
  })
})
