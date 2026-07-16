import { type SyntheticEvent, type ReactNode, useState } from 'react'
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
const TABS: Array<{ label: string; render: () => ReactNode }> = [
  { label: 'Foundations', render: () => <FoundationsTab /> },
  { label: 'Monthly Books', render: () => <MonthlyBooksTab /> },
  { label: 'Learning Map', render: () => <LearningMap /> },
  { label: 'Curriculum', render: () => <CurriculumTab /> },
  { label: 'Skill Snapshot', render: () => <SkillSnapshotPage /> },
  { label: 'Word Wall', render: () => <WordWall /> },
]

export default function ProgressPage() {
  const [tab, setTab] = useState(0)

  const handleChange = (_: SyntheticEvent, newValue: number) => {
    setTab(newValue)
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
