import { type SyntheticEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'

import HelpStrip from '../../components/HelpStrip'
import CurriculumTab from './CurriculumTab'
import FoundationsTab from './FoundationsTab'
import LearningMap from './learning-map/LearningMap'
import MonthlyBooksTab from '../monthly-review/MonthlyBooksTab'
import { PROGRESS_TABS } from './progressNav'
import type { ProgressTabSlug } from './progressNav'
import SkillSnapshotPage from '../evaluation/SkillSnapshotPage'
import WordWall from './WordWall'

/**
 * Tab descriptor list (FEAT-65). Foundations is index 0 — it absorbs the former
 * "Learning Profile" tab, embedding the disposition narrative as a section. The
 * `{ label, render }` array replaces the old index-based `tab === N` guards so
 * future inserts don't require hand-renumbering (design §6.4).
 */
// Slugs come from `progressNav.PROGRESS_TABS` (UX-52) so the table that RESOLVES
// `?tab=` and the table that BUILDS it are the same table — a link into a tab
// that no longer exists would otherwise fail silently by landing on tab 0.
const TABS: Array<{ label: string; slug: ProgressTabSlug; render: () => ReactNode }> = [
  { label: 'Foundations', slug: PROGRESS_TABS.Foundations, render: () => <FoundationsTab /> },
  { label: 'Monthly Books', slug: PROGRESS_TABS.MonthlyBooks, render: () => <MonthlyBooksTab /> },
  { label: 'Learning Map', slug: PROGRESS_TABS.LearningMap, render: () => <LearningMap /> },
  { label: 'Curriculum', slug: PROGRESS_TABS.Curriculum, render: () => <CurriculumTab /> },
  { label: 'Skill Snapshot', slug: PROGRESS_TABS.SkillSnapshot, render: () => <SkillSnapshotPage /> },
  { label: 'Word Wall', slug: PROGRESS_TABS.WordWall, render: () => <WordWall /> },
]

const TAB_HELP: Record<ProgressTabSlug, string> = {
  foundations: 'See what is taking shape in reading and math, and what to try next.',
  'monthly-books': 'Read, generate, and print a book of the month’s learning.',
  'learning-map': 'Explore skills by subject. Open a skill for details and practice ideas.',
  curriculum: 'Manage workbooks and activities. Add pages to an existing workbook or add new resources below.',
  'skill-snapshot': 'Review working levels, priority skills, and supports used by planning and teaching.',
  'word-wall': 'See words collected through learning activities and revisit them together.',
}

export default function ProgressPage() {
  // URL is the source of truth: `?tab=<slug>` selects the tab so deep links
  // (e.g. planner "+ Add" → /progress?tab=curriculum) land on the right tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = Math.max(
    0,
    TABS.findIndex((t) => t.slug === searchParams.get('tab')),
  )

  const handleChange = (_: SyntheticEvent, newValue: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', TABS[newValue].slug)
    setSearchParams(next, { replace: true })
  }

  return (
    <>
      <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 3 } }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
          <Tabs
            sx={{ minWidth: 0, flex: 1 }}
            value={tab}
            onChange={handleChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            {TABS.map((t) => (
              <Tab key={t.label} label={t.label} />
            ))}
          </Tabs>
          {TABS[tab].slug !== PROGRESS_TABS.Curriculum && (
            <HelpStrip key={TABS[tab].slug} pageKey={TABS[tab].slug} text={TAB_HELP[TABS[tab].slug]} />
          )}
        </Box>
      </Container>
      {/* UX-326: the tab bar is followed by the TAB, and by nothing else.
          `CertificateScanSection`, `FoundationsReviewLauncher`,
          `FoundationsDiagPanel` and `DataReviewExportPanel` used to render here,
          between the tabs and their content — four sections, none of them
          tab-specific, on all six tabs. A parent who tapped Word Wall scrolled
          past a certificate scanner, a review chat and (with `?diag=1`) two
          diagnostic panels, one of which stacks every child's full 60-concept
          terrain, before reaching the word wall — and past all of it before
          reaching the tab's own child selector, which is UX-319. Each has moved
          to the tab whose job it shares: the three Foundations-shaped ones to
          `FoundationsTab`, the certificate scanner to `CurriculumTab` (above the
          staging area it is destined to merge with — UX-315). */}
      {TABS[tab]?.render()}
    </>
  )
}
