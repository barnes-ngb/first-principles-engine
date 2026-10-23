import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { getDocs, orderBy, query, where } from 'firebase/firestore'

import ArtifactGallery from '../../components/ArtifactGallery'
import Page from '../../components/Page'
import { LoadingState } from '../../components/states'
import PhotoCapture from '../../components/PhotoCapture'
import AudioRecorder from '../../components/AudioRecorder'
import SectionCard from '../../components/SectionCard'
import { dadLabReportsCollection } from '../../core/firebase/firestore'
import { generateFilename } from '../../core/firebase/upload'
import type { Child, DadLabReport } from '../../core/types'
import { DAD_LAB_TYPE_LABELS, LAB_FRAMEWORKS } from '../../core/types/dadlab'
import { DadLabStatus, EvidenceType, SubjectBucket } from '../../core/types/enums'
import type { DadLabType } from '../../core/types/enums'
import { arrayUnion, updateDoc, doc } from 'firebase/firestore'
import { resolveChildAgeGroup } from '../../core/profile/childIdentity'
import { childReportKey, normalizeChildRoles, resolveChildReport } from './childRoles'
import { DAD_LAB_REFERENCE_DEADLINE_MS, uploadLabArtifact, withDeadline } from './labArtifactUpload'
import { LabUploadAudience, LabUploadHandler, LabUploadMedium } from './labUploadCopy'
import LabUploadStatus from './LabUploadStatus'
import { useLabUploads, type LabUploadJob } from './useLabUploads'

const LAB_TYPE_ICONS: Record<DadLabType, string> = {
  science: '\u{1F9EA}',
  engineering: '\u{1F528}',
  adventure: '\u{1F333}',
  heart: '\u{2764}\u{FE0F}',
}

interface KidLabViewProps {
  familyId: string
  /** The child whose kid-view this is. */
  child: Child
  /** Family children — used to normalize legacy role fields onto childIds. */
  children: Child[]
}

export default function KidLabView({ familyId, child, children }: KidLabViewProps) {
  const [activeLab, setActiveLab] = useState<DadLabReport | null>(null)
  const [plannedLabs, setPlannedLabs] = useState<DadLabReport[]>([])
  const [pastLabs, setPastLabs] = useState<DadLabReport[]>([])
  const [loading, setLoading] = useState(true)
  const [prediction, setPrediction] = useState('')
  const [explanation, setExplanation] = useState('')
  const [observation, setObservation] = useState('')
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0)

  // Scientific method step tracking (for experiment-type labs)
  const [activeStep, setActiveStep] = useState(0)

  const childName = child.name
  // FEAT-183 / ARCH-42 (B1): which capture flow this lab shows is a capability
  // question, not a name one. The framework flow (Scientific Method steps,
  // typed fields) is for an older child; the voice-first + drawing flow below
  // is the right surface for a younger one. Keying on the name meant a third
  // child landed in the younger flow because he isn't called "Lincoln".
  // No behaviour change for either boy today — Lincoln resolves 'older',
  // London 'younger', with or without a stored birthdate.
  const isOlder = resolveChildAgeGroup(child) === 'older'
  // Kid writes still key childReports by lowercase name (unchanged storage
  // shape); reads go through resolveChildReport so any keying resolves.
  // Artifacts are NOT keyed this way — see the childId note on the captures.
  const childKey = childName.toLowerCase()
  // Ensure the current child is always available for legacy role mapping,
  // even before the family children list finishes loading.
  const roleChildren = children.length > 0 ? children : [child]

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
        const cr = resolveChildReport(activeLabs[0].childReports, child)
        if (cr.prediction) setPrediction(cr.prediction)
        if (cr.explanation) setExplanation(cr.explanation)
        if (cr.observation) setObservation(cr.observation)
      }

      setLoading(false)
    }
    void load()
  }, [familyId, childKey, child])

  const handleSaveField = useCallback(
    async (field: string, value: string) => {
      if (!activeLab?.id) return
      const ref = doc(dadLabReportsCollection(familyId), activeLab.id)
      const cr = resolveChildReport(activeLab.childReports, child)
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
    [familyId, activeLab, childKey, child],
  )

  // ── Uploads (FIX-269 / UX-461) ──
  // One runner for both captures. The file goes up before the record
  // (`uploadLabArtifact`), the whole capture has a deadline, and a failure
  // leaves a sentence with Try again.
  //
  // `PhotoCapture` with `multiple` fires `onCapture` once per file without
  // awaiting, so several of these run concurrently. The reference write used to
  // be the WHOLE array, built from the `activeLab` this callback closed over,
  // and each finishing upload overwrote the ones before it, so only the last
  // stayed on the report. It is an `arrayUnion` of this one id now, the shape
  // `LabReportForm` already used, and the local copy is updated with a
  // functional update for the same reason.
  const runUpload = useCallback(
    async (job: LabUploadJob<EvidenceType>, signal: AbortSignal) => {
      const lab = activeLab
      if (!lab?.id) return
      const labId = lab.id
      const isAudio = job.target === EvidenceType.Audio
      let file = job.file
      let filename: string
      if (isAudio) {
        filename = generateFilename('webm')
        file = new File([job.file], filename, { type: 'audio/webm' })
      } else {
        const name = job.file instanceof File ? job.file.name : ''
        filename = generateFilename(name.includes('.') ? name.split('.').pop() || 'jpg' : 'jpg')
      }

      const artifactId = await uploadLabArtifact({
        familyId,
        file,
        filename,
        signal,
        artifact: {
          // FEAT-183 (B14): the child's DOC ID, not the lowercase name. Every
          // artifact reader queries `where('childId','==', child.id)` (Kid
          // Today's My Stuff, the portfolio, the compliance pack), so a
          // name-keyed id made these captures invisible everywhere but this
          // page. Existing docs are counted, never rewritten — the Dev tab's
          // "Artifact childId audit" reports them; a backfill is a separate,
          // confirmed decision.
          childId: child.id,
          title: `Dad Lab ${isAudio ? 'recording' : 'photo'} - ${lab.title}`,
          type: job.target,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: 'Build' as const,
            domain: 'dad-lab',
            subjectBucket: SubjectBucket.Science,
            location: 'Home',
          },
        },
      })

      // Appended, never rewritten. The key is the one this report already
      // reads him under, so the append lands where `resolveChildReport` looks.
      const key = childReportKey(lab.childReports, child)
      await withDeadline(
        updateDoc(doc(dadLabReportsCollection(familyId), labId), {
          [`childReports.${key}.artifacts`]: arrayUnion(artifactId),
          updatedAt: new Date().toISOString(),
        }),
        DAD_LAB_REFERENCE_DEADLINE_MS,
      )
      setActiveLab((prev) => {
        if (!prev || prev.id !== labId) return prev
        const cr = resolveChildReport(prev.childReports, child)
        const artifacts = cr.artifacts ?? []
        if (artifacts.includes(artifactId)) return prev
        return {
          ...prev,
          childReports: {
            ...prev.childReports,
            [childReportKey(prev.childReports, child)]: { ...cr, artifacts: [...artifacts, artifactId] },
          },
        }
      })
      setArtifactRefreshKey((prev) => prev + 1)
    },
    [familyId, activeLab, child],
  )

  const uploads = useLabUploads(runUpload)
  const startUpload = uploads.start
  // The spinner stays until the LAST upload ends, rather than clearing when
  // the first one finishes.
  const uploading = uploads.pending > 0

  const handlePhotoCapture = useCallback(
    (file: File) =>
      startUpload({
        subject: { medium: LabUploadMedium.Photo },
        handler: LabUploadHandler.KidPhoto,
        file,
        target: EvidenceType.Photo,
      }),
    [startUpload],
  )

  const handleAudioCapture = useCallback(
    (blob: Blob) =>
      startUpload({
        subject: { medium: LabUploadMedium.Recording },
        handler: LabUploadHandler.KidRecording,
        file: blob,
        target: EvidenceType.Audio,
      }),
    [startUpload],
  )

  if (loading) {
    return (
      <Page>
        <LoadingState fullHeight label="Loading..." />
      </Page>
    )
  }

  // This child's role for the active lab, mapped forward from legacy fields.
  const myRole = activeLab ? normalizeChildRoles(activeLab, roleChildren)[child.id] : undefined
  const myReport = activeLab ? resolveChildReport(activeLab.childReports, child) : undefined
  const myArtifacts = myReport?.artifacts ?? []

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
            {/* FEAT-186 / UX-90: this chip used to print the raw enum
                (`science`, `engineering`, …). One map, one label per type. */}
            <Chip
              label={`${LAB_TYPE_ICONS[activeLab.labType] ?? ''} ${DAD_LAB_TYPE_LABELS[activeLab.labType] ?? activeLab.labType}`.trim()}
              size="small"
              sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
          </Box>

          {/* How each upload is going, and how it ended (FIX-269). One place,
              near the top, because the capture buttons are spread across steps. */}
          <Box sx={{ mb: 2 }}>
            <LabUploadStatus
              audience={LabUploadAudience.Kid}
              inFlight={uploads.inFlight}
              failures={uploads.failures}
              onRetry={uploads.retry}
              onDismiss={uploads.dismiss}
            />
          </Box>

          {/* Framework steps indicator */}
          {LAB_FRAMEWORKS[activeLab.labType] && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                {LAB_FRAMEWORKS[activeLab.labType].label}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {LAB_FRAMEWORKS[activeLab.labType].steps.map((step, i) => (
                  <Chip
                    key={step}
                    label={step}
                    size="small"
                    variant={i <= activeStep ? 'filled' : 'outlined'}
                    color={i === activeStep ? 'primary' : i < activeStep ? 'success' : 'default'}
                    onClick={() => setActiveStep(i)}
                  />
                ))}
              </Stack>
            </Box>
          )}

          <SectionCard title={`${childName}'s Job`}>
            {isOlder ? (
              activeLab.labType === 'science' ? (
                /* Scientific-method steps — the older-child framework flow */
                <Stack spacing={2}>
                  {myRole && (
                    <Box>
                      <Typography variant="subtitle2" color="primary">Your Role</Typography>
                      <Typography variant="body2">{myRole}</Typography>
                    </Box>
                  )}

                  {/* Step 1: The Question */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: activeStep === 0 ? 'primary.50' : 'transparent', border: activeStep === 0 ? '1px solid' : 'none', borderColor: 'primary.200' }}>
                    <Typography variant="subtitle2" color={activeStep === 0 ? 'primary.main' : 'text.secondary'}>
                      Step 1: THE QUESTION
                    </Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', mb: 1 }}>
                      &ldquo;{activeLab.question}&rdquo;
                    </Typography>
                  </Box>

                  {/* Step 2: Prediction / Hypothesis */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: activeStep === 1 ? 'primary.50' : 'transparent', border: activeStep === 1 ? '1px solid' : 'none', borderColor: 'primary.200' }}>
                    <Typography variant="subtitle2" color={activeStep === 1 ? 'primary.main' : 'text.secondary'}>
                      Step 2: MY PREDICTION
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      What do you THINK will happen?
                    </Typography>
                    <AudioRecorder onCapture={handleAudioCapture} uploading={uploading} />
                    <TextField
                      placeholder="I think..."
                      value={prediction}
                      onChange={(e) => setPrediction(e.target.value)}
                      onBlur={() => handleSaveField('prediction', prediction)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  {/* Step 3: The Test */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: activeStep === 2 ? 'primary.50' : 'transparent', border: activeStep === 2 ? '1px solid' : 'none', borderColor: 'primary.200' }}>
                    <Typography variant="subtitle2" color={activeStep === 2 ? 'primary.main' : 'text.secondary'}>
                      Step 3: THE TEST
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      What did we do? Add photos!
                    </Typography>
                    <PhotoCapture onCapture={handlePhotoCapture} uploading={uploading} multiple />
                  </Box>

                  {/* Step 4: What Happened */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: activeStep === 3 ? 'primary.50' : 'transparent', border: activeStep === 3 ? '1px solid' : 'none', borderColor: 'primary.200' }}>
                    <Typography variant="subtitle2" color={activeStep === 3 ? 'primary.main' : 'text.secondary'}>
                      Step 4: WHAT HAPPENED
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      What did we observe? Was it what you expected?
                    </Typography>
                    <AudioRecorder onCapture={handleAudioCapture} uploading={uploading} />
                  </Box>

                  {/* Step 5: Conclude + Teach London */}
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: activeStep === 4 ? 'primary.50' : 'transparent', border: activeStep === 4 ? '1px solid' : 'none', borderColor: 'primary.200' }}>
                    <Typography variant="subtitle2" color={activeStep === 4 ? 'primary.main' : 'text.secondary'}>
                      Step 5: WHY? + TEACH LONDON
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Why did it happen that way? Explain to London!
                    </Typography>
                    <AudioRecorder onCapture={handleAudioCapture} uploading={uploading} />
                    <TextField
                      placeholder="It happened because..."
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      onBlur={() => handleSaveField('explanation', explanation)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  {/* Step navigation */}
                  <Stack direction="row" justifyContent="space-between">
                    <Chip
                      label="Previous"
                      onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                      disabled={activeStep === 0}
                      variant="outlined"
                    />
                    <Chip
                      label={activeStep === 4 ? 'Done!' : 'Next Step'}
                      onClick={() => setActiveStep(Math.min(4, activeStep + 1))}
                      disabled={activeStep === 4}
                      color="primary"
                    />
                  </Stack>
                </Stack>
              ) : (
                /* Default Lincoln view for non-science labs */
                <Stack spacing={1.5}>
                  {myRole && (
                    <Box>
                      <Typography variant="subtitle2" color="primary">
                        Your Role
                      </Typography>
                      <Typography variant="body2">{myRole}</Typography>
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
              )
            ) : (
              <Stack spacing={2}>
                {myRole && (
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
                    <Typography variant="body1">{myRole}</Typography>
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
                artifactIds={myArtifacts}
                label={`${myArtifacts.length} item${myArtifacts.length !== 1 ? 's' : ''} captured`}
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
