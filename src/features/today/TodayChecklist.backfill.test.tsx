import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import type { ChecklistItem, DayLog, SkillSnapshot } from '../../core/types'
import { PlanType, SubjectBucket } from '../../core/types/enums'
import type { WorkbookConfigLike } from '../../core/utils/workbookMatching'

/** A scannable workbook config whose name matches the 'GATB Math (30m)' item. */
const matchingConfig: WorkbookConfigLike = {
  id: 'wb-math',
  name: 'GATB Math',
  type: 'workbook',
  scannable: true,
}

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    label: 'GATB Math (30m)',
    completed: true,
    subjectBucket: SubjectBucket.Math,
    evidenceArtifactId: 'artifact-1',
    evidenceCollection: 'artifacts',
    ...overrides,
  }
}

function renderChecklist(item: ChecklistItem, configs: WorkbookConfigLike[]) {
  const dayLog = { id: '2026-07-10', date: '2026-07-10', checklist: [item] } as unknown as DayLog
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'Lincoln', id: 'c1' }}
        selectedChildId="c1"
        familyId="f1"
        today="2026-07-10"
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={vi.fn()}
        onTeachHelperOpen={vi.fn()}
        onUnifiedCapture={vi.fn()}
        onBackfillWorkbookScan={vi.fn()}
        configs={configs}
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
      />
    </MemoryRouter>,
  )
}

describe('TodayChecklist — FEAT-62 legacy-item backfill button', () => {
  it('renders the backfill button for an unstamped item whose label matches a config', () => {
    renderChecklist(makeItem(), [matchingConfig])
    expect(screen.queryByRole('button', { name: /analyze as workbook scan/i })).not.toBeNull()
  })

  it('renders NO backfill button when an unstamped item matches no config', () => {
    renderChecklist(makeItem(), [])
    expect(screen.queryByRole('button', { name: /analyze as workbook scan/i })).toBeNull()
  })

  it('still renders the button for a stamped item (characterization — no configs needed)', () => {
    renderChecklist(makeItem({ workbookConfigId: 'wb-math' }), [])
    expect(screen.queryByRole('button', { name: /analyze as workbook scan/i })).not.toBeNull()
  })
})
