import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WEEK_BY_SUBJECT_CAPTION } from './weekBySubject'
import type { WeekSubjectSummary } from './weekBySubject'

/**
 * UX-388 — the week by subject, rendered.
 *
 * Three properties this file exists for, none of them visible in the pure
 * module: it renders for a parent and **nothing** for a kid (and costs a kid
 * zero reads), it hides a subject with nothing in it rather than drawing an
 * empty block, and it says **no target of any kind** — the owner's decision on
 * file, and the one an instinct for dashboards would quietly undo.
 */

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const mockUseWeekBySubject = vi.fn()
vi.mock('./useWeekBySubject', () => ({
  useWeekBySubject: (...args: unknown[]) => mockUseWeekBySubject(...args),
}))

import WeekBySubject from './WeekBySubject'

const PARENT = { isChildProfile: false }

const subject = (over: Partial<WeekSubjectSummary> = {}): WeekSubjectSummary => ({
  subjectBucket: 'Reading',
  label: 'Reading',
  totalMinutes: 288,
  items: [
    { key: 'a', name: 'Fast Phonics', count: 4 },
    { key: 'b', name: 'Booster cards', count: 3 },
  ],
  artifactCount: 2,
  topics: [],
  ...over,
})

const result = (over: Record<string, unknown> = {}) => ({
  subjects: [subject()],
  loading: false,
  hoursFailed: false,
  evidenceFailed: false,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockUseActiveChild.mockReturnValue(PARENT)
  mockUseWeekBySubject.mockReturnValue(result())
})

const renderSection = () =>
  render(<WeekBySubject familyId="fam-1" childId="c1" weekKey="2026-08-30" />)

// ── The audience rule ───────────────────────────────────────────────────────

describe('the section is parent-only', () => {
  it('renders the week by subject for a parent profile', () => {
    renderSection()
    expect(screen.getByText('The Week by Subject')).toBeInTheDocument()
    expect(screen.getByText('Reading')).toBeInTheDocument()
    expect(screen.getByText('4.8 hours')).toBeInTheDocument()
    expect(screen.getByText('Fast Phonics ×4 · Booster cards ×3')).toBeInTheDocument()
    expect(screen.getByText('2 pieces of evidence captured')).toBeInTheDocument()
  })

  it('renders nothing at all for a child profile', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    const { container } = renderSection()
    expect(container).toBeEmptyDOMElement()
  })

  it('costs a child profile zero reads — the gate is above the data hook', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    renderSection()
    expect(mockUseWeekBySubject).not.toHaveBeenCalled()
  })

  it('gates on capability, never on a name', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'WeekBySubject.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/isLincoln|'Lincoln'|"Lincoln"|'London'|"London"/)
  })
})

// ── No target, anywhere ─────────────────────────────────────────────────────

describe('the week is stated, never scored', () => {
  it('shows no target, ratio, percentage or progress bar', () => {
    const { container } = renderSection()
    // The caption is scanned separately, below: it is the one sentence on the
    // section that says the word "target", and it says it to DENY one. Scanning
    // it with the rest would make this test unable to tell a promise from a
    // threat.
    const text = (container.textContent ?? '').replace(WEEK_BY_SUBJECT_CAPTION, '')
    expect(text).not.toMatch(/%/)
    expect(text).not.toMatch(/\bof \d/)
    expect(text).not.toMatch(/goal|target|behind|on track|quota|streak/i)
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('says in words that nothing is measured against a target', () => {
    renderSection()
    expect(screen.getByText(WEEK_BY_SUBJECT_CAPTION)).toBeInTheDocument()
    expect(WEEK_BY_SUBJECT_CAPTION).toMatch(/not|nothing/i)
  })

  it('renders no progress element', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'WeekBySubject.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/LinearProgress|CircularProgress|progressbar/i)
  })
})

// ── Nothing empty renders ───────────────────────────────────────────────────

describe('nothing that can be empty is drawn', () => {
  it('says one line for a week with nothing logged, not a block per subject', () => {
    mockUseWeekBySubject.mockReturnValue(result({ subjects: [] }))
    renderSection()
    expect(
      screen.getByText(
        'Nothing was logged this week — no hours, no completed items and no evidence.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Reading')).not.toBeInTheDocument()
  })

  it('omits the items line for a subject with hours and no completed items', () => {
    mockUseWeekBySubject.mockReturnValue(
      result({ subjects: [subject({ items: [], artifactCount: 0 })] }),
    )
    renderSection()
    expect(screen.getByText('4.8 hours')).toBeInTheDocument()
    expect(screen.queryByText(/pieces? of evidence/)).not.toBeInTheDocument()
  })

  it('renders no Topics line for a subject with no strand sessions', () => {
    renderSection()
    expect(screen.queryByText(/^Topics:/)).not.toBeInTheDocument()
  })

  it('renders the Topics line when a strand ran', () => {
    mockUseWeekBySubject.mockReturnValue(
      result({
        subjects: [
          subject({
            subjectBucket: 'SocialStudies',
            label: 'Social Studies',
            items: [],
            topics: [
              { key: 't1', label: 'Ancient Egypt', count: 2, recorded: true },
              { key: 't2', label: 'The Pilgrims', count: 1, recorded: true },
            ],
          }),
        ],
      }),
    )
    renderSection()
    expect(
      screen.getByText('Topics: Ancient Egypt ×2 · The Pilgrims ×1'),
    ).toBeInTheDocument()
  })
})

// ── A failed read is never a result ─────────────────────────────────────────

describe('a failed read is never rendered as a result', () => {
  it('says the log could not be read rather than showing an empty week', () => {
    mockUseWeekBySubject.mockReturnValue(
      result({ subjects: [], hoursFailed: true }),
    )
    renderSection()
    expect(
      screen.getByText(
        'Couldn’t read this week’s log, so there’s no summary by subject yet.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Nothing was logged this week/)).not.toBeInTheDocument()
  })

  it('says the evidence could not be read, once, and still shows the hours', () => {
    mockUseWeekBySubject.mockReturnValue(
      result({
        subjects: [subject({ artifactCount: null, topics: null })],
        evidenceFailed: true,
      }),
    )
    renderSection()
    expect(screen.getByText('4.8 hours')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Couldn’t read this week’s evidence, so what was captured isn’t shown.',
      ),
    ).toBeInTheDocument()
    // Never as a count of nothing.
    expect(screen.queryByText(/0 pieces of evidence/)).not.toBeInTheDocument()
  })

  it('says it is still reading rather than claiming a quiet week', () => {
    mockUseWeekBySubject.mockReturnValue(result({ subjects: [], loading: true }))
    renderSection()
    expect(screen.getByText('Reading this week’s subjects…')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing was logged this week/)).not.toBeInTheDocument()
  })
})

// ── It writes nothing ───────────────────────────────────────────────────────

describe('the section is a read', () => {
  it('names no Firestore writer in source', () => {
    for (const file of ['WeekBySubject.tsx', 'useWeekBySubject.ts', 'weekBySubject.ts']) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8')
      for (const writer of ['setDoc', 'updateDoc', 'addDoc', 'deleteDoc', 'runTransaction', 'writeBatch']) {
        expect(source, `${file} reaches for ${writer}`).not.toContain(writer)
      }
    }
  })
})
