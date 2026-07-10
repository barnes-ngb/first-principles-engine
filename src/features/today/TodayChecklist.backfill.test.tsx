import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import { resolveDisplayPhotos } from './itemPhotos'
import type { Artifact, ChecklistItem, DayLog, SkillSnapshot } from '../../core/types'
import { EngineStage, EvidenceType, PlanType, SubjectBucket } from '../../core/types/enums'
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

/** A photo artifact tagged to a plan item — the shape the Artifacts section shows. */
function makePhotoArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'artifact-1',
    childId: 'c1',
    dayLogId: '2026-07-10',
    title: "GATB Math — Lincoln's work",
    type: EvidenceType.Photo,
    uri: 'https://x/page-1.jpg',
    createdAt: '2026-07-10T10:00:00.000Z',
    tags: {
      engineStage: EngineStage.Build,
      domain: '',
      subjectBucket: SubjectBucket.Math,
      location: 'Home',
      planItem: 'GATB Math (30m)',
    },
    ...overrides,
  }
}

function renderChecklist(
  item: ChecklistItem,
  configs: WorkbookConfigLike[],
  opts: { todayArtifacts?: Artifact[]; onBackfillWorkbookScan?: ReturnType<typeof vi.fn> } = {},
) {
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
        onBackfillWorkbookScan={opts.onBackfillWorkbookScan ?? vi.fn()}
        todayArtifacts={opts.todayArtifacts ?? []}
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

const backfillButton = () => screen.queryByRole('button', { name: /analyze as workbook scan/i })

describe('TodayChecklist — FEAT-62 legacy-item backfill button', () => {
  it('renders the backfill button for an unstamped item whose label matches a config', () => {
    renderChecklist(makeItem(), [matchingConfig])
    expect(backfillButton()).not.toBeNull()
  })

  it('renders NO backfill button when an unstamped item matches no config', () => {
    renderChecklist(makeItem(), [])
    expect(backfillButton()).toBeNull()
  })

  it('still renders the button for a stamped item (characterization — no configs needed)', () => {
    renderChecklist(makeItem({ workbookConfigId: 'wb-math' }), [])
    expect(backfillButton()).not.toBeNull()
  })
})

describe('TodayChecklist — FEAT-62 polish: display-parity photo lookup', () => {
  // The owner's exact cohort: a legacy item whose checklist row lost its
  // evidenceArtifactId link, but whose photo the Today page still displays
  // (resolved by tags.planItem over the day's artifacts).
  const legacyItem = makeItem({ evidenceArtifactId: undefined, evidenceCollection: undefined })

  it('renders the button for a link-less item when a display-resolvable photo exists', () => {
    renderChecklist(legacyItem, [matchingConfig], {
      todayArtifacts: [makePhotoArtifact({ id: 'a-orphan' })],
    })
    expect(backfillButton()).not.toBeNull()
  })

  it('renders NO button for a link-less item when no photo resolves', () => {
    renderChecklist(legacyItem, [matchingConfig], { todayArtifacts: [] })
    expect(backfillButton()).toBeNull()
  })

  it('passes the display-resolved photo URI to the handler (not the missing link)', async () => {
    const onBackfill = vi.fn()
    renderChecklist(legacyItem, [matchingConfig], {
      todayArtifacts: [makePhotoArtifact({ id: 'a-orphan', uri: 'https://x/orphan.jpg' })],
      onBackfillWorkbookScan: onBackfill,
    })
    backfillButton()!.click()
    expect(onBackfill).toHaveBeenCalledWith(0, ['https://x/orphan.jpg'])
  })

  it('offers analyze-all + per-page when an item resolves to multiple photos', () => {
    const onBackfill = vi.fn()
    renderChecklist(legacyItem, [matchingConfig], {
      todayArtifacts: [
        makePhotoArtifact({ id: 'a1', uri: 'https://x/p1.jpg', mediaUrls: ['https://x/p1.jpg', 'https://x/p2.jpg'] }),
      ],
      onBackfillWorkbookScan: onBackfill,
    })
    // Analyze-all
    const all = screen.getByRole('button', { name: /analyze all 2 pages/i })
    all.click()
    expect(onBackfill).toHaveBeenCalledWith(0, ['https://x/p1.jpg', 'https://x/p2.jpg'])
    // Per-page
    screen.getByRole('button', { name: /^page 2$/i }).click()
    expect(onBackfill).toHaveBeenCalledWith(0, ['https://x/p2.jpg'])
  })
})

describe('resolveDisplayPhotos', () => {
  it('resolves a photo by planItem tag (the display join) with no evidenceArtifactId', () => {
    const item = makeItem({ evidenceArtifactId: undefined, evidenceCollection: undefined })
    const photos = resolveDisplayPhotos(item, [makePhotoArtifact({ id: 'a1', uri: 'https://x/p.jpg' })])
    expect(photos).toEqual([{ artifactId: 'a1', uri: 'https://x/p.jpg' }])
  })

  it('flattens mediaUrls and de-dupes by URI', () => {
    const item = makeItem({ evidenceArtifactId: undefined, evidenceCollection: undefined })
    const photos = resolveDisplayPhotos(item, [
      makePhotoArtifact({ id: 'a1', uri: 'https://x/p1.jpg', mediaUrls: ['https://x/p1.jpg', 'https://x/p2.jpg'] }),
    ])
    expect(photos.map((p) => p.uri)).toEqual(['https://x/p1.jpg', 'https://x/p2.jpg'])
  })

  it('ignores non-photo artifacts and other items’ photos', () => {
    const item = makeItem({ evidenceArtifactId: undefined, evidenceCollection: undefined })
    const photos = resolveDisplayPhotos(item, [
      makePhotoArtifact({ id: 'note', type: EvidenceType.Note, uri: undefined, content: 'x' }),
      makePhotoArtifact({ id: 'other', tags: { ...makePhotoArtifact().tags, planItem: 'Reading (20m)' } }),
    ])
    expect(photos).toEqual([])
  })

  it('skips the linked artifact when the item points at a scan doc', () => {
    const item = makeItem({ evidenceArtifactId: 'scan-1', evidenceCollection: 'scans' })
    // Same id, but tagged to a different plan item so path 2 can't rescue it.
    const photos = resolveDisplayPhotos(item, [
      makePhotoArtifact({ id: 'scan-1', tags: { ...makePhotoArtifact().tags, planItem: 'Reading (20m)' } }),
    ])
    expect(photos).toEqual([])
  })
})
