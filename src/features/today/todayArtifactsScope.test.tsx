import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useCallback, useEffect, useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDocs, query, where } from 'firebase/firestore'
import { artifactsCollection } from '../../core/firebase/firestore'
import type { Artifact, Child } from '../../core/types'
import UnifiedCaptureCard from './UnifiedCaptureCard'
import { useUnifiedCapture } from './useUnifiedCapture'
import { useTodayArtifacts } from './useTodayArtifacts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
type Read = ReturnType<typeof deferred<{ docs: { data: () => Artifact }[] }>>
const reads: Read[] = []
const writes: { collection: string; data: Record<string, unknown> }[] = []
let pendingWrite: ReturnType<typeof deferred<{ id: string }>> | undefined
const strandSave = vi.fn()
const snack = vi.fn()
vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  getDocs: vi.fn(() => {
    const read = deferred<{ docs: { data: () => Artifact }[] }>()
    reads.push(read)
    return read.promise
  }),
  addDoc: vi.fn((collection: string, data: Record<string, unknown>) => {
    writes.push({ collection, data })
    return pendingWrite?.promise ?? Promise.resolve({ id: `saved-${writes.length}` })
  }),
  doc: (...args: unknown[]) => args,
  updateDoc: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: (familyId: string) => `${familyId}/artifacts`,
  hoursCollection: (familyId: string) => `${familyId}/hours`,
}))
vi.mock('../../core/firebase/upload', () => ({
  generateFilename: (ext: string) => `file.${ext}`,
  uploadArtifactFile: vi.fn(() => Promise.resolve({ downloadUrl: 'https://example.test/file' })),
}))
vi.mock('../shelly-chat/useChatActivityConfigs', () => ({ useChatActivityConfigs: () => [] }))
vi.mock('../../core/hooks/useActiveChild', () => ({ useActiveChild: () => ({ isChildProfile: false }) }))
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({ scan: async () => null, clearScan: vi.fn() }),
}))
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: vi.fn() }),
}))
vi.mock('./captureRowWrite', () => ({ writeCaptureRow: async () => ({ status: 'done' }), captureRowWriteNotice: () => null }))
vi.mock('../../core/utils/downscaleImage', () => ({ downscaleImage: async (file: File) => file }))
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onCaptureBatch }: { onCaptureBatch: (files: File[]) => void }) =>
    <button onClick={() => onCaptureBatch([new File(['photo'], 'photo.jpg')])}>Commit photo</button>,
}))
vi.mock('../../components/AudioRecorder', () => ({
  default: ({ onCapture }: { onCapture: (file: File) => void }) =>
    <button onClick={() => onCapture(new File(['audio'], 'audio.webm'))}>Commit audio</button>,
}))

type Scope = { familyId: string; selectedChildId: string; today: string }
const initial: Scope = { familyId: 'family-a', selectedChildId: 'child-a', today: '2026-09-15' }
const changedScopes = [
  { ...initial, selectedChildId: 'child-b' },
  { ...initial, today: '2026-09-16' },
  { ...initial, familyId: 'family-b' },
]
const children = [{ id: 'child-a', name: 'Child A' }, { id: 'child-b', name: 'Child B' }] as Child[]
const row = (id: string, childId = 'child-a', dayLogId = initial.today): Artifact => ({
  id, childId, dayLogId, title: id, type: 'Note', content: id,
  createdAt: '2026-09-15T12:00:00.000Z',
  tags: { engineStage: 'Build', domain: '', subjectBucket: 'Other', location: 'Home' },
}) as Artifact

/**
 * Compile the actual page's evidence statements, unchanged, into a small hook
 * host. This omits unrelated subscriptions/dialogs, not the logic under test.
 * The real card and useUnifiedCapture call those actual callbacks below.
 * Setting TODAY_ARTIFACTS_PAGE_SOURCE to a saved original file runs exactly the
 * same regression against the original implementation (positive control).
 */
const pageSource = readFileSync(process.env.TODAY_ARTIFACTS_PAGE_SOURCE ?? resolve(__dirname, 'TodayPage.tsx'), 'utf8')
const sourceFile = ts.createSourceFile('TodayPage.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const page = sourceFile.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === 'TodayPage')!
const names = /\b(todayArtifacts|todayArtifactsFailed|artifactScope|artifactScopeRef|loadTodayArtifacts|handleUnifiedCapture|handleLogStrandSession)\b/
const statements = page.body!.statements.filter((statement) => {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(d => names.test(d.name.getText(sourceFile)))
  return ts.isExpressionStatement(statement) && /^useEffect\(/.test(statement.getText(sourceFile)) && /artifactScope|loadTodayArtifacts/.test(statement.getText(sourceFile))
}).map(s => s.getText(sourceFile)).join('\n')
if (!statements.includes('handleLogStrandSession') || !statements.includes('loadTodayArtifacts')) throw new Error('Page evidence probe lost its real route')
type PageEvidence = {
  todayArtifacts: Artifact[]; todayArtifactsFailed: boolean
  setTodayArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  loadTodayArtifacts: () => void
  handleUnifiedCapture: (file: File, index: number) => Promise<boolean>
  handleUnifiedCaptureBatch: (files: File[], index: number) => Promise<void>
  handleLogStrandSession: (topic: string, evidence: { note: string }) => Promise<void>
}
const dependencies = {
  useCallback, useEffect, useRef, useState, getDocs, query, where, artifactsCollection, useUnifiedCapture, useTodayArtifacts,
  setSnackMessage: snack, logStrandSession: strandSave,
  StrandSessionRefused: Error, StrandSessionFailure: Error, STRAND_SESSION_FAILED_CLEAN: 'failed',
}
const probe = ts.transpileModule(`return function usePageEvidence({ familyId, selectedChildId, today }) {
  const activeChild = { name: 'Synthetic child' };
  const dayLog = { checklist: [{ label: 'Synthetic activity', completed: false }] };
  const activityConfigs = []; const activityConfigsState = 'settled';
  const strandSessionConfig = { id: 'synthetic-strand' };
  const [, setStrandSessionId] = useState(null);
  const [, setStrandSessionSaving] = useState(false);
  const [, setStrandSessionError] = useState(null);
  ${statements}
  return { todayArtifacts, todayArtifactsFailed, setTodayArtifacts, loadTodayArtifacts,
    handleUnifiedCapture, handleUnifiedCaptureBatch, handleLogStrandSession };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const usePageEvidence = new Function(...Object.keys(dependencies), probe)(...Object.values(dependencies)) as (scope: Scope) => PageEvidence

function Host(scope: Scope) {
  const evidence = usePageEvidence(scope)
  return <MemoryRouter><UnifiedCaptureCard {...scope} weekPlanId="week" selectableChildren={children}
    todayArtifacts={evidence.todayArtifacts} setTodayArtifacts={evidence.setTodayArtifacts}
    artifactsFailed={evidence.todayArtifactsFailed} onSnackMessage={snack} />
    <output data-testid="rows">{evidence.todayArtifacts.map(a => a.id).join(',')}</output>
  </MemoryRouter>
}
async function settle(read: Read, rows: Artifact[] = []) {
  await act(async () => read.resolve({ docs: rows.map(a => ({ data: () => a })) }))
}
beforeEach(() => { reads.length = 0; writes.length = 0; pendingWrite = undefined; vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

async function saveCard(mode: 'note' | 'photo' | 'audio') {
  if (mode === 'note') {
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), { target: { value: 'Synthetic note' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /save capture/i })))
  } else if (mode === 'photo') {
    fireEvent.click(screen.getByRole('button', { name: '📷 Photo' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Commit photo' })))
  } else {
    fireEvent.click(screen.getByRole('button', { name: /audio/i }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Commit audio' })))
  }
}

describe('UX-367: actual Today evidence readers and save callbacks', () => {
  it('keeps the explicit other-child note out of the displayed child and preserves its writes', async () => {
    render(<Host {...initial} />)
    await settle(reads[0])
    fireEvent.mouseDown(screen.getByLabelText(/^child$/i))
    fireEvent.click(await screen.findByRole('option', { name: 'Child B' }))
    fireEvent.change(screen.getByLabelText(/^note \(optional\)$/i), { target: { value: 'Synthetic note' } })
    fireEvent.change(screen.getByLabelText(/duration in minutes/i), { target: { value: '27.9' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /save capture/i })))
    expect(writes[0]).toMatchObject({ collection: 'family-a/artifacts', data: { childId: 'child-b', dayLogId: initial.today, content: 'Synthetic note', type: 'Note' } })
    expect(writes[1]).toEqual({ collection: 'family-a/hours', data: {
      childId: 'child-b', date: initial.today, minutes: 27, subjectBucket: 'Other', location: 'Home',
      source: 'unified-capture', quickCapture: true, notes: 'Synthetic note',
    } })
    expect(screen.getByTestId('rows')).toHaveTextContent(/^$/)
  })

  it.each(['note', 'photo', 'audio'] as const)('shows a matching %s save and pins its artifact payload', async (mode) => {
    // Recording now while viewing a past day must not change either field.
    const recordedAt = '2026-09-20T23:42:00.000Z'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(recordedAt))
    render(<Host {...initial} />)
    await settle(reads[0])
    await saveCard(mode)
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('saved-1'))
    expect(writes).toEqual([{ collection: 'family-a/artifacts', data: {
      title: mode === 'note' ? 'Synthetic note' : `${mode === 'photo' ? 'Photo' : 'Audio'} ${initial.today}`,
      type: mode === 'note' ? 'Note' : mode === 'photo' ? 'Photo' : 'Audio',
      createdAt: recordedAt, childId: initial.selectedChildId, dayLogId: initial.today,
      weekPlanId: 'week', tags: { engineStage: 'Build', domain: '', subjectBucket: 'Other', location: 'Home' },
      notes: '', activityName: undefined, ...(mode === 'note' ? { content: 'Synthetic note' } : {}),
    } }])
    expect(reads).toHaveLength(2) // each real save asks for a successful day read
  })

  describe.each(['note', 'photo', 'audio'] as const)('%s callbacks retain their originating scope', (mode) => {
    it.each(changedScopes)('ignores a pending save after switching to %j and retrieves it on return', async (next) => {
      const { rerender } = render(<Host {...initial} />)
      await settle(reads[0])
      pendingWrite = deferred<{ id: string }>()
      await saveCard(mode)
      expect(writes).toHaveLength(1)
      rerender(<Host {...next} />)
      await settle(reads.at(-1)!)
      await act(async () => pendingWrite!.resolve({ id: 'saved-original' }))
      expect(screen.getByTestId('rows')).toHaveTextContent(/^$/)
      expect(writes[0]).toMatchObject({ collection: 'family-a/artifacts', data: { childId: 'child-a', dayLogId: initial.today } })
      rerender(<Host {...initial} />)
      await settle(reads.at(-1)!, [{ ...writes[0].data, id: 'saved-original' } as unknown as Artifact])
      expect(screen.getByTestId('rows')).toHaveTextContent('saved-original')
    })

    it('does not display a save made using the explicit other-child selector', async () => {
      render(<Host {...initial} />)
      await settle(reads[0])
      fireEvent.mouseDown(screen.getByLabelText(/^child$/i))
      fireEvent.click(await screen.findByRole('option', { name: 'Child B' }))
      await saveCard(mode)
      expect(writes[0].data.childId).toBe('child-b')
      expect(screen.getByTestId('rows')).toHaveTextContent(/^$/)
    })
  })

  it('hides loaded evidence as soon as the child changes, before its read settles', async () => {
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    await settle(reads[0], [row('old')])
    rerender({ ...initial, selectedChildId: 'child-b' })
    expect(result.current.todayArtifacts).toEqual([])
  })

  it('rejects the first A read after A → B → A', async () => {
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    rerender({ ...initial, selectedChildId: 'child-b' })
    rerender(initial)
    await settle(reads[2], [row('new-A')])
    await settle(reads[0], [row('old-A')])
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['new-A'])
  })

  it.each(changedScopes)('rejects old reads and clears loaded rows on %j', async (next) => {
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    await settle(reads[0], [row('old')])
    act(() => result.current.loadTodayArtifacts())
    const oldRead = reads.at(-1)!
    rerender(next)
    expect(result.current.todayArtifacts).toEqual([])
    await settle(reads.at(-1)!, [row('new', next.selectedChildId, next.today)])
    await settle(oldRead, [row('old')])
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['new'])
  })

  it.each(['familyId', 'selectedChildId', 'today'] as const)('an empty %s hides the previous scope without reading', async (key) => {
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    await settle(reads[0], [row('old')])
    rerender({ ...initial, [key]: '' })
    expect(result.current.todayArtifacts).toEqual([])
    expect(reads).toHaveLength(1)
  })

  it('rejects an older same-scope reload, including a late failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(usePageEvidence, { initialProps: initial })
    act(() => result.current.loadTodayArtifacts())
    await settle(reads[1], [row('latest')])
    await act(async () => reads[0].reject(new Error('late failure')))
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['latest'])
    expect(result.current.todayArtifactsFailed).toBe(false)
    expect(snack).not.toHaveBeenCalled()
  })

  it('a pre-save same-scope query cannot erase an actual unified capture', async () => {
    const { result } = renderHook(usePageEvidence, { initialProps: initial })
    await act(async () => { expect(await result.current.handleUnifiedCapture(new File(['photo'], 'photo.jpg'), 0)).toBe(true) })
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['saved-1'])
    await settle(reads[0])
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['saved-1'])
    await settle(reads.at(-1)!, [{ ...writes[0].data, id: 'saved-1' } as unknown as Artifact])
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['saved-1'])
  })

  it.each(changedScopes)('the actual unified-capture callback ignores a pending save after %j', async (next) => {
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    pendingWrite = deferred<{ id: string }>()
    let saving!: Promise<boolean>
    await act(async () => { saving = result.current.handleUnifiedCapture(new File(['photo'], 'photo.jpg'), 0) })
    expect(writes).toHaveLength(1)
    rerender(next)
    await act(async () => { pendingWrite!.resolve({ id: 'old-photo' }); await saving })
    expect(result.current.todayArtifacts).toEqual([])
    expect(writes[0]).toMatchObject({ collection: 'family-a/artifacts', data: { childId: 'child-a', dayLogId: initial.today } })
  })

  it('ignores a capture completing after A → B → A, including its old refresh', async () => {
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    pendingWrite = deferred<{ id: string }>()
    let saving!: Promise<boolean>
    await act(async () => { saving = result.current.handleUnifiedCapture(new File(['photo'], 'photo.jpg'), 0) })
    rerender(changedScopes[0])
    rerender(initial)
    await settle(reads.at(-1)!, [row('second-visit')])
    const readCount = reads.length
    await act(async () => { pendingWrite!.resolve({ id: 'old-photo' }); await saving })
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['second-visit'])
    expect(reads).toHaveLength(readCount)
  })

  it('keeps failed-read semantics until the post-save read actually succeeds (UX-441)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(usePageEvidence, { initialProps: initial })
    await act(async () => reads[0].reject(new Error('synthetic read failure')))
    expect(result.current.todayArtifactsFailed).toBe(true)
    await act(async () => { await result.current.handleUnifiedCapture(new File(['photo'], 'photo.jpg'), 0) })
    expect(result.current.todayArtifactsFailed).toBe(true)
    await act(async () => reads.at(-1)!.reject(new Error('synthetic refresh failure')))
    expect(result.current.todayArtifactsFailed).toBe(true)
    expect(result.current.todayArtifacts).toEqual([])
    act(() => result.current.loadTodayArtifacts())
    await settle(reads.at(-1)!, [row('saved-photo')])
    expect(result.current.todayArtifactsFailed).toBe(false)
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['saved-photo'])
  })

  it('the real batch capture keeps every matching page through older reads', async () => {
    const { result } = renderHook(usePageEvidence, { initialProps: initial })
    await act(async () => { await result.current.handleUnifiedCaptureBatch([new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')], 0) })
    await settle(reads[0])
    await settle(reads[1])
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['saved-2', 'saved-1'])
    expect(writes).toHaveLength(2)
    expect(writes.every(w => w.collection === 'family-a/artifacts')).toBe(true)
  })

  it.each(changedScopes)('the actual strand-session callback ignores a pending save after %j', async (next) => {
    const pending = deferred<{ artifacts: Artifact[] }>()
    strandSave.mockReturnValue(pending.promise)
    const { result, rerender } = renderHook(usePageEvidence, { initialProps: initial })
    let saving!: Promise<void>
    act(() => { saving = result.current.handleLogStrandSession('Synthetic topic', { note: 'evidence' }) })
    rerender(next)
    await act(async () => { pending.resolve({ artifacts: [row('strand')] }); await saving })
    expect(result.current.todayArtifacts).toEqual([])
    expect(strandSave).toHaveBeenCalledWith({ familyId: 'family-a', childId: 'child-a', dayLogId: initial.today,
      config: { id: 'synthetic-strand' }, topic: 'Synthetic topic', evidence: { note: 'evidence' } })
  })

  it('dedupes repeated strand evidence and reconciles a failed read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    strandSave.mockResolvedValue({ artifacts: [row('strand'), row('strand')] })
    const { result } = renderHook(usePageEvidence, { initialProps: initial })
    await act(async () => reads[0].reject(new Error('synthetic failure')))
    await act(async () => { await result.current.handleLogStrandSession('topic', { note: 'evidence' }) })
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['strand'])
    expect(result.current.todayArtifactsFailed).toBe(true)
    await settle(reads.at(-1)!, [row('strand')])
    expect(result.current.todayArtifactsFailed).toBe(false)
    await act(async () => { await result.current.handleLogStrandSession('topic', { note: 'evidence' }) })
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['strand'])
  })

  it('does not invent child/day attribution for ambiguous saved rows or query results', async () => {
    strandSave.mockResolvedValue({ artifacts: [row('valid'), row('other', 'child-b'), row('undated', 'child-a', '')] })
    const { result } = renderHook(usePageEvidence, { initialProps: initial })
    await act(async () => { await result.current.handleLogStrandSession('topic', { note: 'evidence' }) })
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['valid'])
    await settle(reads.at(-1)!, [row('valid'), row('wrong-day', 'child-a', '2026-09-14'), row('unknown', '')])
    expect(result.current.todayArtifacts.map(a => a.id)).toEqual(['valid'])
  })
})
