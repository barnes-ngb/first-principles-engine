import { type SyntheticEvent, useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'

import { useActiveChild } from '../../../core/hooks/useActiveChild'
import { CURRICULUM_MAPS } from '../../../core/curriculum/curriculumMap'
import type { CurriculumNode } from '../../../core/curriculum/curriculumMap'
import { SkillStatus } from '../../../core/curriculum/skillStatus'
import { useSkillMap } from '../../../core/curriculum/useSkillMap'
import DomainSection from './DomainSection'
import SkillDetailDrawer from './SkillDetailDrawer'

export default function LearningMap() {
  const { activeChildId, activeChild } = useActiveChild()
  const { isLoading, getNodeStatus, updateNodeStatus, domainSummaries } = useSkillMap(activeChildId)
  const [domainTab, setDomainTab] = useState(0)
  const [selectedNode, setSelectedNode] = useState<CurriculumNode | null>(null)

  const handleDomainChange = (_: SyntheticEvent, newValue: number) => {
    setDomainTab(newValue)
  }

  const handleTapNode = useCallback((node: CurriculumNode) => {
    setSelectedNode(node)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleUpdateStatus = useCallback(
    async (nodeId: string, status: SkillStatus) => {
      await updateNodeStatus(nodeId, status, 'manual')
    },
    [updateNodeStatus],
  )

  if (!activeChild) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a child to view their learning map.</Typography>
      </Container>
    )
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    )
  }

  const currentDomainMap = CURRICULUM_MAPS[domainTab]

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        {activeChild.name}&apos;s Learning Map
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap any skill to see details, practice ideas, and mark progress.
      </Typography>

      {/* Domain summary bars */}
      <Stack spacing={1} sx={{ mb: 2 }}>
        {domainSummaries.map((ds) => {
          const masteredPct = ds.total > 0 ? (ds.mastered / ds.total) * 100 : 0
          const inProgressPct = ds.total > 0 ? (ds.inProgress / ds.total) * 100 : 0
          return (
            <Box key={ds.domain}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography variant="caption" fontWeight={600}>
                  {CURRICULUM_MAPS.find((m) => m.domain === ds.domain)?.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ds.mastered}/{ds.total} mastered
                </Typography>
              </Box>
              <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: '#e0e0e0', overflow: 'hidden' }}>
                <LinearProgress
                  variant="buffer"
                  value={masteredPct}
                  valueBuffer={masteredPct + inProgressPct}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    '& .MuiLinearProgress-bar1Buffer': { bgcolor: '#4caf50' },
                    '& .MuiLinearProgress-bar2Buffer': { bgcolor: '#ff9800', opacity: 0.5 },
                    '& .MuiLinearProgress-dashed': { display: 'none' },
                  }}
                />
              </Box>
            </Box>
          )
        })}
      </Stack>

      {/* Domain tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={domainTab}
          onChange={handleDomainChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {CURRICULUM_MAPS.map((dm) => (
            <Tab key={dm.domain} label={dm.label} />
          ))}
        </Tabs>
      </Box>

      {/* Current domain content */}
      {currentDomainMap && (
        <DomainSection
          domainMap={currentDomainMap}
          getNodeStatus={getNodeStatus}
          onTapNode={handleTapNode}
        />
      )}

      {/* Skill detail drawer */}
      <SkillDetailDrawer
        node={selectedNode}
        status={selectedNode ? getNodeStatus(selectedNode.id) : undefined}
        onClose={handleCloseDrawer}
        onUpdateStatus={handleUpdateStatus}
        getNodeStatus={getNodeStatus}
      />
    </Container>
  )
}
