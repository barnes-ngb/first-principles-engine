import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ScanResultsPanel from './ScanResultsPanel'
import type { WorksheetScanResult } from '../core/types'

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

  it('shows "Accepted" chip after clicking accept', () => {
    render(
      <ScanResultsPanel
        results={makeSkipResult()}
        onAcceptSkip={vi.fn()}
        childName="Lincoln"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /accept & advance/i }))
    expect(screen.getByText(/✓ Accepted/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept & advance/i })).not.toBeInTheDocument()
  })
})
