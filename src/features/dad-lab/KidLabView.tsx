import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { getDocs, orderBy, query, where } from 'firebase/firestore'

import ArtifactGallery from '../../components/ArtifactGallery'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import AudioRecorder from '../../components/AudioRecorder'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection, dadLabReportsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { DadLabReport } from '../../core/types'
import { DadLabStatus, EvidenceType, SubjectBucket } from '../../core/types/enums'
import type { DadLabType } from '../../core/types/enums'
import { addDoc, updateDoc, doc } from 'firebase/firestore'

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
  const [activeLab, setActiveLab] = useState<DadLabReport | null>(null)
  const [plannedLabs, setPlannedLabs] = useState<DadLabReport[]>([])
  const [pastLabs, setPastLabs] = useState<DadLabReport[]>([])
  const [loading, setLoading] = useState(true)
  const [prediction, setPrediction] = useState('')
  const [explanation, setExplanation] = useState('')
  const [observation, setObservation] = useState('')
  const [uploading, setUploading] = useState(false)
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0)

  const isLincoln = childName === 'Lincoln'
  const childKey = childName.toLowerCase()

  useEffect(() => {
    const load = async () => {
      // Load active labs first
      const activeQ = query(
        dadLabReportsCollection(familyId),
        where('status', '==', DadLabStatus.Active),
      )
      const activeSnap = await getDocs(activeQ)
      const activeLabs = activeSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
      setActiveLab(activeLabs[0] ?? null)

      // Load planned labs
      const plannedQ = query(
        dadLabReportsCollection(familyId),
        where('status', '==', DadLabStatus.Planned),
        orderBy('date', 'asc'),
      )
      const plannedSnap = await getDocs(plannedQ)
      setPlannedLabs(plannedSnap.docs.map((d) => ({ ...d.data(), id: d.id })))

      // Load past completed labs
      const completedQ = query(
        dadLabReportsCollection(familyId),
        where('status', '==', DadLabStatus.Complete),
        orderBy('date', 'desc'),
      )
      const completedSnap = await getDocs(completedQ)
      setPastLabs(completedSnap.docs.map((d) => ({ ...d.data(), id: d.id })).slice(0, 5))

      // Initialize child's fields from active lab
      if (activeLabs[0]) {
        const cr = activeLabs[0].childReports[childKey]
        if (cr?.prediction) setPrediction(cr.prediction)
        if (cr?.explanation) setExplanation(cr.explanation)
        if (cr?.observation) setObservation(cr.observation)
      }

      setLoading(false)
    }
    void load()
  }, [familyId, childKey])

  const handleSaveField = useCallback(
    async (field: string, value: string) => {
      if (!activeLab?.id) return
      const ref = doc(dadLabReportsCollection(familyId), activeLab.id)
      const cr = activeLab.childReports[childKey] ?? { artifacts: [] }
      await updateDoc(ref, {
        [`childReports.${childKey}.${field}`]: value,
        updatedAt: new Date().toISOString(),
      })
      setActiveLab({
        ...activeLab,
        childReports: {
          ...activeLab.childReports,
          [childKey]: { ...cr, [field]: value },
        },
      })
    },
    [familyId, activeLab, childKey],
  )

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      if (!activeLab?.id) return
      setUploading(true)
      try {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const artifact = {
          childId: childKey,
          title: `Dad Lab photo - ${activeLab.title}`,
          type: EvidenceType.Photo,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: 'Build' as const,
            domain: 'dad-lab',
            subjectBucket: SubjectBucket.Science,
            location: 'Home',
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact as never)
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        // Add artifact ID to child report
        const cr = activeLab.childReports[childKey] ?? { artifacts: [] }
        const updatedArtifacts = [...(cr.artifacts ?? []), docRef.id]
        const labRef = doc(dadLabReportsCollection(familyId), activeLab.id!)
        await updateDoc(labRef, {
          [`childReports.${childKey}.artifacts`]: updatedArtifacts,
          updatedAt: new Date().toISOString(),
        })
        setActiveLab({
          ...activeLab,
          childReports: {
            ...activeLab.childReports,
            [childKey]: { ...cr, artifacts: updatedArtifacts },
          },
        })
        setArtifactRefreshKey(prev => prev + 1)
      } finally {
        setUploading(false)
      }
    },
    [familyId, activeLab, childKey],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      if (!activeLab?.id) return
      setUploading(true)
      try {
        const artifact = {
          childId: childKey,
          title: `Dad Lab recording - ${activeLab.title}`,
          type: EvidenceType.Audio,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: 'Build' as const,
            domain: 'dad-lab',
            subjectBucket: SubjectBucket.Science,
            location: 'Home',
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact as never)
        const filename = generateFilename('webm')
        const file = new File([blob], filename, { type: 'audio/webm' })
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        const cr = activeLab.childReports[childKey] ?? { artifacts: [] }
        const updatedArtifacts = [...(cr.artifacts ?? []), docRef.id]
        const labRef = doc(dadLabReportsCollection(familyId), activeLab.id!)
        await updateDoc(labRef, {
          [`childReports.${childKey}.artifacts`]: updatedArtifacts,
          updatedAt: new Date().toISOString(),
        })
        setActiveLab({
          ...activeLab,
          childReports: {
            ...activeLab.childReports,
            [childKey]: { ...cr, artifacts: updatedArtifacts },
          },
        })
        setArtifactRefreshKey(prev => prev + 1)
      } finally {
        setUploading(false)
      }
    },
    [familyId, activeLab, childKey],
  )

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

      {activeLab ? (
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
            <Typography variant="h6">{activeLab.title}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, fontStyle: 'italic' }}>
              &ldquo;{activeLab.question}&rdquo;
            </Typography>
            <Chip
              label={activeLab.labType}
              size="small"
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Box>

          <SectionCard title={`${childName}'s Job`}>
            {isLincoln ? (
              <Stack spacing={1.5}>
                {activeLab.lincolnRole && (
                  <Box>
                    <Typography variant="subtitle2" color="primary">
                      Your Role
                    </Typography>
                    <Typography variant="body2">{activeLab.lincolnRole}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="subtitle2" color="primary">
                    My Prediction
                  </Typography>
                  <TextField
                    placeholder="What do you think will happen?"
                    value={prediction}
                    onChange={(e) => setPrediction(e.target.value)}
                    onBlur={() => handleSaveField('prediction', prediction)}
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="primary">
                    Teach London
                  </Typography>
                  <TextField
                    placeholder="Explain what happened to London in your own words"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    onBlur={() => handleSaveField('explanation', explanation)}
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                  />
                </Box>
              </Stack>
            ) : (
              <Stack spacing={2}>
                {activeLab.londonRole && (
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: 'info.50',
                      border: '1px solid',
                      borderColor: 'info.200',
                    }}
                  >
                    <Typography variant="subtitle2" color="info.main">
                      Your Job
                    </Typography>
                    <Typography variant="body1">{activeLab.londonRole}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                    What did you see?
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Tell Dad what you noticed! You can talk or type.
                  </Typography>
                  <AudioRecorder
                    onCapture={handleAudioCapture}
                    uploading={uploading}
                  />
                  <TextField
                    placeholder="Or type what you saw..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    onBlur={() => handleSaveField('observation', observation)}
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                    sx={{ mt: 1.5 }}
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                    Draw what happened!
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Take a photo of your drawing or pick one from your pictures.
                  </Typography>
                  <PhotoCapture
                    onCapture={handlePhotoCapture}
                    uploading={uploading}
                    multiple
                  />
                </Box>
              </Stack>
            )}
          </SectionCard>

          <SectionCard title="Capture My Work">
            <Stack spacing={2}>
              {/* Show already-captured artifacts */}
              <ArtifactGallery
                key={artifactRefreshKey}
                familyId={familyId}
                artifactIds={activeLab.childReports?.[childKey]?.artifacts ?? []}
                label={`${(activeLab.childReports?.[childKey]?.artifacts ?? []).length} item${(activeLab.childReports?.[childKey]?.artifacts ?? []).length !== 1 ? 's' : ''} captured`}
              />

              {/* Capture buttons */}
              <PhotoCapture
                onCapture={handlePhotoCapture}
                uploading={uploading}
                multiple
              />
              <AudioRecorder
                onCapture={handleAudioCapture}
                uploading={uploading}
              />
            </Stack>
          </SectionCard>
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4, mt: 2 }}>
          <Typography variant="h6" color="text.secondary">
            No lab running right now
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ask Dad when the next lab starts!
          </Typography>

          {plannedLabs.length > 0 && (
            <Box sx={{ mt: 3, textAlign: 'left' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Coming up:
              </Typography>
              {plannedLabs.map((lab) => (
                <Box
                  key={lab.id}
                  sx={{ p: 1.5, mt: 1, borderRadius: 1, bgcolor: 'action.hover' }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {LAB_TYPE_ICONS[lab.labType]} {lab.title}
                  </Typography>
                  {lab.question && (
                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                      &ldquo;{lab.question}&rdquo;
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {new Date(lab.date + 'T00:00:00').toLocaleDateString()}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
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
