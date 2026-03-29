import { type SyntheticEvent, useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'

import HelpStrip from '../../components/HelpStrip'
import DispositionProfile from './DispositionProfile'
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
            <Tab label="Skill Snapshot" />
            <Tab label="Word Wall" />
          </Tabs>
        </Box>
      </Container>
      {tab === 0 && <DispositionProfile />}
      {tab === 1 && <SkillSnapshotPage />}
      {tab === 2 && <WordWall />}
    </>
  )
}
