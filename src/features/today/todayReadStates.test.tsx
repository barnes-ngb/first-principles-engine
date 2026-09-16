import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import * as jsx from 'react/jsx-runtime'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scansCollection } from '../../core/firebase/firestore'
import { effectiveRecommendation, isWorksheetScan } from '../../core/types'
import type { DayLog, ScanRecord } from '../../core/types'
import { PlanType } from '../../core/types/enums'
import KidRitualRow from './KidRitualRow'
import TodayChecklist from './TodayChecklist'
import { useTodayMiningMinutes } from './useTodayMiningMinutes'
import { useUnappliedDraft } from './useUnappliedDraft'
import { selectTodayDayBanner } from './unappliedDraft'

type Snapshot = { docs: { id: string; data: () => unknown }[] }
type Read = { target: unknown; resolve: (value: Snapshot) => void; reject: (error: Error) => void }
type Subscription = { target: unknown; next: (value: unknown) => void; error: (error: Error) => void; off: ReturnType<typeof vi.fn> }
const reads: Read[] = []
const subscriptions: Subscription[] = []
vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args, where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args, limit: (...args: unknown[]) => args,
  doc: (...args: unknown[]) => args,
  getDocs: vi.fn((target: unknown) => new Promise<Snapshot>((resolve, reject) => { reads.push({ target, resolve, reject }) })),
  onSnapshot: vi.fn((target: unknown, next: Subscription['next'], error: Subscription['error']) => {
    const off = vi.fn(); subscriptions.push({ target, next, error, off }); return off
  }),
  getDoc: vi.fn(), updateDoc: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  hoursCollection: (family: string) => `${family}/hours`, scansCollection: (family: string) => `${family}/scans`,
  plannerConversationsCollection: (family: string) => `${family}/plannerConversations`,
  plannerConversationDocId: (week: string, child: string) => `${week}_${child}`,
}))
vi.mock('../../components/PhotoCapture', () => ({ default: () => null }))
vi.mock('../../components/ScanResultsPanel', () => ({ default: () => null }))
vi.mock('../../components/ScanAnalysisPanel', () => ({ default: ({ scan }: { scan: ScanRecord }) => <div>SCAN PANEL {scan.id}</div> }))
vi.mock('./LessonVideoDialog', () => ({ default: () => null }))
vi.mock('./HelpCardStrip', () => ({ default: () => null }))

// Execute the real page statements and JSX. Only unrelated live page sections
// are omitted; failure copy, callbacks, consumer props and row decisions remain
// source-derived. A reviewer can replace these source files in isolated scratch
// and run this same suite as a reversion control.
const pageSource = readFileSync(resolve(__dirname, 'TodayPage.tsx'), 'utf8')
const pageAst = ts.createSourceFile('TodayPage.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const kidSource = readFileSync(resolve(__dirname, 'KidTodayView.tsx'), 'utf8')
const kidAst = ts.createSourceFile('KidTodayView.tsx', kidSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const scanStatements = pageSource.slice(pageSource.indexOf('  const scanScope ='), pageSource.indexOf('  /** Map energy level'))
if (!scanStatements.includes('getDocs(q)') || !scanStatements.includes('onSnapshot(')) throw new Error('Lost actual scan read statements')
let miningJsx = ''
let bannerJsx = ''
const scanNotices: string[] = []
const scanProps: string[] = []
function visitKid(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(kidAst) === 'KidRitualRow'
    && /title="Knowledge Mine"/.test(node.openingElement.getText(kidAst))) miningJsx = node.getText(kidAst)
  ts.forEachChild(node, visitKid)
}
function visitPage(node: ts.Node) {
  if (ts.isJsxExpression(node) && node.expression && node.getText(pageAst).includes('const banner = selectTodayDayBanner')) bannerJsx = node.expression.getText(pageAst)
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(pageAst) === 'SectionErrorBoundary'
    && /section="checklist"/.test(node.openingElement.getText(pageAst))) {
    for (const child of node.children) {
      if (ts.isJsxExpression(child) && /feedbackRead.status|recentScansRead.status/.test(child.getText(pageAst))) scanNotices.push(child.getText(pageAst))
      if (ts.isJsxSelfClosingElement(child) && child.tagName.getText(pageAst) === 'TodayChecklist') {
        for (const attribute of child.attributes.properties) {
          if (ts.isJsxAttribute(attribute) && /^(scanFeedbackBySubject|scanFeedbackAvailable|recentScans|recentScansAvailable)$/.test(attribute.name.getText(pageAst))) scanProps.push(attribute.getText(pageAst))
        }
      }
    }
  }
  ts.forEachChild(node, visitPage)
}
visitKid(kidAst); visitPage(pageAst)
if (!miningJsx || !bannerJsx || scanNotices.length !== 4 || scanProps.length !== 4) throw new Error('Lost actual Today read consumers')
function compile<T>(body: string, dependencies: Record<string, unknown>): T {
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.ReactJSX } }).outputText
  return new Function('exports', 'require', ...Object.keys(dependencies), js)({}, () => jsx, ...Object.values(dependencies)) as T
}
type Scope = { familyId: string; childId: string; day: string; week: string }
const initial: Scope = { familyId: 'f1', childId: 'c1', day: '2026-09-15', week: '2026-09-14' }
const scan = (id = 'scan-1', topic = 'addition'): ScanRecord => ({
  id, childId: 'c1', results: { pageType: 'worksheet', subject: 'Math', specificTopic: topic, recommendation: 'skip', estimatedMinutes: 10 },
}) as ScanRecord
const snapshot = (data: unknown[] = []): Snapshot => ({ docs: data.map((value, i) => ({ id: `scan-${i + 1}`, data: () => value })) })
const draftSnapshot = (hasItems: boolean) => ({ exists: () => hasItems, data: () => ({ status: 'draft', currentDraft: { days: [{ items: [{ accepted: true }] }] } }) })
const fail = () => new Error('synthetic offline')
const navigate = vi.fn()
const Mining = compile<(scope: Scope) => ReactNode>(`return function Mining({familyId, childId, day}) {
  const miningRead = useTodayMiningMinutes(familyId, childId, day);
  const isLincoln = false; const kidPalette = {};
  return (${miningJsx});
}`, { useTodayMiningMinutes, KidRitualRow, Button, navigate })
const DraftBanner = compile<(scope: Scope) => ReactNode>(`return function DraftBanner({familyId, childId, week}) {
  const draftRead = useUnappliedDraft(familyId, childId, week);
  const selectedDate = '2026-09-16'; const realToday = '2026-09-15';
  const isToday = false; const dayLog = { checklist: [] }; const selectedDayName = 'Wednesday';
  return (${bannerJsx});
}`, { useUnappliedDraft, selectTodayDayBanner, Alert, Button, Typography, navigate })
type ScanResult = { feedbackRead: { status: string }; recentScansRead: { status: string }; scanFeedbackBySubject: Record<string, { topic: string }>; todayRecentScans: ScanRecord[]; retryScanFeedback: () => void; retryRecentScans: () => void }
const scanDependencies = { useCallback, useEffect, useState, getDocs, query, where, orderBy, limit, onSnapshot, scansCollection, effectiveRecommendation, isWorksheetScan }
const usePageScanReads = compile<(scope: Scope) => ScanResult>(`return function usePageScanReads({familyId, childId: selectedChildId}) {
  ${scanStatements}
  return { feedbackRead, recentScansRead, scanFeedbackBySubject, todayRecentScans, retryScanFeedback, retryRecentScans };
}`, scanDependencies)
const ScanConsumer = compile<(props: ScanResult & { children?: ReactNode }) => ReactNode>(`return function ScanConsumer({ feedbackRead, recentScansRead, scanFeedbackBySubject, todayRecentScans, retryScanFeedback, retryRecentScans }) {
  return <>${scanNotices.join('\n')}<ChecklistFixture ${scanProps.join('\n')} /></>;
}`, { Alert, Button, Typography, ChecklistFixture })
function ChecklistFixture(props: { scanFeedbackBySubject: Record<string, { topic: string; recommendation: 'skip' }>; scanFeedbackAvailable: boolean; recentScans: ScanRecord[]; recentScansAvailable: boolean }) {
  return <MemoryRouter><TodayChecklist
    dayLog={{ id: initial.day, date: initial.day, childId: 'c1', blocks: [], checklist: [
      { label: 'GATB Math (30m)', completed: false, subjectBucket: 'Math', itemType: 'workbook' },
      { label: 'Saved page', completed: true, subjectBucket: 'Math', evidenceArtifactId: 'artifact-1', evidenceCollection: 'artifacts', pendingScanId: 'scan-1' },
      { label: 'Independent photo', completed: true, evidenceArtifactId: 'photo-1', evidenceCollection: 'artifacts' },
      { label: 'Known guidance', completed: false, skipGuidance: 'Stored plan guidance', subjectBucket: 'Science' },
    ] } as DayLog}
    selectedChild={{ name: 'Synthetic', id: 'c1' }} selectedChildId="c1" familyId="f1" today={initial.day} isToday planType={PlanType.Normal}
    todaySnapshot={null} activeRoutineItems={undefined} persistDayLogImmediate={vi.fn()} onTeachHelperOpen={vi.fn()}
    onUnifiedCapture={vi.fn()} onPreCompletionScan={vi.fn()} captureLoading={false} captureItemIndex={null}
    scanResult={null} scanError={null} onScanAddToPlan={vi.fn()} onScanSkip={vi.fn()} onClearScan={vi.fn()}
    onPrintMaterials={vi.fn()} printingMaterials={false} {...props}
  /></MemoryRouter>
}
function ScanHost(scope: Scope) { return <ScanConsumer {...usePageScanReads(scope)} /> }
function retryNotice(text: string) {
  const alert = screen.getByText(text).closest('[role="alert"]')!
  fireEvent.click(within(alert as HTMLElement).getByRole('button', { name: 'Try again' }))
}
beforeEach(() => {
  reads.length = 0; subscriptions.length = 0; vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Today mining read and real kid row', () => {
  it('distinguishes loading/failure/empty, and retries without blocking mining', async () => {
    render(<Mining {...initial} />)
    expect(screen.getByText('Checking mining time…')).toBeInTheDocument()
    expect(screen.queryByText('No mining yet today')).toBeNull()
    await act(async () => reads[0].reject(fail()))
    expect(screen.getByText('Mining time is unavailable.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start Mining/ }))
    expect(navigate).toHaveBeenCalledWith('/quest')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await act(async () => reads[1].resolve(snapshot()))
    expect(screen.getByText('No mining yet today')).toBeInTheDocument()
  })
  it.each([[[], 0], [[{ minutes: 12 }, { minutes: 15 }], 25], [[{ minutes: 1 }], 5], [[{ minutes: -3 }], 0], [[{}, { minutes: 10 }], 10]])('preserves the query and arithmetic for %j', async (values, minutes) => {
    const { result } = renderHook(() => useTodayMiningMinutes(initial.familyId, initial.childId, initial.day))
    expect(reads[0].target).toEqual(['f1/hours', ['childId', '==', 'c1'], ['date', '==', initial.day], ['source', '==', 'knowledge-mine']])
    await act(async () => reads[0].resolve(snapshot(values as unknown[])))
    expect(result.current).toMatchObject({ status: 'ready', minutes })
  })
  it.each([{ ...initial, familyId: 'f2' }, { ...initial, childId: 'c2' }, { ...initial, day: '2026-09-16' }])('rejects the previous read and resets scoped totals: %j', async (next) => {
    const { result, rerender } = renderHook((s) => useTodayMiningMinutes(s.familyId, s.childId, s.day), { initialProps: initial })
    rerender(next)
    await act(async () => reads[0].resolve(snapshot([{ minutes: 90 }])))
    expect(result.current).toMatchObject({ status: 'loading', minutes: null })
    await act(async () => reads[1].resolve(snapshot([{ minutes: 10 }])))
    expect(result.current.minutes).toBe(10)
    rerender(initial)
    expect(result.current).toMatchObject({ status: 'loading', minutes: null })
  })
  it('rejects retired A responses on A → B → A, and late unmount errors', async () => {
    const { result, rerender, unmount } = renderHook((s) => useTodayMiningMinutes(s.familyId, s.childId, s.day), { initialProps: initial })
    rerender({ ...initial, childId: 'c2' }); rerender(initial)
    await act(async () => reads[0].resolve(snapshot([{ minutes: 90 }])))
    expect(result.current).toMatchObject({ status: 'loading', minutes: null })
    unmount(); await act(async () => reads[2].reject(fail()))
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('Today draft read and actual parent banner', () => {
  it('never promises an empty upcoming day on failure and recovers by one retry', async () => {
    render(<DraftBanner {...initial} />)
    expect(screen.getByText("Checking this week's plan…")).toBeInTheDocument()
    await act(async () => subscriptions[0].error(fail()))
    expect(screen.queryByText(/Items will appear/)).toBeNull()
    retryNotice("Couldn't check this week's draft plan.")
    expect(subscriptions[0].off).toHaveBeenCalledOnce()
    await act(async () => subscriptions[0].next(draftSnapshot(true)))
    expect(screen.queryByRole('button', { name: 'Review & apply' })).toBeNull()
    await act(async () => subscriptions[1].next(draftSnapshot(false)))
    expect(screen.getByText(/Items will appear/)).toBeInTheDocument()
    await act(async () => subscriptions[1].next(draftSnapshot(true)))
    fireEvent.click(screen.getByRole('button', { name: 'Review & apply' }))
    expect(navigate).toHaveBeenCalledWith('/planner/chat')
    await act(async () => subscriptions[1].error(fail()))
    expect(screen.queryByRole('button', { name: 'Review & apply' })).toBeNull()
    expect(screen.getByText("Couldn't check this week's draft plan.")).toBeInTheDocument()
  })
  it.each([{ ...initial, familyId: 'f2' }, { ...initial, childId: 'c2' }, { ...initial, week: '2026-09-21' }])('binds callbacks to the originating family/child/week: %j', async (next) => {
    const { result, rerender } = renderHook((s) => useUnappliedDraft(s.familyId, s.childId, s.week), { initialProps: initial })
    expect(subscriptions[0].target).toEqual(['f1/plannerConversations', '2026-09-14_c1'])
    await act(async () => subscriptions[0].next(draftSnapshot(true)))
    rerender(next)
    expect(result.current).toMatchObject({ status: 'loading', hasDraft: null })
    await act(async () => subscriptions[0].error(fail()))
    expect(result.current.status).toBe('loading')
    await act(async () => subscriptions[1].next(draftSnapshot(false)))
    expect(result.current).toMatchObject({ status: 'ready', hasDraft: false })
  })
  it('rejects retired same-key callbacks and retries, limits repeated retry taps, and cleans unmount', async () => {
    const { result, rerender, unmount } = renderHook((s) => useUnappliedDraft(s.familyId, s.childId, s.week), { initialProps: initial })
    const oldRetry = result.current.retry
    rerender({ ...initial, childId: 'c2' }); rerender(initial)
    await act(async () => subscriptions[0].next(draftSnapshot(true)))
    expect(result.current.status).toBe('loading')
    await act(async () => subscriptions[2].error(fail()))
    act(() => oldRetry())
    expect(subscriptions).toHaveLength(3)
    act(() => { result.current.retry(); result.current.retry() })
    expect(subscriptions).toHaveLength(4)
    unmount()
    expect(subscriptions[3].off).toHaveBeenCalledOnce()
    vi.mocked(console.warn).mockClear()
    await act(async () => subscriptions[3].error(fail()))
    expect(console.warn).not.toHaveBeenCalled()
  })
})

describe('Today scan reads, actual notices and checklist consumers', () => {
  it('keeps empty advice separate from failure, each failed section retries independently', async () => {
    render(<ScanHost {...initial} />)
    expect(screen.getByText('Checking scan guidance…')).toBeInTheDocument()
    expect(screen.getByText('Loading recent scans…')).toBeInTheDocument()
    expect(screen.queryByText(/Scan a page to see if you should skip/)).toBeNull()
    expect(screen.getByText('Review pending')).toBeInTheDocument()
    expect(screen.getByText('Captured ✓')).toBeInTheDocument()
    expect(screen.getByText(/Stored plan guidance/)).toBeInTheDocument()
    await act(async () => { reads[0].reject(fail()); subscriptions[0].error(fail()) })
    expect(screen.queryByText(/Scan a page to see if you should skip/)).toBeNull()
    retryNotice("Couldn't load scan guidance.")
    expect(subscriptions).toHaveLength(1)
    await act(async () => reads[1].resolve(snapshot([scan()])))
    expect(screen.getByText(/Skip — already knows this/)).toBeInTheDocument()
    expect(screen.getByText("Couldn't load recent scans.")).toBeInTheDocument()
    retryNotice("Couldn't load recent scans.")
    expect(reads).toHaveLength(2)
    await act(async () => subscriptions[1].next(snapshot([scan()])))
    fireEvent.click(screen.getByText('Review this ▾'))
    expect(screen.getByText('SCAN PANEL scan-1')).toBeInTheDocument()
    await act(async () => subscriptions[1].error(fail()))
    expect(screen.queryByText('SCAN PANEL scan-1')).toBeNull()
    expect(screen.getByText('Review pending')).toBeInTheDocument()
    expect(screen.getByText(/Skip — already knows this/)).toBeInTheDocument()
  })
  it('successful empty reads keep the existing no-scan advice and captured evidence', async () => {
    render(<ScanHost {...initial} />)
    await act(async () => { reads[0].resolve(snapshot()); subscriptions[0].next(snapshot()) })
    expect(screen.getByText(/Scan a page to see if you should skip/)).toBeInTheDocument()
    expect(screen.getAllByText('Captured ✓')).toHaveLength(2)
    expect(screen.queryByText('Review pending')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('a feedback failure leaves known scan detail usable', async () => {
    render(<ScanHost {...initial} />)
    await act(async () => { reads[0].reject(fail()); subscriptions[0].next(snapshot([scan()])) })
    fireEvent.click(screen.getByText('Review this ▾'))
    expect(screen.getByText('SCAN PANEL scan-1')).toBeInTheDocument()
    expect(screen.getByText("Couldn't load scan guidance.")).toBeInTheDocument()
  })
  it.each([{ ...initial, familyId: 'f2' }, { ...initial, childId: 'c2' }])('clears and rejects stale family/child scan guidance: %j', async (next) => {
    const { result, rerender } = renderHook(usePageScanReads, { initialProps: initial })
    rerender(next)
    await act(async () => { reads[0].resolve(snapshot([scan('old', 'old topic')])); subscriptions[0].next(snapshot([scan('old')])) })
    expect(result.current.feedbackRead.status).toBe('loading')
    expect(result.current.scanFeedbackBySubject).toEqual({})
    expect(result.current.todayRecentScans).toEqual([])
    await act(async () => { reads[1].resolve(snapshot([scan()])); subscriptions[1].next(snapshot([scan('stored-wrong-id')])) })
    expect(result.current.scanFeedbackBySubject.Math.topic).toBe('addition')
    expect(result.current.todayRecentScans[0].id).toBe('scan-1')
    rerender(initial)
    expect(result.current.scanFeedbackBySubject).toEqual({})
    expect(result.current.todayRecentScans).toEqual([])
  })
  it('preserves cross-day query meaning and rejects A → B → A and unmount callbacks', async () => {
    const { result, rerender, unmount } = renderHook(usePageScanReads, { initialProps: initial })
    const oldRetryFeedback = result.current.retryScanFeedback
    const oldRetryScans = result.current.retryRecentScans
    const target = ['f1/scans', ['childId', '==', 'c1'], ['createdAt', 'desc'], [20]]
    expect(reads[0].target).toEqual(target); expect(subscriptions[0].target).toEqual(target)
    rerender({ ...initial, day: '2026-09-16' })
    expect(reads).toHaveLength(1); expect(subscriptions).toHaveLength(1)
    rerender({ ...initial, childId: 'c2' }); rerender(initial)
    await act(async () => { reads[0].resolve(snapshot([scan()])); subscriptions[0].next(snapshot([scan()])) })
    expect(result.current.feedbackRead.status).toBe('loading')
    expect(result.current.recentScansRead.status).toBe('loading')
    await act(async () => { reads[2].reject(fail()); subscriptions[2].error(fail()) })
    act(() => { oldRetryFeedback(); oldRetryScans() })
    expect(reads).toHaveLength(3); expect(subscriptions).toHaveLength(3)
    act(() => { result.current.retryScanFeedback(); result.current.retryScanFeedback(); result.current.retryRecentScans(); result.current.retryRecentScans() })
    expect(reads).toHaveLength(4); expect(subscriptions).toHaveLength(4)
    unmount(); vi.mocked(console.error).mockClear()
    await act(async () => { reads[3].reject(fail()); subscriptions[3].error(fail()) })
    expect(subscriptions[3].off).toHaveBeenCalledOnce()
    expect(console.error).not.toHaveBeenCalled()
  })
})
