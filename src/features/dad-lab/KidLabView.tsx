import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import MicIcon from '@mui/icons-material/Mic'
import { getDocs, orderBy, query } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { dadLabReportsCollection } from '../../core/firebase/firestore'
import type { DadLabReport } from '../../core/types/domain'
import type { DadLabType } from '../../core/types/enums'

const LAB_TYPE_ICONS: Record<DadLabType, string> = {
  science: '\u{1F9EA}',
  engineering: '\u{1F528}',
  adventure: '\u{1F333}',
  heart: '\u{2764}\u{FE0F}',
}

interface KidLabViewProps {
  familyId: string
  childName: string
}

export default function KidLabView({ familyId, childName }: KidLabViewProps) {
  const [currentLab, setCurrentLab] = useState<DadLabReport | null>(null)
  const [pastLabs, setPastLabs] = useState<DadLabReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const q = query(dadLabReportsCollection(familyId), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      const labs = snap.docs.map((d) => ({ ...d.data(), id: d.id }))

      const today = new Date().toISOString().split('T')[0]
      const todayLab = labs.find((l) => l.date === today)
      setCurrentLab(todayLab ?? labs[0] ?? null)
      setPastLabs(labs.slice(0, 5))
      setLoading(false)
    }
    void load()
  }, [familyId])

  const isLincoln = childName === 'Lincoln'
  const childKey = childName.toLowerCase()

  if (loading) {
    return (
      <Page>
        <Typography color="text.secondary">Loading...</Typography>
      </Page>
    )
  }

  return (
    <Page>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Dad Lab
      </Typography>

      {currentLab ? (
        <Box sx={{ mt: 2 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
              color: 'white',
              mb: 2,
            }}
          >
            <Typography variant="h6">{currentLab.title}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, fontStyle: 'italic' }}>
              &ldquo;{currentLab.question}&rdquo;
            </Typography>
            <Chip
              label={currentLab.labType}
              size="small"
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Box>

          <SectionCard title={`${childName}'s Job`}>
            {isLincoln ? (
              <Stack spacing={1.5}>
                {currentLab.childReports[childKey]?.prediction && (
                  <Box>
                    <Typography variant="subtitle2" color="primary">
                      My Prediction
                    </Typography>
                    <Typography variant="body2">
                      {currentLab.childReports[childKey].prediction}
                    </Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="subtitle2" color="primary">
                    What I Need To Do
                  </Typography>
                  <Typography variant="body2">
                    {currentLab.description || 'Dad will tell you what to do today!'}
                  </Typography>
                </Box>
                {currentLab.childReports[childKey]?.explanation && (
                  <Box>
                    <Typography variant="subtitle2" color="primary">
                      Teach London
                    </Typography>
                    <Typography variant="body2">
                      After the lab, explain what happened to London in your own words.
                    </Typography>
                  </Box>
                )}
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {currentLab.childReports[childKey]?.observation && (
                  <Box>
                    <Typography variant="subtitle2" color="primary">
                      What I Noticed
                    </Typography>
                    <Typography variant="body2">
                      {currentLab.childReports[childKey].observation}
                    </Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="subtitle2" color="primary">
                    My Job
                  </Typography>
                  <Typography variant="body2">Watch, help, and draw what you see!</Typography>
                </Box>
              </Stack>
            )}
          </SectionCard>

          <SectionCard title="Capture My Work">
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<CameraAltIcon />}>
                Take Photo
              </Button>
              <Button variant="outlined" startIcon={<MicIcon />}>
                Record
              </Button>
            </Stack>
          </SectionCard>
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4, mt: 2 }}>
          <Typography variant="h6" color="text.secondary">
            No lab today
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ask Dad when the next lab is!
          </Typography>
        </Box>
      )}

      {pastLabs.length > 0 && (
        <SectionCard title="Past Labs">
          <Stack spacing={1}>
            {pastLabs.map((lab) => (
              <Stack
                key={lab.id}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}
              >
                <Typography sx={{ fontSize: '1.3rem' }}>
                  {LAB_TYPE_ICONS[lab.labType] ?? '\u{1F52C}'}
                </Typography>
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {lab.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(lab.date).toLocaleDateString()}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </SectionCard>
      )}
    </Page>
  )
}
