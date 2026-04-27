import { type SyntheticEvent, useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'

import HelpStrip from '../../components/HelpStrip'
import SectionCard from '../../components/SectionCard'
import CertificateScanSection from './CertificateScanSection'
import CurriculumTab from './CurriculumTab'
import DispositionProfile from './DispositionProfile'
import LearningMap from './learning-map/LearningMap'
import SkillSnapshotPage from '../evaluation/SkillSnapshotPage'
import WordWall from './WordWall'

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
          text="The Learning Profile shows growth in curiosity, persistence, articulation, self-awareness, and ownership — not grades. It's built from 4 weeks of daily data."
          maxShowCount={3}
        />
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tab}
            onChange={handleChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Learning Profile" />
            <Tab label="Learning Map" />
            <Tab label="Curriculum" />
            <Tab label="Skill Snapshot" />
            <Tab label="Word Wall" />
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
      {tab === 0 && <DispositionProfile />}
      {tab === 1 && <LearningMap />}
      {tab === 2 && <CurriculumTab />}
      {tab === 3 && <SkillSnapshotPage />}
      {tab === 4 && <WordWall />}
    </>
  )
}
