import { type SyntheticEvent, useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'

import DispositionProfile from './DispositionProfile'
import LaddersPage from '../ladders/LaddersPage'
import EnginePage from '../engine/EnginePage'
import SkillSnapshotPage from '../evaluation/SkillSnapshotPage'
import KidsPage from '../kids/KidsPage'
import WordWall from './WordWall'
import ArmorTab from './ArmorTab'

export default function ProgressPage() {
  const [tab, setTab] = useState(0)

  const handleChange = (_: SyntheticEvent, newValue: number) => {
    setTab(newValue)
  }

  return (
    <>
      <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 3 } }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tab}
            onChange={handleChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Learning Profile" />
            <Tab label="Skill Snapshot" />
            <Tab label="Ladders" />
            <Tab label="Word Wall" />
            <Tab label="Engine" />
            <Tab label="Milestones" />
            <Tab label="Armor" />
          </Tabs>
        </Box>
      </Container>
      {tab === 0 && <DispositionProfile />}
      {tab === 1 && <SkillSnapshotPage />}
      {tab === 2 && <LaddersPage />}
      {tab === 3 && <WordWall />}
      {tab === 4 && <EnginePage />}
      {tab === 5 && <KidsPage />}
      {tab === 6 && <ArmorTab />}
    </>
  )
}
