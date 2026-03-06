import { type SyntheticEvent, useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'

import LaddersPage from '../ladders/LaddersPage'
import EnginePage from '../engine/EnginePage'
import SkillSnapshotPage from '../evaluation/SkillSnapshotPage'
import KidsPage from '../kids/KidsPage'

export default function ProgressPage() {
  const [tab, setTab] = useState(0)

  const handleChange = (_: SyntheticEvent, newValue: number) => {
    setTab(newValue)
  }

  return (
    <>
      <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 3 } }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={handleChange}>
            <Tab label="Ladders" />
            <Tab label="Engine" />
            <Tab label="Skill Snapshot" />
            <Tab label="Milestones" />
          </Tabs>
        </Box>
      </Container>
      {tab === 0 && <LaddersPage />}
      {tab === 1 && <EnginePage />}
      {tab === 2 && <SkillSnapshotPage />}
      {tab === 3 && <KidsPage />}
    </>
  )
}
