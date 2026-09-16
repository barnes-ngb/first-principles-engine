import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

import ScanResultsPanel from './ScanResultsPanel'
import type { WorksheetScanResult } from '../core/types'
import { checklistItemKey } from '../features/today/dayWriteGuard'

// Execute the actual JSX call site so losing one of its scope dimensions makes
// this regression fail even when the isolated panel still handles a made-up key.
const callerSource = readFileSync(join(process.cwd(), 'src/features/today/TodayChecklist.tsx'), 'utf8')
const callerAst = ts.createSourceFile('TodayChecklist.tsx', callerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callSite = ''
let conditionalCallSite = ''
let rowKeySource = ''
function findCall(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(callerAst) === 'ScanResultsPanel') {
    callSite = node.getText(callerAst)
    let expression: ts.Node = node
    while (expression.parent && (ts.isBinaryExpression(expression.parent) || ts.isParenthesizedExpression(expression.parent))) expression = expression.parent
    conditionalCallSite = expression.getText(callerAst)
    let ancestor: ts.Node | undefined = node.parent
    while (ancestor) {
      if (ts.isJsxElement(ancestor)) {
        const key = ancestor.openingElement.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(callerAst) === 'key')
        if (key && ts.isJsxAttribute(key) && key.initializer && ts.isJsxExpression(key.initializer)) {
          rowKeySource = key.initializer.expression!.getText(callerAst)
          break
        }
      }
      ancestor = ancestor.parent
    }
  }
  ts.forEachChild(node, findCall)
}
findCall(callerAst)
if (!callSite) throw new Error('TodayChecklist ScanResultsPanel call not found')
const callerJs = ts.transpileModule(`const panel = ${callSite}`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText
const conditionalCallerJs = ts.transpileModule(`const panel = ${conditionalCallSite}`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText
function callerValues(onAcceptSkip: () => Promise<boolean>, scope: Partial<{ family: string; child: string; day: string; row: string; scan: string }> = {}) {
  return {
    React, ScanResultsPanel, checklistItemKey, onAcceptSkip,
    familyId: scope.family ?? 'family', selectedChildId: scope.child ?? 'child', dayLog: { date: scope.day ?? '2026-09-15' },
    item: { id: scope.row ?? 'row-A', label: 'workbook', completed: false },
    scanResult: { id: scope.scan ?? 'scan', results: makeSkipResult(), imageUrl: '' },
    selectedChild: { name: 'Synthetic child' }, onScanAddToPlan: undefined,
    onScanSkip: undefined, onUpdatePosition: undefined, onSkipToNext: undefined, onClearScan: vi.fn(),
  }
}
function actualCaller(onAcceptSkip: () => Promise<boolean>, scope: Parameters<typeof callerValues>[1] = {}) {
  const values = callerValues(onAcceptSkip, scope)
  return new Function(...Object.keys(values), `${callerJs}; return panel`)(...Object.values(values)) as React.ReactElement
}

function actualRowList(ids: string[], onAcceptSkip: () => Promise<boolean>) {
  return <>{ids.map((id, index) => {
    const values = { ...callerValues(onAcceptSkip, { row: id }), index, scanResultItemIndex: ids.includes('row-A') ? ids.indexOf('row-A') : null, captureItemIndex: 0 }
    const key = new Function(...Object.keys(values), `return ${rowKeySource}`)(...Object.values(values)) as React.Key
    const panel = new Function(...Object.keys(values), `${conditionalCallerJs}; return panel`)(...Object.values(values)) as React.ReactNode
    return <div key={key} data-row={id}>{panel}</div>
  })}</>
}

function makeSkipResult(overrides: Partial<WorksheetScanResult> = {}): WorksheetScanResult {
  return {
    pageType: 'worksheet',
    subject: 'Math',
    specificTopic: 'Addition',
    skillsTargeted: [],
    estimatedDifficulty: 'easy',
    recommendation: 'skip',
    recommendationReason: 'Already mastered',
    estimatedMinutes: 5,
    teacherNotes: '',
    curriculumDetected: {
      provider: 'gatb',
      name: 'GATB Math',
      lessonNumber: 42,
      pageNumber: null,
      levelDesignation: 'Level 4',
    },
    ...overrides,
  }
}

describe('ScanResultsPanel — Accept AI skip', () => {
  it('renders "Accept & advance" button for skip recommendation', () => {
    render(
      <ScanResultsPanel
        results={makeSkipResult()}
        onAcceptSkip={vi.fn()}
        childName="Lincoln"
      />,
    )

    expect(screen.getByRole('button', { name: /accept & advance/i })).toBeInTheDocument()
  })

  it('hides "Accept & advance" button when recommendation is "do"', () => {
    render(
      <ScanResultsPanel
        results={makeSkipResult({ recommendation: 'do' })}
        onAcceptSkip={vi.fn()}
        childName="Lincoln"
      />,
    )

    expect(screen.queryByRole('button', { name: /accept & advance/i })).not.toBeInTheDocument()
  })

  it('hides "Accept & advance" button when recommendation is "quick-review"', () => {
    render(
      <ScanResultsPanel
        results={makeSkipResult({ recommendation: 'quick-review' })}
        onAcceptSkip={vi.fn()}
        childName="Lincoln"
      />,
    )

    expect(screen.queryByRole('button', { name: /accept & advance/i })).not.toBeInTheDocument()
  })

  it('hides "Accept & advance" button when onAcceptSkip is not provided', () => {
    render(
      <ScanResultsPanel
        results={makeSkipResult()}
        childName="Lincoln"
      />,
    )

    expect(screen.queryByRole('button', { name: /accept & advance/i })).not.toBeInTheDocument()
  })

  it('calls onAcceptSkip when button is clicked', () => {
    const onAcceptSkip = vi.fn()
    render(
      <ScanResultsPanel
        results={makeSkipResult()}
        onAcceptSkip={onAcceptSkip}
        childName="Lincoln"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /accept & advance/i }))
    expect(onAcceptSkip).toHaveBeenCalledOnce()
  })

  it('shows "Accepted" only after the confirmed write succeeds', async () => {
    render(
      <ScanResultsPanel
        results={makeSkipResult()}
        onAcceptSkip={vi.fn().mockResolvedValue(true)}
        childName="Lincoln"
      />,
    )

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /accept & advance/i })))
    expect(screen.getByText(/✓ Accepted/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept & advance/i })).not.toBeInTheDocument()
  })

  it.each([false, 'reject'])('a %s result keeps acceptance available without a false receipt', async (outcome) => {
    const onAcceptSkip = outcome === 'reject'
      ? vi.fn().mockRejectedValue(new Error('rejected'))
      : vi.fn().mockResolvedValue(false)
    render(<ScanResultsPanel results={makeSkipResult()} onAcceptSkip={onAcceptSkip} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /accept & advance/i })))
    expect(screen.queryByText(/✓ Accepted/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept & advance/i })).toBeEnabled()
    expect(screen.getByText(/Skip wasn't fully saved/)).toBeInTheDocument()
  })

  it('disables both advance doors while pending and cannot accept another scan from an old result', async () => {
    let finish!: (result: boolean) => void
    const onAcceptSkip = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const { rerender } = render(<ScanResultsPanel results={makeSkipResult()} onAcceptSkip={onAcceptSkip} onSkipToNext={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /accept & advance/i }))
    expect(screen.getByRole('button', { name: /Accepting/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Skip to lesson/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Accepting/ }))
    expect(onAcceptSkip).toHaveBeenCalledOnce()
    rerender(<ScanResultsPanel results={makeSkipResult({ specificTopic: 'New scan' })} onAcceptSkip={vi.fn().mockResolvedValue(false)} />)
    await act(async () => finish(true))
    expect(screen.queryByText(/✓ Accepted/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept & advance/i })).toBeEnabled()
  })

  it.each(['family', 'child', 'day', 'row', 'scan'] as const)('actual Today caller cannot put an old receipt on a different %s', async (dimension) => {
    let finish!: (result: boolean) => void
    const pending = () => new Promise<boolean>((resolve) => { finish = resolve })
    const { rerender } = render(actualCaller(pending))
    fireEvent.click(screen.getByRole('button', { name: /accept & advance/i }))
    // Same mounted position; React keeps the panel across a row-index reuse.
    rerender(actualCaller(pending, { [dimension]: 'different' }))
    await act(async () => finish(true))
    expect(screen.queryByText(/✓ Accepted/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept & advance/i })).toBeEnabled()
  })

  it('actual Today caller keeps pending through fresh result objects and callback churn for the same target', async () => {
    let finish!: (result: boolean) => void
    const { rerender } = render(actualCaller(() => new Promise<boolean>((resolve) => { finish = resolve })))
    fireEvent.click(screen.getByRole('button', { name: /accept & advance/i }))
    rerender(actualCaller(vi.fn().mockResolvedValue(false)))
    expect(screen.getByRole('button', { name: /Accepting/ })).toBeDisabled()
    await act(async () => finish(true))
    expect(screen.getByText(/✓ Accepted/)).toBeInTheDocument()
  })

  it('actual row key and panel placement carry pending acceptance with the original row through reorder', async () => {
    let finish!: (result: boolean) => void
    const accept = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const { rerender } = render(actualRowList(['row-A', 'row-B'], accept))
    fireEvent.click(screen.getByRole('button', { name: /accept & advance/i }))
    rerender(actualRowList(['row-B', 'row-A'], accept))
    expect(screen.getByRole('button', { name: /Accepting/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /accept & advance/i })).not.toBeInTheDocument()
    await act(async () => finish(true))
    expect(screen.getByText(/✓ Accepted/).closest('[data-row]')).toHaveAttribute('data-row', 'row-A')
    expect(accept).toHaveBeenCalledOnce()
    rerender(actualRowList(['row-B', 'replacement'], accept))
    expect(screen.queryByText(/✓ Accepted/)).not.toBeInTheDocument()
  })
})
