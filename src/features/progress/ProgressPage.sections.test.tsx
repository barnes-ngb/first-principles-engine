import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { PROGRESS_TABS } from './progressNav'

/**
 * UX-326 — the tab bar is followed by the TAB, and by nothing else.
 *
 * Four sections used to render between the tab bar and the tab content on all
 * six tabs: `CertificateScanSection` (a per-child WRITE control, above every
 * child selector on the page — UX-319), `FoundationsReviewLauncher`, and the two
 * `?diag=1` panels, one of which stacks every child's full 60-concept terrain.
 * None of them was tab-specific.
 *
 * Every tab body and every moved section is a marker here, so the only thing
 * this file can see is what the SHELL renders.
 */

vi.mock('./FoundationsTab', () => ({ default: () => <div>TAB_FOUNDATIONS</div> }))
vi.mock('../monthly-review/MonthlyBooksTab', () => ({ default: () => <div>TAB_MONTHLY</div> }))
vi.mock('./learning-map/LearningMap', () => ({ default: () => <div>TAB_MAP</div> }))
vi.mock('./CurriculumTab', () => ({ default: () => <div>TAB_CURRICULUM</div> }))
vi.mock('../evaluation/SkillSnapshotPage', () => ({ default: () => <div>TAB_SNAPSHOT</div> }))
vi.mock('./WordWall', () => ({ default: () => <div>TAB_WORDWALL</div> }))
vi.mock('../../components/HelpStrip', () => ({ default: () => <div>HELP_STRIP</div> }))

// The four moved sections. If the shell still rendered any of them, these
// markers would show up on every tab — which is the defect.
vi.mock('./CertificateScanSection', () => ({ default: () => <div>SECTION_CERTIFICATE</div> }))
vi.mock('../foundations-review/FoundationsReviewLauncher', () => ({
  default: () => <div>SECTION_REVIEW_LAUNCHER</div>,
}))
vi.mock('./FoundationsDiagPanel', () => ({ default: () => <div>SECTION_DIAG</div> }))
vi.mock('../records/DataReviewExportPanel', () => ({ default: () => <div>SECTION_EXPORT</div> }))

import ProgressPage from './ProgressPage'

const MOVED = ['SECTION_CERTIFICATE', 'SECTION_REVIEW_LAUNCHER', 'SECTION_DIAG', 'SECTION_EXPORT']

const TAB_MARKER: Record<string, string> = {
  [PROGRESS_TABS.Foundations]: 'TAB_FOUNDATIONS',
  [PROGRESS_TABS.MonthlyBooks]: 'TAB_MONTHLY',
  [PROGRESS_TABS.LearningMap]: 'TAB_MAP',
  [PROGRESS_TABS.Curriculum]: 'TAB_CURRICULUM',
  [PROGRESS_TABS.SkillSnapshot]: 'TAB_SNAPSHOT',
  [PROGRESS_TABS.WordWall]: 'TAB_WORDWALL',
}

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/progress${search}`]}>
      <ProgressPage />
    </MemoryRouter>,
  )
}

describe('ProgressPage — the shell renders the tab and nothing else (UX-326)', () => {
  for (const [slug, marker] of Object.entries(TAB_MARKER)) {
    it(`renders only the ${slug} tab body, with none of the moved sections`, () => {
      renderAt(`?tab=${slug}`)
      expect(screen.getByText(marker)).toBeInTheDocument()
      for (const other of Object.values(TAB_MARKER)) {
        if (other !== marker) expect(screen.queryByText(other)).not.toBeInTheDocument()
      }
      for (const moved of MOVED) {
        expect(screen.queryByText(moved)).not.toBeInTheDocument()
      }
    })

    it(`reveals no diagnostic panel from the shell on ${slug} even with ?diag=1`, () => {
      renderAt(`?tab=${slug}&diag=1`)
      expect(screen.queryByText('SECTION_DIAG')).not.toBeInTheDocument()
      expect(screen.queryByText('SECTION_EXPORT')).not.toBeInTheDocument()
    })
  }

  it('still lands on Foundations for a bare /progress', () => {
    renderAt('')
    expect(screen.getByText('TAB_FOUNDATIONS')).toBeInTheDocument()
  })
})

/**
 * The render tests above prove the shell renders none of the four. This one
 * proves each landed somewhere — an import scan, because the destination tabs
 * are far too heavy to mount here and a marker mocked into them would only
 * assert the mock.
 */
describe('UX-326 — each moved section has exactly one home', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

  it('ProgressPage imports none of the four', () => {
    const src = read('./ProgressPage.tsx')
    expect(src).not.toMatch(/import\s+CertificateScanSection/)
    expect(src).not.toMatch(/import\s+FoundationsReviewLauncher/)
    expect(src).not.toMatch(/import\s+FoundationsDiagPanel/)
    expect(src).not.toMatch(/import\s+DataReviewExportPanel/)
  })

  it('the three Foundations-shaped sections live on the Foundations tab', () => {
    const src = read('./FoundationsTab.tsx')
    expect(src).toMatch(/import\s+FoundationsReviewLauncher/)
    expect(src).toMatch(/import\s+FoundationsDiagPanel/)
    expect(src).toMatch(/import\s+DataReviewExportPanel/)
  })

  it('the certificate door lives on the Curriculum tab (UX-315 keeps it there)', () => {
    expect(read('./CurriculumTab.tsx')).toMatch(/import\s+CertificateScanSection/)
  })
})

/**
 * UX-325 — three of the six Progress tabs render no child selector at all, while
 * the header names one. Fixed by UX-324 EXISTING rather than by adding a fourth
 * in-page copy: the shell's chip is on every page in the product, so a tab with
 * no selector of its own is still switchable.
 *
 * The eight in-page selectors stay for now (owner decision, 2026-09-09 — removing
 * them is a follow-up once the header switcher has been lived with). Both read
 * the same `useActiveChild`, so switching in either place moves both.
 */
describe('UX-325 — the tabs with no selector of their own', () => {
  const readFeature = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

  it.each([
    ['Learning Map', './learning-map/LearningMap.tsx'],
    ['Monthly Books', '../monthly-review/MonthlyBooksTab.tsx'],
    ['Word Wall', './WordWall.tsx'],
  ])('%s still renders no ChildSelector — the header chip is the way', (_label, rel) => {
    expect(readFeature(rel)).not.toMatch(/<ChildSelector/)
  })

  it('the tabs that DO have one still have it', () => {
    expect(readFeature('./FoundationsTab.tsx')).toMatch(/<ChildSelector/)
    expect(readFeature('./CurriculumTab.tsx')).toMatch(/<ChildSelector/)
    expect(readFeature('../evaluation/SkillSnapshotPage.tsx')).toMatch(/<ChildSelector/)
  })
})
