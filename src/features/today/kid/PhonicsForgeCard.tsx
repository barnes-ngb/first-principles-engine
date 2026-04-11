import { useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../../components/SectionCard'
import {
  ufliLessonsCollection,
  ufliProgressDoc,
} from '../../../core/firebase/firestore'
import type { UFLILesson, UFLIProgress } from '../../../core/types'
import { DEFAULT_UFLI_PROGRESS } from '../../../core/ufli/getUfliProgress'

interface PhonicsForgeCardProps {
  familyId: string
  childId: string
}

export default function PhonicsForgeCard({
  familyId,
  childId,
}: PhonicsForgeCardProps) {
  const [progress, setProgress] = useState<UFLIProgress | null>(null)
  const [lesson, setLesson] = useState<UFLILesson | null>(null)
  const [toastOpen, setToastOpen] = useState(false)

  // Listen to UFLI progress
  useEffect(() => {
    if (!familyId || !childId) return
    const unsub = onSnapshot(
      ufliProgressDoc(familyId, childId),
      (snap) => setProgress(snap.exists() ? snap.data() : { ...DEFAULT_UFLI_PROGRESS }),
      () => setProgress({ ...DEFAULT_UFLI_PROGRESS }),
    )
    return unsub
  }, [familyId, childId])

  // Load lesson details
  useEffect(() => {
    if (!familyId || !progress) return
    const ref = doc(ufliLessonsCollection(familyId), String(progress.currentLesson))
    getDoc(ref)
      .then((snap) => setLesson(snap.exists() ? snap.data() : null))
      .catch(() => setLesson(null))
  }, [familyId, progress?.currentLesson, progress])

  if (!progress) return null

  const concept = lesson?.concept ?? 'a new challenge'

  return (
    <>
      <SectionCard title="Phonics Forge">
        <Box
          onClick={() => setToastOpen(true)}
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'rgba(0,0,0,0.7)',
            border: '2px solid',
            borderColor: '#FF6600',
            cursor: 'pointer',
            '&:hover': { borderColor: '#FF9933' },
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography sx={{ fontSize: '1.5rem' }}>
                &#x2692;&#xFE0F;
              </Typography>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="body1"
                  sx={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.55rem',
                    color: '#FF6600',
                    fontWeight: 700,
                  }}
                >
                  The Phonics Forge is open!
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '0.4rem',
                    color: 'rgba(255,255,255,0.7)',
                    mt: 0.5,
                  }}
                >
                  The blacksmith needs your help with {concept}. Tap to start.
                </Typography>
              </Box>
            </Stack>
            <Typography
              sx={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.35rem',
                color: 'rgba(255,255,255,0.4)',
                textAlign: 'right',
              }}
            >
              Quest {progress.currentLesson} / 128
            </Typography>
          </Stack>
        </Box>
      </SectionCard>

      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setToastOpen(false)}
        >
          Shelly will open this with you.
        </Alert>
      </Snackbar>
    </>
  )
}
