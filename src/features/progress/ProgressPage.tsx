import { type SyntheticEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'

import HelpStrip from '../../components/HelpStrip'
import SectionCard from '../../components/SectionCard'
import CertificateScanSection from './CertificateScanSection'
import CurriculumTab from './CurriculumTab'
import FoundationsTab from './FoundationsTab'
import FoundationsDiagPanel from './FoundationsDiagPanel'
import FoundationsReviewLauncher from '../foundations-review/FoundationsReviewLauncher'
import LearningMap from './learning-map/LearningMap'
import MonthlyBooksTab from '../monthly-review/MonthlyBooksTab'
import SkillSnapshotPage from '../evaluation/SkillSnapshotPage'
import WordWall from './WordWall'

/**
 * Tab descriptor list (FEAT-65). Foundations is index 0 — it absorbs the former
 * "Learning Profile" tab, embedding the disposition narrative as a section. The
 * `{ label, render }` array replaces the old index-based `tab === N` guards so
 * future inserts don't require hand-renumbering (design §6.4).
 */
const TABS: Array<{ label: string; slug: string; render: () => ReactNode }> = [
  { label: 'Foundations', slug: 'foundations', render: () => <FoundationsTab /> },
  { label: 'Monthly Books', slug: 'monthly-books', render: () => <MonthlyBooksTab /> },
  { label: 'Learning Map', slug: 'learning-map', render: () => <LearningMap /> },
  { label: 'Curriculum', slug: 'curriculum', render: () => <CurriculumTab /> },
  { label: 'Skill Snapshot', slug: 'skill-snapshot', render: () => <SkillSnapshotPage /> },
  { label: 'Word Wall', slug: 'word-wall', render: () => <WordWall /> },
]

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
        <HelpStrip
          pageKey="progress"
          text="Foundations shows how each child is doing across the reading and math spine — solid, forming, or at the frontier (the good edge) — plus what matters next, and growth in curiosity, persistence, articulation, self-awareness, and ownership. No grades."
          maxShowCount={3}
        />
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
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
        </Box>
      </Container>
      <Container maxWidth="lg" sx={{ py: 2 }}>
        <SectionCard title="Scan Certificate or Progress Report">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Photograph a curriculum certificate or progress report to automatically update workbook progress.
          </Typography>
          <CertificateScanSection />
        </SectionCard>
      </Container>
      {/* Foundations Review Chat (FEAT-51, slice 2a) — parent-only (Progress is a
          parentOnly route). The primary interface for feeding the Learner Model
          by conversation + upload; the Foundations tab reads what it feeds. */}
      <Container maxWidth="lg" sx={{ py: 1 }}>
        <FoundationsReviewLauncher />
      </Container>
      {/* Flag-gated ( ?diag=1 ), parent-only — Learner Model seeder + preview (FEAT-48). */}
      <Container maxWidth="lg" sx={{ py: 0 }}>
        <FoundationsDiagPanel />
      </Container>
      {TABS[tab]?.render()}
    </>
  )
}
