import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import type { ChecklistItem, DayLog, ScanRecord, SkillSnapshot } from '../../core/types'
import { PlanType, SubjectBucket } from '../../core/types/enums'

// The analysis panel is the existing surface; here only its presence matters.
vi.mock('../../components/ScanAnalysisPanel', () => ({
  default: ({ scan }: { scan: ScanRecord }) => <div>SCAN PANEL {scan.id}</div>,
}))

// ── FEAT-184 / UX-151: the "review this" marker on parent Today ─────────────
//
// A kid's photo that read as a curriculum page acted on nothing; its scan doc
// is left for the parent. The item carries `pendingScanId`, and the parent
// checklist shows it on the SAME expandable chip a parent's own scan gets —
// the smallest honest surface that already existed, not a new card.

const worksheetResults = {
  pageType: 'worksheet',
  subject: 'Math',
  specificTopic: 'addition',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
} as unknown as ScanRecord['results']

const scan = (id: string): ScanRecord => ({
  id,
  childId: 'c1',
  imageUrl: 'https://x/scan.jpg',
  storagePath: 'families/f1/scans/x.jpg',
  results: worksheetResults,
  action: 'pending',
})

const row = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'GATB Math (30m)',
  completed: true,
  subjectBucket: SubjectBucket.Math,
  estimatedMinutes: 30,
  source: 'planner',
  ...over,
})

function renderChecklist(item: ChecklistItem, recentScans: ScanRecord[]) {
  const date = '2026-09-03'
  const dayLog = { id: date, date, childId: 'c1', checklist: [item], blocks: [] } as unknown as DayLog
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'London', id: 'c1' }}
        selectedChildId="c1"
        familyId="f1"
        today={date}
        isToday
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={vi.fn()}
        onTeachHelperOpen={vi.fn()}
        onUnifiedCapture={vi.fn()}
        onPreCompletionScan={vi.fn()}
        captureLoading={false}
        captureItemIndex={null}
        scanResult={null}
        scanError={null}
        onScanAddToPlan={vi.fn()}
        onScanSkip={vi.fn()}
        onClearScan={vi.fn()}
        onPrintMaterials={vi.fn()}
        printingMaterials={false}
        recentScans={recentScans}
      />
    </MemoryRouter>,
  )
}

describe('TodayChecklist — "Review this" for a kid capture read as a worksheet', () => {
  it('shows "Review this" on the item and expands to the scan analysis', () => {
    renderChecklist(
      row({ evidenceArtifactId: 'artifact-1', evidenceCollection: 'artifacts', pendingScanId: 'scan-9' }),
      [scan('scan-9')],
    )
    const chip = screen.getByText('Review this ▾')
    expect(screen.queryByText(/Captured ✓/)).toBeNull()
    fireEvent.click(chip)
    expect(screen.getByText('SCAN PANEL scan-9')).toBeInTheDocument()
    expect(screen.getByText('Review this ▴')).toBeInTheDocument()
  })

  it("a parent's own scan capture still reads Captured ✓ (unchanged)", () => {
    renderChecklist(row({ evidenceArtifactId: 'scan-9', evidenceCollection: 'scans', scanned: true }), [scan('scan-9')])
    expect(screen.getByText('Captured ✓ ▾')).toBeInTheDocument()
    expect(screen.queryByText(/Review this/)).toBeNull()
  })

  it('a plain artifact with no marker reads Captured ✓ with nothing to expand', () => {
    renderChecklist(row({ evidenceArtifactId: 'artifact-1', evidenceCollection: 'artifacts' }), [scan('scan-9')])
    expect(screen.getByText('Captured ✓')).toBeInTheDocument()
    expect(screen.queryByText(/Review this/)).toBeNull()
  })

  it('falls back to Captured ✓ when the marked scan is not in the recent list (nothing to show)', () => {
    renderChecklist(
      row({ evidenceArtifactId: 'artifact-1', evidenceCollection: 'artifacts', pendingScanId: 'scan-old' }),
      [scan('scan-9')],
    )
    expect(screen.getByText('Captured ✓')).toBeInTheDocument()
  })
})
