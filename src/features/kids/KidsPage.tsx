import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import ArtifactCard from '../../components/ArtifactCard'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import type { Artifact } from '../../core/types/domain'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

const sampleArtifact: Artifact = {
  id: 'sample-artifact',
  title: 'Volcano model reflection',
  type: EvidenceType.Note,
  createdAt: '2024-03-12T10:30:00.000Z',
  tags: {
    engineStage: EngineStage.Explain,
    domain: 'Earth Science',
    subjectBucket: SubjectBucket.Science,
    location: LearningLocation.Home,
  },
}

export default function KidsPage() {
  const [isRungOpen, setIsRungOpen] = useState(false)

  return (
    <Page>
      <SectionCard title="Ladder Rungs">
        <Stack spacing={2}>
          <Typography color="text.secondary" variant="body2">
            Preview rung details and related artifacts in a quick modal.
          </Typography>
          <Button variant="contained" onClick={() => setIsRungOpen(true)}>
            Open Rung Modal
          </Button>
        </Stack>
      </SectionCard>

      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => setIsRungOpen(false)}
        open={isRungOpen}
      >
        <DialogTitle>Rung: Build & Explain</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Capture evidence that shows how the child explained their model
              and reflected on what they learned.
            </Typography>
            <ArtifactCard artifact={sampleArtifact} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsRungOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Page>
  )
}
